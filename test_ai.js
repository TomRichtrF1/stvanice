/**
 * 🧪 TEST AI - Rychlé testování generátoru otázek v terminálu
 * 
 * Spuštění:
 *   node test_ai.js                    # Rychlý test (5 otázek adult)
 *   node test_ai.js quick              # Rychlý test (5 otázek)
 *   node test_ai.js adult              # 10 otázek adult
 *   node test_ai.js easy               # 10 otázek easy (4-6 let)
 *   node test_ai.js medium             # 10 otázek medium (7-10 let)
 *   node test_ai.js hard               # 10 otázek hard (11-14 let)
 *   node test_ai.js full               # Kompletní test všech módů
 *   node test_ai.js db                 # Test databáze
 *   node test_ai.js stats              # Zobrazení statistik validace
 */

import { 
  generateQuestion, 
  initializeBatch,
  getCacheSize,
  clearHistory,
  clearQuestionCache,
  getUsedAnswersSize,
  getValidationStats,
  resetValidationStats,
  connectDatabase
} from './question_generator.js';

import * as questionDatabase from './question_database.js';

// === 🎨 BARVY PRO TERMINÁL ===
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
};

const c = colors;

// === 📊 STATISTIKY ===
let stats = {
  total: 0,
  passed: 0,
  failed: 0,
  errors: 0,
  startTime: Date.now()
};

// === 🔧 POMOCNÉ FUNKCE ===

function printHeader(title) {
  console.log(`\n${c.cyan}${'═'.repeat(60)}${c.reset}`);
  console.log(`${c.bright}${c.cyan}  ${title}${c.reset}`);
  console.log(`${c.cyan}${'═'.repeat(60)}${c.reset}\n`);
}

function printSubHeader(title) {
  console.log(`\n${c.yellow}--- ${title} ---${c.reset}\n`);
}

function printQuestion(q, index) {
  console.log(`${c.bright}${c.white}#${index}${c.reset} ${q.question}`);
  q.options.forEach((opt, i) => {
    const marker = i === q.correct ? `${c.green}✓${c.reset}` : ' ';
    const optColor = i === q.correct ? c.green : c.white;
    console.log(`   ${marker} ${optColor}${String.fromCharCode(65 + i)}) ${opt}${c.reset}`);
  });
  if (q.category) {
    console.log(`   ${c.blue}📁 ${q.category}${c.reset}`);
  }
  console.log('');
}

function printSuccess(msg) {
  console.log(`${c.green}✅ ${msg}${c.reset}`);
}

function printError(msg) {
  console.log(`${c.red}❌ ${msg}${c.reset}`);
}

function printWarning(msg) {
  console.log(`${c.yellow}⚠️  ${msg}${c.reset}`);
}

function printInfo(msg) {
  console.log(`${c.cyan}ℹ️  ${msg}${c.reset}`);
}

// === 🧪 TESTY ===

async function testQuickMode() {
  printHeader('🚀 RYCHLÝ TEST - 5 otázek');
  
  clearHistory();
  clearQuestionCache();
  resetValidationStats();
  
  console.log(`${c.yellow}Generuji 5 otázek pro dospělé...${c.reset}\n`);
  
  const start = Date.now();
  
  for (let i = 1; i <= 5; i++) {
    try {
      const q = await generateQuestion('adult', null, 'normal');
      printQuestion(q, i);
      stats.passed++;
    } catch (error) {
      printError(`Otázka #${i}: ${error.message}`);
      stats.failed++;
    }
    stats.total++;
  }
  
  const duration = ((Date.now() - start) / 1000).toFixed(1);
  
  printSubHeader('Statistiky');
  console.log(`   ⏱️  Doba: ${duration}s`);
  console.log(`   📦 Cache: ${getCacheSize()} otázek`);
  console.log(`   🎯 Použité odpovědi: ${getUsedAnswersSize()}`);
  
  const validationStats = getValidationStats();
  console.log(`   ✅ Self-Critique PASS: ${validationStats.passedSelfCritique}`);
  console.log(`   ❌ Self-Critique FAIL: ${validationStats.failedSelfCritique}`);
  console.log(`   ✅ Perplexity PASS: ${validationStats.passedPerplexity}`);
  console.log(`   ❌ Perplexity FAIL: ${validationStats.failedPerplexity}`);
}

async function testMode(mode, difficulty, count = 10) {
  const modeNames = {
    adult: '🎓 ADULT (18+)',
    kid: {
      easy: '🐣 EASY (4-6 let)',
      medium: '📚 MEDIUM (7-10 let)',
      hard: '🎒 HARD (11-14 let)'
    }
  };
  
  const modeName = mode === 'kid' ? modeNames.kid[difficulty] : modeNames.adult;
  
  printHeader(`TEST: ${modeName}`);
  
  clearHistory();
  clearQuestionCache();
  resetValidationStats();
  
  console.log(`${c.yellow}Generuji ${count} otázek...${c.reset}\n`);
  
  const start = Date.now();
  const questions = [];
  
  for (let i = 1; i <= count; i++) {
    try {
      const q = await generateQuestion(mode, null, difficulty);
      questions.push(q);
      printQuestion(q, i);
      stats.passed++;
    } catch (error) {
      printError(`Otázka #${i}: ${error.message}`);
      stats.failed++;
    }
    stats.total++;
  }
  
  const duration = ((Date.now() - start) / 1000).toFixed(1);
  
  // Analýza duplicit
  const answers = questions.map(q => q.options[q.correct].toLowerCase());
  const duplicates = answers.filter((a, i) => answers.indexOf(a) !== i);
  
  printSubHeader('Statistiky');
  console.log(`   ⏱️  Doba: ${duration}s (${(duration / count).toFixed(1)}s/otázka)`);
  console.log(`   📦 Cache: ${getCacheSize()} otázek`);
  console.log(`   🎯 Použité odpovědi: ${getUsedAnswersSize()}`);
  console.log(`   🔄 Duplicitní odpovědi: ${duplicates.length}`);
  
  if (duplicates.length > 0) {
    printWarning(`Duplicity: ${[...new Set(duplicates)].join(', ')}`);
  }
  
  const validationStats = getValidationStats();
  console.log(`\n   ${c.cyan}📊 Validace:${c.reset}`);
  console.log(`   ✅ Self-Critique PASS: ${validationStats.passedSelfCritique}`);
  console.log(`   ❌ Self-Critique FAIL: ${validationStats.failedSelfCritique}`);
  console.log(`   ✅ Perplexity PASS: ${validationStats.passedPerplexity}`);
  console.log(`   ❌ Perplexity FAIL: ${validationStats.failedPerplexity}`);
  
  return questions;
}

async function testFullMode() {
  printHeader('🌟 KOMPLETNÍ TEST VŠECH MÓDŮ');
  
  const modes = [
    { mode: 'kid', difficulty: 'easy', name: '🐣 EASY' },
    { mode: 'kid', difficulty: 'medium', name: '📚 MEDIUM' },
    { mode: 'kid', difficulty: 'hard', name: '🎒 HARD' },
    { mode: 'adult', difficulty: 'normal', name: '🎓 ADULT' },
  ];
  
  for (const m of modes) {
    await testMode(m.mode, m.difficulty, 5);
    console.log('\n');
  }
}

async function testDatabase() {
  printHeader('🗄️ TEST DATABÁZE');
  
  try {
    // Inicializace
    questionDatabase.initDatabase();
    connectDatabase(questionDatabase);
    
    printSuccess('Databáze inicializována');
    
    // Statistiky
    const adultCount = questionDatabase.getQuestionCount('adult');
    const kidCount = questionDatabase.getQuestionCount('kid');
    
    console.log(`\n   📊 Statistiky databáze:`);
    console.log(`   🎓 ADULT otázek: ${adultCount}`);
    console.log(`   👶 KID otázek: ${kidCount}`);
    console.log(`   📦 CELKEM: ${adultCount + kidCount}`);
    
    // Test náhodné otázky
    printSubHeader('Náhodná otázka z DB');
    
    const randomQ = questionDatabase.getRandomQuestion('adult');
    if (randomQ) {
      printQuestion(randomQ, 1);
    } else {
      printWarning('Žádné otázky v databázi');
    }
    
    questionDatabase.closeDatabase();
    printSuccess('Test databáze dokončen');
    
  } catch (error) {
    printError(`Chyba databáze: ${error.message}`);
  }
}

async function showStats() {
  printHeader('📊 STATISTIKY VALIDACE');
  
  const validationStats = getValidationStats();
  
  console.log(`   📝 Vygenerováno: ${validationStats.generated}`);
  console.log(`   ✅ Self-Critique PASS: ${validationStats.passedSelfCritique}`);
  console.log(`   ❌ Self-Critique FAIL: ${validationStats.failedSelfCritique}`);
  console.log(`   ✅ Perplexity PASS: ${validationStats.passedPerplexity}`);
  console.log(`   ❌ Perplexity FAIL: ${validationStats.failedPerplexity}`);
  console.log(`   ⏭️  Perplexity SKIP: ${validationStats.skippedPerplexity}`);
  
  const scTotal = validationStats.passedSelfCritique + validationStats.failedSelfCritique;
  const ppxTotal = validationStats.passedPerplexity + validationStats.failedPerplexity;
  
  if (scTotal > 0) {
    const scRate = ((validationStats.passedSelfCritique / scTotal) * 100).toFixed(1);
    console.log(`\n   📈 Self-Critique pass rate: ${scRate}%`);
  }
  
  if (ppxTotal > 0) {
    const ppxRate = ((validationStats.passedPerplexity / ppxTotal) * 100).toFixed(1);
    console.log(`   📈 Perplexity pass rate: ${ppxRate}%`);
  }
}

function printFinalSummary() {
  const duration = ((Date.now() - stats.startTime) / 1000).toFixed(1);
  
  console.log(`\n${c.cyan}${'═'.repeat(60)}${c.reset}`);
  console.log(`${c.bright}${c.cyan}  📋 SOUHRN${c.reset}`);
  console.log(`${c.cyan}${'═'.repeat(60)}${c.reset}`);
  console.log(`   ⏱️  Celková doba: ${duration}s`);
  console.log(`   📝 Celkem otázek: ${stats.total}`);
  console.log(`   ${c.green}✅ Úspěšných: ${stats.passed}${c.reset}`);
  console.log(`   ${c.red}❌ Neúspěšných: ${stats.failed}${c.reset}`);
  
  if (stats.total > 0) {
    const successRate = ((stats.passed / stats.total) * 100).toFixed(1);
    const color = successRate >= 90 ? c.green : successRate >= 70 ? c.yellow : c.red;
    console.log(`   ${color}📈 Úspěšnost: ${successRate}%${c.reset}`);
  }
  console.log(`${c.cyan}${'═'.repeat(60)}${c.reset}\n`);
}

function printHelp() {
  console.log(`
${c.cyan}🧪 TEST AI - Testování generátoru otázek${c.reset}

${c.yellow}Použití:${c.reset}
  node test_ai.js [příkaz]

${c.yellow}Příkazy:${c.reset}
  ${c.green}quick${c.reset}     Rychlý test (5 otázek adult) - ${c.bright}výchozí${c.reset}
  ${c.green}adult${c.reset}     10 otázek pro dospělé
  ${c.green}easy${c.reset}      10 otázek pro děti 4-6 let
  ${c.green}medium${c.reset}    10 otázek pro děti 7-10 let
  ${c.green}hard${c.reset}      10 otázek pro děti 11-14 let
  ${c.green}full${c.reset}      Kompletní test všech módů
  ${c.green}db${c.reset}        Test databáze
  ${c.green}stats${c.reset}     Zobrazení statistik validace
  ${c.green}help${c.reset}      Zobrazení této nápovědy

${c.yellow}Příklady:${c.reset}
  node test_ai.js quick     # Rychlý test
  node test_ai.js adult     # Test dospělých otázek
  node test_ai.js full      # Test všech módů
`);
}

// === 🚀 HLAVNÍ FUNKCE ===

async function main() {
  const command = process.argv[2] || 'quick';
  
  console.log(`\n${c.bright}${c.magenta}🎮 ŠTVANICE - Test AI Generátoru${c.reset}`);
  console.log(`${c.blue}   Sjednocená architektura: LLM + Perplexity${c.reset}\n`);
  
  try {
    switch (command.toLowerCase()) {
      case 'quick':
        await testQuickMode();
        break;
        
      case 'adult':
        await testMode('adult', 'normal', 10);
        break;
        
      case 'easy':
        await testMode('kid', 'easy', 10);
        break;
        
      case 'medium':
        await testMode('kid', 'medium', 10);
        break;
        
      case 'hard':
        await testMode('kid', 'hard', 10);
        break;
        
      case 'full':
        await testFullMode();
        break;
        
      case 'db':
        await testDatabase();
        break;
        
      case 'stats':
        await showStats();
        break;
        
      case 'help':
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
        
      default:
        printError(`Neznámý příkaz: ${command}`);
        printHelp();
        process.exit(1);
    }
    
    printFinalSummary();
    
  } catch (error) {
    printError(`Kritická chyba: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Spuštění
main();
