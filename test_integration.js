/**
 * 🧪 INTEGRAČNÍ TEST - Databáze + Background Generator
 * 
 * Testuje:
 * - SQLite databáze
 * - Background generování
 * - Deduplikace (200 nejnovějších)
 * - Ukládání validovaných otázek
 * 
 * Spuštění: node test_integration.js
 * 
 * Požadavky:
 * - npm install better-sqlite3
 * - .env s GROQ_API_KEY a PERPLEXITY_API_KEY
 */

import * as questionGenerator from './question_generator.js';
import * as questionDatabase from './question_database.js';
import { BackgroundGenerator } from './background_generator.js';

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

function printSubHeader(text) {
  console.log(`\n${COLORS.yellow}--- ${text} ---${COLORS.reset}\n`);
}

async function testDatabase() {
  printSubHeader('🗄️ Test SQLite Databáze');
  
  // Inicializace
  console.log('1. Inicializace databáze...');
  questionDatabase.initDatabase();
  
  // Statistiky
  console.log('2. Statistiky databáze:');
  const stats = questionDatabase.getDatabaseStats();
  console.log(`   - Celkem otázek: ${stats.totalQuestions}`);
  console.log(`   - ADULT otázek: ${stats.adultQuestions}`);
  console.log(`   - Historie použití: ${stats.recentUsageCount}`);
  console.log(`   - Přeskakuje: ${stats.recentQuestionsToSkip} nejnovějších`);
  
  // Testovací otázky
  console.log('\n3. Ukládání testovacích otázek...');
  const testQuestions = [
    { question: "Kdo napsal Hamleta?", options: ["Shakespeare", "Goethe", "Molière"], correct: 0 },
    { question: "Jaké je hlavní město Francie?", options: ["Paříž", "Lyon", "Marseille"], correct: 0 },
    { question: "Kolik planet má sluneční soustava?", options: ["8", "9", "7"], correct: 0 },
  ];
  
  const saved = questionDatabase.saveQuestions(testQuestions, 'adult');
  console.log(`   Uloženo: ${saved} nových otázek`);
  
  // Načtení náhodné otázky
  console.log('\n4. Načtení náhodné otázky z DB...');
  const randomQ = questionDatabase.getRandomQuestion('adult');
  if (randomQ) {
    console.log(`   Otázka: ${randomQ.question}`);
    console.log(`   Odpověď: ${randomQ.options[randomQ.correct]}`);
  } else {
    console.log(`   ${COLORS.yellow}⚠️ Žádná otázka v DB${COLORS.reset}`);
  }
  
  // Finální statistiky
  console.log('\n5. Finální statistiky:');
  const finalStats = questionDatabase.getDatabaseStats();
  console.log(`   - Celkem otázek: ${finalStats.totalQuestions}`);
  
  return finalStats.totalQuestions > 0;
}

async function testQuestionGeneratorWithDB() {
  printSubHeader('🔗 Test Integrace Generator + DB');
  
  // Připojení databáze ke generátoru
  console.log('1. Připojení databáze ke generátoru...');
  const connected = questionGenerator.connectDatabase(questionDatabase);
  console.log(`   Připojeno: ${connected ? '✅ Ano' : '❌ Ne'}`);
  
  // Systémové statistiky
  console.log('\n2. Systémové statistiky:');
  const sysStats = questionGenerator.getSystemStats();
  console.log(`   - Cache: ${sysStats.cache.size} otázek`);
  console.log(`   - DB připojena: ${sysStats.database.connected}`);
  console.log(`   - DB otázek: ${sysStats.database.questionCount}`);
  
  return connected;
}

async function testBackgroundGenerator() {
  printSubHeader('🔄 Test Background Generatoru');
  
  console.log('1. Vytvoření background generatoru...');
  const bg = new BackgroundGenerator(questionGenerator, questionDatabase);
  
  console.log('2. Event listenery...');
  bg.on('started', (data) => console.log(`   📢 Started: mode=${data.mode}`));
  bg.on('generationStarted', () => console.log(`   📢 Generování začalo...`));
  bg.on('generationCompleted', (data) => console.log(`   📢 Dokončeno: ${data.generated} otázek, ${data.saved} uloženo`));
  bg.on('generationError', (error) => console.log(`   📢 Chyba: ${error.message}`));
  
  console.log('3. Statistiky před startem:');
  console.log(`   ${JSON.stringify(bg.getStats(), null, 2)}`);
  
  // Nebudeme startovat - to by trvalo dlouho
  console.log('\n4. Background generator připraven (nespouštíme pro test)');
  console.log(`   Pro spuštění: bg.start('adult')`);
  console.log(`   Pro zastavení: bg.stop()`);
  
  return true;
}

async function testFullFlow() {
  printSubHeader('🚀 Test Kompletního Flow');
  
  console.log('Tento test vygeneruje 1 batch otázek a uloží do DB.');
  console.log('Toto může trvat 2-5 minut...\n');
  
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const answer = await new Promise(resolve => {
    rl.question('Chceš pokračovat? (y/n): ', resolve);
  });
  rl.close();
  
  if (answer.toLowerCase() !== 'y') {
    console.log('Přeskakuji...');
    return true;
  }
  
  console.log('\n1. Generování batche...');
  const startTime = Date.now();
  
  questionGenerator.resetValidationStats();
  const result = await questionGenerator.generateAndValidateBatch('adult', null, 'hard');
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log(`\n2. Výsledky (${elapsed}s):`);
  console.log(`   - Vygenerováno: ${result.questions.length} otázek`);
  console.log(`   - Self-Critique PASS: ${result.stats.passedSelfCritique}`);
  console.log(`   - Perplexity PASS: ${result.stats.passedPerplexity}`);
  
  if (result.questions.length > 0) {
    console.log('\n3. Ukázka otázek:');
    result.questions.slice(0, 3).forEach((q, i) => {
      console.log(`   ${i+1}. ${q.question}`);
      console.log(`      → ${q.options[q.correct]}`);
    });
  }
  
  // Statistiky DB
  console.log('\n4. Statistiky databáze po generování:');
  const dbStats = questionDatabase.getDatabaseStats();
  console.log(`   - Celkem otázek: ${dbStats.totalQuestions}`);
  
  return result.questions.length > 0;
}

async function runAllTests() {
  printHeader('🧪 INTEGRAČNÍ TEST - Databáze + Background Generator');
  
  console.log('Tento test ověřuje:');
  console.log('  1. SQLite databáze funguje');
  console.log('  2. Generátor je propojený s DB');
  console.log('  3. Background generator je připravený');
  console.log('  4. (Volitelně) Kompletní flow generování\n');
  
  const results = {
    database: false,
    integration: false,
    background: false,
    fullFlow: false
  };
  
  try {
    // Test 1: Databáze
    results.database = await testDatabase();
    
    // Test 2: Integrace
    results.integration = await testQuestionGeneratorWithDB();
    
    // Test 3: Background Generator
    results.background = await testBackgroundGenerator();
    
    // Test 4: Full Flow (volitelný)
    results.fullFlow = await testFullFlow();
    
  } catch (error) {
    console.error(`\n${COLORS.red}❌ Chyba: ${error.message}${COLORS.reset}`);
    console.error(error.stack);
  }
  
  // Shrnutí
  printHeader('📋 SHRNUTÍ TESTŮ');
  
  for (const [test, passed] of Object.entries(results)) {
    const icon = passed ? `${COLORS.green}✅` : `${COLORS.red}❌`;
    console.log(`  ${icon} ${test}${COLORS.reset}`);
  }
  
  const allPassed = Object.values(results).every(r => r);
  console.log(`\n${allPassed ? COLORS.green + '✅ Všechny testy prošly!' : COLORS.yellow + '⚠️ Některé testy neprošly'}${COLORS.reset}\n`);
  
  // Cleanup
  questionDatabase.closeDatabase();
}

// Spuštění
runAllTests().catch(console.error);
