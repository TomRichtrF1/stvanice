import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CSV_FILE = path.join(__dirname, 'questions_migrated.csv');
const DB_FILE = path.join(__dirname, 'questions.db');

// 🛡️ Robustní CSV Parser (zvládá čárky uvnitř textů)
function parseCSV(text) {
    const rows = [];
    let currentRow = [];
    let currentVal = '';
    let insideQuotes = false;
    
    // Projdeme soubor znak po znaku (stavový automat)
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i+1];
        
        if (char === '"') {
            if (insideQuotes && nextChar === '"') {
                currentVal += '"'; // Escapované uvozovky
                i++; 
            } else {
                insideQuotes = !insideQuotes; // Přepnutí stavu uvozovek
            }
        } else if (char === ',' && !insideQuotes) {
            currentRow.push(currentVal.trim()); // Konec buňky
            currentVal = '';
        } else if ((char === '\r' || char === '\n') && !insideQuotes) {
            if (char === '\r' && nextChar === '\n') i++; // Skip \n after \r
            currentRow.push(currentVal.trim());
            if (currentRow.length > 1) rows.push(currentRow); // Uložit řádek (pokud není prázdný)
            currentRow = [];
            currentVal = '';
        } else {
            currentVal += char;
        }
    }
    // Poslední řádek
    if (currentVal || currentRow.length > 0) {
        currentRow.push(currentVal.trim());
        rows.push(currentRow);
    }
    return rows;
}

console.log('🏗️  Vytvářím databázi z CSV (v2 - Robustní parser)...');

// 1. Smazat starou DB
if (fs.existsSync(DB_FILE)) {
    try { fs.unlinkSync(DB_FILE); } catch(e) {}
    console.log('🗑️  Stará DB smazána.');
}

// 2. Inicializace DB
const db = new Database(DB_FILE);

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
`);

// 3. Načtení a parsování
const csvContent = fs.readFileSync(CSV_FILE, 'utf-8');
const rawRows = parseCSV(csvContent);
const headers = rawRows[0]; // První řádek jsou hlavičky
const dataRows = rawRows.slice(1);

console.log(`📄 Načteno ${dataRows.length} řádků.`);

// 4. Mapování a čištění dat
const insert = db.prepare(`
    INSERT INTO questions (question, option_a, option_b, option_c, correct, category, aspect, mode, difficulty, use_count, hash)
    VALUES (@question, @option_a, @option_b, @option_c, @correct, @category, @aspect, @mode, @difficulty, @use_count, @hash)
`);

let successCount = 0;
let errorCount = 0;

const insertTransaction = db.transaction((rows) => {
    for (const rowVals of rows) {
        try {
            // Vytvoříme objekt podle hlaviček
            const row = {};
            headers.forEach((h, i) => {
                row[h] = rowVals[i];
            });

            // Validace a konverze
            const correctVal = parseInt(row.correct, 10);
            
            // Pokud je 'correct' neplatné číslo, přeskočíme
            if (isNaN(correctVal) || correctVal < 0 || correctVal > 2) {
                console.warn(`⚠️ Přeskakuji vadný řádek (ID ${row.id || '?'}): correct='${row.correct}'`);
                errorCount++;
                continue;
            }

            insert.run({
                question: row.question,
                option_a: row.option_a,
                option_b: row.option_b,
                option_c: row.option_c,
                correct: correctVal,
                category: row.category || null,
                aspect: row.aspect || null,
                mode: row.mode || 'adult',
                difficulty: row.difficulty || 'normal',
                use_count: parseInt(row.use_count || 0, 10),
                hash: row.hash || null
            });
            successCount++;
        } catch (err) {
            console.error(`❌ Chyba řádku: ${err.message}`);
            errorCount++;
        }
    }
});

insertTransaction(dataRows);

console.log(`\n✅ HOTOVO:`);
console.log(`   Úspěšně importováno: ${successCount}`);
console.log(`   Chybné/Přeskočené:   ${errorCount}`);

db.close();