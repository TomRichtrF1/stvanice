/**
 * 🧠 QUESTION GENERATOR - AI generování otázek
 * 
 * VERZE: 3.1 - STŘÍDÁNÍ LLM/DB
 * 
 * Logika střídání:
 * - Kola 1-3: LLM (garantované)
 * - Kola 4-5: DB
 * - Kola 6+: střídání LLM, DB, LLM, DB...
 * 
 * Batch size: 8 otázek
 * Minimum pro ready: 4 LLM otázky
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

// === 🔧 PERPLEXITY KONFIGURACE ===
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const PERPLEXITY_MODEL = "sonar-pro";
const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";

// === 🎯 KONFIGURACE ===
const BATCH_SIZE = 8; // Sníženo z 12
const MIN_READY = 4;  // Minimum pro "ready" stav

const VALIDATION_CONFIG = {
  enableSelfCritique: true,
  enablePerplexityCheck: true,
  perplexitySampleRate: 0.5,
  maxRetries: 2,
  parallelValidation: 5,
};

// === 📊 STATISTIKY ===
const validationStats = {
  generated: 0,
  passedSelfCritique: 0,
  failedSelfCritique: 0,
  passedPerplexity: 0,
  failedPerplexity: 0,
  skippedPerplexity: 0,
};

// === 🎮 SESSION MANAGEMENT ===
const gameSessions = new Map();
const preWarmingStatus = new Map();

const SESSION_CONFIG = {
  timeout: 180 * 60 * 1000,
  maxSessions: 1000,
  cleanupInterval: 5 * 60 * 1000,
};

setInterval(() => cleanupOldGameSessions(), SESSION_CONFIG.cleanupInterval);

class GameSession {
  constructor(gameId) {
    this.gameId = gameId;
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
    this.usedAnswers = new Set();
    this.currentRound = 0;
    this.dbCache = [];
    this.llmCache = [];
    this.llmGenerating = false;
    this.llmGenerationPromise = null;
    this.llmFailed = false; // Flag pro kritické selhání LLM
    this.settings = {
      mode: 'adult',
      difficulty: 'normal'
    };
  }
  
  touch() {
    this.lastActivity = Date.now();
  }
  
  isExpired() {
    return Date.now() - this.lastActivity > SESSION_CONFIG.timeout;
  }
  
  addUsedAnswer(answer) {
    if (answer) {
      this.usedAnswers.add(answer.toLowerCase().trim());
    }
  }
  
  isAnswerUsed(answer) {
    if (!answer) return false;
    return this.usedAnswers.has(answer.toLowerCase().trim());
  }
  
  /**
   * 🆕 Určí zdroj pro aktuální kolo podle pravidel střídání
   */
  getSourceForRound() {
    const round = this.currentRound;
    
    // Kola 1-3: LLM (pokud dostupné)
    if (round <= 3) {
      return 'llm';
    }
    
    // Kola 4-5: DB
    if (round <= 5) {
      return 'db';
    }
    
    // Kola 6+: střídání - lichá = LLM, sudá = DB
    // Kolo 6 -> (6-6) = 0 -> sudé -> DB... ne, chceme LLM
    // Přepočítáme: kolo 6 = LLM, 7 = DB, 8 = LLM, 9 = DB...
    const offset = round - 6;
    return offset % 2 === 0 ? 'llm' : 'db';
  }
}

function getGameSession(gameId) {
  if (!gameId) gameId = 'default_' + Date.now();
  
  if (!gameSessions.has(gameId)) {
    if (gameSessions.size >= SESSION_CONFIG.maxSessions) {
      cleanupOldGameSessions();
    }
    gameSessions.set(gameId, new GameSession(gameId));
    console.log(`🎮 New game session: ${gameId}`);
  }
  
  const session = gameSessions.get(gameId);
  session.touch();
  return session;
}

function cleanupOldGameSessions() {
  let cleaned = 0;
  for (const [gameId, session] of gameSessions.entries()) {
    if (session.isExpired()) {
      gameSessions.delete(gameId);
      preWarmingStatus.delete(gameId);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`🧹 Cleaned ${cleaned} old game sessions`);
  }
}

export function endGameSession(gameId) {
  if (gameSessions.has(gameId)) {
    gameSessions.delete(gameId);
    preWarmingStatus.delete(gameId);
    console.log(`🎮 Game session ended: ${gameId}`);
  }
}

export function resetGameSession(gameId) {
  const session = gameSessions.get(gameId);
  if (session) {
    session.usedAnswers.clear();
    session.dbCache = [];
    session.llmCache = [];
    session.currentRound = 0;
    session.llmGenerating = false;
    session.llmGenerationPromise = null;
    session.llmFailed = false;
    console.log(`🔄 Game session reset: ${gameId}`);
  }
}

export function getSessionsStats() {
  return {
    activeSessions: gameSessions.size,
    maxSessions: SESSION_CONFIG.maxSessions,
    timeout: SESSION_CONFIG.timeout / 60000 + ' min'
  };
}

// === 🎯 VĚKOVÉ SKUPINY ===

const AGE_GROUP_CONFIG = {
  adult: {
    name: "👔 Dospělí",
    description: "Těžké otázky pro znalce",
    mode: 'adult',
    difficulty: 'normal'
  },
  teen: {
    name: "🎒 Větší školáci",
    description: "Pro 5.-9. třídu (11-14 let)",
    mode: 'kid',
    difficulty: 'hard'
  },
  child: {
    name: "📚 Malí školáci",
    description: "Pro 1.-4. třídu (7-10 let)",
    mode: 'kid',
    difficulty: 'medium'
  },
  preschool: {
    name: "🐣 Předškoláci",
    description: "Pro nejmenší (4-6 let)",
    mode: 'kid',
    difficulty: 'easy'
  }
};

export function getAgeGroups() {
  return Object.entries(AGE_GROUP_CONFIG).map(([key, config]) => ({
    key, ...config
  }));
}

export { AGE_GROUP_CONFIG };

// === 🎯 ASPEKTY PRO GENEROVÁNÍ ===

const ADULT_ASPECTS = [
  "Motorsport", "Týmové sporty", "Film a seriály", "Hudba",
  "Historie", "Zeměpis", "Věda a technologie", "Gastronomie",
  "Literatura", "Umění a architektura", "Zvířata a příroda", "Byznys a ekonomika"
];

const JUNIOR_ASPECTS = {
  easy: ["Zvířátka", "České pohádky", "Barvy a tvary", "Jídlo", "Příroda"],
  medium: ["Zvířata", "Pohádky a filmy", "Svět kolem nás", "Lidské tělo", "Vesmír", "Věda a příroda"],
  hard: ["Zvířata", "Pohádky a filmy", "Lidské tělo", "Svět kolem nás", "Vesmír", "Sport pro děti", "Věda pro děti", "Historie pro děti"]
};

// === 🔧 POMOCNÉ FUNKCE ===

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function selectRandomAspects(mode, difficulty, count) {
  let aspects = mode === 'adult' ? ADULT_ASPECTS : (JUNIOR_ASPECTS[difficulty] || JUNIOR_ASPECTS.hard);
  return shuffleArray(aspects).slice(0, count);
}

// === 🔧 ROBUSTNÍ JSON PARSING ===

function parseJsonSafely(content) {
  // Pokus 1: Přímé parsování
  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.log(`   ⚠️ Direct parse failed: ${e.message}`);
  }
  
  // Pokus 2: Oprava common issues
  try {
    let cleaned = content;
    
    // Najdi JSON array
    const startIdx = cleaned.indexOf('[');
    const endIdx = cleaned.lastIndexOf(']');
    
    if (startIdx === -1 || endIdx === -1) {
      throw new Error('No JSON array found');
    }
    
    cleaned = cleaned.substring(startIdx, endIdx + 1);
    
    // Oprav trailing commas
    cleaned = cleaned.replace(/,\s*]/g, ']');
    cleaned = cleaned.replace(/,\s*}/g, '}');
    
    // Oprav neukončené stringy (nahraď newlines)
    cleaned = cleaned.replace(/[\r\n]+/g, ' ');
    
    return JSON.parse(cleaned);
  } catch (e) {
    console.log(`   ⚠️ Cleaned parse failed: ${e.message}`);
  }
  
  // Pokus 3: Extrahuj jednotlivé objekty
  try {
    const objects = [];
    const regex = /\{[^{}]*"question"[^{}]*"options"[^{}]*"correct"[^{}]*\}/g;
    const matches = content.match(regex);
    
    if (matches && matches.length > 0) {
      for (const match of matches) {
        try {
          const obj = JSON.parse(match);
          if (obj.question && obj.options && typeof obj.correct === 'number') {
            objects.push(obj);
          }
        } catch (e) {
          // Skip invalid objects
        }
      }
      
      if (objects.length > 0) {
        console.log(`   ✅ Extracted ${objects.length} questions via regex`);
        return objects;
      }
    }
  } catch (e) {
    console.log(`   ⚠️ Regex extraction failed: ${e.message}`);
  }
  
  throw new Error('Failed to parse JSON after all attempts');
}

// === 🧠 SYSTÉMOVÉ PROMPTY ===

function getAdultSystemPrompt() {
  return `Jsi expert na tvorbu kvízových otázek pro dospělé v češtině.

PRAVIDLA:
1. Otázky musí být v ČEŠTINĚ
2. Správná odpověď max 3 slova
3. Všechny 3 možnosti musí být věrohodné
4. Index "correct" je 0, 1 nebo 2 (NÁHODNĚ!)
5. ŽÁDNÉ opakování témat nebo odpovědí

KRITICKÉ - JEDNOZNAČNOST:
- POUZE JEDNA odpověď smí být správná!
- Ostatní 2 MUSÍ být prokazatelně ŠPATNÉ

❌ ZAKÁZANÉ: "Kdo je známý...", "Co patří mezi...", "Jakou barvu má vlajka..."
✅ SPRÁVNÉ: "Ve kterém roce...", "Kolik...", "Kdo vyhrál X v roce Y..."

DŮLEŽITÉ: Odpověz POUZE validním JSON polem, žádný další text!`;
}

function getJuniorSystemPrompt(difficulty) {
  const rules = {
    easy: "VELMI JEDNODUCHÉ pro předškoláky 4-6 let. Max 10 slov. Barvy, zvířata, pohádky.",
    medium: "JEDNODUCHÉ pro 1.-4. třídu. Max 15 slov. Disney, planety, základní fakta.",
    hard: "STŘEDNĚ NÁROČNÉ pro 5.-9. třídu. Vzdělávací obsah 2. stupně ZŠ."
  };

  return `Jsi expert na tvorbu kvízových otázek pro děti.

PRAVIDLA:
1. Otázky v ČEŠTINĚ, jednoduchý jazyk
2. Správná odpověď max 3 slova
3. Index "correct" náhodně 0, 1 nebo 2

ÚROVEŇ: ${rules[difficulty] || rules.hard}

🚨 KRITICKÉ:
- NEVYMÝŠLEJ si fakta!
- POUZE JEDNA odpověď smí být správná!

DŮLEŽITÉ: Odpověz POUZE validním JSON polem, žádný další text!`;
}

// === 🔧 FILTRY ===

function shuffleQuestionAnswers(questions) {
  return questions.map(q => {
    if (!q.options || !Array.isArray(q.options)) return null;
    
    const pairs = q.options.map((opt, i) => ({ text: opt, isCorrect: i === q.correct }));
    for (let i = pairs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
    }
    return {
      ...q,
      options: pairs.map(p => p.text),
      correct: pairs.findIndex(p => p.isCorrect)
    };
  }).filter(q => q !== null);
}

function filterLongAnswers(questions, maxLength = 25) {
  return questions.filter(q => {
    if (!q.options) return false;
    return !q.options.some(opt => opt && opt.length > maxLength);
  });
}

function filterDuplicateAnswers(questions, gameSession) {
  const seenAnswers = new Set();
  return questions.filter(q => {
    if (!q.options || typeof q.correct !== 'number') return false;
    const correctAnswer = q.options[q.correct];
    if (!correctAnswer) return false;
    
    const normalized = correctAnswer.toLowerCase().trim();
    if (seenAnswers.has(normalized)) return false;
    if (gameSession?.isAnswerUsed(normalized)) return false;
    seenAnswers.add(normalized);
    return true;
  });
}

function filterSimilarQuestions(questions, threshold = 0.5) {
  const dominated = new Set();
  for (let i = 0; i < questions.length; i++) {
    if (dominated.has(i)) continue;
    if (!questions[i].question) continue;
    
    const words1 = new Set(questions[i].question.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    for (let j = i + 1; j < questions.length; j++) {
      if (dominated.has(j)) continue;
      if (!questions[j].question) continue;
      
      const words2 = new Set(questions[j].question.toLowerCase().split(/\s+/).filter(w => w.length > 3));
      if (words1.size === 0 || words2.size === 0) continue;
      const intersection = [...words1].filter(w => words2.has(w)).length;
      if (intersection / Math.min(words1.size, words2.size) > threshold) {
        dominated.add(j);
      }
    }
  }
  return questions.filter((_, i) => !dominated.has(i));
}

function filterAnswerInQuestion(questions) {
  return questions.filter(q => {
    if (!q.question || !q.options || typeof q.correct !== 'number') return false;
    const correctAnswer = q.options[q.correct];
    if (!correctAnswer) return false;
    return !q.question.toLowerCase().includes(correctAnswer.toLowerCase().trim());
  });
}

// === 🔍 VALIDACE ===

async function selfCritiqueQuestion(question) {
  const critiquePrompt = `Kontroluj kvízovou otázku:

OTÁZKA: "${question.question}"
MOŽNOSTI: A) ${question.options[0]} B) ${question.options[1]} C) ${question.options[2]}
SPRÁVNÁ: ${question.options[question.correct]}

Je gramaticky správná a jednoznačná? Odpověz PASS nebo FAIL.`;

  try {
    const response = await groq.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: critiquePrompt }],
      temperature: 0.1,
      max_tokens: 100,
    });
    const result = response.choices[0].message.content.trim();
    const passed = result.toUpperCase().includes("PASS");
    passed ? validationStats.passedSelfCritique++ : validationStats.failedSelfCritique++;
    return passed;
  } catch (error) {
    console.error(`   ⚠️ Self-Critique error: ${error.message}`);
    return true;
  }
}

async function perplexityFactCheck(question) {
  if (!PERPLEXITY_API_KEY) {
    validationStats.skippedPerplexity++;
    return true;
  }

  if (Math.random() > VALIDATION_CONFIG.perplexitySampleRate) {
    validationStats.skippedPerplexity++;
    return true;
  }

  const factCheckPrompt = `Ověř: "${question.question}" - Správná odpověď: "${question.options[question.correct]}"
Je to fakticky správně? Odpověz: VERDICT: PASS nebo FAIL`;

  try {
    const response = await fetch(PERPLEXITY_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: PERPLEXITY_MODEL,
        messages: [{ role: "user", content: factCheckPrompt }],
        temperature: 0.1,
        max_tokens: 200,
      }),
    });

    if (!response.ok) throw new Error(`Perplexity API error: ${response.status}`);

    const data = await response.json();
    const result = data.choices[0].message.content.trim();
    const passed = result.toUpperCase().includes("PASS");
    passed ? validationStats.passedPerplexity++ : validationStats.failedPerplexity++;
    return passed;
  } catch (error) {
    console.error(`   🛑 Perplexity error: ${error.message}`);
    validationStats.skippedPerplexity++;
    return true;
  }
}

async function validateQuestion(question) {
  validationStats.generated++;
  
  if (VALIDATION_CONFIG.enableSelfCritique) {
    if (!await selfCritiqueQuestion(question)) {
      return { valid: false, reason: 'self-critique' };
    }
  }
  
  if (VALIDATION_CONFIG.enablePerplexityCheck) {
    if (!await perplexityFactCheck(question)) {
      return { valid: false, reason: 'perplexity' };
    }
  }
  
  return { valid: true };
}

async function validateBatchParallel(questions, mode = 'adult', difficulty = 'normal') {
  console.log(`   🔍 Validating ${questions.length} questions...`);
  
  const validatedQuestions = [];
  const concurrency = VALIDATION_CONFIG.parallelValidation;
  
  for (let i = 0; i < questions.length; i += concurrency) {
    const batch = questions.slice(i, i + concurrency);
    const results = await Promise.all(batch.map(q => validateQuestion(q)));
    
    for (let j = 0; j < results.length; j++) {
      if (results[j].valid) {
        validatedQuestions.push(batch[j]);
      }
    }
  }
  
  console.log(`   ✅ Validation: ${validatedQuestions.length}/${questions.length} passed`);
  
  // Uložení do databáze
  if (useDatabase && questionDatabase && validatedQuestions.length > 0) {
    try {
      const saved = questionDatabase.saveQuestions(validatedQuestions, mode, difficulty);
      console.log(`   💾 Saved ${saved} new questions to DB`);
    } catch (error) {
      console.warn(`   ⚠️ DB save failed: ${error.message}`);
    }
  }
  
  return validatedQuestions;
}

export function getValidationStats() {
  return { ...validationStats };
}

// === 🎯 GENEROVÁNÍ ===

async function generateBatchFromLLM(mode, difficulty, gameSession, retryCount = 0) {
  const isKid = mode === 'kid';
  const systemPrompt = isKid ? getJuniorSystemPrompt(difficulty) : getAdultSystemPrompt();
  
  const aspects = selectRandomAspects(mode, difficulty, BATCH_SIZE);
  const usedAnswersList = gameSession ? Array.from(gameSession.usedAnswers).slice(-30) : [];
  
  const forbiddenStr = usedAnswersList.length > 0 
    ? `\n\n🚫 NEPOUŽÍVEJ: ${usedAnswersList.join(', ')}`
    : '';
  
  const userPrompt = `Vygeneruj ${BATCH_SIZE} UNIKÁTNÍCH kvízových otázek.

TÉMATA: ${aspects.join(', ')}
${forbiddenStr}

Formát - POUZE validní JSON pole (bez markdown, bez komentářů):
[{"question": "Text otázky?", "options": ["A", "B", "C"], "correct": 0}]`;

  try {
    console.log(`🧠 LLM: Generating ${BATCH_SIZE} questions (${mode}/${difficulty})...`);
    
    const response = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.8,
      max_tokens: 3000,
    });

    const content = response.choices[0].message.content.trim();
    
    // Robustní parsing
    let questions = parseJsonSafely(content);
    
    // Validace struktury
    questions = questions.filter(q => 
      q && 
      typeof q.question === 'string' && 
      Array.isArray(q.options) && 
      q.options.length >= 3 &&
      typeof q.correct === 'number' &&
      q.correct >= 0 && q.correct <= 2
    );
    
    if (questions.length === 0) {
      throw new Error('No valid questions after structure validation');
    }
    
    // Filtry
    questions = shuffleQuestionAnswers(questions);
    questions = filterLongAnswers(questions);
    questions = filterAnswerInQuestion(questions);
    questions = filterDuplicateAnswers(questions, gameSession);
    questions = filterSimilarQuestions(questions);
    
    console.log(`   📦 After filters: ${questions.length} questions`);
    
    if (questions.length === 0) {
      throw new Error('No questions after filtering');
    }
    
    // Paralelní validace
    const validated = await validateBatchParallel(questions, mode, difficulty);
    
    return validated;
    
  } catch (error) {
    console.error(`   ❌ LLM generation failed: ${error.message}`);
    
    // Retry logika
    if (retryCount < VALIDATION_CONFIG.maxRetries) {
      console.log(`   🔄 Retrying... (attempt ${retryCount + 2}/${VALIDATION_CONFIG.maxRetries + 1})`);
      await new Promise(r => setTimeout(r, 1000));
      return generateBatchFromLLM(mode, difficulty, gameSession, retryCount + 1);
    }
    
    return [];
  }
}

// === 🚀 PRE-WARMING ===

export async function preWarmCache(gameId, ageGroup) {
  const config = AGE_GROUP_CONFIG[ageGroup] || AGE_GROUP_CONFIG.adult;
  const mode = config.mode;
  const difficulty = config.difficulty;
  
  const session = getGameSession(gameId);
  session.settings = { mode, difficulty };
  session.llmFailed = false;
  
  preWarmingStatus.set(gameId, {
    generated: 0,
    target: BATCH_SIZE,
    minReady: MIN_READY,
    inProgress: true,
    error: null
  });
  
  console.log(`🚀 Pre-warming started for ${gameId} (${ageGroup})`);
  
  try {
    // 1. Načti z DB (okamžitě)
    if (useDatabase && questionDatabase) {
      try {
        session.dbCache = questionDatabase.getQuestionsWithRotation(
          mode, null, difficulty, 8, []
        );
        console.log(`   📦 DB cache: ${session.dbCache.length} questions`);
      } catch (e) {
        console.warn(`   ⚠️ DB load failed: ${e.message}`);
      }
    }
    
    // 2. Generuj LLM otázky
    const questions = await generateBatchFromLLM(mode, difficulty, session);
    
    if (questions.length === 0) {
      console.warn(`   ⚠️ LLM returned 0 questions, marking as failed`);
      session.llmFailed = true;
    }
    
    // Filtruj proti použitým
    const filtered = questions.filter(q => {
      const answer = q.options[q.correct];
      return answer && !session.isAnswerUsed(answer);
    }).map(q => ({
      ...q,
      _fromLLM: true,
      _fromDb: false
    }));
    
    session.llmCache = filtered;
    
    // Aktualizovat status
    const status = preWarmingStatus.get(gameId);
    if (status) {
      status.generated = filtered.length;
      status.inProgress = false;
    }
    
    console.log(`✅ Pre-warming complete for ${gameId}: ${filtered.length} LLM questions ready`);
    
  } catch (error) {
    console.error(`❌ Pre-warming failed for ${gameId}: ${error.message}`);
    session.llmFailed = true;
    
    const status = preWarmingStatus.get(gameId);
    if (status) {
      status.error = error.message;
      status.inProgress = false;
    }
  }
}

export function getPreWarmStatus(gameId) {
  const status = preWarmingStatus.get(gameId);
  if (status) return status;
  
  // Pokud nemáme status, zkus získat z session
  const session = gameSessions.get(gameId);
  if (session) {
    return {
      generated: session.llmCache.length,
      target: BATCH_SIZE,
      minReady: MIN_READY,
      inProgress: session.llmGenerating
    };
  }
  
  return { generated: 0, target: BATCH_SIZE, minReady: MIN_READY, inProgress: false };
}

// === 🎯 HLAVNÍ FUNKCE ===

export async function generateQuestion(gameId, ageGroup = 'adult') {
  const config = AGE_GROUP_CONFIG[ageGroup] || AGE_GROUP_CONFIG.adult;
  const mode = config.mode;
  const difficulty = config.difficulty;
  
  const session = getGameSession(gameId);
  session.currentRound++;
  session.settings = { mode, difficulty };
  
  const preferredSource = session.getSourceForRound();
  
  console.log(`\n🎯 Game ${gameId} - Round ${session.currentRound} (prefer: ${preferredSource.toUpperCase()})`);
  
  let question = null;
  
  // 🆕 LOGIKA STŘÍDÁNÍ
  if (preferredSource === 'llm') {
    // Preferujeme LLM
    question = getQuestionFromLLMCache(session);
    
    if (!question && !session.llmFailed) {
      // LLM cache prázdná, ale LLM funguje - zkus DB jako fallback
      console.log(`   ⚠️ LLM cache empty, trying DB fallback`);
      question = getQuestionFromDBCache(session, mode, difficulty);
    } else if (!question && session.llmFailed) {
      // LLM selhalo - použij DB
      console.log(`   ⚠️ LLM failed, using DB only`);
      question = getQuestionFromDBCache(session, mode, difficulty);
    }
  } else {
    // Preferujeme DB
    question = getQuestionFromDBCache(session, mode, difficulty);
    
    if (!question) {
      // DB cache prázdná - zkus LLM
      console.log(`   ⚠️ DB cache empty, trying LLM`);
      question = getQuestionFromLLMCache(session);
    }
  }
  
  // Pokud stále nemáme otázku, zkus cokoliv
  if (!question) {
    question = getQuestionFromLLMCache(session) || getQuestionFromDBCache(session, mode, difficulty);
  }
  
  // Spusť background generování pokud je potřeba
  if (session.llmCache.length < 3 && !session.llmGenerating && !session.llmFailed) {
    startBackgroundGeneration(session, mode, difficulty);
  }
  
  // Doplň DB cache pokud je potřeba
  if (session.dbCache.length < 3) {
    refillDbCache(session, mode, difficulty);
  }
  
  // Pokud stále nemáme otázku - synchronní generování
  if (!question) {
    console.warn(`   ⚠️ All caches empty, sync generation...`);
    
    const batch = await generateBatchFromLLM(mode, difficulty, session);
    if (batch.length > 0) {
      session.llmCache.push(...batch.slice(1).map(q => ({ ...q, _fromLLM: true, _fromDb: false })));
      question = batch[0];
      if (question.options && question.options[question.correct]) {
        session.addUsedAnswer(question.options[question.correct]);
      }
      question._fromLLM = true;
      question._fromDb = false;
    }
  }
  
  // Totální selhání
  if (!question) {
    console.error(`   ❌ Failed to get question for round ${session.currentRound}`);
    return {
      question: "Nepodařilo se načíst otázku. Zkuste to znovu.",
      options: ["OK", "Zkusit znovu", "Pokračovat"],
      correct: 0,
      _error: true,
      _fromLLM: false,
      _fromDb: false
    };
  }
  
  return question;
}

function getQuestionFromLLMCache(session) {
  for (let i = 0; i < session.llmCache.length; i++) {
    const q = session.llmCache[i];
    if (!q.options || !q.options[q.correct]) continue;
    
    const answer = q.options[q.correct].toLowerCase().trim();
    
    if (!session.isAnswerUsed(answer)) {
      session.llmCache.splice(i, 1);
      session.addUsedAnswer(answer);
      console.log(`   📤 LLM question (${session.llmCache.length} remaining)`);
      return { ...q, _fromLLM: true, _fromDb: false };
    }
  }
  return null;
}

function getQuestionFromDBCache(session, mode, difficulty) {
  // Nejdřív zkus existující cache
  for (let i = 0; i < session.dbCache.length; i++) {
    const q = session.dbCache[i];
    if (!q.options || !q.options[q.correct]) continue;
    
    const answer = q.options[q.correct].toLowerCase().trim();
    
    if (!session.isAnswerUsed(answer)) {
      session.dbCache.splice(i, 1);
      session.addUsedAnswer(answer);
      console.log(`   📤 DB question (${session.dbCache.length} remaining)`);
      return { ...q, _fromLLM: false, _fromDb: true };
    }
  }
  
  // Cache prázdná - načti nové
  if (useDatabase && questionDatabase) {
    try {
      const excludeAnswers = Array.from(session.usedAnswers);
      const newQuestions = questionDatabase.getQuestionsWithRotation(
        mode, null, difficulty, 5, excludeAnswers
      );
      
      if (newQuestions && newQuestions.length > 0) {
        session.dbCache.push(...newQuestions.slice(1));
        const q = newQuestions[0];
        if (q.options && q.options[q.correct]) {
          session.addUsedAnswer(q.options[q.correct]);
        }
        console.log(`   📤 Fresh DB question (loaded ${newQuestions.length})`);
        return { ...q, _fromLLM: false, _fromDb: true };
      }
    } catch (e) {
      console.warn(`   ⚠️ DB fetch failed: ${e.message}`);
    }
  }
  
  return null;
}

function startBackgroundGeneration(session, mode, difficulty) {
  if (session.llmGenerating) return;
  
  session.llmGenerating = true;
  
  session.llmGenerationPromise = (async () => {
    try {
      console.log(`   🔄 Background LLM generation...`);
      
      const questions = await generateBatchFromLLM(mode, difficulty, session);
      
      if (questions.length === 0) {
        console.warn(`   ⚠️ Background generation returned 0 questions`);
        // Neoznačuj jako failed - může být dočasný problém
      } else {
        const filtered = questions.filter(q => {
          const answer = q.options[q.correct];
          return answer && !session.isAnswerUsed(answer);
        }).map(q => ({
          ...q,
          _fromLLM: true,
          _fromDb: false
        }));
        
        session.llmCache.push(...filtered);
        session.llmFailed = false; // LLM funguje
        console.log(`   ✅ Background batch: ${filtered.length} questions added`);
      }
      
    } catch (error) {
      console.error(`   ❌ Background generation failed: ${error.message}`);
    } finally {
      session.llmGenerating = false;
      session.llmGenerationPromise = null;
    }
  })();
}

function refillDbCache(session, mode, difficulty) {
  if (!useDatabase || !questionDatabase) return;
  
  try {
    const excludeAnswers = Array.from(session.usedAnswers);
    const newQuestions = questionDatabase.getQuestionsWithRotation(
      mode, null, difficulty, 5, excludeAnswers
    );
    
    if (newQuestions) {
      for (const q of newQuestions) {
        if (!q.options || !q.options[q.correct]) continue;
        const answer = q.options[q.correct].toLowerCase().trim();
        if (!session.isAnswerUsed(answer)) {
          session.dbCache.push({ ...q, _fromLLM: false, _fromDb: true });
        }
      }
    }
    
    console.log(`   🔄 DB cache refilled: ${session.dbCache.length} questions`);
  } catch (error) {
    console.warn(`   ⚠️ DB refill failed: ${error.message}`);
  }
}

// === UTILITY EXPORTS ===

export function clearQuestionCache() {
  console.log(`🧹 Clearing all caches`);
}

export function isDatabaseConnected() {
  return useDatabase && questionDatabase !== null;
}

export function getDatabaseQuestionCount(mode = null) {
  if (!useDatabase || !questionDatabase) return 0;
  try {
    return questionDatabase.getQuestionCount(mode);
  } catch (error) {
    return 0;
  }
}

export function getSystemStats() {
  return {
    sessions: getSessionsStats(),
    validation: getValidationStats(),
    database: {
      connected: isDatabaseConnected(),
      questionCount: getDatabaseQuestionCount()
    }
  };
}

// Legacy exports
export const ADULT_CATEGORIES = {};
export const JUNIOR_CATEGORIES = {};
export const JUNIOR_DIFFICULTY_CONFIG = {
  easy: { name: "🐣 Předškoláci", age: "4-6 let", description: "Pro nejmenší" },
  medium: { name: "📚 Malí školáci", age: "7-10 let", description: "Pro 1.-4. třídu" },
  hard: { name: "🎒 Větší školáci", age: "11-14 let", description: "Pro 5.-9. třídu" }
};
export function getCategories() { return []; }
export function getJuniorDifficultyOptions() {
  return Object.entries(JUNIOR_DIFFICULTY_CONFIG).map(([key, config]) => ({ key, ...config }));
}
