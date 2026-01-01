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

// === 100 TÉMAT PRO GLOBÁLNÍ ROTACI ===
const ALL_TOPICS = [
  // Historie (20 témat)
  "české dějiny 20. století",
  "první světová válka",
  "druhá světová válka",
  "starověký Řím",
  "starověké Řecko",
  "středověká Evropa",
  "habsburská monarchie",
  "Přemyslovci a Lucemburkové",
  "francouzská revoluce",
  "americká válka za nezávislost",
  "ruská revoluce a SSSR",
  "studená válka",
  "kolonialismus a dekolonizace",
  "renesance a reformace",
  "starověký Egypt",
  "Vikingové a severské dějiny",
  "byzantská říše",
  "osmanská říše",
  "dějiny Číny",
  "průmyslová revoluce",
  
  // Zeměpis (15 témat)
  "hlavní města světa (méně známá)",
  "řeky a jezera světa",
  "pohoří a nejvyšší hory",
  "ostrovy a souostroví",
  "pouště světa",
  "evropské státy a regiony",
  "asijské státy",
  "africké státy",
  "státy Ameriky",
  "Oceánie a Austrálie",
  "průlivy, průplavy a zálivy",
  "národní parky světa",
  "vulkány a tektonické zóny",
  "polární oblasti",
  "světové metropole",
  
  // Přírodní vědy (20 témat)
  "chemické prvky a periodická tabulka",
  "lidské tělo a anatomie",
  "astronomie a hvězdy",
  "fyzikální zákony a konstanty",
  "botanika a rostliny",
  "savci světa",
  "ptáci světa",
  "mořští živočichové",
  "geologie a minerály",
  "genetika a DNA",
  "evoluční biologie",
  "matematika a geometrie",
  "vědecké objevy a vynálezy",
  "Nobelovy ceny za vědu",
  "planety a sluneční soustava",
  "mikrobiologie",
  "meteorologie a klima",
  "ekologie",
  "paleontologie a dinosauři",
  "hmyz a pavoukovci",
  
  // Umění a kultura (15 témat)
  "renesanční malířství",
  "impresionismus a postimpresionismus",
  "moderní a současné umění",
  "sochařství",
  "historická architektura",
  "moderní architektura",
  "světová muzea a galerie",
  "světové památky UNESCO",
  "české hrady a zámky",
  "starověké divy světa",
  "divadlo a drama",
  "opera a balet",
  "filmová klasika (do 1980)",
  "moderní kinematografie",
  "animovaný film",
  
  // Literatura (10 témat)
  "česká literatura",
  "světová literatura 19. století",
  "světová literatura 20. století",
  "antická literatura a mytologie",
  "ruská literatura",
  "anglická a americká literatura",
  "francouzská literatura",
  "poezie světová",
  "Nobelova cena za literaturu",
  "sci-fi a fantasy literatura",
  
  // Hudba (10 témat)
  "barokní hudba",
  "klasicismus a romantismus",
  "operní díla a skladatelé",
  "čeští skladatelé",
  "jazz a blues",
  "rock historie (1950-1990)",
  "pop a moderní hudba",
  "hudební nástroje",
  "filmová hudba",
  "světoví dirigenti a orchestry",
  
  // Sport (10 témat)
  "letní olympijské hry",
  "zimní olympijské hry",
  "fotbal - MS a kluby",
  "lední hokej",
  "tenis",
  "atletika a světové rekordy",
  "formule 1 a motorsport",
  "bojové sporty a olympijské disciplíny",
  "cyklistika",
  "plavání a vodní sporty"
];

export function getAgeGroups() {
  return Object.entries(AGE_GROUP_CONFIG).map(([key, config]) => ({ key, ...config }));
}

/**
 * 🆕 Získá další téma z globální rotace (100 témat bez opakování)
 * Používá DB pro perzistenci mezi restarty serveru
 * @param {boolean} skipDbWrite - Pokud true, téma se NEZAPÍŠE do DB (pro retry mechanismus)
 */
async function getNextTopic(skipDbWrite = false) {
  // Fallback pokud DB není dostupná
  if (!useDatabase || !questionDatabase) {
    return ALL_TOPICS[Math.floor(Math.random() * ALL_TOPICS.length)];
  }

  try {
    const usedTopics = await questionDatabase.getUsedTopics();
    const usedSet = new Set(usedTopics);
    const available = ALL_TOPICS.filter(t => !usedSet.has(t));

    // Pokud všechna témata použita → reset a začni znovu
    if (available.length === 0) {
      console.log('🔄 Všech 100 témat použito, resetuji rotaci...');
      await questionDatabase.resetTopicRotation();
      const topic = ALL_TOPICS[Math.floor(Math.random() * ALL_TOPICS.length)];
      // Zapiš pouze pokud NENÍ skipDbWrite
      if (!skipDbWrite) {
        await questionDatabase.markTopicUsed(topic);
      }
      return topic;
    }

    // Vyber náhodně z dostupných
    const topic = available[Math.floor(Math.random() * available.length)];
    
    // Zapiš pouze pokud NENÍ skipDbWrite
    if (!skipDbWrite) {
      await questionDatabase.markTopicUsed(topic);
    }
    
    console.log(`📚 Téma: "${topic}" (zbývá ${available.length - 1}/100)`);
    return topic;
  } catch (e) {
    console.error('getNextTopic error:', e.message);
    return ALL_TOPICS[Math.floor(Math.random() * ALL_TOPICS.length)];
  }
}

/**
 * 🆕 Zapíše použitá témata do DB (volá se až po úspěšné validaci)
 * @param {string[]} topics - Pole témat k zapsání
 */
async function markTopicsAsUsed(topics) {
  if (!useDatabase || !questionDatabase || !topics || topics.length === 0) return;
  
  for (const topic of topics) {
    await questionDatabase.markTopicUsed(topic);
  }
  console.log(`💾 Zapsáno ${topics.length} témat do DB`);
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
 * @param {string[]} topics - pole 5 témat (pouze pro adult, z globální rotace)
 */
function buildPromptForAgeGroup(ageGroup, config, topics = null) {
  // Témata pro děti (zachováno původní chování)
  const KID_TOPICS = [
    "zvířata a jejich vlastnosti",
    "pohádky a dětské příběhy",
    "základní matematika",
    "barvy a tvary",
    "roční období a počasí"
  ];

  if (ageGroup === 'adult') {
    // Pro dospělé: 5 různých témat z globální rotace
    const topicList = topics && topics.length === 5 
      ? topics.map((t, i) => `${i + 1}. ${t}`).join('\n')
      : '1. obecné znalosti';
      
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
    const randomTopic = KID_TOPICS[Math.floor(Math.random() * KID_TOPICS.length)];
    return `Jsi expert na tvorbu kvízových otázek pro STŘEDOŠKOLÁKY v ČEŠTINĚ.

KATEGORIE: Školáci (12-18 let)
TÉMA: ${randomTopic}

PRAVIDLA:
- Otázky přiměřené věku 12-18 let
- Mohou být z učiva ZŠ/SŠ
- Ne příliš jednoduché, ne příliš těžké
- PRÁVĚ JEDNA odpověď musí být správná

FORMÁT: JSON pole [{"question": "...", "options": ["A", "B", "C"], "correct": 0}]
Vytvoř 5 otázek. Vrať POUZE JSON.`;
  }
  
  else { // kids
    const randomTopic = KID_TOPICS[Math.floor(Math.random() * KID_TOPICS.length)];
    return `Jsi expert na tvorbu JEDNODUCHÝCH kvízových otázek pro DĚTI v ČEŠTINĚ.

KATEGORIE: Děti (6-12 let)
TÉMA: ${randomTopic}

PRAVIDLA:
- Otázky musí být JEDNODUCHÉ a zábavné
- Vhodné pro děti základní školy
- Témata: zvířata, pohádky, příroda, základní fakta

FORMÁT: JSON pole [{"question": "...", "options": ["A", "B", "C"], "correct": 0}]
Vytvoř 5 otázek. Vrať POUZE JSON.`;
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
  
  // 🆕 Pro dospělé: použij existující témata NEBO vyber nová (BEZ zápisu do DB)
  let topics = existingTopics;
  if (ageGroup === 'adult' && !topics) {
    topics = [];
    for (let i = 0; i < 5; i++) {
      topics.push(await getNextTopic(true));  // true = skipDbWrite
    }
    console.log(`🎲 Generuji batch s tématy: ${topics.join(', ')}`);
  }
  
  // 🆕 VYLEPŠENÝ PROMPT podle věkové kategorie (s tématy pro adult)
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
      await markTopicsAsUsed(topics);
    }

    // Uložení do DB
    if (useDatabase && questionDatabase && finalQuestions.length > 0) {
       questionDatabase.saveQuestions(finalQuestions, config.mode, config.difficulty)
         .catch(err => console.error("Save error (nevadí):", err.message));
    }

    return finalQuestions;

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