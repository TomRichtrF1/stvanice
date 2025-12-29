/**
 * 🗄️ QUESTION DATABASE - SQLite persistentní úložiště
 * * VERZE: 2.1 - FIX LOGIKA POČÍTADLA & READ/WRITE SEPARATION
 * * Změny:
 * - getQuestionsWithRotation: Pouze ČTE, nezvyšuje počítadlo
 * - markQuestionAsUsed: Nová funkce pro zvýšení počítadla při skutečném použití
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
  maxQuestionsPerSession: 500,
  sessionTimeout: 180 * 60 * 1000,
  usageCountLimit: 3,  // Max použití otázky před "zamčením"
};

const sessionHistories = new Map();
let db = null;

/**
 * Inicializace databáze
 */
export function initDatabase() {
  if (db) return db;
  
  try {
    db = new Database(DB_PATH);
    
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 30000');
    db.pragma('synchronous = NORMAL');
    
    db.exec(`
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
      
      CREATE INDEX IF NOT EXISTS idx_questions_mode ON questions(mode);
      CREATE INDEX IF NOT EXISTS idx_questions_hash ON questions(hash);
      CREATE INDEX IF NOT EXISTS idx_questions_use_count ON questions(use_count);
    `);
    
    console.log(`🗄️ Databáze inicializována: ${DB_PATH}`);
    return db;
  } catch (error) {
    console.error(`❌ Chyba při inicializaci databáze: ${error.message}`);
    throw error;
  }
}

function generateQuestionHash(question, options) {
  const normalized = `${question.toLowerCase().trim()}|${options.map(o => o.toLowerCase().trim()).sort().join('|')}`;
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

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
    return false;
  }
}

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
  
  try {
    const savedCount = insertMany(questions);
    console.log(`💾 Uloženo ${savedCount} nových otázek do DB`);
    return savedCount;
  } catch (error) {
    console.error(`❌ Chyba ukládání:`, error.message);
    return 0;
  }
}

function formatQuestion(question) {
  return {
    question: question.question,
    options: [question.option_a, question.option_b, question.option_c],
    correct: question.correct,
    _id: question.id,
    _fromDb: true,
    _fromLLM: false
  };
}

/**
 * 🆕 UPRAVENÁ FUNKCE: Pouze ZÍSKÁ otázky, ale NEINKREMENTUJE use_count
 * Inkrementaci budeme volat zvlášť, až když otázku skutečně použijeme.
 */
export function getQuestionsWithRotation(mode = 'adult', category = null, difficulty = null, count = 5, excludeAnswers = []) {
  if (!db) initDatabase();
  
  // Kontrola a případný reset, pokud je vše vyčerpáno
  checkAndResetUsageCount(mode, difficulty);
  
  let whereClause = 'WHERE mode = ? AND use_count < ?';
  const params = [mode, CONFIG.usageCountLimit];
  
  if (difficulty) {
    whereClause += ' AND difficulty = ?';
    params.push(difficulty);
  }
  
  // Vyloučení odpovědí (ochrana proti duplicitám v rámci session)
  if (excludeAnswers.length > 0) {
    whereClause += ` AND NOT (
      (correct = 0 AND LOWER(option_a) IN (${excludeAnswers.map(() => '?').join(',')})) OR
      (correct = 1 AND LOWER(option_b) IN (${excludeAnswers.map(() => '?').join(',')})) OR
      (correct = 2 AND LOWER(option_c) IN (${excludeAnswers.map(() => '?').join(',')}))
    )`;
    params.push(...excludeAnswers, ...excludeAnswers, ...excludeAnswers);
  }
  
  const query = `
    SELECT * FROM questions 
    ${whereClause}
    ORDER BY use_count ASC, RANDOM()
    LIMIT ?
  `;
  params.push(count);
  
  try {
    const rows = db.prepare(query).all(...params);
    console.log(`📦 DB Fetch: Načteno ${rows.length} kandidátů (bez inkrementace)`);
    return rows.map(formatQuestion);
  } catch (error) {
    console.error(`❌ getQuestionsWithRotation error:`, error.message);
    return [];
  }
}

/**
 * 🆕 NOVÁ FUNKCE: Potvrdí použití otázky (Zvedne counter + timestamp)
 * Volat z generatoru ve chvíli, kdy otázka jde na frontend
 */
export function markQuestionAsUsed(id) {
  if (!db) initDatabase();
  try {
    const info = db.prepare(`
      UPDATE questions 
      SET use_count = use_count + 1, last_used_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(id);
    console.log(`📈 DB: Otázka ID ${id} označena jako použitá (use_count +1)`);
    return info.changes > 0;
  } catch (error) {
    console.error(`❌ markQuestionAsUsed error:`, error.message);
    return false;
  }
}

function checkAndResetUsageCount(mode, difficulty = null) {
  if (!db) return;
  
  let whereClause = 'WHERE mode = ? AND use_count < ?';
  const params = [mode, CONFIG.usageCountLimit];
  
  if (difficulty) {
    whereClause += ' AND difficulty = ?';
    params.push(difficulty);
  }
  
  const availableCount = db.prepare(`SELECT COUNT(*) as count FROM questions ${whereClause}`).get(...params).count;
  
  if (availableCount === 0) {
    console.log(`🔄 RESET use_count: VŠECHNY otázky vyčerpány pro mode=${mode}`);
    let resetWhere = 'WHERE mode = ?';
    const resetParams = [mode];
    if (difficulty) {
      resetWhere += ' AND difficulty = ?';
      resetParams.push(difficulty);
    }
    db.prepare(`UPDATE questions SET use_count = 0 ${resetWhere}`).run(...resetParams);
  }
}

// === UTILS pro statistiky ===
export function getQuestionCount(mode = null) {
  if (!db) initDatabase();
  let query = 'SELECT COUNT(*) as count FROM questions';
  const params = [];
  if (mode) {
    query += ' WHERE mode = ?';
    params.push(mode);
  }
  return db.prepare(query).get(...params).count;
}

export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

export { CONFIG as DB_CONFIG };