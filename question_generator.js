/**
 * 🧠 QUESTION GENERATOR - Production Edition (Full Feature Set)
 * * FEATURES:
 * 1. Anti-Repeat: Over-fetch & Filter (zabraňuje opakování odpovědí)
 * 2. Fact-Checking: Perplexity/Sonar validace
 * 3. Auto-Retry: Oprava syntaxe JSONu z LLM (3 pokusy)
 * 4. DB Backup: Pokud selže LLM, bere se otázka z DB (Live Fallback)
 * 5. Emergency: Pokud selže i DB, použije se hardcoded otázka
 */

import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

// === KONFIGURACE ===
const GENERATOR_MODEL = "llama-3.3-70b-versatile";
const VALIDATOR_MODEL = "sonar-pro";
const BATCH_SIZE = 5;       
const DB_FETCH_BATCH = 20;  // Over-fetch pro lepší filtrování
const MIN_CACHE_SIZE = 5;   // 🆕 Zvýšeno pro lepší pre-generování   
const BLACKLIST_DURATION = 3 * 60 * 60 * 1000; // 3 hodiny
const MAX_RETRIES = 3;      // Kolikrát zkusit opravit JSON z LLM

// === ZÁCHRANNÁ OTÁZKA (Poslední instance) ===
const EMERGENCY_QUESTION = {
  question: "Které město je hlavním městem České republiky?",
  options: ["Brno", "Praha", "Ostrava"],
  correct: 1,
  _fromDb: false,
  _fromLLM: false,
  _emergency: true
};

// === DATABÁZE ===
let questionDatabase = null;
let useDatabase = false;

export async function connectDatabase(dbModule) {
  try {
    questionDatabase = dbModule;
    const success = await questionDatabase.initDatabase();
    useDatabase = success;
    
    if (success) {
      console.log('✅ Generator: Databáze aktivní a připojená');
    } else {
      console.log('⚠️ Generator: Databáze nedostupná (init selhal), jedeme v LLM-only módu');
    }
    return success;
  } catch (error) {
    console.warn('⚠️ Generator: Chyba při připojování DB:', error.message);
    useDatabase = false;
    return false;
  }
}

// === API KLIENTI ===
let groqInstance = null;
function getGroqClient() {
  if (groqInstance) return groqInstance;
  if (!process.env.GROQ_API_KEY) return null;
  try {
    groqInstance = new Groq({ apiKey: process.env.GROQ_API_KEY });
    return groqInstance;
  } catch (error) { return null; }
}

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;

// === STATISTIKY ===
let validationStats = {
  generated: 0,
  passedSelfCritique: 0,
  failedSelfCritique: 0,
  passedPerplexity: 0,
  failedPerplexity: 0,
  skippedPerplexity: 0
};

let validationHistory = [];

export function getValidationStats() { return validationStats; }
export function getValidationHistory() { return validationHistory; }
export function resetValidationStats() {
  validationStats = { generated: 0, passedSelfCritique: 0, failedSelfCritique: 0, passedPerplexity: 0, failedPerplexity: 0, skippedPerplexity: 0 };
  validationHistory = [];
}

// === ANTI-REPEAT (GLOBAL BLACKLIST) ===
const globalAnswerBlacklist = new Map();

function normalizeText(text) {
  if (!text) return "";
  return text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '').trim();
}

/**
 * 🆕 Zamíchá pořadí odpovědí, aby správná nebyla vždy na pozici A
 */
function shuffleOptions(question) {
  const correctAnswer = question.options[question.correct];
  
  // Fisher-Yates shuffle
  const shuffled = [...question.options];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  
  // Najdi nový index správné odpovědi
  const newCorrect = shuffled.indexOf(correctAnswer);
  
  return {
    ...question,
    options: shuffled,
    correct: newCorrect
  };
}

function blockAnswerGlobally(answer) {
  if (!answer) return;
  const key = normalizeText(answer);
  globalAnswerBlacklist.set(key, Date.now());
}

function isAnswerBlocked(answer) {
  if (!answer) return false;
  const key = normalizeText(answer);
  const timestamp = globalAnswerBlacklist.get(key);
  
  if (!timestamp) return false;
  
  if (Date.now() - timestamp > BLACKLIST_DURATION) {
    globalAnswerBlacklist.delete(key);
    return false;
  }
  return true;
}

// Čištění blacklistu
setInterval(() => {
  const now = Date.now();
  for (const [key, time] of globalAnswerBlacklist) {
    if (now - time > BLACKLIST_DURATION) globalAnswerBlacklist.delete(key);
  }
}, 60 * 60 * 1000);

// === GAME SESSIONS ===
const gameSessions = new Map();

class GameSession {
  constructor(gameId) {
    this.gameId = gameId;
    this.dbCache = [];
    this.llmCache = [];
    this.llmGenerating = false;
    this.usedAnswers = new Set();
    this.questionCount = 0;  // 🆕 Počítadlo pro střídání LLM/DB
  }
  isAnswerUsed(ans) { return this.usedAnswers.has(normalizeText(ans)); }
  addUsedAnswer(ans) { this.usedAnswers.add(normalizeText(ans)); }
}

/**
 * 🔄 LOGIKA STŘÍDÁNÍ LLM/DB
 * Pravidelné střídání: LLM, DB, LLM, DB...
 * Liché kolo = LLM (1, 3, 5, 7...)
 * Sudé kolo = DB (2, 4, 6, 8...)
 */
function shouldUseLLM(round) {
  return round % 2 === 1;  // Liché = LLM, Sudé = DB
}

function getGameSession(gameId) {
  if (!gameId) gameId = 'default';
  if (!gameSessions.has(gameId)) gameSessions.set(gameId, new GameSession(gameId));
  return gameSessions.get(gameId);
}

export function endGameSession(gameId) { gameSessions.delete(gameId); }
export function resetGameSession(gameId) { gameSessions.delete(gameId); }
export function getCacheStatus(gameId) {
  const s = gameSessions.get(gameId);
  if (!s) return { generated: 0, target: 5, ready: false };
  
  const total = s.llmCache.length + s.dbCache.length;
  return { 
    generated: Math.min(total, 5),
    target: 5,
    ready: total >= 5
  };
}

const AGE_GROUP_CONFIG = {
  adult: { name: "👔 Dospělí", mode: 'adult', difficulty: 'normal' },
  student: { name: "🎒 Školáci", mode: 'kid', difficulty: 'normal' },
  kids: { name: "🐣 Děti", mode: 'kid', difficulty: 'easy' }
};

// === STRUKTUROVANÉ KATEGORIE A TÉMATA PRO DOSPĚLÉ (140 kategorií) ===
// Zdroj: STRUKTURA_KATEGORII_A_TEMAT_DOSPELI.md
// "Obecná otázka z kategorie" se přidává automaticky při flatten
const CATEGORIES_ADULT = {
  // BLOK 1: HISTORIE (15 kategorií)
  "Starověké civilizace": ["Egypt a pyramidy", "Mezopotámie a Sumer", "antické Řecko", "Římská říše", "Persie", "Fénicie a Kartágo", "starověká Indie", "starověká Čína"],
  "Starověká filozofie a věda": ["Sokrates, Platón, Aristoteles", "stoicismus a epikureismus", "antická matematika", "Hippokrates a medicína", "Ptolemaiův model vesmíru"],
  "Středověká Evropa": ["Franská říše a Karel Veliký", "feudalismus", "křížové výpravy", "rytířské řády", "středověké hrady", "černá smrt", "Hansa a obchod"],
  "Středověk mimo Evropu": ["Arabský chalífát", "Osmanská říše", "dynastie Ming", "Mongolská říše", "japonský šogunát", "Vikingové"],
  "Renesance a osvícenství": ["Da Vinci, Michelangelo, Raffael", "Shakespeare", "vědecká revoluce", "osvícenští filozofové", "humanismus"],
  "Zámořské objevy a kolonialismus": ["Kolumbus, da Gama, Magalhães", "španělská a portugalská kolonizace", "otroctví a transatlantický obchod", "Východoindická společnost", "holandské impérium"],
  "Reformace a náboženské války": ["Luther a protestantismus", "kalvinismus", "anglická reformace", "jezuité", "třicetiletá válka", "hugenotské války"],
  "Francouzská revoluce a Napoleon": ["příčiny revoluce", "Deklarace práv člověka", "teror a Robespierre", "Napoleonovy války", "Vídeňský kongres", "Code Civil"],
  "Průmyslová revoluce": ["textilní průmysl", "parní stroj", "železnice", "těžba a ocel", "urbanizace", "sociální změny"],
  "Nacionalismus 19. století": ["německé sjednocení", "italské sjednocení", "balkánské národy", "latinoamerická nezávislost"],
  "První světová válka": ["příčiny a aliance", "zákopová válka", "východní fronta", "nové zbraně", "Versailleská smlouva", "ruská revoluce"],
  "Meziválečné období": ["zlatá dvacátá léta", "velká deprese", "vzestup fašismu", "Hitlerův vzestup", "Stalinovy čistky", "španělská občanská válka"],
  "Druhá světová válka": ["Blitzkrieg", "bitva o Británii", "operace Barbarossa", "holocaust", "D-Day", "Pacifik a atomové bomby", "Norimberk"],
  "Studená válka": ["železná opona", "NATO vs. Varšavská smlouva", "korejská válka", "kubánská krize", "vietnamská válka", "vesmírný závod", "pád SSSR"],
  "Dějiny každodennosti": ["historie jídla", "dějiny módy", "historie bydlení", "dějiny hygieny", "historie zábavy", "dějiny cestování", "historie peněz"],

  // BLOK 2: ZEMĚPIS A GEOGRAFIE (12 kategorií)
  "Fyzická geografie": ["tektonika desek", "sopky a zemětřesení", "pohoří světa", "řeky a jezera", "pouště", "ledovce", "oceány a moře"],
  "Evropa": ["Skandinávie", "Britské ostrovy", "Střední Evropa", "Balkán", "Iberský poloostrov", "Itálie", "Pobaltí", "mikrostáty"],
  "Asie": ["Blízký východ", "Střední Asie", "jižní Asie", "jihovýchodní Asie", "Čína", "Japonsko a Korea", "Sibiř"],
  "Amerika": ["USA východ vs. západ", "Kanada", "Mexiko a Střední Amerika", "Karibik", "Brazílie", "Andské státy", "Amazonie"],
  "Afrika a Oceánie": ["Severní Afrika", "subsaharská Afrika", "Jižní Afrika", "Austrálie", "Nový Zéland", "Polynésie", "Madagaskar"],
  "Polární oblasti": ["Arktida", "Antarktida", "polární expedice", "ledovce", "permafrost", "polární fauna"],
  "Metropole světa": ["evropské metropole", "asijské megaměsta", "americká velkoměsta", "historická hlavní města", "města na řekách", "nejstarší města"],
  "Geopolitika a hranice": ["sporná území", "enklávy a exklávy", "rozdělené státy", "změny hranic ve 20. století", "separatismus", "koloniální dědictví"],
  "Mapy a kartografie": ["historie mapování", "mapové projekce", "navigace", "GPS", "kartografické omyly", "imaginární země"],
  "Cestování a turismus": ["památky UNESCO", "přírodní divy světa", "poutní místa", "extrémní turistika", "skryté perly", "turistické pasti"],
  "Geologie a mineralogie": ["typy hornin", "minerály a krystaly", "drahokamy", "fosilie", "geologické éry", "jeskynní systémy"],
  "Meteorologie a klima": ["typy oblaků", "bouřky a blesky", "hurikány", "tornáda", "klimatické rekordy", "předpověď počasí", "El Niño"],

  // BLOK 3: PŘÍRODNÍ VĚDY (15 kategorií)
  "Zoologie - savci a ptáci": ["savci", "ptáci", "chování zvířat", "migrace", "rekordmani říše", "domestikace"],
  "Zoologie - ostatní": ["plazi a obojživelníci", "ryby", "hmyz", "pavoukovci", "měkkýši", "vymřelá zvířata"],
  "Botanika": ["stromy a lesy", "květiny", "houby", "léčivé rostliny", "jedovaté rostliny", "masožravé rostliny"],
  "Ekologie a životní prostředí": ["ekosystémy", "ohrožené druhy", "klimatická změna", "znečištění", "národní parky", "invazivní druhy"],
  "Lidské tělo": ["kardiovaskulární systém", "nervový systém", "trávicí soustava", "imunitní systém", "smyslové orgány", "hormony"],
  "Medicína a zdraví": ["vakcíny", "antibiotická rezistence", "epidemiologie", "chirurgie", "transplantace", "diagnostika", "placebo efekt"],
  "Chemie": ["periodická tabulka", "organická chemie", "chemické reakce", "polymery a plasty", "jedy a toxiny", "chemie v životě"],
  "Fyzika": ["mechanika a pohyb", "elektřina a magnetismus", "optika", "termodynamika", "jaderná fyzika", "kvantová fyzika", "relativita"],
  "Astronomie - Sluneční soustava": ["Slunce", "vnitřní planety", "Mars", "Jupiter a Saturn", "vnější planety", "asteroidy a komety", "mise"],
  "Astronomie - vesmír": ["hvězdy a jejich typy", "galaxie", "černé díry", "temná hmota", "kosmologie", "exoplanety", "mimozemský život"],
  "Matematika": ["aritmetika", "algebra", "geometrie", "statistika a pravděpodobnost", "teorie čísel", "slavné problémy", "matematici"],
  "Evoluce a paleontologie": ["Darwinova teorie", "evoluce člověka", "dinosauři", "pravěká megafauna", "masová vymírání", "paleontologické nálezy"],
  "Oceánografie": ["hlubinné moře", "mořské proudy", "podmořské hory", "korálové útesy", "mořský život", "tsunami", "záhady oceánů"],
  "Genetika a biotechnologie": ["DNA a geny", "dědičnost", "CRISPR", "GMO", "klonování", "forenzní genetika", "etika biotechnologií"],
  "Vědecké objevy": ["Nobelovy ceny", "průlomové experimenty", "vědecké omyly", "náhodné objevy", "největší vědci", "podvody ve vědě"],

  // BLOK 4: TECHNOLOGIE A VYNÁLEZY (10 kategorií)
  "Historie techniky": ["vynálezy starověku", "středověká technika", "průmyslová revoluce", "elektřina", "spalovací motory", "patenty"],
  "Doprava - pozemní": ["automobily", "železnice", "motocykly", "hromadná doprava", "dopravní infrastruktura", "budoucnost dopravy"],
  "Doprava - letecká a námořní": ["letadla a letectví", "lodě a námořnictví", "majáky", "černé skříňky", "slavné nehody", "kanály"],
  "Počítače a informatika": ["historie počítačů", "hardware", "operační systémy", "programování", "databáze", "kybernetická bezpečnost", "AI"],
  "Internet a digitální svět": ["historie internetu", "WWW", "sociální sítě", "e-commerce", "streaming", "cloud", "dark web", "kryptoměny"],
  "Komunikační technologie": ["tisk a knihtisk", "telegraf", "telefon", "rádio", "televize", "mobilní telefony", "satelity", "5G"],
  "Energetika": ["fosilní paliva", "jaderná energie", "vodní energie", "solární a větrná", "vodíková ekonomika", "energetické sítě"],
  "Stavebnictví a megaprojekty": ["stavební materiály", "mrakodrapy", "mosty", "tunely", "přehrady", "stadiony", "ekologické stavby"],
  "Kosmonautika": ["počátky kosmického průzkumu", "Apollo", "Sojuz", "ISS", "sondy do vesmíru", "Mars", "SpaceX"],
  "Domácí technologie a DIY": ["smart home", "3D tisk", "nářadí", "renovace", "domácí bezpečnost", "úspory energie", "kuchyňské hacky"],

  // BLOK 5: UMĚNÍ A KULTURA (14 kategorií)
  "Malířství": ["renesance", "baroko", "impresionismus", "expresionismus", "surrealismus", "abstrakce", "pop art", "slavné obrazy"],
  "Sochařství a jiné výtvarné umění": ["antické sochy", "gotika", "moderní sochařství", "street art a graffiti", "keramika", "sklo", "digitální umění"],
  "Literatura - klasická": ["antická literatura", "středověk", "renesance", "romantismus", "realismus", "modernismus", "světoví klasici"],
  "Literatura - žánry a současnost": ["fantasy a sci-fi", "detektivky", "poezie", "drama", "komiksy", "bestsellery", "literární adaptace"],
  "Hudba - klasická": ["baroko", "klasicismus", "romantismus", "opera", "balet", "nástroje orchestru"],
  "Hudba - populární": ["rock and roll", "pop", "hip hop", "elektronika", "jazz", "blues", "country", "metal a punk"],
  "Film": ["němý film", "zlatý věk Hollywoodu", "evropský film", "animovaný film", "dokumenty", "režiséři", "filmové ceny"],
  "Televize a seriály": ["historie TV", "sitcomy", "dramatické seriály", "reality show", "kultovní seriály", "streaming platformy"],
  "Divadlo a scénická umění": ["antické divadlo", "Shakespeare", "opera a opereta", "muzikál", "moderní drama", "improvizace", "stand-up"],
  "Fotografie": ["historie fotografie", "techniky", "portrét", "krajina", "reportáž", "móda", "ikonické fotografie", "deepfakes"],
  "Architektura": ["gotika", "baroko", "funkcionalismus", "brutalismus", "Art Nouveau", "Art Deco", "Bauhaus", "Gaudí"],
  "Design": ["průmyslový design", "grafický design", "typografie", "interiérový design", "skandinávský design", "Apple estetika"],
  "Mytologie": ["řecká", "severská", "slovanská", "egyptská", "hinduistická", "mýty o potopě", "hrdinské archetypy", "draci"],
  "Náboženství světa": ["křesťanství", "islám", "buddhismus", "hinduismus", "judaismus", "náboženské relikvie", "sekty a kulty"],

  // BLOK 6: FILOZOFIE (6 kategorií)
  "Antická filozofie": ["sokratovská metoda", "Platónův idealismus", "Aristotelova logika", "cynismus", "skepticismus", "stoicismus", "epikureismus"],
  "Středověká a renesanční filozofie": ["scholastika", "nominalismus vs. realismus", "Avicenna", "Averroes", "humanismus"],
  "Novověká filozofie": ["empirismus", "racionalismus", "Kantův idealismus"],
  "Moderní filozofie": ["existencialismus", "fenomenologie", "analytická filozofie", "pragmatismus"],
  "Etika a morální filozofie": ["deontologie", "konsekvencialismus", "utilitarismus", "ctnostní etika", "bioetika", "práva zvířat"],
  "Metafyzika a epistemologie": ["bytí a substance", "kauzalita", "čas a prostor", "teorie poznání", "pravda", "skepticismus"],

  // BLOK 7: SPOLEČNOST A HUMANITNÍ VĚDY (10 kategorií)
  "Psychologie": ["psychoanalýza", "behaviorismus", "kognitivní psychologie", "sociální psychologie", "slavné experimenty", "fobie"],
  "Sociologie a antropologie": ["sociální struktury", "rodina", "kultura", "migrace", "urbanizace", "rituály", "antropologické výzkumy"],
  "Ekonomie": ["mikroekonomie", "makroekonomie", "ekonomické krize", "hospodářská politika", "ekonomické systémy", "slavní ekonomové"],
  "Právo a spravedlnost": ["právní systémy", "ústavní právo", "trestní právo", "lidská práva", "slavné případy", "bizarní zákony"],
  "Politologie": ["politické systémy", "demokracie", "totalitarismus", "volební systémy", "politické ideologie", "diplomacie"],
  "Jazykověda": ["jazykové rodiny", "vymírající jazyky", "etymologie", "dialekty", "umělé jazyky", "překlad"],
  "Média a žurnalistika": ["historie tisku", "investigativní žurnalistika", "propaganda", "dezinformace", "fake news", "mediální etika"],
  "Rétorika a komunikace": ["argumentační fauly", "slavné projevy", "vyjednávání", "storytelling", "neverbální komunikace", "debatní techniky"],
  "Geopolitika a mezinárodní vztahy": ["mocnosti", "geopolitika surovin", "námořní úžiny", "sankce", "mezinárodní organizace", "konflikty"],
  "Evropská unie": ["instituce EU", "eurozóna", "Schengen", "legislativní proces", "rozšíření EU", "symboly EU"],

  // BLOK 8: SPORT (8 kategorií)
  "Olympijské hry": ["historie olympiád", "letní sporty", "zimní sporty", "rekordy", "skandály", "pořadatelská města", "symboly"],
  "Fotbal": ["historie fotbalu", "MS a ME", "slavné kluby", "legendární hráči", "taktiky", "stadiony", "fotbalová pravidla"],
  "Hokej a zimní sporty": ["NHL", "MS v hokeji", "krasobruslení", "lyžování", "biatlon", "skoky na lyžích", "curling", "snowboarding"],
  "Tenis a raketové sporty": ["grandslamy", "legendy tenisu", "Davis Cup", "badminton", "stolní tenis", "squash"],
  "Motorsport": ["Formule 1", "rally", "MotoGP", "NASCAR", "vytrvalostní závody", "slavní jezdci", "legendární tratě"],
  "Atletika a gymnastika": ["běhy", "skoky a vrhy", "gymnastika", "světové rekordy", "dopingové skandály", "ultra sporty"],
  "Bojové a silové sporty": ["box", "MMA/UFC", "judo", "karate", "wrestling", "vzpírání", "strongman", "šerm"],
  "Ostatní sporty": ["basketbal/NBA", "baseball", "americký fotbal/NFL", "rugby", "golf", "cyklistika", "vodní sporty", "e-sporty"],

  // BLOK 9: GASTRONOMIE (8 kategorií)
  "Světové kuchyně": ["italská", "francouzská", "asijské", "mexická", "středomořská", "blízkovýchodní", "africké", "americká"],
  "Potraviny a suroviny": ["maso", "ryby a mořské plody", "zelenina a ovoce", "mléčné výrobky", "obiloviny", "koření", "oleje"],
  "Kulinářské techniky": ["techniky krájení", "fermentace", "grilování", "pečení", "molekulární gastronomie", "food pairing"],
  "Víno a vinařství": ["terroir", "odrůdy", "apelace", "degustace", "šumivá vína", "fortifikovaná vína", "vinařské regiony"],
  "Pivo a pivovarnictví": ["lager vs. ale", "chmel a slad", "pivní styly světa", "craft revoluce", "párování s jídlem"],
  "Destiláty a koktejly": ["whisky", "vodka", "rum", "gin", "likéry", "koktejlová kultura", "bary a mixologie"],
  "Káva a čaj": ["odrůdy kávy", "čajové ceremonie", "kofein", "kávová kultura", "čajové rituály", "kakao"],
  "Gastronomické fenomény": ["Michelinské hvězdy", "slavní šéfkuchaři", "street food", "fast food", "gastronomické trendy", "kulinářské soutěže"],

  // BLOK 10: ZÁBAVA A VOLNÝ ČAS (10 kategorií)
  "Deskové hry": ["šachy", "go", "Monopoly", "strategické hry", "kooperativní hry", "karetní hry", "moderní deskovky", "D&D"],
  "Videohry a gaming": ["historie videoher", "konzolové války", "PC gaming", "herní žánry", "legendární série", "e-sport", "easter eggs"],
  "Hazard a sázení": ["poker", "blackjack", "ruleta", "loterie", "kasina světa", "pravděpodobnost", "slavní podvodníci"],
  "Sběratelství": ["filatelie", "numismatika", "vinyly", "memorabilie", "veterány", "podivné sbírky"],
  "Hádanky a logické hry": ["křížovky", "sudoku", "rébusy", "hlavolamy", "paradoxy", "escape room logika", "IQ testy"],
  "Móda a krása": ["dějiny módy", "módní domy", "módní ikony", "kosmetika", "parfumerie", "šperky", "udržitelná móda"],
  "Domácí mazlíčci": ["psi - plemena", "kočky - plemena", "akvarijní ryby", "exotická zvířata", "výcvik", "veterinární péče"],
  "Zahradničení a příroda": ["pěstování rostlin", "pokojovky", "bylinky", "jedovaté rostliny", "bonsaje", "sběr hub"],
  "Přežití v přírodě": ["rozdělávání ohně", "uzly", "orientace", "jedlé rostliny", "stavba přístřešku", "první pomoc"],
  "Komiksy a fandomy": ["Marvel vs. DC", "manga", "evropské komiksy", "superhrdinové", "sběratelství", "fanfikce", "cosplay"],

  // BLOK 11: PIKANTNÍ A DOSPĚLÉ (10 kategorií)
  "Alkohol a opojení": ["historie alkoholu", "legendární opilci", "prohibice", "absint", "alkohol v kultuře", "kocovina"],
  "Sex, láska a vztahy": ["afrodiziaka", "historie antikoncepce", "slavné milenecké páry", "Kámasútra", "erotika v umění"],
  "Kriminalita a podsvětí": ["sérioví vrazi", "slavné loupeže", "mafiánské klany", "vězeňský slang", "pašeráctví", "organizovaný zločin"],
  "Drogy a psychedelika": ["opium v 19. století", "hippies éra", "vliv drog na umění", "léčebné využití", "prohibice drog"],
  "Noční život": ["legendární kluby", "taneční styly", "rave kultura", "kabaret a burleska", "DJ kultura"],
  "Tabák a kouření": ["kubánské doutníky", "historie kouření", "dýmkové rituály", "zákazy kouření", "tabákový průmysl"],
  "Špionáž a tajné služby": ["Mata Hari", "KGB vs. CIA", "Enigma", "dvojití agenti", "špionážní gadgety", "slavné operace"],
  "Kriminalistika a forenzní věda": ["DNA", "otisky prstů", "balistika", "toxikologie", "profilování", "slavné případy"],
  "Podvody a skandály": ["Ponzi schémata", "falza umění", "účetní podvody", "hoaxy", "pyramidové hry", "finanční bubliny"],
  "Konspirace a záhady": ["JFK", "Ilumináti", "UFO historie", "nevyřešené záhady", "Bermudský trojúhelník", "záhady historie"],

  // BLOK 12: KURIOZITY (8 kategorií)
  "Guinessovy rekordy": ["tělesné modifikace", "největší sbírky", "pojídání", "vytrvalost", "hromadné akce", "kuriózní rekordy"],
  "Darwinovy ceny": ["nejhloupější úmrtí", "selhání bezpečnosti", "hloupost zločinců", "domácí nehody"],
  "Bizarní zákony": ["zákony v USA", "historické zákony", "zákony o zvířatech", "daňové kuriozity", "byrokratické absurdity"],
  "Městské legendy": ["Krvavá Mary", "stopař duchů", "jídlo z potkanů", "únosy mimozemšťany", "černá sanitka"],
  "Pověry a rituály": ["černá kočka", "pátek 13.", "rozbité zrcadlo", "svatební pověry", "pohřební rituály", "kulturní tabu"],
  "Etymologie a jazykové kuriozity": ["původ slov", "falešní přátelé", "palindromy", "internet slang", "nadávky", "jména a jejich význam"],
  "Slavné citáty": ["vědecké citáty", "politické", "filozofické", "filmové hlášky", "špatně připisované citáty", "poslední slova"],
  "Symboly a vlajky": ["státní vlajky", "heraldika", "náboženské symboly", "korporátní loga", "emoji", "tajné symboly"],

  // BLOK 13: BUSINESS A PRÁCE (4 kategorie)
  "Marketing a značky": ["positioning", "psychologie cenovky", "neuromarketing", "virální kampaně", "rebranding", "slogany"],
  "Management a leadership": ["motivace týmů", "OKR/KPI", "rozhodování", "projektové metodiky", "firemní kultura", "konflikty"],
  "Startupy a podnikání": ["business model", "fundraising", "pitch", "škálování", "fail stories", "Silicon Valley"],
  "Pracovní trh a kariéra": ["vyhoření", "home office", "nejhůře placené práce", "bizarní povolání", "budoucnost práce"],

  // BLOK 14: ČESKÉ KATEGORIE (10 kategorií)
  "Česká historie": ["Velká Morava", "Přemyslovci", "Karel IV.", "husitství", "Habsburkové", "1918", "1968", "1989"],
  "České filmy a hlášky": ["Pelíšky", "Slunce seno", "Svěrákovy filmy", "česká nová vlna", "pohádky", "Český lev"],
  "Česká kuchyně": ["omáčky", "knedlíky", "svíčková", "zabíjačka", "chlebíčky", "sváteční jídla", "regionální speciality"],
  "České pivo a víno": ["pivovary", "pivní styly", "historie českého piva", "moravské víno", "vinařské regiony"],
  "Česká hudební scéna": ["Karel Gott", "underground", "folk festivaly", "české muzikály", "legendární kapely", "Smetana a Dvořák"],
  "Česká literatura": ["Kundera", "Hrabal", "Hašek a Švejk", "Čapek", "Neruda", "povinná četba", "literární ceny"],
  "Čeští vynálezci a vědci": ["Wichterle", "Křižík", "Mendel", "Purkyně", "Heyrovský", "Semtex"],
  "Český sport": ["Nagano 98", "Jágr", "Zátopek", "tenisové legendy", "fotbalová reprezentace", "olympionici"],
  "Praha a její tajemství": ["Golem", "pražské podzemí", "mosty", "kavárny", "strašidla", "pražské legendy", "architektura"],
  "České regiony a tradice": ["Ostravsko", "brněnský hantec", "Morava", "Šumava", "české sklo", "chataření", "houbaření"]
};

// === FLATTEN: Převod struktury na ploché pole témat ===
// Automaticky přidává "Obecná otázka z kategorie" ke každé kategorii
const ALL_TOPICS = Object.entries(CATEGORIES_ADULT).flatMap(([category, topics]) => [
  ...topics.map(topic => `${category}: ${topic}`),
  `${category}: Obecná otázka z kategorie`
]);

// === STRUKTUROVANÉ KATEGORIE A TÉMATA PRO STUDENTY (90 kategorií) ===
// Zdroj: STRUKTURA_KATEGORII_A_TEMAT_STUDENTI.md
// "Obecná otázka z kategorie" se přidává automaticky při flatten
const CATEGORIES_STUDENT = {
  // BLOK 1: MATEMATIKA (4 kategorie)
  "Matematika – algebra a rovnice": ["lineární rovnice", "kvadratické rovnice", "nerovnice", "systémy rovnic", "polynomy", "exponenciální a logaritmické funkce"],
  "Matematika – geometrie": ["trojúhelníky a kružnice", "Pythagorova věta", "podobnost a shodnost", "objemy a povrchy", "analytická geometrie", "vektory"],
  "Matematika – goniometrie a funkce": ["sinus/kosinus/tangens", "grafy funkcí", "trigonometrické rovnice", "jednotková kružnice", "posloupnosti"],
  "Matematika – statistika a pravděpodobnost": ["kombinatorika", "pravděpodobnost", "průměr/medián/modus", "grafy a interpretace dat", "normální rozdělení"],

  // BLOK 2: FYZIKA (4 kategorie)
  "Fyzika – mechanika": ["Newtonovy zákony", "práce a energie", "hybnost", "tření", "pohyb v kružnici", "jednoduché stroje"],
  "Fyzika – elektřina a magnetismus": ["Ohmův zákon", "elektrické obvody", "magnetické pole", "elektromagnetická indukce", "střídavý proud"],
  "Fyzika – vlnění a optika": ["zvuk a frekvence", "odraz a lom světla", "čočky a zrcadla", "spektrum a barvy", "Dopplerův jev"],
  "Fyzika – moderní fyzika": ["atomová struktura", "radioaktivita", "speciální relativita", "základy kvantové mechaniky", "jaderné reakce"],

  // BLOK 3: CHEMIE (3 kategorie)
  "Chemie – obecná": ["periodická tabulka", "chemické vazby", "reakce a rovnice", "pH a kyseliny/zásady", "oxidace a redukce", "chemie v domácnosti"],
  "Chemie – organická": ["uhlovodíky", "alkoholy a kyseliny", "plasty a polymery", "léčiva", "izomerie"],
  "Chemie – biochemie": ["bílkoviny", "sacharidy", "tuky", "enzymy", "vitaminy", "metabolismus"],

  // BLOK 4: BIOLOGIE (4 kategorie)
  "Biologie – buňka a genetika": ["stavba buňky", "DNA a RNA", "dědičnost", "Mendelovy zákony", "mutace", "genetické testy"],
  "Biologie – lidské tělo": ["oběhová soustava", "nervová soustava", "trávicí soustava", "dýchací soustava", "imunita", "smysly", "hormony"],
  "Biologie – ekologie a evoluce": ["ekosystémy", "potravní řetězce", "biodiverzita", "Darwinova teorie", "přirozený výběr", "klimatická změna"],
  "Biologie – botanika a zoologie": ["rostlinná stavba", "fotosyntéza", "živočišná říše", "houby", "mikroorganismy", "ohrožené druhy"],

  // BLOK 5: ZEMĚPIS (4 kategorie)
  "Zeměpis – fyzický": ["stavba Země", "tektonika desek", "sopky a zemětřesení", "atmosféra", "hydrosféra", "podnebné pásy"],
  "Zeměpis – Česko a Evropa": ["české regiony a kraje", "česká pohoří a řeky", "sousední státy", "EU a Schengen", "evropské státy"],
  "Zeměpis – svět": ["kontinenty", "hlavní města", "časová pásma", "světové velmoci", "přírodní divy", "rekordy přírody"],
  "Zeměpis – socioekonomický": ["světová populace", "urbanizace", "globalizace", "hospodářství", "mezinárodní organizace", "migrace"],

  // BLOK 6: DĚJEPIS (6 kategorií)
  "Dějepis – starověk": ["Egypt a pyramidy", "antické Řecko", "Římská říše", "Mezopotámie", "antická kultura", "mýty vs. fakta"],
  "Dějepis – středověk": ["feudalismus", "křížové výpravy", "rytíři a hrady", "církev", "města a cechy", "morové epidemie"],
  "Dějepis – novověk": ["zámořské objevy", "reformace", "třicetiletá válka", "osvícenství", "průmyslová revoluce", "Francouzská revoluce"],
  "Dějepis – světové války": ["první světová válka", "meziválečné období", "druhá světová válka", "holocaust", "zbraně a technika", "život na frontě"],
  "Dějepis – studená válka a současnost": ["bipolární svět", "Berlínská zeď", "vesmírný závod", "dekolonizace", "pád komunismu", "současné konflikty"],
  "Dějepis – české dějiny": ["Přemyslovci", "Karel IV.", "husitství", "Habsburkové", "národní obrození", "1918", "1948", "1968", "1989"],

  // BLOK 7: ČESKÁ LITERATURA (4 kategorie)
  "Česká literatura – středověk a baroko": ["Kosmas", "Jan Hus", "humanismus", "baroko", "Komenský"],
  "Česká literatura – 19. století": ["národní obrození", "Mácha a romantismus", "Němcová a realismus", "Neruda", "májovci a ruchovci"],
  "Česká literatura – 20. století": ["Čapek", "Hašek a Švejk", "Hrabal", "Kundera", "Havel", "meziválečná literatura"],
  "Česká literatura – poezie a drama": ["Seifert", "Halas", "Holan", "české divadlo", "absurdní drama", "současní autoři"],

  // BLOK 8: SVĚTOVÁ LITERATURA (6 kategorií)
  "Světová literatura – antika a středověk": ["Homér", "řecké drama", "Dante", "Chaucer", "Bible jako literatura"],
  "Světová literatura – renesance a klasicismus": ["Shakespeare – tragédie", "Shakespeare – komedie", "Molière", "Cervantes"],
  "Světová literatura – 19. století": ["romantismus", "realismus", "Dostojevskij", "Tolstoj", "Brontëovy"],
  "Světová literatura – 20. století": ["Kafka", "Hemingway", "Orwell", "Joyce", "magický realismus"],
  "Světová literatura – ruská a francouzská": ["Puškin", "Čechov", "Gogol", "Hugo", "Zola", "Maupassant"],
  "Světová literatura – současná a žánrová": ["young adult", "fantasy a sci-fi", "thrillery", "komiksy a manga", "bestsellery", "Stephen King"],

  // BLOK 9: ČESKÝ JAZYK A CIZÍ JAZYKY (3 kategorie)
  "Český jazyk": ["pravopis a vyjmenovaná slova", "větná skladba", "slovní druhy", "stylistika", "vývoj jazyka", "nářečí"],
  "Angličtina": ["gramatika a časy", "slovní zásoba", "idiomy a fráze", "britská vs. americká", "reálie USA/UK", "angličtina v popkultuře"],
  "Cizí jazyky": ["němčina – základy", "francouzština – základy", "španělština – základy", "falešní přátelé", "jazykové rodiny"],

  // BLOK 10: OBČANSKÁ NAUKA A PRÁVO (3 kategorie)
  "Občanská nauka": ["Ústava ČR", "politický systém", "volby a demokracie", "politické ideologie", "EU a její instituce"],
  "Právo pro život": ["lidská práva", "trestní a občanské právo", "od kolika let co můžu", "smlouvy", "pracovní právo", "autorská práva"],
  "Filosofie a etika": ["antická filosofie", "etická dilemata", "základní směry", "slavní filosofové", "filosofie pro začátečníky"],

  // BLOK 11: INFORMATIKA A TECHNOLOGIE (5 kategorií)
  "Informatika – základy": ["hardware a software", "operační systémy", "soubory a formáty", "počítačové sítě", "cloud"],
  "Programování": ["proměnné a podmínky", "cykly a funkce", "algoritmické myšlení", "programovací jazyky", "ladění chyb"],
  "Kyberbezpečnost": ["hesla a 2FA", "phishing", "digitální stopa", "soukromí online", "bezpečné sdílení", "hoaxy a podvody"],
  "Umělá inteligence a moderní tech": ["co je AI", "ChatGPT a generativní nástroje", "deepfakes", "VR a AR", "roboti", "budoucnost technologií"],
  "Internet a sítě": ["jak funguje web", "Wi-Fi", "IP a DNS", "historie internetu", "síťová neutralita"],

  // BLOK 12: DIGITÁLNÍ SVĚT A SOCIÁLNÍ SÍTĚ (4 kategorie)
  "Sociální sítě": ["TikTok", "Instagram", "YouTube", "algoritmy a bubliny", "influenceři", "digitální wellbeing"],
  "Memy a internetová kultura": ["původ slavných memů", "virální videa", "internetový slang", "emoji", "cancel culture"],
  "Média a kritické myšlení": ["fake news", "fact-checking", "clickbait", "manipulace obrazem", "propaganda", "mediální gramotnost"],
  "Digitální tvorba": ["grafický design", "video editing", "tvorba obsahu", "podcast", "fotografie", "osobní branding"],

  // BLOK 13: GAMING (3 kategorie)
  "Videohry – kompetitivní": ["League of Legends/Dota", "CS:GO a Valorant", "Fortnite", "e-sport týmy", "herní slang"],
  "Videohry – příběhové a klasiky": ["Minecraft", "The Witcher", "GTA", "Assassin's Creed", "Nintendo klasiky", "indie hry"],
  "Gaming kultura": ["historie konzolí", "streamování her", "herní vývojáři", "easter eggs", "speedrunning"],

  // BLOK 14: FILM A SERIÁLY (4 kategorie)
  "Filmové trháky": ["Marvel vs. DC", "Star Wars", "Harry Potter", "Rychle a zběsile", "horory"],
  "Seriály a streaming": ["Netflix originals", "Stranger Things", "sitcomy", "true crime", "reality show"],
  "České filmy a seriály": ["česká klasika", "česká nová vlna", "čeští režiséři a herci", "pohádky"],
  "Film – technika a pojmy": ["filmové žánry", "Oscarové filmy", "filmové techniky", "adaptace knih", "filmové hlášky"],

  // BLOK 15: HUDBA (3 kategorie)
  "Hudba – klasická a teorie": ["hudební nástroje", "hudební pojmy", "čeští skladatelé", "světoví skladatelé", "orchestr"],
  "Hudba – populární": ["rap a hip hop", "pop", "rock", "K-pop", "elektronika", "letní hity"],
  "Hudba – scéna a festivaly": ["čeští interpreti", "světové hvězdy", "hudební festivaly", "hudební ceny", "historie popu"],

  // BLOK 16: ANIME A MANGA (1 kategorie)
  "Anime a manga": ["Naruto", "One Piece", "Pokémon", "Studio Ghibli", "Attack on Titan", "japonská popkultura"],

  // BLOK 17: UMĚNÍ A KULTURA (3 kategorie)
  "Výtvarné umění": ["malířské techniky", "slavné obrazy", "čeští malíři", "sochařství", "street art a graffiti"],
  "Architektura a design": ["architektonické styly", "slavné stavby", "moderní architektura", "průmyslový design", "grafický design"],
  "Divadlo": ["divadelní žánry", "Shakespeare na jevišti", "česká divadelní scéna", "muzikály", "improvizace"],

  // BLOK 18: SPORT (4 kategorie)
  "Populární sporty": ["fotbal", "hokej", "basketbal", "tenis", "atletika", "zimní sporty"],
  "Olympiáda a velké akce": ["letní a zimní olympiáda", "MS ve fotbale", "MS v hokeji", "čeští sportovci", "olympijské rekordy"],
  "Extrémní a alternativní sporty": ["skateboarding", "BMX", "parkour", "surfing", "snowboarding", "e-sport jako sport"],
  "Sportovní kultura": ["sportovní značky", "stadiony", "doping", "transfery a peníze", "fanouškovská kultura", "sportovní pravidla"],

  // BLOK 19: ZDRAVÍ A ŽIVOTNÍ STYL (4 kategorie)
  "Zdraví a první pomoc": ["resuscitace", "co dělat při úrazu", "běžné nemoci", "prevence", "alkohol a účinky", "spánek"],
  "Výživa a stravování": ["zdravá výživa", "makroživiny", "cukr a mýty", "pitný režim", "kofein", "etikety potravin"],
  "Fitness a cvičení": ["posilovna", "regenerace", "prevence zranění", "strava sportovců", "trendy ve fitness"],
  "Duševní zdraví": ["stres a jeho zvládání", "emoce", "mentální hygiena", "závislosti", "kde hledat pomoc"],

  // BLOK 20: PRAKTICKÝ ŽIVOT (6 kategorií)
  "Finanční gramotnost": ["bankovní účet", "spoření", "rozpočet", "kreditky a dluhy", "kryptoměny základy", "finanční podvody"],
  "Práce a kariéra": ["životopis", "pohovor", "brigády", "soft skills", "profesní orientace", "networking"],
  "Studium a vzdělávání": ["maturita", "vysoké školy v ČR", "studium v zahraničí", "efektivní učení", "gap year", "online vzdělávání"],
  "Vztahy a komunikace": ["typy vztahů", "komunikační dovednosti", "red flags", "asertivita", "online vs. offline"],
  "Cestování": ["cestování s rozpočtem", "evropské destinace", "cestovní dokumenty", "bezpečnost", "kulturní rozdíly"],
  "Občanský život": ["občanský průkaz", "volby – jak volit", "řidičský průkaz", "zdravotní pojištění", "úřady"],

  // BLOK 21: EKOLOGIE (1 kategorie)
  "Ekologie a udržitelnost": ["klimatická změna", "recyklace", "uhlíková stopa", "obnovitelné zdroje", "zero waste", "greenwashing"],

  // BLOK 22: MÓDA A LIFESTYLE (2 kategorie)
  "Móda a styl": ["sneakers kultura", "streetwear značky", "udržitelná móda", "historie trendů", "subkulturní styly"],
  "Auto-moto": ["značky aut", "tuning", "Formule 1", "motorky", "jak vyměnit kolo", "dopravní značky"],

  // BLOK 23: KURIOZITY A ZÁBAVA (5 kategorií)
  "Guinnessovy rekordy": ["bláznivé rekordy", "jídlo a pití", "zvířecí rekordy", "sportovní kuriozity", "lidské extrémy"],
  "Záhady a konspirace": ["UFO a Area 51", "Bermudský trojúhelník", "městské legendy", "nevyřešené záhady", "paranormálno"],
  "Věda populárně": ["jak fungují věci", "vesmírné lety", "zajímavosti o zvířatech", "optické klamy", "Nobelovy ceny"],
  "Hlášky a citáty": ["filmové hlášky", "citáty slavných", "internetové hlášky", "přísloví", "české hlášky"],
  "Hádanky a logika": ["logické hádanky", "IQ úlohy", "rébusy", "escape room logika", "matematické hříčky", "laterální myšlení"],

  // BLOK 24: ČESKÉ ZAMĚŘENÍ (4 kategorie)
  "Česká republika": ["kraje a regiony", "česká nej", "čeští prezidenti", "české vynálezy", "české značky"],
  "Česká jídla a tradice": ["česká kuchyně", "vánoční tradice", "velikonoce", "svátky", "regionální speciality"],
  "Čeští vědci a osobnosti": ["čeští vynálezci", "sportovci", "umělci", "Češi ve světě"],
  "Studentský život v Česku": ["typy učitelů", "školní slang", "maturitní ples", "povinná četba vs. realita", "studentské tradice"]
};

// === FLATTEN: Převod struktury na ploché pole témat ===
// Automaticky přidává "Obecná otázka z kategorie" ke každé kategorii
const STUDENT_TOPICS = Object.entries(CATEGORIES_STUDENT).flatMap(([category, topics]) => [
  ...topics.map(topic => `${category}: ${topic}`),
  `${category}: Obecná otázka z kategorie`
]);

// === STRUKTUROVANÉ KATEGORIE A TÉMATA PRO DĚTI (45 kategorií) ===
// Zdroj: STRUKTURA_KATEGORII_A_TEMAT_KIDS.md
// "Obecná otázka z kategorie" se přidává automaticky při flatten
const CATEGORIES_KIDS = {
  // BLOK 1: ZVÍŘATA (8 kategorií)
  "Domácí mazlíčci": ["psi a jejich plemena", "kočky", "křečci a morčata", "králíci", "akvarijní rybičky", "papoušci a ptáci", "péče o mazlíčky"],
  "Zvířata na farmě": ["krávy a telata", "prasata", "ovce a kozy", "slepice a kuřata", "koně a poníci", "kachny a husy", "co nám dávají hospodářská zvířata"],
  "Zvířata v lese": ["lesní savci", "lesní ptáci", "stopy zvířat", "noční zvířata", "jak se zvířata chrání", "zimní spánek", "les a jeho obyvatelé"],
  "Africká a exotická zvířata": ["safari zvířata", "opice a lidoopi", "zvířata džungle", "australská zvířata", "zvířata Ameriky", "zvířata Asie", "zvířecí rekordy"],
  "Vodní živočichové": ["delfíni a velryby", "žraloci", "ryby", "krokodýli a aligátoři", "želvy", "chobotnice a medúzy", "korálové útesy"],
  "Ptáci": ["ptáci u krmítka", "dravci", "vodní ptáci", "exotičtí ptáci", "ptačí hnízda a vejce", "tažní ptáci", "nelétaví ptáci"],
  "Hmyz a drobní živočichové": ["motýli", "včely a jejich důležitost", "mravenci", "brouci", "pavouci", "žáby a obojživelníci", "plazi"],
  "Dinosauři a pravěk": ["nejznámější dinosauři", "T-Rex a masožravci", "býložraví dinosauři", "létající pravěká zvířata", "pravěká mořská stvoření", "mamuti", "fosilie a zkameněliny", "jak dinosauři vyhynuli"],

  // BLOK 2: PŘÍRODA A PLANETA (5 kategorií)
  "Stromy a rostliny": ["stromy a jejich listy", "květiny", "ovoce", "zelenina", "houby", "jak rostou rostliny", "fotosyntéza jednoduše"],
  "Počasí a roční období": ["déšť a sníh", "bouřka a blesky", "duha", "vítr", "jaro, léto, podzim, zima", "rekordní počasí", "předpověď počasí"],
  "Planeta Země": ["hory a pohoří", "řeky a jezera", "moře a oceány", "pouště", "ledovce a polární oblasti", "sopky", "ostrovy"],
  "Vesmír pro děti": ["sluneční soustava", "Slunce", "Měsíc", "planety", "hvězdy", "astronauti a kosmonauti", "rakety a vesmírné lodě", "den a noc"],
  "Ekologie pro děti": ["třídění odpadu", "šetření vodou a energií", "ohrožená zvířata", "znečištění a plasty", "stromy a kyslík", "co můžu udělat já pro přírodu", "proč chránit přírodu"],

  // BLOK 3: LIDSKÉ TĚLO A ZDRAVÍ (3 kategorie)
  "Lidské tělo": ["kostra a kosti", "srdce a krev", "mozek", "smysly", "zuby", "svaly", "trávení jídla", "jak rosteme"],
  "Zdraví a hygiena": ["hygienické návyky", "zdravá strava", "pohyb a sport", "spánek", "nemoc a imunita", "vitamíny", "co jíst a co nejíst"],
  "Bezpečnost a první pomoc": ["jak přejít silnici", "dopravní značky", "co dělat, když se ztratím", "bezpečnost u vody", "důležitá telefonní čísla", "požární bezpečnost", "drobná poranění", "cizí lidé a jak se chovat"],

  // BLOK 4: VĚDA A TECHNIKA (5 kategorií)
  "Jednoduchá fyzika": ["magnety", "elektřina v domácnosti", "voda a led", "světlo a stín", "zvuk", "tření", "jak věci padají"],
  "Pokusy a experimenty": ["pokusy s vodou", "pokusy s magnety", "chemie v kuchyni", "barvení a míchání", "sopka z octa a sody", "rostlinné experimenty", "pokusy doma"],
  "Vynálezy a objevy": ["kdo vynalezl žárovku", "historie dopravy", "telefon a jeho vývoj", "slavní vědci pro děti", "vynálezy, které změnily svět", "jednoduché stroje", "jak fungují věci"],
  "Moderní technika": ["počítače a tablety", "části počítače", "internet a bezpečnost", "mobilní telefony", "roboti", "doprava budoucnosti", "vesmírná technika"],
  "Doprava": ["auta", "vlaky", "letadla", "lodě", "autobusy a tramvaje", "kolo a koloběžka", "motorky"],

  // BLOK 5: ČESKO A SVĚT (5 kategorií)
  "Česká republika": ["Praha a její památky", "české hrady a zámky", "české hory a řeky", "kraje České republiky", "české tradice", "slavní Češi", "státní symboly"],
  "Svět kolem nás": ["kontinenty", "oceány", "největší a nejmenší země", "hlavní města", "světové památky a divy", "jazyky světa", "vlajky"],
  "Tradice a svátky": ["Vánoce", "Velikonoce", "Mikuláš", "narozeniny", "Halloween", "masopust", "tradice z celého světa"],
  "Jak se žilo dřív": ["pravěk a lovci mamutů", "staří Egypťané", "rytíři a hrady", "jak žily děti dřív", "škola kdysi a dnes", "hračky našich prarodičů", "vynálezy, které změnily život"],
  "Povolání": ["hasiči", "policisté", "lékaři a zdravotníci", "učitelé", "veterináři", "piloti", "kuchaři", "stavbaři"],

  // BLOK 6: POHÁDKY A PŘÍBĚHY (4 kategorie)
  "České pohádky": ["pohádkové postavy", "Večerníček", "české pohádkové filmy", "princezny a princové", "kouzelné předměty", "čeští pohádkoví autoři", "nejznámější české pohádky"],
  "Světové pohádky": ["Popelka, Sněhurka, Červená Karkulka", "bratři Grimmové", "Hans Christian Andersen", "Pinocchio", "Petr Pan", "Kniha džunglí", "Tisíc a jedna noc"],
  "Fantasy a dobrodružství": ["Harry Potter", "draci", "čarodějové a magie", "víly a skřítci", "rytíři a hrdinové", "bájná stvoření", "dobrodružné příběhy"],
  "Knižní hrdinové": ["hrdinové z knih", "komiksoví hrdinové", "bajky a jejich poučení", "pověsti", "detektivky pro děti", "příběhy o zvířatech", "dobrodružství slavných postav"],

  // BLOK 7: FILMY A SERIÁLY (3 kategorie)
  "Disney a Pixar": ["Disney klasiky", "Pixar filmy", "Disney princezny", "zvířecí filmy", "pohádky od Disneyho", "oblíbené postavičky", "nové Disney filmy"],
  "Animované seriály": ["české animované seriály", "zahraniční animáky", "kreslené postavičky", "animované filmy", "anime pro děti", "seriály z dětství rodičů", "nové oblíbené seriály"],
  "Superhrdinové": ["Marvel hrdinové", "DC hrdinové", "superhrdinské filmy", "superhrdinské schopnosti", "záporáci", "týmy superhrdinů", "příběhy superhrdinů"],

  // BLOK 8: HUDBA A UMĚNÍ (3 kategorie)
  "Hudba pro děti": ["dětské písničky", "hudební nástroje", "hudba z pohádek", "rytmus a takt", "zvuky přírody", "zpěváci a kapely pro děti", "jak vzniká hudba"],
  "Výtvarné umění": ["barvy a jejich míchání", "kreslení a malování", "známí malíři pro děti", "tvary v umění", "koláže a techniky", "sochařství", "optické klamy"],
  "Tvoření a kreativita": ["modelování", "origami", "ruční práce", "pletení a háčkování", "výrobky z papíru", "recyklované tvoření", "dárky vlastní výroby"],

  // BLOK 9: HRY A SPORT (4 kategorie)
  "Sporty": ["fotbal", "hokej", "plavání", "gymnastika", "atletika", "zimní sporty", "bojové sporty", "olympijské hry"],
  "Hry a hračky": ["stolní a karetní hry", "LEGO", "puzzle", "hry venku", "pohybové hry", "panenky a plyšáci", "stavebnice"],
  "Videohry pro děti": ["Minecraft", "Roblox", "Pokémon", "Mario", "herní konzole", "mobilní hry", "hry s kamarády"],
  "YouTube a internet": ["YouTubeři pro děti", "vzdělávací videa", "bezpečnost na internetu", "oblíbené kanály", "virální videa pro děti", "streaming pro děti", "co sledovat a co ne"],

  // BLOK 10: ŠKOLA HROU (3 kategorie)
  "Čeština hrou": ["abeceda", "vyjmenovaná slova", "slovní druhy", "protikladná slova", "rýmy", "přísloví a pořekadla", "jazykolamy"],
  "Matematika hrou": ["sčítání a odčítání", "násobení", "geometrické tvary", "měření a jednotky", "čas a hodiny", "peníze a počítání", "logické úlohy"],
  "Angličtina hrou": ["barvy anglicky", "čísla anglicky", "zvířata anglicky", "jídlo anglicky", "rodina anglicky", "základní fráze", "písničky v angličtině"],

  // BLOK 11: JÍDLO (1 kategorie)
  "Jídlo a vaření pro děti": ["ovoce a zelenina", "odkud je jídlo", "zdravá svačina", "základy v kuchyni", "tradiční česká jídla", "sladkosti a dezerty", "jídla z celého světa"],

  // BLOK 12: ZAJÍMAVOSTI (1 kategorie)
  "Zábavné Proč a kuriozity": ["proč je obloha modrá", "proč mají zebry pruhy", "odkud se bere déšť", "proč svítí hvězdy", "proč zíváme", "proč je sníh bílý", "legrační fakta o zvířatech", "neuvěřitelné rekordy"]
};

// === FLATTEN: Převod struktury na ploché pole témat ===
// Automaticky přidává "Obecná otázka z kategorie" ke každé kategorii
const KIDS_TOPICS = Object.entries(CATEGORIES_KIDS).flatMap(([category, topics]) => [
  ...topics.map(topic => `${category}: ${topic}`),
  `${category}: Obecná otázka z kategorie`
]);

export function getAgeGroups() {
  return Object.entries(AGE_GROUP_CONFIG).map(([key, config]) => ({ key, ...config }));
}

/**
 * 🆕 Získá další téma z globální rotace (bez opakování pro danou kategorii)
 * Používá DB pro perzistenci mezi restarty serveru
 * @param {boolean} skipDbWrite - Pokud true, téma se NEZAPÍŠE do DB (pro retry mechanismus)
 * @param {string} ageGroup - 'adult', 'student', nebo 'kids'
 */
async function getNextTopic(skipDbWrite = false, ageGroup = 'adult') {
  // Výběr správné sady témat podle kategorie
  const topicSets = {
    adult: ALL_TOPICS,
    student: STUDENT_TOPICS,
    kids: KIDS_TOPICS
  };
  const topics = topicSets[ageGroup] || ALL_TOPICS;
  const prefix = `${ageGroup}:`;
  
  // Fallback pokud DB není dostupná
  if (!useDatabase || !questionDatabase) {
    return topics[Math.floor(Math.random() * topics.length)];
  }

  try {
    const allUsedTopics = await questionDatabase.getUsedTopics();
    // Filtrovat pouze témata pro danou kategorii (podle prefixu)
    const usedTopics = allUsedTopics
      .filter(t => t.startsWith(prefix))
      .map(t => t.substring(prefix.length));
    
    const usedSet = new Set(usedTopics);
    const available = topics.filter(t => !usedSet.has(t));

    // Pokud všechna témata použita → reset pro tuto kategorii a začni znovu
    if (available.length === 0) {
      console.log(`🔄 Všech ${topics.length} témat (${ageGroup}) použito, resetuji...`);
      // Selektivní reset - smažeme pouze témata s daným prefixem
      await resetTopicsForCategory(ageGroup);
      const topic = topics[Math.floor(Math.random() * topics.length)];
      if (!skipDbWrite) {
        await questionDatabase.markTopicUsed(prefix + topic);
      }
      return topic;
    }

    // Vyber náhodně z dostupných
    const topic = available[Math.floor(Math.random() * available.length)];
    
    if (!skipDbWrite) {
      await questionDatabase.markTopicUsed(prefix + topic);
    }
    
    console.log(`📚 Téma (${ageGroup}): "${topic}" (zbývá ${available.length - 1}/${topics.length})`);
    return topic;
  } catch (e) {
    console.error('getNextTopic error:', e.message);
    return topics[Math.floor(Math.random() * topics.length)];
  }
}

/**
 * 🆕 Resetuje témata pouze pro danou kategorii
 * @param {string} ageGroup - 'adult', 'student', nebo 'kids'
 */
async function resetTopicsForCategory(ageGroup) {
  if (!useDatabase || !questionDatabase) return;
  
  try {
    const allUsedTopics = await questionDatabase.getUsedTopics();
    const prefix = `${ageGroup}:`;
    const topicsToReset = allUsedTopics.filter(t => t.startsWith(prefix));
    
    // Resetujeme celou tabulku a znovu přidáme témata ostatních kategorií
    const otherTopics = allUsedTopics.filter(t => !t.startsWith(prefix));
    await questionDatabase.resetTopicRotation();
    
    for (const topic of otherTopics) {
      await questionDatabase.markTopicUsed(topic);
    }
    
    console.log(`🔄 Reset ${topicsToReset.length} témat pro kategorii ${ageGroup}`);
  } catch (e) {
    console.error('resetTopicsForCategory error:', e.message);
  }
}

/**
 * 🆕 Zapíše použitá témata do DB (volá se až po úspěšné validaci)
 * @param {string[]} topics - Pole témat k zapsání
 * @param {string} ageGroup - 'adult', 'student', nebo 'kids'
 */
async function markTopicsAsUsed(topics, ageGroup = 'adult') {
  if (!useDatabase || !questionDatabase || !topics || topics.length === 0) return;
  
  const prefix = `${ageGroup}:`;
  for (const topic of topics) {
    await questionDatabase.markTopicUsed(prefix + topic);
  }
  console.log(`💾 Zapsáno ${topics.length} témat (${ageGroup}) do DB`);
}

// === FACT CHECKING (SONAR) ===
async function validateWithSonar(questionData) {
  if (!PERPLEXITY_API_KEY) {
    validationStats.skippedPerplexity++;
    return true; 
  }

  const correctAnswer = questionData.options[questionData.correct];
  const otherOptions = questionData.options.filter((_, i) => i !== questionData.correct);
  
  const prompt = `Jsi FACT-CHECKER kvízových otázek. Ověř POUZE faktickou správnost.

OTÁZKA: "${questionData.question}"
OZNAČENÁ SPRÁVNÁ ODPOVĚĎ: "${correctAnswer}"
OSTATNÍ MOŽNOSTI: ${otherOptions.join(", ")}

═══════════════════════════════════════════════════════════
KONTROLUJ POUZE:
═══════════════════════════════════════════════════════════

1. Je "${correctAnswer}" FAKTICKY SPRÁVNÁ odpověď?
2. Jsou "${otherOptions.join('" a "')}" FAKTICKY ŠPATNÉ?
3. Nemůže být správná i jiná z nabízených možností?

═══════════════════════════════════════════════════════════
PRAVIDLA TOLERANCE:
═══════════════════════════════════════════════════════════
- IGNORUJ okrajové případy a teoretické výjimky
- IGNORUJ vědecké nuance
- Hodnoť z pohledu běžného kvízu

═══════════════════════════════════════════════════════════
VÝSTUP (pouze JSON):
═══════════════════════════════════════════════════════════
SCHVÁLENÍ: {"valid": true}
ZAMÍTNUTÍ: {"valid": false, "reason": "konkrétní důvod (max 10 slov)"}

Důvody zamítnutí:
- "Fakticky špatná odpověď: [správná je X]"
- "Více správných: [která další]"
- "Odpověď X je také správná"`;

  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({ 
        model: VALIDATOR_MODEL, 
        messages: [{ role: "user", content: prompt }], 
        temperature: 0 
      })
    });
    
    const data = await response.json();
    if (data.error) { 
        console.warn("Perplexity API Error:", data.error);
        validationStats.skippedPerplexity++; 
        return true;
    }

    const content = data.choices[0].message.content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return false;
    
    const result = JSON.parse(jsonMatch[0]);
    
    if (result.valid) {
      validationStats.passedPerplexity++;
      return true;
    } else {
      validationStats.failedPerplexity++;
      console.log(`❌ Rejected by Sonar: "${questionData.question}" - ${result.reason}`);
      validationHistory.push({ ...questionData, status: 'REJECTED', reason: result.reason });
      return false;
    }
  } catch (error) {
    console.error("Validation Error:", error.message);
    validationStats.skippedPerplexity++;
    return true; 
  }
}

// === FILTRACE (ANTI-REPEAT) ===
function filterQuestions(questions, session) {
  if (!questions || questions.length === 0) return [];
  
  return questions.filter(q => {
    const answer = q.options[q.correct];
    
    // 1. Kontrola globálního blacklistu
    if (isAnswerBlocked(answer)) return false;
    
    // 2. Kontrola lokální historie
    if (session && session.isAnswerUsed(answer)) return false;
    
    return true;
  });
}

/**
 * 🎯 PROMPT BUILDER - generuje specifický prompt podle věkové kategorie
 * @param {string} ageGroup - 'adult', 'student', nebo 'kids'
 * @param {object} config - konfigurace věkové skupiny
 * @param {string[]} topics - pole 5 témat (z globální rotace pro všechny kategorie)
 */
function buildPromptForAgeGroup(ageGroup, config, topics = null) {
  // Formátování seznamu témat
  const topicList = topics && topics.length === 5 
    ? topics.map((t, i) => `${i + 1}. ${t}`).join('\n')
    : '1. obecné znalosti';

  if (ageGroup === 'adult') {
    return `Jsi expert na tvorbu NÁROČNÝCH kvízových otázek pro vědomostní soutěže (AZ-kvíz, Riskuj!).

JAZYK: Čeština (gramaticky správně!)

═══════════════════════════════════════════════════════════
🎯 TÉMATA (každá otázka z JINÉHO tématu):
═══════════════════════════════════════════════════════════
${topicList}

═══════════════════════════════════════════════════════════
PRAVIDLA PRO GENEROVÁNÍ
═══════════════════════════════════════════════════════════

1. OBTÍŽNOST - otázky musí testovat ZNALOSTI, ne zdravý rozum
2. JEDNOZNAČNOST - právě JEDNA odpověď musí být správná
3. DISTRAKTORY - špatné odpovědi musí být uvěřitelné, ale jasně špatné
4. VARIABILITA - každá otázka MUSÍ být z jiného tématu (viz seznam výše)

═══════════════════════════════════════════════════════════
❌ NEGENERUJ (triviální/příliš snadné):
═══════════════════════════════════════════════════════════
"Jakou barvu má tráva/obloha/krev?"
"Kolik nohou má pes?"
"Hlavní město Francie/Německa/Itálie?" (příliš známé)
"Kdo napsal Babičku?" (každý Čech zná)
"Kolik dní má týden?"
"Kde žije lední medvěd?"
"Ve které zemi jsou pyramidy?" (Egypt - moc snadné)

═══════════════════════════════════════════════════════════
❌ NEGENERUJ (nejednoznačné/více správných odpovědí):
═══════════════════════════════════════════════════════════
"Kdo objevil Ameriku?" (Kolumbus i Vikingové)
"Co je symbol Vánoc?" (stromek, betlém, hvězda...)
"Kdo byl slavný vědec?" (příliš obecné)
"Která barva je teplá?" (červená, oranžová, žlutá)

═══════════════════════════════════════════════════════════
✅ GENERUJ OTÁZKY TOHOTO TYPU:
═══════════════════════════════════════════════════════════

HISTORIE:
"Ve kterém roce byla podepsána Mnichovská dohoda?" → 1938
"Který římský císař nechal postavit Koloseum?" → Vespasián
"Ve které bitvě zemřel Jan Lucemburský?" → Kresčak
"Jak se jmenoval první československý prezident?" → T.G. Masaryk

ZEMĚPIS:
"Která řeka protéká nejvíce státy světa?" → Dunaj
"Jaké je hlavní město Myanmaru?" → Naypyidaw
"Ve které zemi leží poušť Atacama?" → Chile
"Který průliv odděluje Evropu od Afriky?" → Gibraltarský

VĚDA:
"Který prvek má v periodické tabulce značku W?" → Wolfram
"Jak se nazývá nejmenší kost v lidském těle?" → Třmínek
"Kdo objevil penicilin?" → Alexander Fleming
"Jaká je chemická značka zlata?" → Au

UMĚNÍ A LITERATURA:
"Který malíř namaloval Guernici?" → Pablo Picasso
"Kdo zkomponoval operu Rusalka?" → Antonín Dvořák
"Ve kterém městě se nachází muzeum Prado?" → Madrid
"Kdo napsal Mistr a Markétka?" → Michail Bulgakov

SPORT:
"Ve kterém roce se konaly první zimní OH?" → 1924
"Kolik hráčů má volejbalové družstvo na hřišti?" → 6
"Ve kterém roce vyhráli čeští hokejisté v Naganu?" → 1998

═══════════════════════════════════════════════════════════
FORMÁT VÝSTUPU
═══════════════════════════════════════════════════════════
Vrať POUZE JSON pole (žádný další text):
[
  {"question": "...", "options": ["A", "B", "C"], "correct": 0},
  ...
]

- Přesně 5 otázek (každá z JINÉHO tématu ze seznamu výše)
- Každá má přesně 3 možnosti
- "correct" = index správné odpovědi (0, 1, nebo 2)
- Odpovědi max 4 slova
- Otázky MUSÍ končit otazníkem`;
  } 
  
  else if (ageGroup === 'student') {
    return `Jsi expert na tvorbu kvízových otázek pro STŘEDOŠKOLÁKY v ČEŠTINĚ.

KATEGORIE: Školáci (12-18 let)

═══════════════════════════════════════════════════════════
🎯 TÉMATA (každá otázka z JINÉHO tématu):
═══════════════════════════════════════════════════════════
${topicList}

PRAVIDLA:
- Otázky přiměřené věku 12-18 let
- Mohou být z učiva ZŠ/SŠ
- Ne příliš jednoduché, ne příliš těžké
- PRÁVĚ JEDNA odpověď musí být správná
- Každá otázka MUSÍ být z jiného tématu ze seznamu výše

FORMÁT: JSON pole [{"question": "...", "options": ["A", "B", "C"], "correct": 0}]
Vytvoř přesně 5 otázek. Vrať POUZE JSON.`;
  }
  
  else { // kids
    return `Jsi expert na tvorbu JEDNODUCHÝCH kvízových otázek pro DĚTI v ČEŠTINĚ.

KATEGORIE: Děti (6-12 let)

═══════════════════════════════════════════════════════════
🎯 TÉMATA (každá otázka z JINÉHO tématu):
═══════════════════════════════════════════════════════════
${topicList}

PRAVIDLA:
- Otázky musí být JEDNODUCHÉ a zábavné
- Vhodné pro děti základní školy
- PRÁVĚ JEDNA odpověď musí být správná
- Každá otázka MUSÍ být z jiného tématu ze seznamu výše

FORMÁT: JSON pole [{"question": "...", "options": ["A", "B", "C"], "correct": 0}]
Vytvoř přesně 5 otázek. Vrať POUZE JSON.`;
  }
}

// === GENERACE Z LLM (S Retry a Fallbacky) ===
async function generateBatchFromLLM(ageGroup, gameSession, retryCount = 0, existingTopics = null) {
  const client = getGroqClient();
  if (!client) return [];

  // Stop condition pro rekurzi
  if (retryCount >= MAX_RETRIES) {
    console.warn(`⚠️ LLM Retry limit (${MAX_RETRIES}) dosažen.`);
    return [];
  }

  const config = AGE_GROUP_CONFIG[ageGroup] || AGE_GROUP_CONFIG.adult;
  
  // 🆕 Pro VŠECHNY kategorie: použij existující témata NEBO vyber nová (BEZ zápisu do DB)
  let topics = existingTopics;
  if (!topics) {
    topics = [];
    for (let i = 0; i < 5; i++) {
      topics.push(await getNextTopic(true, ageGroup));  // true = skipDbWrite, ageGroup pro správnou sadu
    }
    console.log(`🎲 Generuji batch (${ageGroup}) s tématy: ${topics.join(', ')}`);
  }
  
  // 🆕 VYLEPŠENÝ PROMPT podle věkové kategorie (s tématy pro všechny)
  const prompt = buildPromptForAgeGroup(ageGroup, config, topics);

  try {
    const response = await client.chat.completions.create({
      model: GENERATOR_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.9
    });

    const content = response.choices[0].message.content;
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    
    // 🔄 RETRY: Pokud model nevrátil JSON (se STEJNÝMI tématy)
    if (!jsonMatch) {
      console.warn(`⚠️ LLM syntax error (pokus ${retryCount+1}). Zkouším znovu...`);
      return generateBatchFromLLM(ageGroup, gameSession, retryCount + 1, topics);
    }
    
    let rawQuestions;
    try {
      rawQuestions = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      // 🔄 RETRY: Pokud JSON nejde parsovat (se STEJNÝMI tématy)
      console.warn(`⚠️ JSON Parse Error (pokus ${retryCount+1}). Zkouším znovu...`);
      return generateBatchFromLLM(ageGroup, gameSession, retryCount + 1, topics);
    }

    validationStats.generated += rawQuestions.length;

    // 1. Strukturální validace
    const structurallyValid = rawQuestions.filter(q => 
      q.question && Array.isArray(q.options) && q.options.length === 3 && typeof q.correct === 'number'
    );
    
    // 1.5 🆕 Kontrola: odpověď nesmí být obsažena v otázce
    const answerNotInQuestion = structurallyValid.filter(q => {
      const questionNorm = normalizeText(q.question);
      const correctAnswer = q.options[q.correct];
      const answerNorm = normalizeText(correctAnswer);
      
      // Odpověď musí mít alespoň 3 znaky pro smysluplnou kontrolu
      if (answerNorm.length < 3) return true;
      
      if (questionNorm.includes(answerNorm)) {
        console.log(`   🚫 Odpověď v otázce: "${q.question.substring(0, 40)}..." → "${correctAnswer}"`);
        return false;
      }
      return true;
    });
    
    // 2. Kontrola obtížnosti (pro dospělé) - filtruje triviální otázky
    const difficultyFiltered = answerNotInQuestion.filter(q => {
      if (ageGroup !== 'adult') return true; // Pro děti nefiltrujeme
      
      const question = q.question.toLowerCase();
      
      // Vzory triviálních otázek
      const trivialPatterns = [
        // Triviální (zná každé dítě)
        /jakou barvu má/i,
        /jaké barvy je/i,
        /kolik (má|dní|měsíců|hodin|minut)/i,
        /kolik nohou má/i,
        /kolik je \d+\s*[+\-*/]\s*\d+/i,
        /je .+ (zelená|červená|modrá|žlutá)/i,
        /která zelenina/i,
        /které ovoce/i,
        /je mrkev/i,
        /je slunce/i,
        /kolik má týden/i,
        /kolik má rok/i,
        /kde žije lední medvěd/i,
        /co pije kráva/i,
        /jaký zvuk dělá/i,
        
        // Příliš snadné pro dospělé
        /kdo napsal babičku/i,
        /hlavní město (francie|německa|itálie|anglie|španělska)\?/i,
        /ve které zemi jsou pyramidy/i,
        /kdo je na českých korunách/i,
      ];
      
      for (const pattern of trivialPatterns) {
        if (pattern.test(question)) {
          console.log(`   🚫 Triviální otázka vyfiltrována: "${question.substring(0, 50)}..."`);
          return false;
        }
      }
      
      // Otázka příliš krátká = pravděpodobně triviální
      if (question.length < 20) {
        console.log(`   🚫 Příliš krátká otázka: "${question}"`);
        return false;
      }
      
      return true;
    });
    
    console.log(`📊 Kontrola obtížnosti: ${difficultyFiltered.length}/${structurallyValid.length} prošlo`);
    
    // 3. Anti-Repeat
    const uniqueQuestions = filterQuestions(difficultyFiltered, gameSession);
    
    // Fact-Checking
    const finalQuestions = [];
    for (const q of uniqueQuestions) {
        const isValid = await validateWithSonar(q);
        if (isValid) finalQuestions.push(q);
    }

    // 🆕 Po úspěšné validaci: zapiš témata do DB
    if (finalQuestions.length > 0 && topics) {
      await markTopicsAsUsed(topics, ageGroup);
    }

    // 🆕 Zamíchej pořadí odpovědí (aby správná nebyla vždy A)
    const shuffledQuestions = finalQuestions.map(q => shuffleOptions(q));

    // Uložení do DB
    if (useDatabase && questionDatabase && shuffledQuestions.length > 0) {
       questionDatabase.saveQuestions(shuffledQuestions, config.mode, config.difficulty)
         .catch(err => console.error("Save error (nevadí):", err.message));
    }

    return shuffledQuestions;

  } catch (error) {
    console.error("LLM Error:", error.message);
    return [];
  }
}

// === DB CACHE REFILL (Over-fetch strategy) ===
async function refillDbCache(session, ageGroup) {
  if (!useDatabase || !questionDatabase) return;
  const config = AGE_GROUP_CONFIG[ageGroup] || AGE_GROUP_CONFIG.adult;

  try {
    const candidates = await questionDatabase.getQuestionsWithRotation(
      config.mode, null, config.difficulty, DB_FETCH_BATCH, []
    );
    const cleanQuestions = filterQuestions(candidates, session);
    const toAdd = cleanQuestions.slice(0, 5);
    
    if (toAdd.length > 0) {
      session.dbCache.push(...toAdd);
    }
  } catch (e) {
    console.error("DB Refill Error:", e.message);
  }
}

// === PRE-WARM CACHE ===
export async function preWarmCache(gameId, ageGroup) {
  const session = getGameSession(gameId);
  const config = AGE_GROUP_CONFIG[ageGroup] || AGE_GROUP_CONFIG.adult;
  
  console.log(`🔥 Pre-warming cache pro ${gameId} (${ageGroup})`);

  // 1. DB PRE-WARM
  if (useDatabase && questionDatabase) {
    try {
      const candidates = await questionDatabase.getQuestionsWithRotation(
        config.mode, null, config.difficulty, DB_FETCH_BATCH, []
      );
      const cleanQuestions = filterQuestions(candidates, session);
      session.dbCache = cleanQuestions.slice(0, 5);
      console.log(`   -> DB Cache: ${session.dbCache.length} čistých otázek`);
    } catch (e) {
      console.warn("   -> DB fetch error (ignorován)");
    }
  }

  // 2. LLM PRE-WARM
  startBackgroundGeneration(session, ageGroup);
}

function startBackgroundGeneration(session, ageGroup) {
  if (session.llmGenerating) return;
  session.llmGenerating = true;
  generateBatchFromLLM(ageGroup, session).then(qs => {
    const formatted = qs.map(q => ({...q, _fromLLM: true, _fromDb: false}));
    session.llmCache.push(...formatted);
    session.llmGenerating = false;
  }).catch(() => {
    session.llmGenerating = false;
  });
}

// === HLAVNÍ GENERÁTOR ===
export async function generateQuestion(gameId, ageGroup = 'adult') {
  const session = getGameSession(gameId);
  const config = AGE_GROUP_CONFIG[ageGroup] || AGE_GROUP_CONFIG.adult;
  
  // 🆕 Inkrementace počítadla kol pro střídání
  session.questionCount++;
  const round = session.questionCount;
  const preferLLM = shouldUseLLM(round);
  
  console.log(`🎯 Kolo ${round}: Preferuji ${preferLLM ? 'LLM' : 'DB'} (LLM: ${session.llmCache.length}, DB: ${session.dbCache.length})`);
  
  let question = null;

  // 🔄 STŘÍDÁNÍ PODLE KOLA
  if (preferLLM) {
    // Priorita: LLM → DB fallback
    if (session.llmCache.length > 0) {
      question = session.llmCache.shift();
      console.log(`   ✅ Použita LLM otázka`);
    } else if (session.dbCache.length > 0) {
      question = session.dbCache.shift();
      console.log(`   ⚠️ LLM prázdná, fallback na DB`);
    }
  } else {
    // Priorita: DB → LLM fallback
    if (session.dbCache.length > 0) {
      question = session.dbCache.shift();
      console.log(`   ✅ Použita DB otázka`);
    } else if (session.llmCache.length > 0) {
      question = session.llmCache.shift();
      console.log(`   ⚠️ DB prázdná, fallback na LLM`);
    }
  }
  
  // Doplňování cache na pozadí
  if (session.llmCache.length < MIN_CACHE_SIZE) {
    startBackgroundGeneration(session, ageGroup);
  }
  if (useDatabase && questionDatabase && session.dbCache.length < MIN_CACHE_SIZE) {
    refillDbCache(session, ageGroup).catch(() => {});
  }

  // 3. Live Generace (S Retry)
  if (!question) {
    console.log("⚠️ Cache prázdná, generuji live...");
    const fresh = await generateBatchFromLLM(ageGroup, session);
    if (fresh.length > 0) {
      question = fresh.shift();
      session.llmCache.push(...fresh.map(x => ({...x, _fromLLM: true})));
      question._fromLLM = true;
    }
  }

  // 4. 🚑 DB LIVE FALLBACK (Obnoveno)
  // Pokud LLM (i po retry) selhalo, zkusíme ještě jednou sáhnout přímo do DB
  if (!question && useDatabase && questionDatabase) {
    console.warn("⚠️ LLM selhalo. Zkouším DB Live Fallback...");
    try {
      const candidates = await questionDatabase.getQuestionsWithRotation(config.mode, null, config.difficulty, DB_FETCH_BATCH, []);
      const clean = filterQuestions(candidates, session);
      if (clean.length > 0) {
        question = clean[0]; // Bereme první čistou
        question._fromDb = true;
        // Zbytek uložíme do cache
        if (clean.length > 1) {
            session.dbCache.push(...clean.slice(1, 5));
        }
        console.log("✅ Zachráněno z DB.");
      }
    } catch (e) {
      console.error("DB Fallback failed:", e.message);
    }
  }

  // 5. Finální kontrola a blokace
  if (question) {
    const answer = question.options[question.correct];
    
    // Last minute skip (dvojitá pojistka)
    if (isAnswerBlocked(answer) || session.isAnswerUsed(answer)) {
       console.log(`♻️ Last minute skip: "${answer}". Zkouším znovu.`);
       return generateQuestion(gameId, ageGroup);
    }

    blockAnswerGlobally(answer);
    session.addUsedAnswer(answer);

    if (question._fromDb && question._id && questionDatabase) {
        questionDatabase.markQuestionAsUsed(question._id).catch(() => {});
    }

    return question;
  }

  // 6. 🚑 EMERGENCY FALLBACK (Proti bílé obrazovce)
  console.error("❌ CRITICAL: Total failure. Using EMERGENCY QUESTION.");
  return { ...EMERGENCY_QUESTION };
}