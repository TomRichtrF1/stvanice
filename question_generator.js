/**
 * 🧠 QUESTION GENERATOR - AI generování otázek + Globální ochrana
 * * VERZE: 3.4 - FIX DUPLICITNÍ DEKLARACE
 * * Funkce:
 * - Blokuje odpovědi (např. "Au", "Zlato") napříč všemi hrami na 3 hodiny
 * - Zajišťuje, že se counter v DB zvedne jen u skutečně použitých otázek
 */

import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

// === 🗄️ DATABASE KONFIGURACE ===
let questionDatabase = null;
let useDatabase = false;

export function connectDatabase(dbModule) {
  try {
    questionDatabase = dbModule;
    questionDatabase.initDatabase();
    useDatabase = true;
    console.log('🗄️ Databáze připojena k question_generator');
    return true;
  } catch (error) {
    console.warn('⚠️ Databáze není dostupná:', error.message);
    useDatabase = false;
    return false;
  }
}

// === 🔧 GROQ KONFIGURACE ===
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const MODEL = "llama-3.3-70b-versatile";
const BATCH_SIZE = 8;
const MIN_READY = 4;

// === 🌍 GLOBÁLNÍ ANSWER BLACKLIST ===
// Blokuje ODPOVĚDI, ne jen znění otázek.
// Klíč = normalizovaná odpověď ("zlato", "au", "karel capek")
// Hodnota = timestamp
const globalAnswerBlacklist = new Map(); 
const BLACKLIST_DURATION = 3 * 60 * 60 * 1000; // 3 hodiny blokace napříč servery

// Pomocná funkce pro normalizaci (odstraní diakritiku, malá písmena)
function normalizeText(text) {
  if (!text) return "";
  return text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '') // jen alfanumerické znaky
    .trim();
}

// Přidat odpověď do blacklistu
function blockAnswerGlobally(answer) {
  const key = normalizeText(answer);
  globalAnswerBlacklist.set(key, Date.now());
  // console.log(`🚫 Globálně blokuji odpověď: "${answer}" (klíč: ${key})`);
}

// Je odpověď blokovaná?
function isAnswerBlocked(answer) {
  const key = normalizeText(answer);
  const timestamp = globalAnswerBlacklist.get(key);
  if (!timestamp) return false;
  
  // Cleanup při kontrole - pokud expirovalo, smažeme a vrátíme false
  if (Date.now() - timestamp > BLACKLIST_DURATION) {
    globalAnswerBlacklist.delete(key);
    return false;
  }
  return true;
}

// === 🎮 SESSION MANAGEMENT ===
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
    this.settings = { mode: 'adult', difficulty: 'normal' };
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
  if (!gameSessions.has(gameId)) {
    gameSessions.set(gameId, new GameSession(gameId));
  }
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

// === 🎯 KATEGORIE ===
const AGE_GROUP_CONFIG = {
  adult: { name: "👔 Dospělí", mode: 'adult', difficulty: 'normal' },
  student: { name: "🎒 Školáci", mode: 'kid', difficulty: 'normal' },
  kids: { name: "🐣 Děti", mode: 'kid', difficulty: 'easy' }
};

export function getAgeGroups() {
  return Object.entries(AGE_GROUP_CONFIG).map(([key, config]) => ({ key, ...config }));
}

export { AGE_GROUP_CONFIG };

// === 🎯 GENEROVÁNÍ LLM ===
// Prompty a pomocné funkce
const ADULT_ASPECTS = ["Film", "Hudba", "Historie", "Zeměpis", "Věda", "Literatura", "Sport", "Příroda"];
const STUDENT_ASPECTS = ["Matematika", "Fyzika", "Biologie", "Dějepis", "Zeměpis", "Literatura", "Chemie"];
const KIDS_ASPECTS = ["Zvířata", "Pohádky", "Barvy", "Příroda", "Vesmír", "Jídlo"];

function getSystemPrompt(ageGroup) {
  if (ageGroup === 'kids') return `Jsi tvůrce kvízu pro malé děti (6-12 let). Otázky velmi jednoduché, max 2 slova odpověď. POUZE JSON.`;
  if (ageGroup === 'student') return `Jsi tvůrce kvízu pro středoškoláky. Úroveň gymnázia. Odpovědi max 3 slova. POUZE JSON.`;
  return `Jsi expert na kvízové otázky pro dospělé. Odpovědi max 3 slova. Index 'correct' náhodně 0-2. POUZE JSON.`;
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
  const aspects = ageGroup === 'kids' ? KIDS_ASPECTS : (ageGroup === 'student' ? STUDENT_ASPECTS : ADULT_ASPECTS);
  const randomAspects = aspects.sort(() => 0.5 - Math.random()).slice(0, 3);
  
  const prompt = `Vygeneruj ${BATCH_SIZE} unikátních otázek. Témata: ${randomAspects.join(', ')}. Formát JSON: [{"question": "...", "options": ["A","B","C"], "correct": 0}].`;

  try {
    const response = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: getSystemPrompt(ageGroup) },
        { role: "user", content: prompt }
      ],
      temperature: 0.8
    });

    let questions = parseJsonSafely(response.choices[0].message.content);
    
    // FILTRACE PŘÍMO PO VYGENEROVÁNÍ
    // Zahodíme otázky, jejichž odpověď je globálně blokovaná
    questions = questions.filter(q => {
        if (!q.options || typeof q.correct !== 'number') return false;
        const answer = q.options[q.correct];
        
        // Pokud je odpověď blokovaná (použitá v jiné hře) nebo v této hře -> zahodit
        if (isAnswerBlocked(answer) || (gameSession && gameSession.isAnswerUsed(answer))) {
            return false;
        }
        return true;
    });

    // Uložit do DB ty, co prošly
    if (useDatabase && questionDatabase && questions.length > 0) {
        questionDatabase.saveQuestions(questions, config.mode, config.difficulty);
    }
    
    return questions;

  } catch (error) {
    console.error("LLM Error:", error.message);
    return [];
  }
}

// === 🚀 PRE-WARMING & CACHE ===
export async function preWarmCache(gameId, ageGroup) {
  const session = getGameSession(gameId);
  const config = AGE_GROUP_CONFIG[ageGroup] || AGE_GROUP_CONFIG.adult;
  
  preWarmingStatus.set(gameId, { generated: 0, target: BATCH_SIZE, inProgress: true });
  
  try {
    // 1. Načíst z DB (bez inkrementace)
    if (useDatabase && questionDatabase) {
      session.dbCache = questionDatabase.getQuestionsWithRotation(
        config.mode, null, config.difficulty, 10, []
      );
    }
    
    // 2. Generovat LLM
    const questions = await generateBatchFromLLM(ageGroup, session);
    session.llmCache = questions.map(q => ({...q, _fromLLM: true, _fromDb: false}));
    
    preWarmingStatus.get(gameId).inProgress = false;
    preWarmingStatus.get(gameId).generated = session.llmCache.length;
    
  } catch (e) {
    console.error("Pre-warm failed:", e);
  }
}

export function getPreWarmStatus(gameId) {
  return preWarmingStatus.get(gameId) || { generated: 0, target: BATCH_SIZE, inProgress: false };
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

function refillDbCache(session, mode, difficulty) {
  if (!useDatabase || !questionDatabase) return;
  const newQs = questionDatabase.getQuestionsWithRotation(mode, null, difficulty, 5, []);
  session.dbCache.push(...newQs);
}

// === 🎯 HLAVNÍ FUNKCE ===

export async function generateQuestion(gameId, ageGroup = 'adult') {
  const session = getGameSession(gameId);
  const config = AGE_GROUP_CONFIG[ageGroup] || AGE_GROUP_CONFIG.adult;
  session.currentRound++;
  
  // Preferovaný zdroj podle kola
  const preferredSource = session.getSourceForRound();
  let question = null;
  let source = 'none';

  // --- VÝBĚR OTÁZKY ---
  
  // 1. Zkusit LLM Cache (pokud je preferovaná nebo jako fallback)
  if (preferredSource === 'llm' || session.dbCache.length === 0) {
    for (let i = 0; i < session.llmCache.length; i++) {
        const q = session.llmCache[i];
        const answer = q.options[q.correct];
        // Kontrola blokace
        if (!isAnswerBlocked(answer) && !session.isAnswerUsed(answer)) {
            question = q;
            session.llmCache.splice(i, 1);
            source = 'llm';
            break;
        }
    }
  }

  // 2. Zkusit DB Cache (pokud nebyla nalezena v LLM)
  if (!question) {
    for (let i = 0; i < session.dbCache.length; i++) {
        const q = session.dbCache[i];
        const answer = q.options[q.correct];
        // Kontrola blokace
        if (!isAnswerBlocked(answer) && !session.isAnswerUsed(answer)) {
            question = q;
            session.dbCache.splice(i, 1);
            source = 'db';
            break;
        }
    }
  }

  // 3. Kritický Fallback - pokud nemáme nic, vezmeme čerstvé z DB
  if (!question && questionDatabase) {
      const freshBatch = questionDatabase.getQuestionsWithRotation(config.mode, null, config.difficulty, 5, []);
      for (const q of freshBatch) {
          const answer = q.options[q.correct];
          if (!isAnswerBlocked(answer) && !session.isAnswerUsed(answer)) {
              question = q;
              source = 'db';
              break;
          }
      }
  }

  // --- FINÁLNÍ ZPRACOVÁNÍ ---
  
  if (question) {
    const answer = question.options[question.correct];
    
    // A. Zablokovat odpověď GLOBÁLNĚ (pro ostatní lobby)
    blockAnswerGlobally(answer);
    
    // B. Zablokovat lokálně pro tuto hru
    session.addUsedAnswer(answer);
    
    // C. Pokud je z DB, potvrdit použití (zvýšit counter)
    if (question._id && questionDatabase) {
        questionDatabase.markQuestionAsUsed(question._id);
    }
    
    // D. Doplnit cache na pozadí
    if (session.llmCache.length < 3) startBackgroundGeneration(session, ageGroup);
    if (session.dbCache.length < 3) refillDbCache(session, config.mode, config.difficulty);
    
    console.log(`🎯 Otázka vybrána (${source}): "${question.question}" (Blokuji odpověď: ${answer})`);
    
    return { ...question, _fromLLM: source === 'llm', _fromDb: source === 'db' };
  }

  // Error stav
  return { 
    question: "Načítání otázky se nezdařilo...", 
    options: ["Zkusit znovu", "Chyba", "Error"], 
    correct: 0, 
    _error: true 
  };
}

// Utils pro statistiky
export function clearQuestionCache() {
  globalAnswerBlacklist.clear();
}

export function getSessionsStats() {
  return { activeSessions: gameSessions.size, blacklistSize: globalAnswerBlacklist.size };
}