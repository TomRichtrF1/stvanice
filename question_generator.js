/**
 * 🧠 QUESTION GENERATOR - PostgreSQL Supported
 * * VERZE: 5.0 (Async DB Calls)
 */

import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

let questionDatabase = null;
let useDatabase = false;

// Inicializace je nyní asynchronní
export async function connectDatabase(dbModule) {
  try {
    questionDatabase = dbModule;
    await questionDatabase.initDatabase(); // AWAIT!
    useDatabase = true;
    console.log('🗄️ Databáze připojena a inicializována');
    return true;
  } catch (error) {
    console.warn('⚠️ Databáze není dostupná:', error.message);
    useDatabase = false;
    return false;
  }
}

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;

const GENERATOR_MODEL = "llama-3.3-70b-versatile";
const VALIDATOR_MODEL = "sonar-pro"; 
const BATCH_SIZE = 5; 
const MIN_CACHE_SIZE = 3;

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

const globalAnswerBlacklist = new Map(); 
const BLACKLIST_DURATION = 3 * 60 * 60 * 1000; 

function normalizeText(text) {
  if (!text) return "";
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '').trim();
}

function blockAnswerGlobally(answer) {
  const key = normalizeText(answer);
  globalAnswerBlacklist.set(key, Date.now());
}

function isAnswerBlocked(answer) {
  const key = normalizeText(answer);
  const timestamp = globalAnswerBlacklist.get(key);
  if (!timestamp) return false;
  if (Date.now() - timestamp > BLACKLIST_DURATION) {
    globalAnswerBlacklist.delete(key);
    return false;
  }
  return true;
}

const gameSessions = new Map();
const preWarmingStatus = new Map();

class GameSession {
  constructor(gameId) {
    this.gameId = gameId;
    this.usedAnswers = new Set();
    this.currentRound = 0;
    this.dbCache = [];
    this.llmCache = [];
    this.llmGenerating = false;
  }
  
  addUsedAnswer(answer) {
    if (answer) this.usedAnswers.add(normalizeText(answer));
  }
  
  isAnswerUsed(answer) {
    if (!answer) return false;
    return this.usedAnswers.has(normalizeText(answer));
  }

  getSourceForRound() {
    const round = this.currentRound;
    if (round <= 3) return 'llm';
    if (round <= 5) return 'db';
    return (round - 6) % 2 === 0 ? 'llm' : 'db';
  }
}

function getGameSession(gameId) {
  if (!gameId) gameId = 'default_' + Date.now();
  if (!gameSessions.has(gameId)) gameSessions.set(gameId, new GameSession(gameId));
  return gameSessions.get(gameId);
}

export function endGameSession(gameId) {
  gameSessions.delete(gameId);
  preWarmingStatus.delete(gameId);
}

export function resetGameSession(gameId) {
  const session = gameSessions.get(gameId);
  if (session) {
    session.usedAnswers.clear();
    session.dbCache = [];
    session.llmCache = [];
    session.currentRound = 0;
  }
}

const AGE_GROUP_CONFIG = {
  adult: { name: "👔 Dospělí", mode: 'adult', difficulty: 'normal' },
  student: { name: "🎒 Školáci", mode: 'kid', difficulty: 'normal' },
  kids: { name: "🐣 Děti", mode: 'kid', difficulty: 'easy' }
};

export function getAgeGroups() {
  return Object.entries(AGE_GROUP_CONFIG).map(([key, config]) => ({ key, ...config }));
}

async function validateWithSonar(questionData) {
  if (!PERPLEXITY_API_KEY) {
    validationStats.skippedPerplexity++;
    validationHistory.push({ ...questionData, status: 'SKIPPED', reason: 'Chybí API Key' });
    return true; 
  }

  const correctAnswer = questionData.options[questionData.correct];
  
  const prompt = `
    Jsi přísný fact-checker pro vědomostní kvíz. Ověř následující otázku:
    Otázka: "${questionData.question}"
    Možnosti: ${JSON.stringify(questionData.options)}
    Označená správná odpověď: "${correctAnswer}"
    Zkontroluj tato pravidla:
    1. Je označená odpověď fakticky SPRÁVNÁ?
    2. Jsou ostatní možnosti fakticky NESPRÁVNÉ?
    3. Je otázka OBJEKTIVNÍ?
    Odpověz POUZE ve formátu JSON: {"valid": true} nebo {"valid": false, "reason": "stručný důvod česky"}
  `;

  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${PERPLEXITY_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: VALIDATOR_MODEL, messages: [{ role: "user", content: prompt }], temperature: 0 })
    });
    const data = await response.json();
    if (data.error) { validationStats.skippedPerplexity++; return true; }

    const content = data.choices[0].message.content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return false;
    const result = JSON.parse(jsonMatch[0]);
    
    if (result.valid) {
      validationStats.passedPerplexity++;
      validationHistory.push({ ...questionData, status: 'APPROVED', reason: 'OK' });
      return true;
    } else {
      validationStats.failedPerplexity++;
      validationHistory.push({ ...questionData, status: 'REJECTED', reason: result.reason });
      return false;
    }
  } catch (error) {
    validationStats.skippedPerplexity++;
    return true; 
  }
}

function parseJsonSafely(content) {
  try {
    const match = content.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
  } catch (e) {}
  return [];
}

async function generateBatchFromLLM(ageGroup, gameSession) {
  const config = AGE_GROUP_CONFIG[ageGroup] || AGE_GROUP_CONFIG.adult;
  let systemPrompt = `Jsi expert na kvízové otázky. Odpovědi max 3 slova. Index 'correct' náhodně 0-2. POUZE JSON.`;
  if (ageGroup === 'kids') systemPrompt = `Jsi tvůrce kvízu pro malé děti (6-12 let). Otázky velmi jednoduché. POUZE JSON.`;
  
  const prompt = `Vygeneruj ${BATCH_SIZE} unikátních vědomostních otázek pro kategorii: ${config.name}. POUZE JSON: [{"question": "...", "options": ["A","B","C"], "correct": 0}]`;

  try {
    const response = await groq.chat.completions.create({
      model: GENERATOR_MODEL,
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: prompt }],
      temperature: 0.9
    });

    let rawQuestions = parseJsonSafely(response.choices[0].message.content);
    let validQuestions = [];
    validationStats.generated += rawQuestions.length;

    for (const q of rawQuestions) {
      if (!q.options || typeof q.correct !== 'number' || q.options.length !== 3) {
        validationStats.failedSelfCritique++; continue;
      }
      const answer = q.options[q.correct];
      if (isAnswerBlocked(answer) || (gameSession && gameSession.isAnswerUsed(answer))) {
        validationStats.failedSelfCritique++; continue;
      }
      validationStats.passedSelfCritique++;
      if (await validateWithSonar(q)) validQuestions.push(q);
    }

    // ZDE JE ZMĚNA: AWAIT SAVE
    if (useDatabase && questionDatabase && validQuestions.length > 0) {
      await questionDatabase.saveQuestions(validQuestions, config.mode, config.difficulty);
    }
    
    return validQuestions;
  } catch (error) { console.error("LLM Error:", error.message); return []; }
}

export async function preWarmCache(gameId, ageGroup) {
  const session = getGameSession(gameId);
  const config = AGE_GROUP_CONFIG[ageGroup] || AGE_GROUP_CONFIG.adult;
  
  preWarmingStatus.set(gameId, { generated: 0, target: BATCH_SIZE, inProgress: true });
  
  try {
    if (useDatabase && questionDatabase) {
      // ZDE JE ZMĚNA: AWAIT GET
      session.dbCache = await questionDatabase.getQuestionsWithRotation(config.mode, null, config.difficulty, 10, []);
    }
    
    const questions = await generateBatchFromLLM(ageGroup, session);
    session.llmCache = questions.map(q => ({...q, _fromLLM: true, _fromDb: false}));
    
    preWarmingStatus.get(gameId).inProgress = false;
    preWarmingStatus.get(gameId).generated = session.llmCache.length;
    
  } catch (e) { console.error("Pre-warm failed:", e); }
}

function startBackgroundGeneration(session, ageGroup) {
  if (session.llmGenerating) return;
  session.llmGenerating = true;
  generateBatchFromLLM(ageGroup, session).then(qs => {
    const formatted = qs.map(q => ({...q, _fromLLM: true, _fromDb: false}));
    session.llmCache.push(...formatted);
    session.llmGenerating = false;
  });
}

async function refillDbCache(session, mode, difficulty) {
  if (!useDatabase || !questionDatabase) return;
  // ZDE JE ZMĚNA: AWAIT
  const newQs = await questionDatabase.getQuestionsWithRotation(mode, null, difficulty, 5, []);
  session.dbCache.push(...newQs);
}

export async function generateQuestion(gameId, ageGroup = 'adult') {
  const session = getGameSession(gameId);
  const config = AGE_GROUP_CONFIG[ageGroup] || AGE_GROUP_CONFIG.adult;
  session.currentRound++;
  
  const preferredSource = session.getSourceForRound();
  let question = null;
  let source = 'none';

  if (preferredSource === 'llm' || session.dbCache.length === 0) {
    for (let i = 0; i < session.llmCache.length; i++) {
        const q = session.llmCache[i];
        const answer = q.options[q.correct];
        if (!isAnswerBlocked(answer) && !session.isAnswerUsed(answer)) {
            question = q;
            session.llmCache.splice(i, 1);
            source = 'llm';
            break;
        }
    }
  }

  if (!question) {
    for (let i = 0; i < session.dbCache.length; i++) {
        const q = session.dbCache[i];
        const answer = q.options[q.correct];
        if (!isAnswerBlocked(answer) && !session.isAnswerUsed(answer)) {
            question = q;
            session.dbCache.splice(i, 1);
            source = 'db';
            break;
        }
    }
  }

  // Fallback direct DB fetch
  if (!question && questionDatabase) {
      // ZDE JE ZMĚNA: AWAIT
      const freshBatch = await questionDatabase.getQuestionsWithRotation(config.mode, null, config.difficulty, 5, []);
      for (const q of freshBatch) {
          const answer = q.options[q.correct];
          if (!isAnswerBlocked(answer) && !session.isAnswerUsed(answer)) {
              question = q;
              source = 'db';
              break;
          }
      }
  }

  if (question) {
    const answer = question.options[question.correct];
    blockAnswerGlobally(answer);
    session.addUsedAnswer(answer);
    
    if (question._id && questionDatabase) {
        // ZDE JE ZMĚNA: AWAIT
        await questionDatabase.markQuestionAsUsed(question._id);
    }
    
    if (session.llmCache.length < MIN_CACHE_SIZE) startBackgroundGeneration(session, ageGroup);
    if (session.dbCache.length < MIN_CACHE_SIZE) refillDbCache(session, config.mode, config.difficulty);
    
    return { ...question, _fromLLM: source === 'llm', _fromDb: source === 'db' };
  }

  return { question: "Načítání...", options: ["Chyba", "Chyba", "Chyba"], correct: 0, _error: true };
}

export function clearHistory() { globalAnswerBlacklist.clear(); }
export function clearQuestionCache() { resetValidationStats(); }
export function getCacheSize() { return 0; }
export function getUsedAnswersSize() { return globalAnswerBlacklist.size; }
export function initializeBatch() {}
export { AGE_GROUP_CONFIG as AG };