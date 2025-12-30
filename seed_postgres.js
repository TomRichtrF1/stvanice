/**
 * 🌱 SEED POSTGRES - Hardcoded URL verze pro opravu připojení
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CSV_FILE = path.join(__dirname, 'questions_newDB.csv');

// 👇 ZDE JE TVOJE ADRESA (opravená, v uvozovkách) 👇
const DATABASE_URL = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// CSV Parser
function parseCSV(text) {
    const rows = [];
    let currentRow = [];
    let currentVal = '';
    let insideQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '"') {
            if (insideQuotes && text[i+1] === '"') { currentVal += '"'; i++; }
            else { insideQuotes = !insideQuotes; }
        } else if (char === ',' && !insideQuotes) {
            currentRow.push(currentVal.trim()); currentVal = '';
        } else if ((char === '\r' || char === '\n') && !insideQuotes) {
            if (char === '\r' && text[i+1] === '\n') i++;
            currentRow.push(currentVal.trim());
            if (currentRow.length > 1) rows.push(currentRow);
            currentRow = []; currentVal = '';
        } else { currentVal += char; }
    }
    if (currentVal || currentRow.length > 0) { currentRow.push(currentVal.trim()); rows.push(currentRow); }
    return rows;
}

async function seed() {
  const client = await pool.connect();
  try {
    console.log('🚀 Začínám migraci do Postgres...');
    
    // 1. Vytvoření tabulky
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
    `);

    // 2. Načtení CSV
    if (!fs.existsSync(CSV_FILE)) {
        throw new Error(`Soubor neexistuje: ${CSV_FILE}`);
    }
    const csvContent = fs.readFileSync(CSV_FILE, 'utf-8');
    const rows = parseCSV(csvContent).slice(1); // Přeskočit header
    console.log(`📄 Načteno ${rows.length} řádků z CSV.`);

    // 3. Insert loop
    let inserted = 0;
    for (const row of rows) {
        if (row.length < 5) continue; // Ochrana proti prázdným řádkům

        const [oldId, q, a, b, c, corr, cat, asp, mode, diff, created, used, count, hash] = row;
        
        await client.query(`
            INSERT INTO questions (question, option_a, option_b, option_c, correct, category, aspect, mode, difficulty, use_count, hash)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (hash) DO NOTHING
        `, [q, a, b, c, parseInt(corr), cat, asp, mode, diff, parseInt(count), hash]);
        
        inserted++;
        if (inserted % 500 === 0) process.stdout.write('.');
    }
    
    console.log(`\n✅ Migrace dokončena! Data jsou v cloudu.`);

  } catch (err) {
    console.error('❌ Chyba:', err);
  } finally {
    client.release();
    pool.end();
  }
}

seed();