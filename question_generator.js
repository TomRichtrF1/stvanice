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
  return { generated: s ? s.llmCache.length + s.dbCache.length : 0, target: 5 };
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
  const prompt = `
    Jsi fact-checker. Ověř tuto kvízovou otázku:
    Otázka: "${questionData.question}"
    Možnosti: ${JSON.stringify(questionData.options)}
    Správná odpověď: "${correctAnswer}"
    
    Pravidla:
    1. Je odpověď fakticky SPRÁVNÁ?
    2. Jsou ostatní možnosti NESPRÁVNÉ?
    3. Je otázka jednoznačná?
    
    Odpověz POUZE JSON: {"valid": true} nebo {"valid": false, "reason": "důvod"}
  `;

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
  
  const prompt = `
    Vytvoř 5 kvízových otázek pro kategorii: ${config.name}.
    Formát JSON: [{"question": "...", "options": ["A", "B", "C"], "correct": 0}]
    Odpovědi max 3 slova. Index correct je 0, 1 nebo 2.
    Vrať POUZE čistý JSON pole, nic víc.
  `;

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

    // Struktura
    const structurallyValid = rawQuestions.filter(q => 
      q.question && Array.isArray(q.options) && q.options.length === 3 && typeof q.correct === 'number'
    );
    
    // Anti-Repeat
    const uniqueQuestions = filterQuestions(structurallyValid, gameSession);
    
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