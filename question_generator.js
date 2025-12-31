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
const MIN_CACHE_SIZE = 3;   
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
  }
  isAnswerUsed(ans) { return this.usedAnswers.has(normalizeText(ans)); }
  addUsedAnswer(ans) { this.usedAnswers.add(normalizeText(ans)); }
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

export function getAgeGroups() {
  return Object.entries(AGE_GROUP_CONFIG).map(([key, config]) => ({ key, ...config }));
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
 */
function buildPromptForAgeGroup(ageGroup, config) {
  // Témata pro rotaci (zabraňuje opakování stejných témat)
  const ADULT_TOPICS = [
    "česká a světová historie",
    "světová literatura a autoři",
    "zeměpis a hlavní města",
    "přírodní vědy a objevy",
    "klasická hudba a skladatelé",
    "film a režiséři",
    "sport a olympijské hry",
    "umění a malíři"
  ];
  
  const KID_TOPICS = [
    "zvířata a jejich vlastnosti",
    "pohádky a dětské příběhy",
    "základní matematika",
    "barvy a tvary",
    "roční období a počasí"
  ];

  // Náhodné téma pro variabilitu
  const topics = ageGroup === 'adult' ? ADULT_TOPICS : KID_TOPICS;
  const randomTopic = topics[Math.floor(Math.random() * topics.length)];

  if (ageGroup === 'adult') {
    return `Jsi expert na tvorbu NÁROČNÝCH kvízových otázek pro vědomostní soutěže (AZ-kvíz, Riskuj!).

TÉMA: ${randomTopic}
JAZYK: Čeština (gramaticky správně!)

═══════════════════════════════════════════════════════════
PRAVIDLA PRO GENEROVÁNÍ
═══════════════════════════════════════════════════════════

1. OBTÍŽNOST - otázky musí testovat ZNALOSTI, ne zdravý rozum
2. JEDNOZNAČNOST - právě JEDNA odpověď musí být správná
3. DISTRAKTORY - špatné odpovědi musí být uvěřitelné, ale jasně špatné

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

- Přesně 5 otázek
- Každá má přesně 3 možnosti
- "correct" = index správné odpovědi (0, 1, nebo 2)
- Odpovědi max 4 slova
- Otázky MUSÍ končit otazníkem`;
  } 
  
  else if (ageGroup === 'student') {
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
async function generateBatchFromLLM(ageGroup, gameSession, retryCount = 0) {
  const client = getGroqClient();
  if (!client) return [];

  // Stop condition pro rekurzi
  if (retryCount >= MAX_RETRIES) {
    console.warn(`⚠️ LLM Retry limit (${MAX_RETRIES}) dosažen.`);
    return [];
  }

  const config = AGE_GROUP_CONFIG[ageGroup] || AGE_GROUP_CONFIG.adult;
  
  // 🆕 VYLEPŠENÝ PROMPT podle věkové kategorie
  const prompt = buildPromptForAgeGroup(ageGroup, config);

  try {
    const response = await client.chat.completions.create({
      model: GENERATOR_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.9
    });

    const content = response.choices[0].message.content;
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    
    // 🔄 RETRY: Pokud model nevrátil JSON
    if (!jsonMatch) {
      console.warn(`⚠️ LLM syntax error (pokus ${retryCount+1}). Zkouším znovu...`);
      return generateBatchFromLLM(ageGroup, gameSession, retryCount + 1);
    }
    
    let rawQuestions;
    try {
      rawQuestions = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      // 🔄 RETRY: Pokud JSON nejde parsovat
      console.warn(`⚠️ JSON Parse Error (pokus ${retryCount+1}). Zkouším znovu...`);
      return generateBatchFromLLM(ageGroup, gameSession, retryCount + 1);
    }

    validationStats.generated += rawQuestions.length;

    // 1. Strukturální validace
    const structurallyValid = rawQuestions.filter(q => 
      q.question && Array.isArray(q.options) && q.options.length === 3 && typeof q.correct === 'number'
    );
    
    // 2. 🆕 Kontrola obtížnosti (pro dospělé) - filtruje triviální otázky
    const difficultyFiltered = structurallyValid.filter(q => {
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
  
  let question = null;

  // 1. Zkusíme LLM Cache
  if (session.llmCache.length > 0) {
    question = session.llmCache.shift();
    if (session.llmCache.length < MIN_CACHE_SIZE) startBackgroundGeneration(session, ageGroup);
  }

  // 2. Pokud není LLM, zkusíme DB Cache
  if (!question && session.dbCache.length > 0) {
    question = session.dbCache.shift();
  }
  
  // Doplňování DB cache
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