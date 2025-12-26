import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

// === 🔧 GROQ KONFIGURACE ===
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const MODEL = "llama-3.3-70b-versatile";

// === 🎯 BATCH KONFIGURACE ===
const BATCH_SIZE = 24;

// === 🧠 PAMĚŤ PRO ANTI-REPEAT ===
const recentQuestions = [];
const recentEntities = [];
const MAX_QUESTION_HISTORY = 200;
const MAX_ENTITY_HISTORY = 300;

// === 🛡️ TVRDÁ VALIDACE - POUŽITÉ ODPOVĚDI ===
const usedCorrectAnswers = new Set();
const MAX_ANSWER_HISTORY = 100;

// === 📦 CACHE PRO BATCH OTÁZKY ===
let questionCache = [];

// === 🎯 ROZŠÍŘENÉ KATEGORIE - ADULT (12 kategorií) ===
const ADULT_CATEGORIES = {
  "motorsport": {
    name: "Motorsport",
    aspects: [
      "Historický moment", "Konkrétní okruh", "Kuriozita", "Tým nebo stáj",
      "Pravidlo nebo rozhodnutí", "Rekord", "Slavný souboj", "Nehoda nebo drama",
      "Šampionát roku", "Technický prvek", "Sponzoři a byznys", "Legendární závodník"
    ]
  },
  "team_sports": {
    name: "Týmové sporty",
    aspects: [
      "Historický moment", "Stadion nebo aréna", "Kuriozita", "Klub nebo tým",
      "Pravidlo nebo rozhodnutí", "Rekord", "Slavné rivalství", "Přestup nebo transfer",
      "Mistrovství roku", "Trenér", "Národní tým", "Legendární hráč"
    ]
  },
  "film": {
    name: "Film a seriály",
    aspects: [
      "Milník kinematografie", "Herec nebo herečka", "Zákulisí natáčení", "Režisér",
      "Ocenění Oscar", "Rekord tržeb", "Filmová dvojice", "Skandál",
      "Konkrétní film", "Soundtrack", "Filmové studio", "Adaptace knihy"
    ]
  },
  "music": {
    name: "Hudba",
    aspects: [
      "Historický milník", "Zpěvák nebo zpěvačka", "Kuriozita", "Kapela",
      "Ocenění Grammy", "Rekord prodejů", "Spolupráce nebo rivalita", "Skandál",
      "Album nebo píseň", "Hudební nástroj", "Žánr a historie", "Koncert nebo turné"
    ]
  },
  "history": {
    name: "Historie",
    aspects: [
      "Klíčová událost", "Místo nebo lokalita", "Málo známý fakt", "Významná osobnost",
      "Politické rozhodnutí", "První nebo poslední", "Rivalita nebo konflikt", "Tragédie",
      "Konkrétní rok", "Vynález té doby", "Kultura období", "Důsledky pro dnešek"
    ]
  },
  "geography": {
    name: "Zeměpis",
    aspects: [
      "Hlavní město", "Řeka nebo jezero", "Kuriozita", "Hora nebo pohoří",
      "Hranice nebo sousedé", "Rekord největší", "Historická souvislost", "Přírodní památka",
      "Obyvatelstvo nebo jazyk", "Vlajka nebo symbol", "Ekonomika", "Slavná osobnost"
    ]
  },
  "science": {
    name: "Věda a technologie",
    aspects: [
      "Historický objev", "Vědec nebo vynálezce", "Paradox nebo kuriozita", "Instituce",
      "Teorie nebo zákon", "Rekord", "Vědecký závod", "Selhání nebo nehoda",
      "Experiment", "Praktická aplikace", "Nobelova cena", "Budoucnost"
    ]
  },
  "food": {
    name: "Gastronomie",
    aspects: [
      "Původ pokrmu", "Země nebo region", "Kuriozita", "Ingredience",
      "Tradiční příprava", "Rekord nejdražší", "Slavný šéfkuchař", "Kontroverzní jídlo",
      "Národní pokrm", "Nápoje", "Michelin", "Jídlo v popkultuře"
    ]
  },
  "literature": {
    name: "Literatura",
    aspects: [
      "Klasické dílo", "Autor nebo spisovatelka", "Kuriozita", "Literární žánr",
      "Ocenění Nobel", "Bestseller", "Literární postavy", "Kontroverzní kniha",
      "Poezie", "Adaptace na film", "Slavný citát", "Nakladatelství"
    ]
  },
  "art": {
    name: "Umění a architektura",
    aspects: [
      "Slavný obraz", "Malíř nebo sochař", "Kuriozita", "Umělecký směr",
      "Aukční rekord", "Muzeum nebo galerie", "Architektonický skvost", "Padělky nebo krádeže",
      "Socha", "Design", "Street art", "Mecenáš umění"
    ]
  },
  "nature": {
    name: "Zvířata a příroda",
    aspects: [
      "Savci", "Ptáci", "Mořští živočichové", "Hmyz",
      "Rekord největší", "Vyhynulé druhy", "Kuriózní chování", "Národní zvíře",
      "Migrace", "Symbióza", "Nebezpečná zvířata", "Ochrana přírody"
    ]
  },
  "business": {
    name: "Byznys a ekonomika",
    aspects: [
      "Slavná firma", "CEO nebo podnikatel", "Kuriozita", "Značka",
      "Rekord tržní hodnoty", "Krach nebo bankrot", "Rivalita firem", "Akvizice",
      "Startup příběh", "Vynález produktu", "Reklama", "Burzovní historie"
    ]
  }
};

// === 🎯 ROZŠÍŘENÉ KATEGORIE - JUNIOR ===

// 🐣 DROBEČCI (4-6 let) - Předškoláci
const JUNIOR_CATEGORIES_EASY = {
  "animals_simple": {
    name: "Zvířátka",
    aspects: [
      "Zvuky zvířat", "Barvy zvířat", "Kde bydlí", "Co jedí",
      "Domácí mazlíčci", "Zvířata na farmě", "Kolik má nohou", "Mláďata"
    ]
  },
  "fairytales_cz": {
    name: "České pohádky",
    aspects: [
      "Krteček", "Večerníček", "Pat a Mat", "Rumcajs",
      "Mach a Šebestová", "Bob a Bobek", "Rákosníček", "Kubula a Kuba Kubikula"
    ]
  },
  "colors_shapes": {
    name: "Barvy a tvary",
    aspects: [
      "Základní barvy", "Tvary kolem nás", "Co je kulaté", "Co je červené",
      "Barvy v přírodě", "Barvy jídla", "Barvy zvířat", "Duhové barvy"
    ]
  },
  "food_simple": {
    name: "Jídlo",
    aspects: [
      "Ovoce", "Zelenina", "Odkud pochází", "Co je zdravé",
      "Snídaně", "Oblíbená jídla", "Nápoje", "Sladkosti"
    ]
  },
  "nature_simple": {
    name: "Příroda",
    aspects: [
      "Roční období", "Počasí", "Stromy", "Květiny",
      "Den a noc", "Slunce a měsíc", "Voda", "Hmyz"
    ]
  }
};

// 📚 ŠKOLÁCI (7-10 let) - 1.-4. třída
const JUNIOR_CATEGORIES_MEDIUM = {
  "animals": {
    name: "Zvířata",
    aspects: [
      "Savci", "Ptáci", "Mořští živočichové", "Hmyz",
      "Domácí mazlíčci", "Zvířata v ZOO", "Kde žijí", "Co jedí",
      "Rekord největší", "Zvířata z pohádek", "Mláďata", "Zvuky zvířat"
    ]
  },
  "fairytales": {
    name: "Pohádky a filmy",
    aspects: [
      "České pohádky", "Disney postavy", "Pixar filmy", "Kouzelné předměty",
      "Záporáci", "Princezny a princové", "Zvířecí hrdinové", "Písničky z pohádek"
    ]
  },
  "world_simple": {
    name: "Svět kolem nás",
    aspects: [
      "Hlavní města", "Kontinenty", "Oceány", "Vlajky",
      "Slavné stavby", "Počasí", "Řeky a hory", "Kde žijí zvířata"
    ]
  },
  "body_simple": {
    name: "Lidské tělo",
    aspects: [
      "Orgány", "Pět smyslů", "Kosti", "Zdraví",
      "Zuby", "Srdce", "Mozek", "Jak rosteme"
    ]
  },
  "space_simple": {
    name: "Vesmír",
    aspects: [
      "Planety", "Slunce", "Měsíc", "Hvězdy",
      "Astronauti", "Rakety", "Souhvězdí", "Sluneční soustava"
    ]
  },
  "science_simple": {
    name: "Věda a příroda",
    aspects: [
      "Dinosauři", "Sopky", "Elektřina", "Magnety",
      "Voda a led", "Rostliny", "Zvuky", "Jednoduché pokusy"
    ]
  }
};

// 🎒 KLUCI A HOLKY (11-14 let) - 5.-9. třída
const JUNIOR_CATEGORIES_HARD = {
  "animals": {
    name: "Zvířata",
    aspects: [
      "Savci", "Ptáci", "Mořští živočichové", "Hmyz",
      "Domácí mazlíčci", "Zvířata v ZOO", "Kde žijí", "Co jedí",
      "Rekord největší", "Zvířata z pohádek", "Mláďata", "Zvuky zvířat"
    ]
  },
  "fairytales": {
    name: "Pohádky a filmy",
    aspects: [
      "České pohádky", "Disney postavy", "Pixar filmy", "Kouzelné předměty",
      "Záporáci", "Princezny a princové", "Zvířecí hrdinové", "Písničky z pohádek",
      "Kde se odehrává", "Jak to končí", "Kdo natočil", "Kamarádi hrdiny"
    ]
  },
  "body": {
    name: "Lidské tělo",
    aspects: [
      "Kosti", "Orgány", "Pět smyslů", "Svaly",
      "Výživa", "Zdraví a hygiena", "Jak rosteme", "Zajímavosti o těle",
      "Mozek", "Srdce a krev", "Zuby", "Spánek"
    ]
  },
  "world": {
    name: "Svět kolem nás",
    aspects: [
      "Hlavní města", "Kontinenty", "Oceány a moře", "Vlajky",
      "Jazyky", "Slavné stavby", "Zvířata podle kontinentů", "Počasí",
      "Řeky", "Hory", "Ostrovy", "Pouště a pralesy"
    ]
  },
  "space": {
    name: "Vesmír",
    aspects: [
      "Planety", "Slunce", "Měsíc", "Hvězdy",
      "Astronauti", "Rakety a sondy", "Galaxie", "Zatmění",
      "Komety", "Souhvězdí", "Vesmírné rekordy", "Život ve vesmíru"
    ]
  },
  "sports_kids": {
    name: "Sport pro děti",
    aspects: [
      "Fotbal", "Hokej", "Plavání", "Atletika",
      "Olympijské hry", "Pravidla her", "Slavní sportovci", "Míče a vybavení",
      "Zimní sporty", "Týmy a kluby", "Rekordy", "Sport ve škole"
    ]
  },
  "science_kids": {
    name: "Věda pro děti",
    aspects: [
      "Dinosauři", "Sopky a zemětřesení", "Elektřina", "Magnety",
      "Barvy a světlo", "Voda a led", "Rostliny", "Počasí proč",
      "Jednoduché stroje", "Zajímavé pokusy", "Vynálezy pro děti", "Ekologie"
    ]
  },
  "history_kids": {
    name: "Historie pro děti",
    aspects: [
      "Rytíři a hrady", "Piráti", "Egypt a faraoni", "Vikingové",
      "Dinosauří doba", "Pravěk", "Staré Řecko", "Římané",
      "Indiáni", "Středověk", "Králové a královny", "Slavní objevitelé"
    ]
  }
};

// 🔧 Konfigurace obtížností
const JUNIOR_DIFFICULTY_CONFIG = {
  easy: {
    name: "🐣 Drobečci",
    age: "4-6 let",
    description: "Předškoláci",
    categories: JUNIOR_CATEGORIES_EASY
  },
  medium: {
    name: "📚 Školáci",
    age: "7-10 let",
    description: "1.-4. třída ZŠ",
    categories: JUNIOR_CATEGORIES_MEDIUM
  },
  hard: {
    name: "🎒 Kluci a holky",
    age: "11-14 let",
    description: "5.-9. třída ZŠ",
    categories: JUNIOR_CATEGORIES_HARD
  }
};

// Pro zpětnou kompatibilitu - výchozí je 'hard' (současný JUNIOR)
const JUNIOR_CATEGORIES = JUNIOR_CATEGORIES_HARD;

// === 🔧 POMOCNÉ FUNKCE ===

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function selectRandomCategoryAspectPairs(categories, count) {
  const allPairs = [];
  
  for (const [key, cat] of Object.entries(categories)) {
    for (const aspect of cat.aspects) {
      allPairs.push({
        categoryKey: key,
        categoryName: cat.name,
        aspect: aspect
      });
    }
  }
  
  const shuffled = shuffleArray(allPairs);
  return shuffled.slice(0, count);
}

function addToHistory(question) {
  recentQuestions.push(question.toLowerCase());
  if (recentQuestions.length > MAX_QUESTION_HISTORY) {
    recentQuestions.shift();
  }
}

function extractEntities(question) {
  const words = question.split(/\s+/);
  const entities = words.filter(w => w.length > 4 && /^[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/.test(w));
  return entities.slice(0, 3);
}

function addEntitiesToHistory(question) {
  const entities = extractEntities(question);
  entities.forEach(e => {
    const normalized = e.toLowerCase();
    if (!recentEntities.includes(normalized)) {
      recentEntities.push(normalized);
      if (recentEntities.length > MAX_ENTITY_HISTORY) {
        recentEntities.shift();
      }
    }
  });
}

function getRecentEntitiesForPrompt() {
  if (recentEntities.length === 0) return "";
  
  const sample = recentEntities.slice(-50);
  return `
# ZAKÁZANÉ ENTITY (nepoužívej tyto):
${sample.join(", ")}
`;
}

// === 📝 SYSTEM PROMPTS ===

function buildAdultSystemPrompt() {
  return `Jsi expert na tvorbu kvízových otázek pro dospělé hráče (střední obtížnost).

PRAVIDLA:
1. Otázky musí být v ČEŠTINĚ
2. Fakticky 100% správné
3. Střední obtížnost - ne příliš lehké, ne příliš těžké
4. Odpovědi max 4 slova
5. Všechny 3 možnosti musí být věrohodné (žádná hloupá odpověď)
6. Index "correct" je 0, 1 nebo 2 (náhodně)

🚨 KRITICKÉ PRAVIDLO - ŽÁDNÉ HALUCINACE:
- NEVYMÝŠLEJ si fakta, která neexistují!
- Ptej se POUZE na věci, které PROKAZATELNĚ EXISTUJÍ a znáš je
- Pokud si nejsi 100% JISTÝ, že informace je pravdivá → NEGENERUJ tuto otázku
- U filmů/knih/seriálů: ptej se jen na HLAVNÍ postavy, které jsou všeobecně známé
- NIKDY nevymýšlej jména postav, míst nebo věcí, které neexistují

❌ PŘÍKLADY HALUCINACÍ (nikdy nedělej):
- "Jak se jmenuje pes z filmu X?" → pokud nevíš JISTĚ, že tam pes je a jak se jmenuje
- "Jaká je přezdívka postavy Y?" → pokud si nejsi 100% jistý
- Vymýšlení jmen vedlejších postav, které nejsou známé

KRITICKÉ PRAVIDLO - ODPOVĚĎ NESMÍ BÝT V OTÁZCE:
- Text správné odpovědi se NESMÍ objevit v textu otázky!
- Ani částečně, ani jako součást jiného slova

KRITICKÉ PRAVIDLO - EXKLUZIVITA ODPOVĚDI:
- POUZE JEDNA z nabízených odpovědí smí být správná!
- Ostatní 2 odpovědi MUSÍ být prokazatelně ŠPATNÉ
- Před generováním si ověř: "Mohla by být i jiná nabízená odpověď správná?" Pokud ano, ZMĚŇ OTÁZKU!

❌ ZAKÁZANÉ FORMULACE (nikdy nepoužívej tyto vzory):
- "Který/á/é je známý/á/é pro..." → Mnoho lidí/věcí může být známých
- "Který závodník/herec/zpěvák působí v..." → Více osob působí
- "Jakou zeleninu/ovoce máme v..." → Více možností je správně
- "Jaké zvíře žije v..." → Více zvířat tam žije
- "Co patří mezi..." → Více věcí patří mezi
- "Co se nachází v..." → Více věcí se nachází
- "Co je typické pro..." → Subjektivní
- "Kdo je slavný sportovec/herec/zpěvák?" → Více lidí je slavných!
- "Jakou barvu má X vlajka?" → Vlajky mají více barev!

❌ KONKRÉTNÍ PŘÍKLADY ŠPATNÝCH OTÁZEK:
- "Který závodník je známý pro působení ve F1?" → Schumacher, Senna, Alonso - VŠICHNI jsou správně!
- "Jakou zeleninu máme v polévce?" → Cibule, mrkev, petržel - VŠECHNY jsou správně!
- "Jaké zvíře je nejčastěji v ZOO?" → Neexistuje jedna správná odpověď!
- "Kdo je slavný sportovec?" → Messi, Ronaldo - OBA jsou slavní!
- "Jakou barvu má česká vlajka?" → Bílá, červená, modrá - MÁ TŘI BARVY!

✅ SPRÁVNÉ FORMULACE (používej tyto vzory):
- "Kdo jako PRVNÍ vyhrál..." → Jen jeden může být první
- "Kolik titulů mistra světa má..." → Konkrétní číslo
- "Ve kterém ROCE se narodil..." → Konkrétní rok
- "Jak se JMENUJE hlavní město..." → Konkrétní jméno
- "Kdo NAPSAL knihu..." → Konkrétní autor
- "Kdo REŽÍROVAL film..." → Konkrétní režisér
- "Kdo vyhrál Zlatý míč v roce 2023?" → Konkrétní vítěz (ne "kdo je slavný")
- "Kolik barev má česká vlajka?" → 3 (konkrétní číslo)

✅ KONKRÉTNÍ PŘÍKLADY DOBRÝCH OTÁZEK:
- "Kdo má nejvíce titulů mistra světa F1?" → Michael Schumacher (7) - ostatní mají méně
- "Ve kterém roce zemřel Ayrton Senna?" → 1994 - jediná správná odpověď
- "Jaké je hlavní město Francie?" → Paříž - jediná správná odpověď
- "Kolik barev má česká vlajka?" → 3 (konkrétní číslo)

KATEGORIE: Sport, Film, Hudba, Historie, Zeměpis, Věda, Gastronomie, Literatura, Umění, Příroda, Byznys`;
}

function buildJuniorSystemPrompt(difficulty = 'hard') {
  const difficultyRules = {
    easy: {
      age: "4-6 let (předškoláci)",
      maxWords: 2,
      rules: `
- VELMI JEDNODUCHÉ otázky pro malé děti
- Otázka max 10 slov, jednoduchá věta
- Známé pojmy z běžného života a encyklopedií pro děti
- České pohádky (Krteček, Večerníček, Pat a Mat)
- Základní fakta o zvířatech, barvách, přírodě
- Příklady: "Jakou barvu má sluníčko?", "Kolik nohou má pes?", "Kde žije ryba?"`,
      categories: "Zvířátka, České pohádky, Barvy a tvary, Jídlo, Příroda"
    },
    medium: {
      age: "7-10 let (1.-4. třída ZŠ)",
      maxWords: 3,
      rules: `
- JEDNODUCHÉ otázky pro mladší školáky
- Otázka max 15 slov
- Základní fakta ze školy a populární témata
- Disney/Pixar pohádky, zvířata, planety
- Příklady: "Kolik planet má sluneční soustava?", "Které zvíře je největší na světě?"`,
      categories: "Zvířata, Pohádky a filmy, Svět, Lidské tělo, Vesmír, Věda"
    },
    hard: {
      age: "11-14 let (5.-9. třída ZŠ)",
      maxWords: 3,
      rules: `
- STŘEDNĚ NÁROČNÉ otázky pro starší žáky
- Vzdělávací obsah odpovídající 2. stupni ZŠ
- Zajímavosti a fakta z různých oblastí
- Příklady: "Který plyn vydechujeme?", "Ve kterém roce skončila 2. světová válka?"`,
      categories: "Zvířata, Pohádky, Lidské tělo, Svět, Vesmír, Sport, Věda, Historie"
    }
  };

  const config = difficultyRules[difficulty] || difficultyRules.hard;

  return `Jsi expert na tvorbu kvízových otázek pro děti ${config.age}.

PRAVIDLA:
1. Otázky musí být v ČEŠTINĚ
2. Jednoduchý jazyk bez cizích slov
3. Zábavná a vzdělávací témata
4. Odpovědi max ${config.maxWords} slova
5. Všechny 3 možnosti musí být věrohodné
6. Index "correct" je 0, 1 nebo 2 (náhodně)

SPECIFICKÁ PRAVIDLA PRO TUTO VĚKOVOU SKUPINU:
${config.rules}

🚨 KRITICKÉ PRAVIDLO - ŽÁDNÉ HALUCINACE:
- NEVYMÝŠLEJ si fakta, postavy ani jména, která neexistují!
- Ptej se POUZE na věci, které PROKAZATELNĚ EXISTUJÍ a znáš je
- Pokud si nejsi 100% JISTÝ → NEGENERUJ tuto otázku

🚨 SPECIÁLNĚ PRO POHÁDKY - POUZE ZNÁMÉ POSTAVY:
- Ptej se JEN na HLAVNÍ postavy, které zná každé dítě
- ČESKÉ POHÁDKY - povolené postavy: Krteček, Rumcajs, Manka, Cipísek, Mach, Šebestová, Pat, Mat, Bob, Bobek, Rákosníček, Křemílek, Vochomůrka, Kubula, Kuba Kubikula, Maková panenka, Včelí medvídci
- DISNEY - povolené: Sněhurka (7 trpaslíků nemají v češtině ustálená jména!), Popelka, Ariel, Elsa, Anna, Simba, Nemo, Buzz, Woody
- NIKDY se neptej na vedlejší postavy, zvířata nebo předměty z pohádek, pokud nejsou SLAVNÉ

❌ PŘÍKLADY HALUCINACÍ (nikdy nedělej):
- "Jak se jmenuje kůň z pohádky o Sněhurce?" → Ve Sněhurce NENÍ žádný pojmenovaný kůň!
- "Jak se jmenuje pes z Krtečka?" → Krteček nemá psa!
- "Jaká je barva Rumcajsova koně?" → Rumcajs nemá koně!
- Vymýšlení jmen postav, které neexistují

✅ SPRÁVNÉ OTÁZKY O POHÁDKÁCH:
- "Kolik trpaslíků žije se Sněhurkou?" → 7 (známý fakt)
- "Jak se jmenuje hlavní postava večerníčku o krtečkovi?" → Krteček
- "Kde žije Rumcajs?" → V lese / Řáholci
- "Kdo je kamarád Boba?" → Bobek

KRITICKÉ PRAVIDLO - ODPOVĚĎ NESMÍ BÝT V OTÁZCE:
- Text správné odpovědi se NESMÍ objevit v textu otázky!
- Ani částečně, ani jako součást jiného slova

KRITICKÉ PRAVIDLO - EXKLUZIVITA ODPOVĚDI:
- POUZE JEDNA z nabízených odpovědí smí být správná!
- Ostatní 2 odpovědi MUSÍ být prokazatelně ŠPATNÉ
- Před generováním si ověř: "Mohla by být i jiná nabízená odpověď správná?" Pokud ano, ZMĚŇ OTÁZKU!

❌ ZAKÁZANÉ FORMULACE (nikdy nepoužívej):
- "Jakou zeleninu/ovoce máme v..." → Více možností je správně
- "Jaké zvíře žije v..." → Více zvířat tam žije  
- "Jaké zvíře je nejčastěji v..." → Neexistuje jedna správná odpověď
- "Co patří mezi..." → Více věcí patří mezi
- "Co je typické pro..." → Subjektivní
- "Co můžeme vidět v..." → Více věcí můžeme vidět

❌ DALŠÍ ZAKÁZANÉ FORMULACE (v5.2):
- "Kdo je hlavní postava večerníčku?" → BEZ názvu je to špatně! Více večerníčků má hlavní postavu
- "Co svítí na obloze?" → Slunce, Měsíc, hvězdy - VŠECHNO svítí!
- "Co je na stromě?" → Listy, větve, ptáci - VŠECHNO je správně!
- "Co je největší část X?" → Nesmyslná konstrukce
- "Jakou vlajku má X?" → Popis vlajky je složitý, vyhni se tomu
- "Kde žije zvíře?" → Příliš obecné, musíš uvést KONKRÉTNÍ zvíře

❌ DALŠÍ ZAKÁZANÉ FORMULACE (v5.3):
- "Co jí kočka/pes?" → Zvířata jí různé věci, nelze určit jednu správnou!
- "Jaká je zelenina?" → Cibule, mrkev, petržel - VŠECHNY jsou zeleniny!
- "Co je ovoce?" → Jablko, hruška, banán - VŠECHNY jsou ovoce!
- "Které zvíře je?" → Příliš obecné bez kritéria

❌ DALŠÍ ZAKÁZANÉ FORMULACE (v5.4):
- "Jakou barvu má česká/německá/... vlajka?" → Vlajky mají VÍCE barev, nelze vybrat jednu!
- "Kdo je slavný sportovec/herec?" → Messi, Ronaldo, Federer - VŠICHNI jsou slavní!
- "Kdo je známý zpěvák?" → Více lidí je známých!

❌ DALŠÍ ZAKÁZANÉ FORMULACE (v5.5):
- "Co létá?" → Pták, hmyz, letadlo - VŠECHNO létá!
- "Jak se jmenuje domácí mazlíček?" → Pes, kočka, králík - VŠECHNY jsou mazlíčci!
- "Co děti rády jedí?" → Ovoce, pizzu, zmrzlinu - VŠECHNO mohou jíst rády!
- "Jak se jmenuje známý pták?" → Sokol, orel, havran - VŠICHNI jsou známí!
- "Co je zdraví/láska/štěstí?" → Filozofické otázky bez jednoznačné odpovědi!
- "Kdo je nejlepší sportovec?" → Více lidí může být nejlepších!

❌ KONKRÉTNÍ PŘÍKLADY ŠPATNÝCH OTÁZEK:
- "Jakou zeleninu máme v polévce?" → Cibule, mrkev, petržel - VŠECHNY jsou správně!
- "Jaké zvíře je nejčastěji v ZOO?" → Slon, lev, opice - VŠECHNY mohou být správně!
- "Co je znečištění ovzduší?" → Vágní, nekonkrétní otázka
- "Kdo je hlavní postava večerníčku?" → Krteček, Rákosníček, Pat - VŠICHNI jsou správně!
- "Co svítí na obloze?" → Měsíc, Slunce, hvězdy - VŠECHNO svítí!
- "Co jí kočka?" → Maso, ryby, granule - VŠECHNO může být správně!
- "Jaká je zelenina?" → Cibule, česnek, petržel - VŠECHNY jsou zeleniny!
- "Jakou barvu má česká vlajka?" → Bílá, červená, modrá - MÁ TŘI BARVY!
- "Kdo je slavný sportovec?" → Messi, Ronaldo - OBA jsou slavní!
- "Co létá?" → Pták, hmyz, letadlo - VŠECHNO létá!
- "Jak se jmenuje domácí mazlíček?" → Pes, kočka - OBOJÍ jsou mazlíčci!

✅ SPRÁVNÉ FORMULACE (používej tyto):
- "Kolik nohou má..." → Konkrétní číslo
- "Jakou barvu má..." → Konkrétní barva (pokud je jednoznačná, např. banán = žlutý)
- "Jak se jmenuje hlavní postava večerníčku O KRTEČKOVI?" → Krteček (MUSÍŠ uvést název!)
- "Kde žije TUČŇÁK?" → Na Antarktidě (konkrétní zvíře!)
- "Kolik..." → Vždy konkrétní číslo
- "Jaká zelenina je ORANŽOVÁ?" → Mrkev (konkrétní kritérium!)
- "Kolik barev má česká vlajka?" → 3 (konkrétní číslo!)
- "Který pták NEUMÍ létat?" → Pštros (konkrétní kritérium!)
- "Kolik nohou má PAVOUK?" → 8 (konkrétní zvíře + číslo!)

✅ KONKRÉTNÍ PŘÍKLADY DOBRÝCH OTÁZEK:
- "Kolik nohou má pavouk?" → 8 (jediná správná odpověď)
- "Jakou barvu má banán?" → Žlutá (jednoznačná odpověď)
- "Jak se jmenuje hlavní postava večerníčku o krtečkovi?" → Krteček (uveden název!)
- "Kolik planet má sluneční soustava?" → 8 (konkrétní číslo)
- "Kde žije tučňák?" → Na Antarktidě (konkrétní zvíře + konkrétní místo)
- "Kolik trpaslíků pomáhá Sněhurce?" → 7 (konkrétní číslo)
- "Jaká zelenina je oranžová?" → Mrkev (konkrétní kritérium)
- "Kolik barev má česká vlajka?" → 3 (konkrétní číslo)
- "Který pták neumí létat?" → Pštros (konkrétní kritérium)

KATEGORIE: ${config.categories}`;
}

// === 🛡️ FILTRY ===

function filterDuplicateAnswers(questions) {
  const seenAnswers = new Set();
  const filtered = [];
  
  for (const q of questions) {
    const correctAnswer = q.options[q.correct].toLowerCase().trim();
    
    if (seenAnswers.has(correctAnswer)) {
      console.log(`⚠️ Duplicitní odpověď odfiltrována: "${correctAnswer}"`);
      continue;
    }
    
    seenAnswers.add(correctAnswer);
    filtered.push(q);
  }
  
  return filtered;
}

function filterSimilarQuestions(questions, threshold = 0.5) {
  const dominated = new Set();
  
  for (let i = 0; i < questions.length; i++) {
    if (dominated.has(i)) continue;
    
    const words1 = new Set(
      questions[i].question.toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 3)
    );
    
    for (let j = i + 1; j < questions.length; j++) {
      if (dominated.has(j)) continue;
      
      const words2 = new Set(
        questions[j].question.toLowerCase()
          .split(/\s+/)
          .filter(w => w.length > 3)
      );
      
      if (words1.size === 0 || words2.size === 0) continue;
      
      const intersection = [...words1].filter(w => words2.has(w)).length;
      const similarity = intersection / Math.min(words1.size, words2.size);
      
      if (similarity > threshold) {
        console.log(`⚠️ Podobné otázky [${i+1}] ~ [${j+1}] - odstraňuji druhou`);
        dominated.add(j);
      }
    }
  }
  
  return questions.filter((_, i) => !dominated.has(i));
}

/**
 * 🛡️ Filtr: Odpověď nesmí být obsažena v otázce
 * Kontroluje celou odpověď i jednotlivá klíčová slova
 */
function filterAnswerInQuestion(questions) {
  return questions.filter(q => {
    const questionLower = q.question.toLowerCase();
    const correctAnswer = q.options[q.correct].toLowerCase().trim();
    
    // Kontrola 1: Je celá odpověď v otázce?
    if (questionLower.includes(correctAnswer)) {
      console.log(`⚠️ Filtr odpověď-v-otázce: "${correctAnswer}" nalezena v "${q.question}"`);
      return false;
    }
    
    // Kontrola 2: Jsou klíčová slova odpovědi v otázce? (pro víceslovné odpovědi)
    // Ignorujeme krátká slova (předložky, spojky atd.)
    const answerWords = correctAnswer
      .split(/\s+/)
      .filter(w => w.length > 4) // Jen slova delší než 4 znaky
      .filter(w => !['který', 'která', 'které', 'jaký', 'jaká', 'jaké'].includes(w));
    
    for (const word of answerWords) {
      // Kontrola základu slova (prvních 5+ znaků pro češtinu kvůli skloňování)
      const wordBase = word.length > 5 ? word.substring(0, 5) : word;
      
      if (questionLower.includes(wordBase)) {
        console.log(`⚠️ Filtr odpověď-v-otázce: slovo "${word}" (základ "${wordBase}") nalezeno v "${q.question}"`);
        return false;
      }
    }
    
    return true;
  });
}

/**
 * 🛡️ Filtr: Vágní/nejednoznačné otázky s více možnými správnými odpověďmi
 * Detekuje podezřelé formulace, které vedou k vícero správným odpovědím
 */
function filterAmbiguousQuestions(questions) {
  // Podezřelé vzory v otázkách
  const suspiciousPatterns = [
    // "Který/á/é je známý/á/é..."
    /kter[ýáéí]\s+.{0,30}\s+je\s+(známý|známá|známé|proslulý|proslulá)/i,
    // "Který závodník/herec/zpěvák působí/působil v..."
    /kter[ýáéí]\s+\w+\s+(působí|působil|hraje|hrál|zpívá|zpíval)\s+(v|ve|na)/i,
    // "Jakou zeleninu/ovoce/jídlo máme/dáváme..."
    /jakou?\s+(zeleninu|ovoce|jídlo|potravinu|ingredienci)\s+(máme|dáváme|přidáváme|používáme)/i,
    // "Jaké zvíře žije/je v..."
    /jaké?\s+zvíře\s+(žije|bydlí|je|najdeme|vidíme)\s+(v|ve|na)/i,
    // "Jaké zvíře je nejčastěji/obvykle/typicky..."
    /jaké?\s+zvíře\s+je\s+(nejčastěji|obvykle|typicky|běžně)/i,
    // "Co patří mezi..."
    /co\s+patří\s+mezi/i,
    // "Co se nachází v..."
    /co\s+se\s+(nachází|vyskytuje|objevuje)\s+(v|ve|na)/i,
    // "Co je typické/charakteristické pro..."
    /co\s+je\s+(typické|charakteristické|příznačné)\s+pro/i,
    // "Co můžeme vidět/najít v..."
    /co\s+(můžeme|lze|je možné)\s+(vidět|najít|spatřit)\s+(v|ve|na)/i,
    // "Co je znečištění/součást/druh..."
    /co\s+je\s+(znečištění|součást|druh|typ|forma)/i,
    // "Která kniha/film byla/byl..."
    /kter[ýáéí]\s+(kniha|film|píseň|skladba)\s+(byla|byl|je)\s+(zfilmována|natočen|vydána)/i,
    // "Jaký sport se hraje..."
    /jaký\s+sport\s+se\s+(hraje|provozuje)/i,
    
    // === NOVÉ VZORY v5.2 ===
    
    // "Kdo je hlavní postava večerníčku?" (bez konkrétního názvu)
    /kdo\s+je\s+hlavní\s+postava\s+(večerníčku|pohádky|příběhu|seriálu)\??$/i,
    // "Co svítí/je na obloze?"
    /co\s+(svítí|je|vidíme|najdeme)\s+(na\s+)?(obloze|nebi)/i,
    // "Co je na stromě/v lese/ve vodě?" (příliš obecné)
    /co\s+(je|roste|žije|najdeme)\s+(na|v|ve)\s+(stromě|stromu|lese|vodě|moři|řece)/i,
    // "Co je největší/nejmenší část X?"
    /co\s+je\s+(největší|nejmenší|hlavní)\s+část/i,
    // "Jakou barvu má X?" kde X je něco s více barvami
    /jakou\s+barvu\s+má\s+(les|obloha|moře|příroda|zahrada)/i,
    // "Co dělá X?" (příliš obecné)
    /co\s+dělá\s+(pes|kočka|pták|zvíře)\??$/i,
    // "Kde žije X?" bez konkrétního zvířete
    /kde\s+žije\s+(zvíře|pták|ryba)\??$/i,
    // "Co jí/žere X?" bez konkrétního zvířete
    /co\s+(jí|žere|konzumuje)\s+(zvíře|pták)\??$/i,
    // "Jakou vlajku má X?" - problém s popisem
    /jakou\s+vlajku\s+má/i,
    
    // === NOVÉ VZORY v5.3 ===
    
    // "Co jí kočka/pes/pták?" - vágní, jí různé věci
    /co\s+(jí|žere|pije)\s+(kočka|pes|pták|kráva|králík|myš|had)\??$/i,
    // "Jaká je zelenina/ovoce?" - příliš obecné
    /jak[áéý]\s+je\s+(zelenina|ovoce|jídlo|potravina|květina|rostlina|strom)\??$/i,
    // "Co je zelenina/ovoce?" - příliš obecné  
    /co\s+je\s+(zelenina|ovoce|jídlo|květina)\??$/i,
    // "Jaké je ovoce/zelenina?" - příliš obecné
    /jaké\s+je\s+(ovoce|zelenina|jídlo)\??$/i,
    // "Které zvíře je...?" bez konkrétního kritéria
    /kter[éá]\s+(zvíře|zelenina|ovoce)\s+je\??$/i,
    
    // === NOVÉ VZORY v5.4 ===
    
    // "Jakou barvu má X vlajka?" - vlajky mají více barev
    /jakou\s+barvu\s+má\s+.{0,20}vlajka/i,
    // "Kdo je slavný X?" - více lidí je slavných
    /kdo\s+je\s+slavn[ýá]\s+(sportovec|herec|zpěvák|umělec|vědec|politik|spisovatel)/i,
    // "Který X je slavný?" - více lidí je slavných  
    /kter[ýá]\s+(sportovec|herec|zpěvák|umělec)\s+je\s+slavn/i,
    // "Kdo je známý X?" - více lidí je známých
    /kdo\s+je\s+znám[ýá]\s+(sportovec|herec|zpěvák|umělec|vědec)/i,
    // "Jaké barvy má vlajka?" - vlajky mají více barev
    /jaké\s+barvy\s+má\s+.{0,20}vlajka/i,
    
    // === NOVÉ VZORY v5.5 ===
    
    // "Kdo je považován za jednoho z nejlepších..." - vágní superlativ
    /kdo\s+je\s+(považován|pokládán)\s+za\s+(jednoho|jednu)\s+(z|ze)\s+(nej|nejlepš)/i,
    // "Co létá/plave/běhá?" - příliš obecné, více odpovědí
    /co\s+(létá|plave|běhá|skáče|leze)\??$/i,
    // "Jak se jmenuje domácí mazlíček/zvíře?" - více mazlíčků
    /jak\s+se\s+jmenuje\s+(domácí\s+)?(mazlíček|zvíře|zvířátko)\??$/i,
    // "Co děti/lidé rády/rádi jedí/pijí?" - více odpovědí
    /co\s+(děti|lidé|lidi)\s+(rád[yia]?|rádi)\s+(jedí|jí|pijí)\??$/i,
    // "Jak se jmenuje známý X?" - více známých
    /jak\s+se\s+jmenuje\s+znám[ýá]\s+(pták|zvíře|rostlina|strom|květina)/i,
    // "Co je jednoduchý/složitý X?" - subjektivní
    /co\s+je\s+(jednoduch[ýá]|složit[ýá]|snadn[ýá]|těžk[ýá])\s+\w+\??$/i,
    // "Co je zdraví/láska/štěstí?" - filozofické/abstraktní
    /co\s+je\s+(zdraví|láska|štěstí|radost|smutek|strach|život|smrt)\??$/i,
    // "Co je X?" kde X je abstraktní pojem
    /co\s+je\s+(přátelství|rodina|domov|svoboda|pravda)\??$/i,
    // Obecné "Co X?" otázky
    /^co\s+(létá|plave|běží|roste|kvete|svítí|hřeje)\??$/i,
    // "Kdo je nejlepší/největší X?" bez konkrétního kritéria
    /kdo\s+je\s+(nejlepší|největší|nejznámější|nejslavnější)\s+(sportovec|herec|zpěvák)/i,
  ];
  
  return questions.filter(q => {
    const questionText = q.question;
    
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(questionText)) {
        console.log(`⚠️ Filtr vágní otázky: "${questionText}"`);
        return false;
      }
    }
    
    return true;
  });
}

/**
 * 🛡️ Filtr: Potenciální halucinace - otázky na vedlejší postavy z pohádek/filmů
 * Detekuje podezřelé otázky, které se ptají na neexistující postavy
 */
function filterPotentialHallucinations(questions) {
  // Vzory, které často vedou k halucinacím
  const hallucinationPatterns = [
    // "Jak se jmenuje kůň/pes/kočka z pohádky..."
    /jak\s+se\s+jmenuje\s+(kůň|pes|kočka|pták|myš|králík|medvěd|vlk|liška)\s+(z|ve|v)\s+(pohádky|pohádce|filmu|příběhu|seriálu)/i,
    // "Jaké je jméno koně/psa z..."
    /jaké?\s+(je\s+)?jméno\s+(koně|psa|kočky|ptáka|zvířete)\s+(z|ve|v)/i,
    // "Jak se jmenuje přítel/kamarád/pomocník X z pohádky Y" (pokud není hlavní postava)
    /jak\s+se\s+jmenuje\s+(přítel|pomocník|sluha|strážce)\s+.{0,30}\s+(z|ve|v)\s+(pohádky|pohádce|filmu)/i,
    // "Jaká je barva koně/pláště/šatů postavy z..."
    /jaká\s+je\s+barva\s+(koně|pláště|šatů|oblečení)\s+.{0,20}\s+(z|ve|v)\s+(pohádky|pohádce|filmu)/i,
    // "Jak se jmenuje zámek/hrad/dům z pohádky..."
    /jak\s+se\s+jmenuje\s+(zámek|hrad|dům|vesnice|město|les)\s+(z|ve|v)\s+(pohádky|pohádce|filmu)/i,
    // Otázky na přezdívky vedlejších postav
    /jaká\s+je\s+přezdívka\s+.{0,30}\s+(z|ve|v)\s+(pohádky|pohádce|filmu)/i,
  ];
  
  // Seznam známých HLAVNÍCH postav, na které se ptát LZE
  const knownMainCharacters = [
    'krteček', 'krtečka', 'krtek',
    'rumcajs', 'rumcajse', 'manka', 'manky', 'cipísek', 'cipíska',
    'mach', 'macha', 'šebestová', 'šebestové',
    'pat', 'pata', 'mat', 'mata',
    'bob', 'boba', 'bobek', 'bobka',
    'rákosníček', 'rákosníčka',
    'křemílek', 'křemílka', 'vochomůrka', 'vochomůrky',
    'kubula', 'kubuly', 'kuba kubikula',
    'sněhurka', 'sněhurky', 'popelka', 'popelky',
    'ariel', 'elsa', 'elsy', 'anna', 'anny',
    'simba', 'simby', 'nemo', 'nema',
    'buzz', 'buzze', 'woody', 'woodyho',
    'shrek', 'shreka', 'fiona', 'fiony',
    'harry potter', 'harryho pottera', 'hermiona', 'hermiony', 'ron', 'rona',
    'pinocchio', 'pinocchia', 'bambi', 'bambiho',
  ];
  
  return questions.filter(q => {
    const questionText = q.question.toLowerCase();
    
    // Kontrola halucinačních vzorů
    for (const pattern of hallucinationPatterns) {
      if (pattern.test(q.question)) {
        // Zkontroluj, jestli otázka obsahuje známou hlavní postavu
        const containsKnownCharacter = knownMainCharacters.some(char => 
          questionText.includes(char.toLowerCase())
        );
        
        if (!containsKnownCharacter) {
          console.log(`⚠️ Filtr potenciální halucinace: "${q.question}"`);
          return false;
        }
      }
    }
    
    return true;
  });
}

// === 🚀 BATCH GENEROVÁNÍ ===

async function generateBatch(mode = 'adult', selectedCategory = null, juniorDifficulty = 'hard') {
  // Vyber správnou sadu kategorií podle módu a obtížnosti
  let allCategories;
  if (mode === 'kid') {
    const difficultyConfig = JUNIOR_DIFFICULTY_CONFIG[juniorDifficulty] || JUNIOR_DIFFICULTY_CONFIG.hard;
    allCategories = difficultyConfig.categories;
    console.log(`🎓 Junior obtížnost: ${difficultyConfig.name} (${difficultyConfig.age})`);
  } else {
    allCategories = ADULT_CATEGORIES;
  }
  
  // Pokud je vybraná konkrétní kategorie, použij jen tu
  let categories;
  if (selectedCategory && allCategories[selectedCategory]) {
    categories = { [selectedCategory]: allCategories[selectedCategory] };
    console.log(`📚 Vybraná kategorie: ${allCategories[selectedCategory].name}`);
  } else {
    categories = allCategories;
    console.log(`📚 Mix všech kategorií`);
  }
  
  const pairs = selectRandomCategoryAspectPairs(categories, BATCH_SIZE);
  
  console.log(`\n📦 BATCH GENEROVÁNÍ - ${mode.toUpperCase()} (${BATCH_SIZE} otázek)`);
  console.log(`🎲 Vybrané aspekty: ${[...new Set(pairs.map(p => p.aspect))].join(', ')}`);
  
  const aspectList = pairs.map((p, i) => `${i + 1}. ${p.categoryName} - ${p.aspect}`).join("\n");
  
  const systemPrompt = mode === 'kid' 
    ? buildJuniorSystemPrompt(juniorDifficulty) 
    : buildAdultSystemPrompt();
  
  const userPrompt = `
# ÚKOL
Vygeneruj PŘESNĚ ${BATCH_SIZE} kvízových otázek. Každá otázka MUSÍ odpovídat zadané kategorii a aspektu.

# ZADÁNÍ (${BATCH_SIZE} kombinací)
${aspectList}

# KRITICKÁ PRAVIDLA
- KAŽDÁ otázka MUSÍ být o JINÉM tématu
- NIKDY NEOPAKUJ stejnou osobu, zemi, nebo místo
- KAŽDÁ otázka MUSÍ mít JINOU správnou odpověď
${getRecentEntitiesForPrompt()}

# PRAVIDLA KVALITY
- Otázky musí být fakticky správné
- Odpovědi maximálně 4 slova
- V otázce NIKDY nezmiňuj správnou odpověď
- Všechny 3 možnosti musí být věrohodné

# VÝSTUPNÍ FORMÁT (POUZE PLATNÝ JSON)
{
  "questions": [
    {"question": "Text otázky 1", "options": ["A", "B", "C"], "correct": 0},
    {"question": "Text otázky 2", "options": ["A", "B", "C"], "correct": 1}
  ]
}

ODPOVĚZ POUZE PLATNÝM JSON BEZ DALŠÍHO TEXTU.
`;

  return await callGroqBatch(systemPrompt, userPrompt, mode);
}

async function callGroqBatch(systemPrompt, userPrompt, mode) {
  const maxRetries = 5;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Volám Groq API... pokus ${attempt}/${maxRetries}`);
      const startTime = Date.now();
      
      const response = await groq.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: mode === 'kid' ? 0.7 : 0.85,
        max_tokens: 5000,
      });
      
      const elapsed = Date.now() - startTime;
      console.log(`✅ Groq odpověděl za ${elapsed}ms`);
      
      let rawContent = response.choices[0].message.content;
      rawContent = rawContent.replace(/```json/g, "").replace(/```/g, "").trim();
      
      const parsed = JSON.parse(rawContent);
      
      if (!parsed.questions || !Array.isArray(parsed.questions)) {
        throw new Error("Chybí pole 'questions'");
      }
      
      // Validace otázek
      const validQuestions = parsed.questions.filter(q => {
        if (!q.question || !q.options || q.options.length !== 3) return false;
        if (typeof q.correct !== 'number' || q.correct < 0 || q.correct > 2) return false;
        return true;
      });
      
      console.log(`📊 Validních otázek: ${validQuestions.length}/${parsed.questions.length}`);
      
      if (validQuestions.length < 18) {
        throw new Error(`Málo validních otázek: ${validQuestions.length}`);
      }
      
      // Filtrování
      let filtered = filterDuplicateAnswers(validQuestions);
      console.log(`🛡️ Po filtraci duplicit: ${filtered.length} otázek`);
      
      filtered = filterSimilarQuestions(filtered);
      console.log(`🛡️ Po filtraci podobných: ${filtered.length} otázek`);
      
      filtered = filterAnswerInQuestion(filtered);
      console.log(`🛡️ Po filtraci odpověď-v-otázce: ${filtered.length} otázek`);
      
      filtered = filterAmbiguousQuestions(filtered);
      console.log(`🛡️ Po filtraci vágních otázek: ${filtered.length} otázek`);
      
      filtered = filterPotentialHallucinations(filtered);
      console.log(`🛡️ Po filtraci halucinací: ${filtered.length} otázek`);
      
      // Přidej entity do historie
      filtered.forEach(q => {
        addToHistory(q.question);
        addEntitiesToHistory(q.question);
      });
      
      return filtered;
      
    } catch (error) {
      console.error(`❌ Pokus ${attempt} selhal:`, error.message);
      
      if (attempt === maxRetries) {
        console.error(`💀 Všechny pokusy selhaly`);
        throw error;
      }
      
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
  
  return [];
}

// === 📤 SPRÁVA CACHE A ODPOVĚDÍ ===

function addToUsedAnswers(answer) {
  const normalized = answer.toLowerCase().trim();
  usedCorrectAnswers.add(normalized);
  
  if (usedCorrectAnswers.size > MAX_ANSWER_HISTORY) {
    const firstKey = usedCorrectAnswers.values().next().value;
    usedCorrectAnswers.delete(firstKey);
  }
}

function isAnswerUsed(answer) {
  return usedCorrectAnswers.has(answer.toLowerCase().trim());
}

function selectUnusedQuestionFromCache() {
  for (let i = 0; i < questionCache.length; i++) {
    const q = questionCache[i];
    const correctAnswer = q.options[q.correct];
    
    if (!isAnswerUsed(correctAnswer)) {
      questionCache.splice(i, 1);
      addToUsedAnswers(correctAnswer);
      return q;
    }
  }
  
  return null;
}

// === 📤 HLAVNÍ EXPORTOVANÉ FUNKCE ===

export async function initializeBatch(mode = 'adult', category = null, juniorDifficulty = 'hard') {
  try {
    questionCache = await generateBatch(mode, category, juniorDifficulty);
    questionCache = shuffleArray(questionCache);
    
    console.log(`📦 Cache naplněna: ${questionCache.length} otázek`);
    return true;
    
  } catch (error) {
    console.error(`❌ Inicializace batch selhala:`, error.message);
    questionCache = [];
    return false;
  }
}

/**
 * Hlavní funkce pro získání otázky
 * @param {string} mode - 'adult' nebo 'kid'
 * @param {string|null} category - null = všechny kategorie, nebo konkrétní klíč kategorie
 * @param {string} juniorDifficulty - 'easy' | 'medium' | 'hard' (pouze pro mode='kid')
 */
export async function generateQuestion(mode = 'adult', category = null, juniorDifficulty = 'hard') {
  // Pokud je cache prázdná, inicializuj batch
  if (questionCache.length === 0) {
    console.log(`📦 Cache prázdná, generuji batch...`);
    const success = await initializeBatch(mode, category, juniorDifficulty);
    
    if (!success || questionCache.length === 0) {
      console.error(`💀 Nelze vygenerovat otázky`);
      return {
        question: "Chyba při generování otázky. Omlouváme se.",
        options: ["Zkusit znovu", "Počkat", "Restartovat"],
        correct: 0
      };
    }
  }
  
  // Vyber otázku s nepoužitou odpovědí
  let question = selectUnusedQuestionFromCache();
  
  if (!question) {
    console.log(`🔄 Všechny odpovědi z cache byly použity, generuji nový batch...`);
    const success = await initializeBatch(mode, category, juniorDifficulty);
    
    if (success && questionCache.length > 0) {
      question = selectUnusedQuestionFromCache();
    }
  }
  
  if (!question) {
    console.log(`⚠️ Extrémní situace - čistím historii odpovědí`);
    usedCorrectAnswers.clear();
    question = questionCache.shift();
    if (question) {
      addToUsedAnswers(question.options[question.correct]);
    }
  }
  
  if (question) {
    console.log(`📤 Otázka z cache (zbývá: ${questionCache.length}, použitých odpovědí: ${usedCorrectAnswers.size})`);
    return question;
  }
  
  return {
    question: "Nepodařilo se načíst otázku. Zkuste to znovu.",
    options: ["OK", "Zkusit znovu", "Pokračovat"],
    correct: 0
  };
}

export function clearHistory() {
  recentQuestions.length = 0;
  recentEntities.length = 0;
  questionCache.length = 0;
  usedCorrectAnswers.clear();
  console.log("🧹 Historie vyčištěna");
}

/**
 * Vyčistí pouze cache otázek (při změně režimu/kategorie)
 * Zachová historii entit pro anti-repeat
 */
export function clearQuestionCache() {
  const previousSize = questionCache.length;
  questionCache.length = 0;
  console.log(`🗑️ Question cache vyčištěna (bylo ${previousSize} otázek)`);
}

export function getCacheSize() {
  return questionCache.length;
}

export function getUsedAnswersSize() {
  return usedCorrectAnswers.size;
}

// === 📚 EXPORT KATEGORIÍ PRO FRONTEND ===
export function getCategories(mode = 'adult', juniorDifficulty = 'hard') {
  let categories;
  
  if (mode === 'kid') {
    const difficultyConfig = JUNIOR_DIFFICULTY_CONFIG[juniorDifficulty] || JUNIOR_DIFFICULTY_CONFIG.hard;
    categories = difficultyConfig.categories;
  } else {
    categories = ADULT_CATEGORIES;
  }
  
  return Object.entries(categories).map(([key, cat]) => ({
    key,
    name: cat.name,
    aspectCount: cat.aspects.length
  }));
}

// Export konfigurace obtížností pro frontend
export function getJuniorDifficultyOptions() {
  return Object.entries(JUNIOR_DIFFICULTY_CONFIG).map(([key, config]) => ({
    key,
    name: config.name,
    age: config.age,
    description: config.description
  }));
}

export { ADULT_CATEGORIES, JUNIOR_CATEGORIES, JUNIOR_DIFFICULTY_CONFIG };
