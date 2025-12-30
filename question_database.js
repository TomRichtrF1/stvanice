/**
 * 🗄️ QUESTION DATABASE - PostgreSQL (Heroku Production Ready)
 * VERZE: 3.2 - Přidán globální tracking odpovědí (3h okno)
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// SSL je vždy zapnuté pokud existuje DATABASE_URL (vzdálená DB)
const sslConfig = process.env.DATABASE_URL 
  ? { rejectUnauthorized: false }
  : false;

console.log(`🔐 SSL konfigurace: ${sslConfig ? 'ZAPNUTO' : 'VYPNUTO'}`);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig
});

const CONFIG = {
  usageCountLimit: 3,          // Max použití otázky před resetem
  answerDedupeHours: 3,        // Okno pro deduplikaci odpovědí (hodiny)
  answerCleanupHours: 24,      // Jak dlouho uchovávat záznamy o odpovědích
};

/**
 * Inicializace tabulek v Postgres
 */
export async function initDatabase() {
  try {
    console.log('🔌 Připojuji se k PostgreSQL...');
    const client = await pool.connect();
    try {
      // Hlavní tabulka otázek
      await client.query(`
        CREATE TABLE IF NOT EXISTS questions (
          id SERIAL PRIMARY KEY,
          question TEXT NOT NULL,
          option_a TEXT NOT NULL,
          option_b TEXT NOT NULL,
          option_c TEXT NOT NULL,
          correct INTEGER NOT NULL CHECK(correct >= 0 AND correct <= 2),
          category TEXT,
          aspect TEXT,
          mode TEXT DEFAULT 'adult',
          difficulty TEXT DEFAULT 'normal',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_used_at TIMESTAMP,
          use_count INTEGER DEFAULT 0,
          hash TEXT UNIQUE
        );
        
        CREATE INDEX IF NOT EXISTS idx_questions_mode ON questions(mode);
        CREATE INDEX IF NOT EXISTS idx_questions_hash ON questions(hash);
        CREATE INDEX IF NOT EXISTS idx_questions_use_count ON questions(use_count);
      `);
      
      // 🆕 Tabulka pro globální tracking použitých odpovědí
      await client.query(`
        CREATE TABLE IF NOT EXISTS used_answers (
          id SERIAL PRIMARY KEY,
          answer_hash TEXT NOT NULL,
          used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE INDEX IF NOT EXISTS idx_used_answers_hash ON used_answers(answer_hash);
        CREATE INDEX IF NOT EXISTS idx_used_answers_time ON used_answers(used_at);
      `);
      
      // 🆕 Tabulka pro vstupenky do divácké místnosti
      await client.query(`
        CREATE TABLE IF NOT EXISTS spectator_tickets (
          id SERIAL PRIMARY KEY,
          code TEXT NOT NULL UNIQUE,
          session_id TEXT NOT NULL,
          email TEXT,
          expires_at TIMESTAMP NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          used_count INTEGER DEFAULT 0
        );
        
        CREATE INDEX IF NOT EXISTS idx_tickets_code ON spectator_tickets(code);
      `);
      
      // Zjisti počet otázek v DB
      const countResult = await client.query('SELECT COUNT(*) FROM questions');
      const questionCount = parseInt(countResult.rows[0].count);
      
      console.log('🗄️ Postgres databáze inicializována.');
      console.log(`📊 Počet otázek v DB: ${questionCount}`);
      
      // 🆕 Automatické čištění starých záznamů při startu
      await cleanupOldAnswers(CONFIG.answerCleanupHours);
      
      return true;
      
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(`❌ Chyba inicializace DB: ${error.message}`);
    return false;
  }
}

/**
 * Generuje jednoduchý hash pro deduplikaci
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return hash.toString(36);
}

/**
 * Generuje unikátní hash pro otázku (pro deduplikaci v DB)
 */
function generateQuestionHash(question, options) {
  const normalized = `${question.toLowerCase().trim()}|${options.map(o => o.toLowerCase().trim()).sort().join('|')}`;
  return simpleHash(normalized);
}

/**
 * 🆕 Zkontroluje, zda odpověď nebyla použita za poslední X hodin
 * @param {string} answer - Text odpovědi
 * @param {number} hoursWindow - Časové okno v hodinách (default: 3)
 * @returns {Promise<boolean>} - true pokud BYLA nedávno použita
 */
export async function isAnswerRecentlyUsed(answer, hoursWindow = CONFIG.answerDedupeHours) {
  try {
    const hash = simpleHash(answer.toLowerCase().trim());
    const res = await pool.query(`
      SELECT COUNT(*) FROM used_answers 
      WHERE answer_hash = $1 
      AND used_at > NOW() - INTERVAL '${hoursWindow} hours'
    `, [hash]);
    
    return parseInt(res.rows[0].count) > 0;
  } catch (e) {
    console.error('isAnswerRecentlyUsed error:', e.message);
    return false;  // Při chybě povolíme použití
  }
}

/**
 * 🆕 Zaznamenání použité odpovědi pro globální deduplikaci
 * @param {string} answer - Text odpovědi
 */
export async function recordUsedAnswer(answer) {
  try {
    const hash = simpleHash(answer.toLowerCase().trim());
    await pool.query(`
      INSERT INTO used_answers (answer_hash) VALUES ($1)
    `, [hash]);
  } catch (e) {
    console.error('recordUsedAnswer error:', e.message);
  }
}

/**
 * 🆕 Čištění starých záznamů odpovědí
 * @param {number} hoursToKeep - Kolik hodin zpětně uchovávat
 */
export async function cleanupOldAnswers(hoursToKeep = CONFIG.answerCleanupHours) {
  try {
    const res = await pool.query(`
      DELETE FROM used_answers 
      WHERE used_at < NOW() - INTERVAL '${hoursToKeep} hours'
    `);
    if (res.rowCount > 0) {
      console.log(`🧹 Vyčištěno ${res.rowCount} starých answer záznamů`);
    }
  } catch (e) {
    console.error('cleanupOldAnswers error:', e.message);
  }
}

/**
 * Ukládá nové otázky (deduplikuje pomocí hash)
 */
export async function saveQuestions(questions, mode = 'adult', difficulty = 'normal') {
  const client = await pool.connect();
  let savedCount = 0;

  try {
    await client.query('BEGIN');

    for (const q of questions) {
      const hash = generateQuestionHash(q.question, q.options);
      
      const query = `
        INSERT INTO questions (question, option_a, option_b, option_c, correct, category, aspect, mode, difficulty, hash)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (hash) DO NOTHING
      `;
      
      const values = [
        q.question, q.options[0], q.options[1], q.options[2], q.correct,
        q.category || null, q.aspect || null, mode, difficulty, hash
      ];

      const res = await client.query(query, values);
      savedCount += res.rowCount;
    }

    await client.query('COMMIT');
    
    if (savedCount > 0) {
      console.log(`💾 Uloženo ${savedCount} nových otázek do Postgres DB`);
    }
    return savedCount;

  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`❌ Chyba ukládání do DB:`, error.message);
    return 0;
  } finally {
    client.release();
  }
}

/**
 * Formátuje řádek z DB na objekt otázky
 */
function formatQuestion(row) {
  return {
    question: row.question,
    options: [row.option_a, row.option_b, row.option_c],
    correct: row.correct,
    _id: row.id,
    _fromDb: true,
    _fromLLM: false
  };
}

/**
 * Načítá otázky s rotací (counter systém)
 * - Preferuje otázky s nižším use_count
 * - Při vyčerpání resetuje countery
 */
export async function getQuestionsWithRotation(mode = 'adult', category = null, difficulty = null, count = 5, excludeAnswers = []) {
  const client = await pool.connect();
  
  try {
    let whereClause = 'WHERE mode = $1 AND use_count < $2';
    const params = [mode, CONFIG.usageCountLimit];
    let paramIndex = 3;

    if (difficulty) {
      whereClause += ` AND difficulty = $${paramIndex}`;
      params.push(difficulty);
      paramIndex++;
    }

    if (category) {
      whereClause += ` AND category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    const query = `
      SELECT * FROM questions 
      ${whereClause}
      ORDER BY use_count ASC, RANDOM()
      LIMIT $${paramIndex}
    `;
    params.push(count);

    const res = await client.query(query, params);
    
    // Fallback: Pokud nemáme dost otázek, resetujeme počítadla
    if (res.rows.length === 0) {
      console.log(`🔄 DB prázdná pro tento filtr, resetuji use_count...`);
      await client.query(`UPDATE questions SET use_count = 0 WHERE mode = $1`, [mode]);
      
      // Zkusíme znovu
      const retryRes = await client.query(query, params);
      return retryRes.rows.map(formatQuestion);
    }

    return res.rows.map(formatQuestion);

  } catch (error) {
    console.error(`❌ getQuestions error:`, error.message);
    return [];
  } finally {
    client.release();
  }
}

/**
 * Označí otázku jako použitou (inkrementuje counter)
 */
export async function markQuestionAsUsed(id) {
  try {
    const res = await pool.query(`
      UPDATE questions 
      SET use_count = use_count + 1, last_used_at = CURRENT_TIMESTAMP 
      WHERE id = $1
    `, [id]);
    return res.rowCount > 0;
  } catch (error) {
    console.error(`❌ markUsed error:`, error.message);
    return false;
  }
}

/**
 * Získá počet otázek v DB
 */
export async function getQuestionCount(mode = null) {
  try {
    let query = 'SELECT COUNT(*) FROM questions';
    const params = [];
    if (mode) {
      query += ' WHERE mode = $1';
      params.push(mode);
    }
    const res = await pool.query(query, params);
    return parseInt(res.rows[0].count);
  } catch (e) { 
    return 0; 
  }
}

// === SPECTATOR TICKETS ===

/**
 * Inicializuje tabulku pro vstupenky
 */
async function initTicketsTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS spectator_tickets (
        id SERIAL PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        session_id TEXT NOT NULL,
        email TEXT,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        used_count INTEGER DEFAULT 0
      )
    `);
    console.log('✅ Tabulka spectator_tickets připravena');
  } catch (error) {
    console.error('❌ Chyba při vytváření tabulky spectator_tickets:', error.message);
  }
}

/**
 * Uloží kód vstupenky do databáze
 */
export async function saveTicketCode(code, sessionId, expiresAt, email = null) {
  try {
    await pool.query(
      `INSERT INTO spectator_tickets (code, session_id, email, expires_at) 
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (code) DO NOTHING`,
      [code, sessionId, email, expiresAt]
    );
    console.log(`🎫 Vstupenka ${code} uložena do DB`);
    return true;
  } catch (error) {
    console.error('❌ Chyba při ukládání vstupenky:', error.message);
    return false;
  }
}

/**
 * Ověří kód vstupenky
 */
export async function verifyTicketCode(code) {
  try {
    const result = await pool.query(
      `SELECT * FROM spectator_tickets 
       WHERE code = $1 AND expires_at > NOW()`,
      [code.toUpperCase()]
    );
    
    if (result.rows.length > 0) {
      // Inkrementovat počet použití
      await pool.query(
        `UPDATE spectator_tickets SET used_count = used_count + 1 WHERE code = $1`,
        [code.toUpperCase()]
      );
      
      return { 
        valid: true, 
        expiresAt: result.rows[0].expires_at,
        email: result.rows[0].email
      };
    }
    
    // Kontrola vypršelého kódu
    const expired = await pool.query(
      `SELECT * FROM spectator_tickets WHERE code = $1`,
      [code.toUpperCase()]
    );
    
    if (expired.rows.length > 0) {
      return { valid: false, error: 'Kód vypršel' };
    }
    
    return { valid: false, error: 'Neplatný kód' };
  } catch (error) {
    console.error('❌ Chyba při ověřování vstupenky:', error.message);
    return { valid: false, error: 'Chyba databáze' };
  }
}

/**
 * Uzavře pool připojení
 */
export function closeDatabase() {
  pool.end();
}
