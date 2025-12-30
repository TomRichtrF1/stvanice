/**
 * 🧪 TEST AI - DETAILNÍ DEBUG PRO POSTGRESQL
 * * Tento skript slouží k vizuální kontrole kvality otázek a validačního procesu.
 * * Podporuje novou asynchronní architekturu (Postgres).
 * * Spuštění:
 * node test_ai.js debug       # Detailní test generování + výpis DB
 * node test_ai.js quick       # Rychlý test hráče (End-to-End)
 */

import dotenv from 'dotenv';
import pg from 'pg'; // Potřebujeme pro přímé čtení DB v testu
import { 
  generateQuestion, 
  preWarmCache,
  getValidationStats,
  resetValidationStats,
  connectDatabase,
  getValidationHistory
} from './question_generator.js';

import * as questionDatabase from './question_database.js';

dotenv.config();

// === 🔧 KONFIGURACE PRO TESTOVACÍ PŘIPOJENÍ ===
// Vytvoříme si "bokem" připojení jen pro tento testovací skript, 
// abychom mohli vypisovat data přímo z DB (SELECT * ...).
const { Pool } = pg;
const testDbPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// === 🎨 BARVY ===
const c = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

function printHeader(title) {
  console.log(`\n${c.cyan}${'═'.repeat(60)}${c.reset}`);
  console.log(`${c.bright}${c.cyan}  ${title}${c.reset}`);
  console.log(`${c.cyan}${'═'.repeat(60)}${c.reset}\n`);
}

// Pomocná funkce pro výpis detailu otázky
function printQuestionDetails(q, indent = '   ') {
  console.log(`${indent}• "${c.bright}${q.question}${c.reset}"`);
  
  if (q.options) {
    q.options.forEach((opt, idx) => {
      const isCorrect = idx === q.correct;
      const marker = isCorrect ? '✅' : '  ';
      const color = isCorrect ? c.green : c.dim;
      const letter = String.fromCharCode(65 + idx);
      console.log(`${indent}  ${marker} ${color}${letter}) ${opt}${c.reset}`);
    });
  }
}

// === 🐛 HLAVNÍ DEBUG TEST (Generování) ===
async function runDebugMode() {
  printHeader('🐛 DEBUG MODE: Validace Sonar & Postgres DB');
  
  // 1. Připojení generátoru k DB
  console.log(`${c.dim}Připojuji k Heroku Postgres...${c.reset}`);
  const connected = await connectDatabase(questionDatabase);
  if (!connected) {
    console.error(`${c.red}❌ Nepodařilo se připojit k DB. Zkontroluj .env!${c.reset}`);
    process.exit(1);
  }

  const categories = [
    { id: 'adult', name: '👔 DOSPĚLÍ' },
    { id: 'student', name: '🎒 ŠKOLÁCI' },
    { id: 'kids', name: '🐣 DĚTI' }
  ];

  for (const cat of categories) {
    console.log(`\n${c.yellow}--- TEST KATEGORIE: ${cat.name} ---${c.reset}`);
    resetValidationStats();
    
    // Zjistíme počet otázek před testem
    const dbMode = cat.id === 'adult' ? 'adult' : 'kid'; 
    const countQuery = await testDbPool.query('SELECT COUNT(*) FROM questions WHERE mode = $1', [dbMode]);
    const countBefore = parseInt(countQuery.rows[0].count);

    const startTime = Date.now();
    console.log(`${c.dim}Generuji a ověřuji u Sonaru...${c.reset}`);
    
    // Spustíme generování (AWAIT!)
    await preWarmCache(`debug_${cat.id}_${Date.now()}`, cat.id);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    // Zjistíme počet otázek po testu
    const countQueryAfter = await testDbPool.query('SELECT COUNT(*) FROM questions WHERE mode = $1', [dbMode]);
    const countAfter = parseInt(countQueryAfter.rows[0].count);
    const diff = countAfter - countBefore;

    // Výpis historie validace
    const history = getValidationHistory();
    const approved = history.filter(h => h.status === 'APPROVED');
    const rejected = history.filter(h => h.status === 'REJECTED');

    // === VÝPIS SCHVÁLENÝCH ===
    console.log(`\n${c.green}✅ SCHVÁLENO (${approved.length}):${c.reset}`);
    approved.forEach(h => {
        printQuestionDetails(h);
        console.log('');
    });

    // === VÝPIS ZAMÍTNUTÝCH ===
    if (rejected.length > 0) {
        console.log(`\n${c.red}❌ ZAMÍTNUTO (${rejected.length}):${c.reset}`);
        rejected.forEach(h => {
            printQuestionDetails(h);
            console.log(`     ${c.red}Důvod: ${h.reason}${c.reset}\n`);
        });
    } else {
        console.log(`\n${c.dim}(Žádné otázky nebyly zamítnuty)${c.reset}`);
    }

    console.log(`⏱️  Čas: ${duration}s`);
    console.log(`💾 Uloženo do DB (Persistence Check): ${diff > 0 ? c.green : c.red}${diff}${c.reset} nových`);

    // === KONTROLA DAT V DB (SELECT) ===
    if (diff > 0) {
        console.log(`\n${c.bright}🔍 POHLED PŘÍMO DO DATABÁZE (Poslední přidané):${c.reset}`);
        const newQs = await testDbPool.query(`
            SELECT * FROM questions 
            WHERE mode = $1 
            ORDER BY id DESC 
            LIMIT $2
        `, [dbMode, diff]);

        newQs.rows.reverse().forEach((q, i) => {
            console.log(`   ${c.cyan}[DB ID: ${q.id}] ${q.question}${c.reset}`);
        });
    }
  }

  // Úklid
  questionDatabase.closeDatabase();
  await testDbPool.end();
}

// === 🚀 RYCHLÝ TEST (Simulace Hráče) ===
async function runQuickTest() {
  printHeader('🚀 RYCHLÝ TEST (Vynucená AI Otázka)');
  
  // 1. Připojení
  await connectDatabase(questionDatabase);
  
  const testSessionId = `quick_test_${Date.now()}`;

  console.log(`${c.yellow}⏳ Čekám na vygenerování otázek od AI...${c.reset}`);
  // Musíme použít await, protože preWarmCache je nyní async a zapisuje do DB
  await preWarmCache(testSessionId, 'adult');
  
  console.log(`${c.green}✅ AI připravena! Hráč si žádá otázku...${c.reset}\n`);

  // Vyžádání otázky
  const result = await generateQuestion(testSessionId, 'adult');
  
  if (result._error) {
    console.log(`${c.red}❌ Chyba: ${result.question}${c.reset}`);
  } else {
    const sourceIcon = result._fromLLM ? '⚡' : '🗄️';
    const sourceText = result._fromLLM ? 'LLM (Čerstvá z AI)' : 'DB (Záloha/Cache)';
    const sourceColor = result._fromLLM ? c.green : c.yellow;

    console.log(`${sourceColor}✅ Hráč dostal otázku:${c.reset}`);
    console.log(`   Otázka:  ${c.bright}${result.question}${c.reset}`);
    console.log(`   Zdroj:   ${sourceIcon} ${sourceColor}${sourceText}${c.reset}`);
    console.log(`   ${c.dim}-----------------------------------${c.reset}`);
    
    result.options.forEach((opt, index) => {
        const isCorrect = index === result.correct;
        const letter = String.fromCharCode(65 + index);
        
        if (isCorrect) {
            console.log(`   ${c.green}${c.bright}✅ ${letter}) ${opt}${c.reset}`);
        } else {
            console.log(`      ${letter}) ${opt}`);
        }
    });
    console.log(`   ${c.dim}-----------------------------------${c.reset}`);
  }

  // Úklid
  questionDatabase.closeDatabase();
  await testDbPool.end();
}

// === MAIN ===
async function main() {
  const command = process.argv[2] || 'help';
  try {
    switch (command) {
      case 'debug': await runDebugMode(); break;
      case 'quick': await runQuickTest(); break;
      default: console.log(`Spusť: node test_ai.js debug`);
    }
  } catch (err) { console.error(err); }
}

main();