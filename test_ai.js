/**
 * 🧪 TEST AI - DETAILNÍ DEBUG S DŮVODY ZAMÍTNUTÍ A MOŽNOSTMI
 */

import dotenv from 'dotenv';
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

// Funkce pro formátování výpisu otázky s možnostmi
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
  printHeader('🐛 DEBUG MODE: Validace Sonar');
  
  questionDatabase.initDatabase();
  connectDatabase(questionDatabase);

  const categories = [
    { id: 'adult', name: '👔 DOSPĚLÍ' },
    { id: 'student', name: '🎒 ŠKOLÁCI' },
    { id: 'kids', name: '🐣 DĚTI' }
  ];

  for (const cat of categories) {
    console.log(`\n${c.yellow}--- TEST KATEGORIE: ${cat.name} ---${c.reset}`);
    resetValidationStats();
    
    const startTime = Date.now();
    console.log(`${c.dim}Generuji a ověřuji u Sonaru...${c.reset}`);
    
    // Spustíme generování
    await preWarmCache(`debug_${cat.id}_${Date.now()}`, cat.id);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const history = getValidationHistory();
    const approved = history.filter(h => h.status === 'APPROVED');
    const rejected = history.filter(h => h.status === 'REJECTED');

    // === VÝPIS SCHVÁLENÝCH ===
    console.log(`\n${c.green}✅ SCHVÁLENO (${approved.length}):${c.reset}`);
    approved.forEach(h => {
        printQuestionDetails(h);
        console.log(''); // mezera
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
  }

  questionDatabase.closeDatabase();
}

// === 🚀 RYCHLÝ TEST (Simulace Hráče) ===
async function runQuickTest() {
  printHeader('🚀 RYCHLÝ TEST (Vynucená AI Otázka)');
  questionDatabase.initDatabase();
  connectDatabase(questionDatabase);
  
  const testSessionId = `quick_test_${Date.now()}`;

  console.log(`${c.yellow}⏳ Čekám na vygenerování otázek od AI...${c.reset}`);
  await preWarmCache(testSessionId, 'adult');
  
  console.log(`${c.green}✅ AI připravena! Hráč si žádá otázku...${c.reset}\n`);

  const result = await generateQuestion(testSessionId, 'adult');
  
  if (result._error) {
    console.log(`${c.red}❌ Chyba: ${result.question}${c.reset}`);
  } else {
    const sourceIcon = result._fromLLM ? '⚡' : '🗄️';
    const sourceText = result._fromLLM ? 'LLM (Čerstvá z AI)' : 'DB (Záloha)';
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