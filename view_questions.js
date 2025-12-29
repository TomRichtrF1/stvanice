/**
 * 👀 VIEW QUESTIONS - Prohlížení otázek v databázi
 * 
 * Spuštění: node view_questions.js
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, 'questions.db');

const db = new Database(DB_PATH);

// === KONFIGURACE ===
const SHOW_COUNT = 20;  // Kolik otázek zobrazit
const MODE = 'adult';   // 'adult' nebo 'kid'

console.log('\n' + '═'.repeat(70));
console.log('👀 PROHLÍŽENÍ DATABÁZE OTÁZEK');
console.log('═'.repeat(70));

// Celkové statistiky
const total = db.prepare('SELECT COUNT(*) as count FROM questions').get().count;
const adult = db.prepare("SELECT COUNT(*) as count FROM questions WHERE mode = 'adult'").get().count;
const kid = db.prepare("SELECT COUNT(*) as count FROM questions WHERE mode = 'kid'").get().count;

console.log(`\n📊 STATISTIKY:`);
console.log(`   Celkem: ${total} | Adult: ${adult} | Kid: ${kid}`);

// Nejnovější otázky
console.log(`\n📋 POSLEDNÍCH ${SHOW_COUNT} OTÁZEK (${MODE}):`);
console.log('─'.repeat(70));

const questions = db.prepare(`
  SELECT id, question, option_a, option_b, option_c, correct, category, created_at
  FROM questions 
  WHERE mode = ?
  ORDER BY id DESC 
  LIMIT ?
`).all(MODE, SHOW_COUNT);

questions.forEach((q, i) => {
  const correctAnswer = [q.option_a, q.option_b, q.option_c][q.correct];
  const date = q.created_at ? q.created_at.substring(0, 16) : '?';
  
  console.log(`\n${q.id}. ${q.question}`);
  console.log(`   A) ${q.option_a}${q.correct === 0 ? ' ✓' : ''}`);
  console.log(`   B) ${q.option_b}${q.correct === 1 ? ' ✓' : ''}`);
  console.log(`   C) ${q.option_c}${q.correct === 2 ? ' ✓' : ''}`);
  console.log(`   📁 ${q.category || '?'} | 🕐 ${date}`);
});

// Rozložení podle kategorií
console.log('\n' + '─'.repeat(70));
console.log('\n📁 ROZLOŽENÍ PODLE KATEGORIÍ:');

const categories = db.prepare(`
  SELECT category, COUNT(*) as count 
  FROM questions 
  WHERE mode = ? AND category IS NOT NULL
  GROUP BY category 
  ORDER BY count DESC
`).all(MODE);

categories.forEach(c => {
  const bar = '█'.repeat(Math.min(Math.round(c.count / 5), 30));
  console.log(`   ${c.category?.padEnd(25) || 'Neznámá'.padEnd(25)} ${bar} ${c.count}`);
});

// Kontrola duplicitních odpovědí
console.log('\n' + '─'.repeat(70));
console.log('\n🔍 KONTROLA DUPLICIT (odpovědi které se opakují):');

const duplicates = db.prepare(`
  SELECT answer, cnt FROM (
    SELECT option_a as answer, COUNT(*) as cnt
    FROM questions 
    WHERE correct = 0 AND mode = ?
    GROUP BY option_a
    HAVING cnt > 1
    UNION ALL
    SELECT option_b, COUNT(*)
    FROM questions 
    WHERE correct = 1 AND mode = ?
    GROUP BY option_b
    HAVING COUNT(*) > 1
    UNION ALL
    SELECT option_c, COUNT(*)
    FROM questions 
    WHERE correct = 2 AND mode = ?
    GROUP BY option_c
    HAVING COUNT(*) > 1
  )
  ORDER BY cnt DESC
  LIMIT 15
`).all(MODE, MODE, MODE);

if (duplicates.length === 0) {
  console.log('   ✅ Žádné duplicitní správné odpovědi!');
} else {
  duplicates.forEach(d => {
    console.log(`   ⚠️ "${d.answer}" - ${d.cnt}×`);
  });
}

// Časové rozpětí
console.log('\n' + '─'.repeat(70));
const timeRange = db.prepare(`
  SELECT MIN(created_at) as oldest, MAX(created_at) as newest
  FROM questions
`).get();

console.log(`\n🕐 ČASOVÉ ROZPĚTÍ:`);
console.log(`   Nejstarší: ${timeRange.oldest || '?'}`);
console.log(`   Nejnovější: ${timeRange.newest || '?'}`);

console.log('\n' + '═'.repeat(70) + '\n');

db.close();
