/**
 * 🧠 QUESTION GENERATOR - Production Edition
 * VERZE: 4.2
 * 
 * OPRAVY:
 * - BUG6: Timeout pro LLM + robustní fallback na DB
 * - BUG7: Ukládání do DB až při použití hráčem
 * - BUG10: Anti-repeat validace (3h okno) - ověřeno
 * - ERROR FIX: Ukládání do DB POUZE pro fact-checked otázky!
 * 
 * NOVÉ FUNKCE:
 * - Obsahová validace otázek (question_validator.js)
 * - Fact-checking pomocí Sonar Pro (fact_checker.js)
 * - Globální deduplikace odpovědí (3h okno)
 * - Střídání LLM/DB podle schématu kol
 * - Background generování pro další hry
 * 
 * DŮLEŽITÉ:
 * - Otázky se ukládají do DB POUZE pokud _factChecked === true
 * - Bez PERPLEXITY_API_KEY se LLM otázky NEUKLÁDAJÍ do DB
 */

import Groq from 'groq-sdk';
import dotenv from 'dotenv';
import { filterValidQuestions } from './question_validator.js';
import { factCheckBatch } from './fact_checker.js';

dotenv.config();

// === DATABASE REFERENCE ===
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
      console.log('⚠️ Generator: Databáze nedostupná, jedeme v LLM-only módu');
    }
    
    // Kontrola fact-checkeru
    if (process.env.PERPLEXITY_API_KEY) {
      console.log('✅ Generator: Fact-checker aktivní (Sonar Pro)');
    } else {
      console.warn('⚠️ Generator: Fact-checker NEAKTIVNÍ - LLM otázky se NEBUDOU ukládat do DB!');
    }
    
    return success;
  } catch (error) {
    console.warn('⚠️ Generator: Chyba při připojování DB:', error.message);
    useDatabase = false;
    return false;
  }
}

// === GROQ CLIENT ===
let groqInstance = null;
function getGroqClient() {
  if (groqInstance) return groqInstance;
  if (!process.env.GROQ_API_KEY) return null;
  try {
    groqInstance = new Groq({ apiKey: process.env.GROQ_API_KEY });
    return groqInstance;
  } catch (error) { return null; }
}

// === KONFIGURACE ===
const GENERATOR_MODEL = "llama-3.3-70b-versatile";
const TARGET_BATCH_SIZE = 8;       // Cílový počet otázek v batchi (pro progress bar)
const MIN_BATCH_FOR_START = 5;     // Minimum otázek pro start hry
const LLM_TIMEOUT_MS = 25000;      // 25s timeout pro LLM
const LLM_GENERATE_COUNT = 12;     // Generovat více, po validaci zbyde méně

// === GAME SESSIONS ===
const gameSessions = new Map();

class GameSession {
  constructor(gameId) {
    this.gameId = gameId;
    this.currentRound = 0;
    this.dbCache = [];
    this.llmCache = [];
    this.llmGenerating = false;
    this.llmTimedOut = false;
    this.llmFailed = false;
    this.usedAnswers = new Set();
  }
  
  getTotalCached() {
    return this.dbCache.length + this.llmCache.length;
  }
  
  incrementRound() {
    this.currentRound++;
    return this.currentRound;
  }
}

function getGameSession(gameId) {
  if (!gameId) gameId = 'default';
  if (!gameSessions.has(gameId)) {
    gameSessions.set(gameId, new GameSession(gameId));
  }
  return gameSessions.get(gameId);
}

// === SESSION MANAGEMENT ===
export function endGameSession(gameId) { 
  gameSessions.delete(gameId); 
}

export function resetGameSession(gameId) { 
  const session = gameSessions.get(gameId);
  if (session) {
    session.currentRound = 0;
    session.usedAnswers.clear();
    session.llmTimedOut = false;
    session.llmFailed = false;
    // NEMAZAT cache při rematchi - použijeme existující otázky
  }
}

// === ROUND SOURCE LOGIC ===
// Schéma: 1-3 LLM, 4-5 DB, 6+ střídání
function getSourceForRound(round) {
  if (round <= 3) return 'llm';
  if (round <= 5) return 'db';
  return round % 2 === 0 ? 'llm' : 'db';
}

// === CACHE STATUS (PROGRESS BAR - DB + LLM dohromady) ===
export function getCacheStatus(gameId) {
  const session = gameSessions.get(gameId);
  if (!session) {
    return { 
      generated: 0, 
      target: TARGET_BATCH_SIZE, 
      ready: false,
      status: 'waiting'
    };
  }
  
  const dbCount = session.dbCache.length;
  const llmCount = session.llmCache.length;
  const totalCached = dbCount + llmCount;
  
  // Progress bar ukazuje DB + LLM, max = target
  const displayGenerated = Math.min(totalCached, TARGET_BATCH_SIZE);
  
  // Ready když máme dostatek otázek celkem
  const isReady = totalCached >= MIN_BATCH_FOR_START;
  
  // Určení statusu
  let status = 'generating';
  if (totalCached >= TARGET_BATCH_SIZE) {
    status = 'ready';
  } else if ((session.llmTimedOut || session.llmFailed) && totalCached >= MIN_BATCH_FOR_START) {
    status = 'fallback';
  } else if (session.llmGenerating) {
    status = 'generating';
  } else if (totalCached >= MIN_BATCH_FOR_START) {
    status = 'ready';
  }
  
  // Debug log
  console.log(`📊 Cache status [${gameId}]: DB=${dbCount}, LLM=${llmCount}, total=${totalCached}/${TARGET_BATCH_SIZE}, generating=${session.llmGenerating}`);
  
  return {
    generated: displayGenerated,
    target: TARGET_BATCH_SIZE,
    ready: isReady,
    status,
    dbCount,
    llmCount,
    isGenerating: session.llmGenerating,
  };
}

// === AGE GROUP CONFIG ===
const AGE_GROUP_CONFIG = {
  adult: { name: "👔 Dospělí", mode: 'adult', difficulty: 'normal' },
  student: { name: "🎒 Školáci", mode: 'kid', difficulty: 'normal' },
  kids: { name: "🐣 Děti", mode: 'kid', difficulty: 'easy' }
};

export function getAgeGroups() {
  return Object.entries(AGE_GROUP_CONFIG).map(([key, config]) => ({ key, ...config }));
}

export function getValidationStats() { return {}; }

// === LLM GENERATION (s validací a fact-checkem) ===
async function generateBatchFromLLM(ageGroup, session) {
  const client = getGroqClient();
  if (!client) {
    console.error('❌ Groq client není dostupný');
    return [];
  }

  const config = AGE_GROUP_CONFIG[ageGroup] || AGE_GROUP_CONFIG.adult;
  
  // Vylepšený prompt s pravidly pro kvalitu
  const prompt = `Vytvoř ${LLM_GENERATE_COUNT} českých kvízových otázek pro kategorii: ${config.name}.

STRIKTNÍ PRAVIDLA:
1. Každá otázka musí mít JEDNU jasně správnou faktickou odpověď
2. Správná odpověď NESMÍ být obsažena v textu otázky
3. ZAKÁZÁNY jsou subjektivní otázky (nejkrásnější, nejlepší, oblíbený...)
4. ZAKÁZÁNY jsou spekulativní otázky o budoucnosti
5. Všechny 3 odpovědi musí být RŮZNÉ
6. Otázky musí být fakticky ověřitelné

Formát JSON: [{"question": "...", "options": ["A", "B", "C"], "correct": 0}]
- Odpovědi max 3 slova
- Index correct je 0, 1 nebo 2
- Vrať POUZE čistý JSON pole, žádný další text`;

  try {
    console.log(`🤖 Generuji ${LLM_GENERATE_COUNT} otázek pomocí LLM...`);
    
    const response = await client.chat.completions.create({
      model: GENERATOR_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    });

    const content = response.choices[0].message.content;
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('❌ LLM nevrátilo validní JSON');
      return [];
    }
    
    let questions = JSON.parse(jsonMatch[0]);
    console.log(`   [0] LLM vrátilo: ${questions.length} otázek`);

    // === KROK 1: Základní strukturální validace ===
    questions = questions.filter(q => 
      q.question && 
      Array.isArray(q.options) && 
      q.options.length === 3 && 
      typeof q.correct === 'number' &&
      q.correct >= 0 && 
      q.correct <= 2
    );
    console.log(`   [1] Strukturální validace: ${questions.length} otázek`);

    // === KROK 2: Obsahová validace ===
    questions = filterValidQuestions(questions);
    console.log(`   [2] Obsahová validace: ${questions.length} otázek`);

    // === KROK 3: Fact-checking (Sonar Pro) ===
    questions = await factCheckBatch(questions);
    console.log(`   [3] Fact-check: ${questions.length} otázek`);

    // === KROK 4: Globální deduplikace odpovědí (3h okno) - BUG10 ===
    if (useDatabase && questionDatabase) {
      const deduped = [];
      for (const q of questions) {
        const correctAnswer = q.options[q.correct];
        const isRecent = await questionDatabase.isAnswerRecentlyUsed(correctAnswer, 3);
        
        if (!isRecent) {
          deduped.push(q);
        } else {
          console.log(`   ⏭️ Přeskočena - odpověď "${correctAnswer}" použita v posledních 3h`);
        }
      }
      questions = deduped;
      console.log(`   [4] Anti-repeat (3h): ${questions.length} otázek`);
    }

    console.log(`✅ LLM pipeline dokončena: ${questions.length} kvalitních otázek`);
    return questions;
    
  } catch (error) {
    console.error("❌ LLM Error:", error.message);
    return [];
  }
}

// === PRE-WARM CACHE ===
export async function preWarmCache(gameId, ageGroup) {
  const session = getGameSession(gameId);
  const config = AGE_GROUP_CONFIG[ageGroup] || AGE_GROUP_CONFIG.adult;
  
  // Reset flagů
  session.llmTimedOut = false;
  session.llmFailed = false;
  session.dbCache = [];
  session.llmCache = [];
  
  console.log(`🔥 Pre-warming cache pro ${gameId} (${ageGroup})`);

  // === KROK 1: Načíst DB otázky ===
  if (useDatabase && questionDatabase) {
    try {
      const dbQuestions = await questionDatabase.getQuestionsWithRotation(
        config.mode, null, config.difficulty, TARGET_BATCH_SIZE, []
      );
      session.dbCache = dbQuestions || [];
      console.log(`   -> DB Cache: ${session.dbCache.length} otázek`);
    } catch (e) {
      console.warn("   -> DB fetch error:", e.message);
    }
  }

  // === KROK 2: Spustit LLM generování s timeoutem ===
  session.llmGenerating = true;
  
  const llmPromise = generateBatchFromLLM(ageGroup, session);
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('LLM_TIMEOUT')), LLM_TIMEOUT_MS)
  );
  
  try {
    const questions = await Promise.race([llmPromise, timeoutPromise]);
    
    // Označit jako _pendingSave
    const formatted = questions.map(q => ({
      ...q, 
      _fromLLM: true, 
      _fromDb: false,
      _pendingSave: true
    }));
    
    session.llmCache.push(...formatted);
    console.log(`   -> LLM Cache: ${session.llmCache.length} otázek`);
    
  } catch (error) {
    if (error.message === 'LLM_TIMEOUT') {
      console.warn(`   ⏱️ LLM timeout po ${LLM_TIMEOUT_MS/1000}s`);
      session.llmTimedOut = true;
    } else {
      console.error(`   ❌ LLM selhalo:`, error.message);
      session.llmFailed = true;
    }
    
    if (session.dbCache.length >= MIN_BATCH_FOR_START) {
      console.log(`   ✅ Fallback na DB (${session.dbCache.length} otázek)`);
    } else {
      console.error(`   ❌ KRITICKÉ: Nedostatek otázek!`);
    }
  } finally {
    session.llmGenerating = false;
  }
  
  console.log(`📊 Celkem v cache: DB=${session.dbCache.length} + LLM=${session.llmCache.length} = ${session.getTotalCached()}`);
  
  // === KROK 3: Spustit background generování pro další hry ===
  startBackgroundGenerationForFuture(ageGroup);
}

// === BACKGROUND GENERATION PRO BUDOUCÍ HRY ===
let backgroundGenerationRunning = false;
const backgroundCache = new Map();  // ageGroup -> otázky[]

async function startBackgroundGenerationForFuture(ageGroup) {
  if (backgroundGenerationRunning) return;
  
  const existingCache = backgroundCache.get(ageGroup) || [];
  if (existingCache.length >= 10) {
    console.log(`📦 Background cache pro ${ageGroup} je plná (${existingCache.length} otázek)`);
    return;
  }
  
  backgroundGenerationRunning = true;
  console.log(`🔄 Spouštím background generování pro budoucí hry (${ageGroup})...`);
  
  try {
    // Použít dummy session
    const dummySession = { usedAnswers: new Set() };
    const questions = await generateBatchFromLLM(ageGroup, dummySession);
    
    const formatted = questions.map(q => ({
      ...q,
      _fromLLM: true,
      _fromDb: false,
      _pendingSave: true
    }));
    
    const current = backgroundCache.get(ageGroup) || [];
    backgroundCache.set(ageGroup, [...current, ...formatted].slice(0, 15));
    
    console.log(`📦 Background cache pro ${ageGroup}: ${backgroundCache.get(ageGroup).length} otázek`);
  } catch (e) {
    console.error('Background generation error:', e.message);
  } finally {
    backgroundGenerationRunning = false;
  }
}

// Použít background cache při startu nové hry
function useBackgroundCache(session, ageGroup) {
  const cached = backgroundCache.get(ageGroup) || [];
  if (cached.length > 0) {
    const toUse = cached.splice(0, 5);
    session.llmCache.push(...toUse);
    console.log(`📦 Použito ${toUse.length} otázek z background cache`);
    return toUse.length;
  }
  return 0;
}

// === BACKGROUND GENERATION PRO AKTUÁLNÍ HRU ===
function startBackgroundGeneration(session, ageGroup) {
  if (session.llmGenerating) return;
  
  session.llmGenerating = true;
  
  generateBatchFromLLM(ageGroup, session)
    .then(questions => {
      const formatted = questions.map(q => ({
        ...q, 
        _fromLLM: true, 
        _fromDb: false,
        _pendingSave: true
      }));
      session.llmCache.push(...formatted);
      console.log(`   -> Background LLM: +${questions.length} otázek`);
    })
    .catch(err => {
      console.error('Background generation error:', err.message);
    })
    .finally(() => {
      session.llmGenerating = false;
    });
}

// === GET QUESTION FROM SOURCE ===
async function getQuestionFromSource(source, session, ageGroup) {
  const config = AGE_GROUP_CONFIG[ageGroup] || AGE_GROUP_CONFIG.adult;
  
  if (source === 'llm') {
    // Zkus LLM cache
    if (session.llmCache.length > 0) {
      const q = session.llmCache.shift();
      
      // Doplnit cache na pozadí
      if (session.llmCache.length < 3) {
        startBackgroundGeneration(session, ageGroup);
      }
      
      return q;
    }
    
    // Fallback na DB
    console.log(`⚠️ LLM cache prázdná, fallback na DB`);
    if (session.dbCache.length > 0) {
      return session.dbCache.shift();
    }
    
  } else {
    // Zkus DB cache
    if (session.dbCache.length > 0) {
      const q = session.dbCache.shift();
      
      // Doplnit DB cache na pozadí
      if (useDatabase && questionDatabase && session.dbCache.length < 3) {
        questionDatabase.getQuestionsWithRotation(config.mode, null, config.difficulty, 5, [])
          .then(qs => {
            session.dbCache.push(...qs);
          })
          .catch(() => {});
      }
      
      return q;
    }
    
    // Fallback na LLM
    console.log(`⚠️ DB cache prázdná, fallback na LLM`);
    if (session.llmCache.length > 0) {
      return session.llmCache.shift();
    }
  }
  
  return null;
}

// === MAIN EXPORT: generateQuestion ===
export async function generateQuestion(gameId, ageGroup = 'adult') {
  const session = getGameSession(gameId);
  const config = AGE_GROUP_CONFIG[ageGroup] || AGE_GROUP_CONFIG.adult;
  
  // Inkrementovat kolo
  const currentRound = session.incrementRound();
  
  // Určit zdroj podle čísla kola
  const preferredSource = getSourceForRound(currentRound);
  console.log(`📋 Kolo ${currentRound}: Preferovaný zdroj = ${preferredSource.toUpperCase()}`);
  
  // Získat otázku z preferovaného zdroje
  let question = await getQuestionFromSource(preferredSource, session, ageGroup);
  
  if (question) {
    // Uložit LLM otázku do DB až při použití - POUZE pokud prošla fact-checkem!
    if (question._fromLLM && question._pendingSave && question._factChecked) {
      delete question._pendingSave;
      
      if (useDatabase && questionDatabase) {
        questionDatabase.saveQuestions([{
          question: question.question,
          options: question.options,
          correct: question.correct
        }], config.mode, config.difficulty)
          .then(saved => {
            if (saved > 0) console.log(`💾 Otázka uložena do DB po použití (fact-checked ✓)`);
          })
          .catch(err => console.error("Save error:", err.message));
      }
    } else if (question._fromLLM && question._pendingSave && !question._factChecked) {
      // Otázka nebyla fact-checked - NEULOŽIT do DB!
      delete question._pendingSave;
      console.log(`⚠️ Otázka NEBYLA uložena do DB (fact-check přeskočen)`);
    }
    
    // Inkrementovat counter pro DB otázky
    if (question._id && question._fromDb && useDatabase && questionDatabase) {
      questionDatabase.markQuestionAsUsed(question._id);
    }
    
    // 🆕 BUG10: Zaznamenat odpověď pro globální deduplikaci (3h okno)
    if (useDatabase && questionDatabase) {
      const correctAnswer = question.options[question.correct];
      questionDatabase.recordUsedAnswer(correctAnswer);
      console.log(`   📝 Odpověď "${correctAnswer}" zaznamenána pro anti-repeat`);
    }
    
    console.log(`   ✅ Otázka z ${question._fromLLM ? 'LLM' : 'DB'}: "${question.question.substring(0, 40)}..."`);
    return question;
  }
  
  // === LIVE GENERATION (poslední záchrana) ===
  console.log("⚠️ Obě cache prázdné, generuji LIVE...");
  const fresh = await generateBatchFromLLM(ageGroup, session);
  
  if (fresh.length > 0) {
    const q = fresh.shift();
    
    // Zbytek do cache
    session.llmCache.push(...fresh.map(x => ({
      ...x, 
      _fromLLM: true, 
      _fromDb: false,
      _pendingSave: true
    })));
    
    // Uložit použitou otázku POUZE pokud prošla fact-checkem
    if (useDatabase && questionDatabase && q._factChecked) {
      questionDatabase.saveQuestions([q], config.mode, config.difficulty).catch(() => {});
      questionDatabase.recordUsedAnswer(q.options[q.correct]);
      console.log(`💾 LIVE otázka uložena do DB (fact-checked ✓)`);
    } else if (!q._factChecked) {
      console.log(`⚠️ LIVE otázka NEBYLA uložena do DB (fact-check přeskočen)`);
      // Ale stále zaznamenat odpověď pro anti-repeat
      if (useDatabase && questionDatabase) {
        questionDatabase.recordUsedAnswer(q.options[q.correct]);
      }
    }
    
    return { ...q, _fromLLM: true, _fromDb: false };
  }

  // === PANIC MODE ===
  console.error("❌ CRITICAL: Nelze získat otázku ze žádného zdroje!");
  return {
    question: "Systémová chyba: Nelze načíst otázku. Kdo vyhrává?",
    options: ["Lovec", "Štvanec", "Nikdo"],
    correct: 2,
    _error: true,
    _fromLLM: false,
    _fromDb: false
  };
}
