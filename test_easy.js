/**
 * 🐣 TEST: EASY Databáze (4-6 let)
 * 
 * Testuje načítání otázek z databáze pro nejmenší děti.
 * - Žádné LLM cally
 * - Okamžité načtení
 * - 100% ověřené otázky
 */

import { 
  generateQuestion, 
  getEasyDatabaseStats,
  resetEasyQuestionsHistory
} from './question_generator.js';

// Barvy pro konzoli
const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function printHeader(text) {
  console.log(`\n${COLORS.cyan}${'═'.repeat(60)}${COLORS.reset}`);
  console.log(`${COLORS.cyan}  ${text}${COLORS.reset}`);
  console.log(`${COLORS.cyan}${'═'.repeat(60)}${COLORS.reset}\n`);
}

function printQuestion(q, index) {
  console.log(`${COLORS.yellow}📤 Otázka ${index}:${COLORS.reset}`);
  console.log(`   ${q.question}`);
  console.log(`   A) ${q.options[0]}${q.correct === 0 ? ` ${COLORS.green}✓${COLORS.reset}` : ''}`);
  console.log(`   B) ${q.options[1]}${q.correct === 1 ? ` ${COLORS.green}✓${COLORS.reset}` : ''}`);
  console.log(`   C) ${q.options[2]}${q.correct === 2 ? ` ${COLORS.green}✓${COLORS.reset}` : ''}`);
  console.log();
}

async function runTest() {
  printHeader('🐣 TEST: EASY Databáze (4-6 let)');
  
  console.log('📌 Konfigurace:');
  console.log('   - Mode: KID');
  console.log('   - Difficulty: EASY (4-6 let)');
  console.log('   - Zdroj: JSON databáze (žádné LLM!)');
  console.log('   - Počet otázek: 10\n');
  
  // Reset historie
  resetEasyQuestionsHistory();
  
  // Statistiky před testem
  const statsBefore = getEasyDatabaseStats();
  console.log(`${COLORS.magenta}📊 DATABÁZE PŘED TESTEM:${COLORS.reset}`);
  if (statsBefore.loaded) {
    console.log(`   Celkem otázek: ${statsBefore.totalQuestions}`);
    console.log(`   Kategorie:`);
    for (const [cat, count] of Object.entries(statsBefore.categories)) {
      console.log(`     - ${cat}: ${count} otázek`);
    }
  } else {
    console.log(`   ${COLORS.red}❌ Databáze nenačtena!${COLORS.reset}`);
    return;
  }
  console.log();
  
  const questions = [];
  const startTime = Date.now();
  
  // Generuj 10 otázek
  for (let i = 1; i <= 10; i++) {
    try {
      const q = await generateQuestion('kid', null, 'easy');
      
      if (q && !q.question.includes("Nepodařilo se")) {
        questions.push(q);
        printQuestion(q, i);
      } else {
        console.log(`${COLORS.red}❌ Otázka ${i} se nepodařila načíst${COLORS.reset}\n`);
      }
    } catch (error) {
      console.error(`${COLORS.red}❌ Chyba: ${error.message}${COLORS.reset}\n`);
    }
  }
  
  const elapsed = Date.now() - startTime;
  
  // Statistiky po testu
  const statsAfter = getEasyDatabaseStats();
  
  // Výsledky
  printHeader('📋 VÝSLEDKY TESTU');
  
  console.log(`⏱️  Čas: ${elapsed}ms (${(elapsed / 10).toFixed(1)}ms na otázku)`);
  console.log(`📤 Úspěšně načteno: ${questions.length}/10 otázek`);
  console.log();
  console.log(`${COLORS.magenta}📊 STATISTIKY DATABÁZE:${COLORS.reset}`);
  console.log(`   Celkem otázek:    ${statsAfter.totalQuestions}`);
  console.log(`   Použito otázek:   ${statsAfter.usedQuestions}`);
  console.log(`   Zbývá otázek:     ${statsAfter.remainingQuestions}`);
  
  // Shrnutí
  printHeader('✅ TEST DOKONČEN');
  
  if (questions.length === 10) {
    console.log(`${COLORS.green}✅ Databáze funguje perfektně!${COLORS.reset}`);
    console.log(`${COLORS.green}   - Všech 10 otázek načteno`);
    console.log(`   - Průměrný čas: ${(elapsed / 10).toFixed(1)}ms (okamžité!)${COLORS.reset}`);
  } else {
    console.log(`${COLORS.yellow}⚠️ Některé otázky se nepodařilo načíst.${COLORS.reset}`);
  }
  
  console.log();
  console.log(`${COLORS.cyan}💡 Porovnání s LLM generováním:${COLORS.reset}`);
  console.log(`   - LLM (ADULT): ~4-5 minut pro 10 otázek`);
  console.log(`   - Databáze (EASY): ${elapsed}ms pro 10 otázek`);
  console.log(`   - Zrychlení: ${((5 * 60 * 1000) / elapsed).toFixed(0)}x rychlejší! 🚀`);
  console.log();
}

// Spuštění
runTest().catch(console.error);
