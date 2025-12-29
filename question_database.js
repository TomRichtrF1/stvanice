/**
 * 🗄️ QUESTION DATABASE - SQLite persistentní úložiště
 * 
 * VERZE: 2.0 - OPRAVENÁ LOGIKA POČÍTADLA
 * 
 * Funkce:
 * - Ukládání validovaných otázek
 * - Rotace otázek podle use_count (nejméně použité mají přednost)
 * - Reset počítadel POUZE když VŠECHNY dosáhnou limitu
 * - Deduplikace per-session
 * 
 * Kapacita: 10 000+ otázek bez problémů
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cesta k databázi
const DB_PATH = path.join(__dirname, 'questions.db');

// Konfigurace
const CONFIG = {
  maxQuestionsPerSession: 500,  // Max otázek které si pamatujeme per session
  sessionTimeout: 180 * 60 * 1000,  // 180 minut - pak session expiruje (ZMĚNĚNO z 24h)
  usageCountLimit: 3,  // Max použití otázky před "zamčením"
};

// === 🎮 SESSION MANAGEMENT ===
// Per-session historie - každý hráč má vlastní seznam viděných otázek
const sessionHistories = new Map();  // sessionId -> Set<questionId>

let db = null;

/**
 * Inicializace databáze
 */
export function initDatabase() {
  if (db) return db;
  
  try {
    db = new Database(DB_PATH);
    
    // 🔧 WAL mód pro paralelní přístup (více procesů může číst/zapisovat)
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 30000');  // 30 sekund čekání při zamčení
    db.pragma('synchronous = NORMAL');  // Rychlejší zápisy, stále bezpečné
    
    // Vytvoření tabulek
    db.exec(`
      -- Hlavní tabulka otázek
      CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question TEXT NOT NULL,
        option_a TEXT NOT NULL,
        option_b TEXT NOT NULL,
        option_c TEXT NOT NULL,
        correct INTEGER NOT NULL CHECK(correct >= 0 AND correct <= 2),
        category TEXT,
        aspect TEXT,
        mode TEXT DEFAULT 'adult',
        difficulty TEXT DEFAULT 'normal',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_used_at DATETIME,
        use_count INTEGER DEFAULT 0,
        hash TEXT UNIQUE
      );
      
      -- Index pro rychlé vyhledávání
      CREATE INDEX IF NOT EXISTS idx_questions_mode ON questions(mode);
      CREATE INDEX IF NOT EXISTS idx_questions_category ON questions(category);
      CREATE INDEX IF NOT EXISTS idx_questions_hash ON questions(hash);
      CREATE INDEX IF NOT EXISTS idx_questions_last_used ON questions(last_used_at);
      CREATE INDEX IF NOT EXISTS idx_questions_created ON questions(created_at);
      CREATE INDEX IF NOT EXISTS idx_questions_use_count ON questions(use_count);
      CREATE INDEX IF NOT EXISTS idx_questions_difficulty ON questions(difficulty);
      
      -- Tabulka pro statistiky
      CREATE TABLE IF NOT EXISTS stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stat_name TEXT UNIQUE,
        stat_value INTEGER DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    console.log(`🗄️ Databáze inicializována: ${DB_PATH}`);
    
    // Vypsat statistiky
    const count = getQuestionCount();
    console.log(`   📊 Počet otázek v DB: ${count}`);
    
    return db;
  } catch (error) {
    console.error(`❌ Chyba při inicializaci databáze: ${error.message}`);
    throw error;
  }
}

/**
 * Generuje hash pro deduplikaci otázek
 */
function generateQuestionHash(question, options) {
  const normalized = `${question.toLowerCase().trim()}|${options.map(o => o.toLowerCase().trim()).sort().join('|')}`;
  // Jednoduchý hash
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

/**
 * Uloží validovanou otázku do databáze
 * @returns {boolean} true pokud uloženo, false pokud duplicita
 */
export function saveQuestion(questionData, mode = 'adult', category = null, aspect = null) {
  if (!db) initDatabase();
  
  const { question, options, correct } = questionData;
  const hash = generateQuestionHash(question, options);
  
  try {
    const stmt = db.prepare(`
      INSERT INTO questions (question, option_a, option_b, option_c, correct, category, aspect, mode, hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(question, options[0], options[1], options[2], correct, category, aspect, mode, hash);
    return true;
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      // Duplicitní otázka - to je OK
      return false;
    }
    console.error(`❌ Chyba při ukládání otázky: ${error.message}`);
    return false;
  }
}

/**
 * Uloží více otázek najednou (transakce) s retry logikou pro paralelní přístup
 * @param {Array} questions - Pole otázek k uložení
 * @param {string} mode - 'adult' nebo 'kid'
 * @param {string} difficulty - 'easy', 'medium', 'hard', 'normal'
 * @returns {number} počet nově uložených otázek
 */
export function saveQuestions(questions, mode = 'adult', difficulty = 'normal') {
  if (!db) initDatabase();
  
  const insert = db.prepare(`
    INSERT OR IGNORE INTO questions (question, option_a, option_b, option_c, correct, category, aspect, mode, difficulty, hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const insertMany = db.transaction((items) => {
    let saved = 0;
    for (const item of items) {
      const { question, options, correct, category, aspect } = item;
      const hash = generateQuestionHash(question, options);
      
      const result = insert.run(question, options[0], options[1], options[2], correct, category || null, aspect || null, mode, difficulty, hash);
      if (result.changes > 0) saved++;
    }
    return saved;
  });
  
  // 🔄 Retry logika pro paralelní přístup
  const MAX_RETRIES = 5;
  let savedCount = 0;
  let lastError = null;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      savedCount = insertMany(questions);
      console.log(`💾 Uloženo ${savedCount}/${questions.length} nových otázek do DB (${mode}/${difficulty})`);
      return savedCount;
    } catch (error) {
      lastError = error;
      if (error.code === 'SQLITE_BUSY' || error.message.includes('database is locked')) {
        const waitTime = attempt * 1000 + Math.random() * 500;
        console.log(`⏳ DB zamčená, čekám ${Math.round(waitTime)}ms... (pokus ${attempt}/${MAX_RETRIES})`);
        // Synchronní čekání (pro better-sqlite3)
        const start = Date.now();
        while (Date.now() - start < waitTime) {
          // busy wait
        }
      } else {
        throw error;
      }
    }
  }
  
  console.error(`❌ Nepodařilo se uložit po ${MAX_RETRIES} pokusech:`, lastError?.message);
  return savedCount;
}

/**
 * Získá nebo vytvoří session historii
 */
function getSessionHistory(sessionId) {
  if (!sessionId) {
    sessionId = 'anonymous';
  }
  
  if (!sessionHistories.has(sessionId)) {
    sessionHistories.set(sessionId, {
      seenQuestions: new Set(),
      createdAt: Date.now(),
      lastActivity: Date.now()
    });
  }
  
  // Aktualizovat poslední aktivitu
  const session = sessionHistories.get(sessionId);
  session.lastActivity = Date.now();
  
  return session;
}

/**
 * Vyčistí staré sessions (starší než 180 minut)
 */
function cleanupOldSessions() {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [sessionId, session] of sessionHistories.entries()) {
    if (now - session.lastActivity > CONFIG.sessionTimeout) {
      sessionHistories.delete(sessionId);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`🧹 Vyčištěno ${cleaned} starých sessions`);
  }
}

/**
 * Formátuje otázku z DB do správného formátu
 */
function formatQuestion(question) {
  return {
    question: question.question,
    options: [question.option_a, question.option_b, question.option_c],
    correct: question.correct,
    _id: question.id,
    _category: question.category,
    _fromDb: true,
    _fromLLM: false
  };
}

/**
 * Získá náhodnou otázku z databáze (LEGACY - zachováno pro kompatibilitu)
 */
export function getRandomQuestion(mode = 'adult', category = null, sessionId = null, difficulty = null) {
  if (!db) initDatabase();
  
  // Občas vyčistit staré sessions
  if (Math.random() < 0.01) {
    cleanupOldSessions();
  }
  
  // Získat historii pro tuto session
  const session = getSessionHistory(sessionId);
  const seenIds = Array.from(session.seenQuestions);
  
  // Vytvořit WHERE podmínku
  let whereClause = 'WHERE mode = ?';
  const params = [mode];
  
  if (category) {
    whereClause += ' AND category = ?';
    params.push(category);
  }
  
  if (difficulty) {
    whereClause += ' AND difficulty = ?';
    params.push(difficulty);
  }
  
  // Vyloučit otázky které tento hráč už viděl
  if (seenIds.length > 0) {
    whereClause += ` AND id NOT IN (${seenIds.join(',')})`;
  }
  
  // Získat náhodnou otázku - PRIORITA: nejnižší use_count
  const question = db.prepare(`
    SELECT * FROM questions 
    ${whereClause}
    ORDER BY use_count ASC, RANDOM() 
    LIMIT 1
  `).get(...params);
  
  if (!question) {
    // Tento hráč viděl všechny otázky v DB
    console.log(`🔄 Session ${sessionId}: Viděl všechny otázky, resetuji historii...`);
    session.seenQuestions.clear();
    
    // Zkusit znovu
    const retryQuestion = db.prepare(`
      SELECT * FROM questions 
      WHERE mode = ? ${difficulty ? 'AND difficulty = ?' : ''}
      ORDER BY use_count ASC, RANDOM() 
      LIMIT 1
    `).get(mode, ...(difficulty ? [difficulty] : []));
    
    if (!retryQuestion) {
      console.warn(`⚠️ Žádné otázky v DB pro mode=${mode}, difficulty=${difficulty}`);
      return null;
    }
    
    session.seenQuestions.add(retryQuestion.id);
    
    // Aktualizovat use_count
    try {
      db.prepare(`
        UPDATE questions 
        SET last_used_at = CURRENT_TIMESTAMP, use_count = use_count + 1 
        WHERE id = ?
      `).run(retryQuestion.id);
    } catch (e) {}
    
    return formatQuestion(retryQuestion);
  }
  
  // Zaznamenat do session historie
  session.seenQuestions.add(question.id);
  
  // Omezit velikost session historie
  if (session.seenQuestions.size > CONFIG.maxQuestionsPerSession) {
    const iterator = session.seenQuestions.values();
    session.seenQuestions.delete(iterator.next().value);
  }
  
  // Aktualizovat statistiky otázky
  try {
    db.prepare(`
      UPDATE questions 
      SET last_used_at = CURRENT_TIMESTAMP, use_count = use_count + 1 
      WHERE id = ?
    `).run(question.id);
  } catch (e) {}
  
  return formatQuestion(question);
}

/**
 * 🆕 HYBRIDNÍ ARCHITEKTURA: Získá N otázek s rotací a vyloučením odpovědí
 * 
 * LOGIKA (OPRAVENÁ):
 * 1. Vybírá otázky s nejnižším use_count (ty co byly použity nejméně)
 * 2. Mezi otázkami se stejným use_count vybírá náhodně
 * 3. Vylučuje otázky jejichž správná odpověď je v excludeAnswers
 * 4. Pokud VŠECHNY mají use_count >= limit → RESET VŠECH na 0
 * 5. Inkrementuje use_count pro vybrané otázky
 * 
 * @param {string} mode - 'adult' nebo 'kid'
 * @param {string|null} category - null = všechny kategorie (IGNORUJE SE - odstraněno)
 * @param {string|null} difficulty - 'easy', 'medium', 'hard', 'normal'
 * @param {number} count - kolik otázek vrátit
 * @param {Array<string>} excludeAnswers - odpovědi k vyloučení (lowercase)
 * @returns {Array} pole otázek
 */
export function getQuestionsWithRotation(mode = 'adult', category = null, difficulty = null, count = 5, excludeAnswers = []) {
  if (!db) initDatabase();
  
  // Nejdříve zkontroluj jestli nepotřebujeme reset
  checkAndResetUsageCount(mode, difficulty);
  
  // Sestavení WHERE klauzule (BEZ kategorie - ta je odstraněna)
  let whereClause = 'WHERE mode = ? AND use_count < ?';
  const params = [mode, CONFIG.usageCountLimit];
  
  if (difficulty) {
    whereClause += ' AND difficulty = ?';
    params.push(difficulty);
  }
  
  // Vyloučení odpovědí (lowercase porovnání)
  if (excludeAnswers.length > 0) {
    whereClause += ` AND NOT (
      (correct = 0 AND LOWER(option_a) IN (${excludeAnswers.map(() => '?').join(',')})) OR
      (correct = 1 AND LOWER(option_b) IN (${excludeAnswers.map(() => '?').join(',')})) OR
      (correct = 2 AND LOWER(option_c) IN (${excludeAnswers.map(() => '?').join(',')}))
    )`;
    params.push(...excludeAnswers, ...excludeAnswers, ...excludeAnswers);
  }
  
  // Query: priorita podle use_count (nejméně použité první), pak náhodně
  const query = `
    SELECT * FROM questions 
    ${whereClause}
    ORDER BY use_count ASC, RANDOM()
    LIMIT ?
  `;
  params.push(count);
  
  try {
    const rows = db.prepare(query).all(...params);
    
    if (rows.length === 0) {
      console.log(`⚠️ Žádné otázky v DB pro mode=${mode}, difficulty=${difficulty} (po filtraci)`);
      return [];
    }
    
    // Inkrementuj use_count a last_used_at pro vybrané otázky
    const updateStmt = db.prepare(`
      UPDATE questions 
      SET use_count = use_count + 1, last_used_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `);
    
    const updateMany = db.transaction((ids) => {
      for (const id of ids) {
        updateStmt.run(id);
      }
    });
    
    updateMany(rows.map(r => r.id));
    
    console.log(`📦 DB rotace: Vybráno ${rows.length} otázek (use_count priorita)`);
    
    return rows.map(formatQuestion);
    
  } catch (error) {
    console.error(`❌ getQuestionsWithRotation error:`, error.message);
    return [];
  }
}

/**
 * 🆕 OPRAVENÁ LOGIKA: Zkontroluje a případně resetuje use_count
 * 
 * Reset nastane POUZE když VŠECHNY otázky daného typu mají use_count >= limit
 * (Tedy když není žádná dostupná otázka)
 */
function checkAndResetUsageCount(mode, difficulty = null) {
  if (!db) return;
  
  // Počet otázek pod limitem (dostupných)
  let whereClause = 'WHERE mode = ? AND use_count < ?';
  const params = [mode, CONFIG.usageCountLimit];
  
  if (difficulty) {
    whereClause += ' AND difficulty = ?';
    params.push(difficulty);
  }
  
  const availableCount = db.prepare(`
    SELECT COUNT(*) as count FROM questions ${whereClause}
  `).get(...params).count;
  
  // 🔧 OPRAVENÁ LOGIKA: Reset POUZE když VŠECHNY otázky dosáhly limitu
  // (tj. když není žádná dostupná otázka)
  if (availableCount === 0) {
    console.log(`🔄 RESET use_count: VŠECHNY otázky dosáhly ${CONFIG.usageCountLimit} použití`);
    console.log(`   Mode: ${mode}, Difficulty: ${difficulty || 'all'}`);
    
    let resetWhere = 'WHERE mode = ?';
    const resetParams = [mode];
    
    if (difficulty) {
      resetWhere += ' AND difficulty = ?';
      resetParams.push(difficulty);
    }
    
    const result = db.prepare(`UPDATE questions SET use_count = 0 ${resetWhere}`).run(...resetParams);
    
    console.log(`   ✅ Resetováno ${result.changes} otázek - jedeme znovu od začátku!`);
  }
}

/**
 * Získá statistiky rotace pro daný mode/difficulty
 */
export function getRotationStats(mode = 'adult', difficulty = null) {
  if (!db) initDatabase();
  
  let whereClause = 'WHERE mode = ?';
  const params = [mode];
  
  if (difficulty) {
    whereClause += ' AND difficulty = ?';
    params.push(difficulty);
  }
  
  const total = db.prepare(`SELECT COUNT(*) as count FROM questions ${whereClause}`).get(...params).count;
  
  const byUsageCount = db.prepare(`
    SELECT use_count, COUNT(*) as count 
    FROM questions ${whereClause}
    GROUP BY use_count 
    ORDER BY use_count ASC
  `).all(...params);
  
  const available = db.prepare(`
    SELECT COUNT(*) as count FROM questions ${whereClause} AND use_count < ?
  `).get(...params, CONFIG.usageCountLimit).count;
  
  return {
    mode,
    difficulty,
    total,
    available,
    locked: total - available,
    usageCountLimit: CONFIG.usageCountLimit,
    distribution: byUsageCount
  };
}

/**
 * Manuální reset use_count (pro debug/admin)
 */
export function resetAllUsageCount(mode = null, difficulty = null) {
  if (!db) initDatabase();
  
  let whereClause = '';
  const params = [];
  
  if (mode) {
    whereClause = 'WHERE mode = ?';
    params.push(mode);
    
    if (difficulty) {
      whereClause += ' AND difficulty = ?';
      params.push(difficulty);
    }
  }
  
  const result = db.prepare(`UPDATE questions SET use_count = 0 ${whereClause}`).run(...params);
  console.log(`🔄 Reset use_count: ${result.changes} otázek`);
  return result.changes;
}

/**
 * Získá více náhodných otázek najednou (LEGACY)
 */
export function getRandomQuestions(count, mode = 'adult', category = null, sessionId = null) {
  const questions = [];
  
  for (let i = 0; i < count; i++) {
    const q = getRandomQuestion(mode, category, sessionId);
    if (q) questions.push(q);
  }
  
  return questions;
}

/**
 * Počet otázek v databázi
 */
export function getQuestionCount(mode = null, difficulty = null) {
  if (!db) initDatabase();
  
  let query = 'SELECT COUNT(*) as count FROM questions';
  const params = [];
  const conditions = [];
  
  if (mode) {
    conditions.push('mode = ?');
    params.push(mode);
  }
  
  if (difficulty) {
    conditions.push('difficulty = ?');
    params.push(difficulty);
  }
  
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  
  return db.prepare(query).get(...params).count;
}

/**
 * Statistiky databáze
 */
export function getDatabaseStats() {
  if (!db) initDatabase();
  
  const totalQuestions = db.prepare('SELECT COUNT(*) as count FROM questions').get().count;
  const adultQuestions = db.prepare("SELECT COUNT(*) as count FROM questions WHERE mode = 'adult'").get().count;
  const kidQuestions = db.prepare("SELECT COUNT(*) as count FROM questions WHERE mode = 'kid'").get().count;
  
  // Statistiky pro jednotlivé obtížnosti
  const byDifficulty = db.prepare(`
    SELECT mode, difficulty, COUNT(*) as count 
    FROM questions 
    GROUP BY mode, difficulty 
    ORDER BY mode, difficulty
  `).all();
  
  const oldestQuestion = db.prepare('SELECT MIN(created_at) as date FROM questions').get().date;
  const newestQuestion = db.prepare('SELECT MAX(created_at) as date FROM questions').get().date;
  
  // Session statistiky
  const activeSessions = sessionHistories.size;
  let totalSeenQuestions = 0;
  for (const session of sessionHistories.values()) {
    totalSeenQuestions += session.seenQuestions.size;
  }
  
  return {
    totalQuestions,
    adultQuestions,
    kidQuestions,
    byDifficulty,
    activeSessions,
    totalSeenQuestions,
    sessionTimeout: CONFIG.sessionTimeout / 60000 + ' minut',
    maxQuestionsPerSession: CONFIG.maxQuestionsPerSession,
    oldestQuestion,
    newestQuestion,
    dbPath: DB_PATH
  };
}

/**
 * Získá statistiky pro konkrétní session
 */
export function getSessionStats(sessionId) {
  const session = sessionHistories.get(sessionId);
  
  if (!session) {
    return {
      exists: false,
      seenCount: 0
    };
  }
  
  return {
    exists: true,
    seenCount: session.seenQuestions.size,
    createdAt: session.createdAt,
    lastActivity: session.lastActivity,
    ageMs: Date.now() - session.createdAt
  };
}

/**
 * Resetuje historii pro konkrétní session
 */
export function clearSessionHistory(sessionId) {
  if (sessionId) {
    const session = sessionHistories.get(sessionId);
    if (session) {
      session.seenQuestions.clear();
      console.log(`🧹 Session ${sessionId}: Historie vyčištěna`);
    }
  }
}

/**
 * Vyčistí všechny session historie
 */
export function clearAllSessionHistories() {
  sessionHistories.clear();
  console.log('🧹 Všechny session historie vyčištěny');
}

/**
 * Vyčistí historii použití (legacy)
 */
export function clearUsageHistory() {
  clearAllSessionHistories();
}

/**
 * Vyčistí celou databázi (POZOR!)
 */
export function clearAllQuestions() {
  if (!db) initDatabase();
  
  clearAllSessionHistories();
  
  db.prepare('DELETE FROM questions').run();
  console.log('🧹 Všechny otázky a session historie smazány');
}

/**
 * Exportuje otázky do JSON
 */
export function exportToJson(filePath, mode = null) {
  if (!db) initDatabase();
  
  let questions;
  if (mode) {
    questions = db.prepare('SELECT * FROM questions WHERE mode = ?').all(mode);
  } else {
    questions = db.prepare('SELECT * FROM questions').all();
  }
  
  fs.writeFileSync(filePath, JSON.stringify(questions, null, 2));
  console.log(`📤 Exportováno ${questions.length} otázek do ${filePath}`);
}

/**
 * Importuje otázky z JSON
 */
export function importFromJson(filePath, mode = 'adult') {
  if (!db) initDatabase();
  
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  
  const questions = data.map(q => ({
    question: q.question,
    options: [q.option_a || q.options[0], q.option_b || q.options[1], q.option_c || q.options[2]],
    correct: q.correct,
    category: q.category,
    aspect: q.aspect
  }));
  
  return saveQuestions(questions, mode);
}

/**
 * Kontrola zdraví databáze
 */
export function healthCheck() {
  if (!db) initDatabase();
  
  try {
    const count = getQuestionCount();
    const stats = getDatabaseStats();
    
    return {
      healthy: true,
      questionCount: count,
      ...stats
    };
  } catch (error) {
    return {
      healthy: false,
      error: error.message
    };
  }
}

/**
 * Uzavře databázi (pro čisté ukončení)
 */
export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
    console.log('🗄️ Databáze uzavřena');
  }
}

// Export konfigurace
export { CONFIG as DB_CONFIG };
