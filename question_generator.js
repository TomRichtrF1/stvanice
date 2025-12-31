/**
 * 🧠 QUESTION GENERATOR - Ultimate Edition
 * Features:
 * 1. Anti-Repeat (Over-fetch & Filter)
 * 2. Fact-Checking (Perplexity/Sonar)
 * 3. Robust Database Handling
 */

import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

// === KONFIGURACE ===
const GENERATOR_MODEL = "llama-3.3-70b-versatile";
const VALIDATOR_MODEL = "sonar-pro"; // Model pro ověřování faktů
const BATCH_SIZE = 5;       
const DB_FETCH_BATCH = 20;  // Over-fetch pro filtrování
const MIN_CACHE_SIZE = 3;   
const BLACKLIST_DURATION = 3 * 60 * 60 * 1000; // 3 hodiny

// === DATABÁZE ===
let questionDatabase = null;
let useDatabase = false;

export async function connectDatabase(dbModule) {
  try {
    questionDatabase = dbModule;
    const success = await questionDatabase.initDatabase();
    useDatabase = success;
    if (success) console.log('✅ Generator: Databáze aktivní a připojená');
    else console.log('⚠️ Generator: Databáze nedostupná (init selhal), jedeme v LLM-only módu');
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

// === STATISTIKY (OBNOVENO) ===
let validationStats = {
  generated: 0,
  passedSelfCritique: 0, // Prošlo strukturální kontrolou
  failedSelfCritique: 0,
  passedPerplexity: 0,   // Prošlo fact-checkingem
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

// === ANTI-REPEAT LOGIKA ===
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
    this.currentRound = 0;
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

// === FACT CHECKING (PERPLEXITY SONAR) - OBNOVENO ===
async function validateWithSonar(questionData) {
  if (!PERPLEXITY_API_KEY) {
    validationStats.skippedPerplexity++;
    return true; // Bez klíče propouštíme (fallback)
  }

  const correctAnswer = questionData.options[questionData.correct];
  
  const prompt = `
    Jsi přísný fact-checker. Ověř tuto kvízovou otázku:
    Otázka: "${questionData.question}"
    Možnosti: ${JSON.stringify(questionData.options)}
    Správná odpověď (index ${questionData.correct}): "${correctAnswer}"
    
    Pravidla:
    1. Je označená odpověď fakticky SPRÁVNÁ?
    2. Jsou ostatní možnosti fakticky NESPRÁVNÉ?
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
        return true; // Při chybě API raději pustíme, než abychom neměli nic
    }

    const content = data.choices[0].message.content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return false;
    
    const result = JSON.parse(jsonMatch[0]);
    
    if (result.valid) {
      validationStats.passedPerplexity++;
      // console.log(`✅ Validated: "${questionData.question.substring(0,30)}..."`);
      return true;
    } else {
      validationStats.failedPerplexity++;
      console.log(`❌ Rejected: "${questionData.question}" - ${result.reason}`);
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
    if (isAnswerBlocked(answer)) return false;
    if (session && session.isAnswerUsed(answer)) return false;
    return true;
  });
}

// === GENERACE Z LLM ===
async function generateBatchFromLLM(ageGroup, gameSession) {
  const client = getGroqClient();
  if (!client) return [];

  const config = AGE_GROUP_CONFIG[ageGroup] || AGE_GROUP_CONFIG.adult;
  
  const prompt = `
    Vytvoř 5 českých kvízových otázek pro kategorii: ${config.name}.
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
    if (!jsonMatch) return [];
    
    const rawQuestions = JSON.parse(jsonMatch[0]);
    validationStats.generated += rawQuestions.length;

    // 1. Validace struktury
    const structurallyValid = rawQuestions.filter(q => 
      q.question && Array.isArray(q.options) && q.options.length === 3 && typeof q.correct === 'number'
    );
    
    // 2. Anti-Repeat Filtr (okamžitě vyhodit duplicity)
    const uniqueQuestions = filterQuestions(structurallyValid, gameSession);
    
    // 3. Fact-Checking (Perplexity) - Pouze pro unikátní otázky
    const finalQuestions = [];
    for (const q of uniqueQuestions) {
        // Validujeme sériově (nebo paralelně Promise.all, ale sériově šetříme Rate Limit)
        const isValid = await validateWithSonar(q);
        if (isValid) finalQuestions.push(q);
    }

    // Uložení do DB
    if (useDatabase && questionDatabase && finalQuestions.length > 0) {
       questionDatabase.saveQuestions(finalQuestions, config.mode, config.difficulty)
         .catch(err => console.error("Save error:", err.message));
    }

    return finalQuestions;
  } catch (error) {
    console.error("LLM Error:", error.message);
    return [];
  }
}

// === DB CACHE REFILL (S FILTREM) ===
async function refillDbCache(session, ageGroup) {
  if (!useDatabase || !questionDatabase) return;
  const config = AGE_GROUP_CONFIG[ageGroup] || AGE_GROUP_CONFIG.adult;

  try {
    // Over-fetch 20 otázek
    const candidates = await questionDatabase.getQuestionsWithRotation(
      config.mode, null, config.difficulty, DB_FETCH_BATCH, []
    );

    // Filtr (zde NEVOLÁME Perplexity, protože v DB by už měly být ověřené)
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

  // DB část
  if (useDatabase && questionDatabase) {
    try {
      const candidates = await questionDatabase.getQuestionsWithRotation(
        config.mode, null, config.difficulty, DB_FETCH_BATCH, []
      );
      const cleanQuestions = filterQuestions(candidates, session);
      session.dbCache = cleanQuestions.slice(0, 5);
      console.log(`   -> DB Cache: ${session.dbCache.length} čistých otázek`);
    } catch (e) {
      console.warn("   -> DB fetch error");
    }
  }

  // LLM část
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

  // 1. LLM Cache
  if (session.llmCache.length > 0) {
    question = session.llmCache.shift();
    if (session.llmCache.length < MIN_CACHE_SIZE) startBackgroundGeneration(session, ageGroup);
  }

  // 2. DB Cache
  if (!question && session.dbCache.length > 0) {
    question = session.dbCache.shift();
  }
  
  // Doplňování DB
  if (useDatabase && questionDatabase && session.dbCache.length < MIN_CACHE_SIZE) {
     refillDbCache(session, ageGroup).catch(() => {});
  }

  // 3. Live Generace
  if (!question) {
    console.log("⚠️ Cache prázdná, generuji live...");
    const fresh = await generateBatchFromLLM(ageGroup, session);
    if (fresh.length > 0) {
      question = fresh.shift();
      session.llmCache.push(...fresh.map(x => ({...x, _fromLLM: true})));
      question._fromLLM = true;
    }
  }

  // 4. Finální kontrola a blokace
  if (question) {
    const answer = question.options[question.correct];
    
    // Last-minute check (pokud se mezitím zablokovala)
    if (isAnswerBlocked(answer) || session.isAnswerUsed(answer)) {
       console.log(`♻️ Last minute skip: "${answer}". Hledám jinou.`);
       return generateQuestion(gameId, ageGroup);
    }

    blockAnswerGlobally(answer);
    session.addUsedAnswer(answer);

    if (question._fromDb && question._id && questionDatabase) {
        questionDatabase.markQuestionAsUsed(question._id).catch(() => {});
    }

    return question;
  }

  // 5. Panic Mode
  console.error("❌ CRITICAL: Panic question!");
  return {
    question: "Systémová chyba: Nelze načíst otázku. Kdo vyhrává?",
    options: ["Lovec", "Štvanec", "Nikdo"],
    correct: 2,
    _error: true,
    _fromLLM: false
  };
}