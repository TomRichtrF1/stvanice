/**
 * 🧪 TEST AI v3.2 - KOMPLETNÍ DEBUG PRO VYLEPŠENOU ARCHITEKTURU
 * 
 * ZMĚNY v3.2:
 * - Vylepšené příklady náročných otázek
 * - Oddělené role: GROQ (generátor) vs SONAR (fact-checker)
 * - Aktualizovaný test obtížnosti
 * 
 * Spuštění:
 *   node test_ai.js debug       # Detailní test generování + statistiky
 *   node test_ai.js quick       # Rychlý E2E test
 *   node test_ai.js quick kids  # Rychlý test pro děti
 *   node test_ai.js stats       # Pouze výpis statistik
 *   node test_ai.js grammar     # Test gramatických kontrol
 *   node test_ai.js difficulty  # Test kontroly obtížnosti
 */

import dotenv from 'dotenv';
import pg from 'pg';
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

const { Pool } = pg;
const testDbPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
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
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
};

function printHeader(title) {
  console.log(`\n${c.cyan}${'═'.repeat(70)}${c.reset}`);
  console.log(`${c.bright}${c.cyan}  ${title}${c.reset}`);
  console.log(`${c.cyan}${'═'.repeat(70)}${c.reset}\n`);
}

function printSubHeader(title) {
  console.log(`\n${c.yellow}─── ${title} ${'─'.repeat(50 - title.length)}${c.reset}`);
}

// Pomocná funkce pro výpis detailu otázky
function printQuestionDetails(q, indent = '   ') {
  console.log(`${indent}${c.bright}"${q.question}"${c.reset}`);
  
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

// 🆕 Kontrola kvality otázky pro dospělé
function assessQuestionQuality(question) {
  const text = question.question.toLowerCase();
  
  const issues = [];
  
  // Triviální vzory
  const trivialPatterns = [
    { pattern: /jakou barvu má/i, issue: "Triviální (barva)" },
    { pattern: /jaké barvy je/i, issue: "Triviální (barva)" },
    { pattern: /kolik nohou má/i, issue: "Triviální (počítání)" },
    { pattern: /kolik má týden/i, issue: "Triviální (kalendář)" },
    { pattern: /kolik má rok/i, issue: "Triviální (kalendář)" },
    { pattern: /kolik dní má/i, issue: "Triviální (kalendář)" },
    { pattern: /je .+ (zelená|červená|modrá)/i, issue: "Triviální (barva)" },
    { pattern: /která zelenina/i, issue: "Triviální (zelenina)" },
    { pattern: /které ovoce/i, issue: "Triviální (ovoce)" },
    { pattern: /kde žije lední medvěd/i, issue: "Triviální" },
    { pattern: /kdo napsal babičku/i, issue: "Příliš snadné pro ČR" },
    { pattern: /hlavní město (francie|německa|itálie)\?/i, issue: "Příliš snadné (známé hl. město)" },
    { pattern: /ve které zemi jsou pyramidy/i, issue: "Příliš snadné" },
    { pattern: /je mrkev/i, issue: "Triviální" },
    { pattern: /je slunce/i, issue: "Triviální" },
  ];
  
  for (const { pattern, issue } of trivialPatterns) {
    if (pattern.test(text)) {
      issues.push(issue);
    }
  }
  
  // Příliš krátká otázka
  if (text.length < 25) {
    issues.push("Příliš krátká");
  }
  
  // Gramatické chyby
  if (/který planet/i.test(text)) issues.push("Gramatika: 'který planet'");
  if (/jaký je kapitál/i.test(text)) issues.push("Anglicismus: 'kapitál'");
  if (/který země/i.test(text)) issues.push("Gramatika: 'který země'");
  
  // Pozitivní indikátory - náročné kvízové otázky
  const goodIndicators = [];
  if (/ve kterém roce/i.test(text)) goodIndicators.push("Historická");
  if (/kdo (napsal|namaloval|složil|zkomponoval|vynalezl|objevil)/i.test(text)) goodIndicators.push("Autorství/Objev");
  if (/který (prvek|chemick)/i.test(text)) goodIndicators.push("Chemie");
  if (/(mnichovsk|kresčak|lucembursk|habsbur)/i.test(text)) goodIndicators.push("Historie CZ/EU");
  if (/(olympi|mistrovství|nagano)/i.test(text)) goodIndicators.push("Sport");
  if (/(hlavní město).*(myanmaru|austrálie|kanady)/i.test(text)) goodIndicators.push("Zeměpis (náročný)");
  if (/(průliv|poušť atacama|dunaj)/i.test(text)) goodIndicators.push("Zeměpis");
  if (/(třmínek|penicilin|wolfram)/i.test(text)) goodIndicators.push("Věda");
  if (/(guernica|prado|rusalka|bulgakov)/i.test(text)) goodIndicators.push("Umění/Literatura");
  if (/(kneset|zlotý)/i.test(text)) goodIndicators.push("Obecné znalosti");
  
  return {
    isGood: issues.length === 0,
    issues,
    goodIndicators,
    score: goodIndicators.length - issues.length
  };
}

// Výpis statistik jako tabulka
function printStatsTable(stats) {
  printSubHeader('📊 STATISTIKY VALIDACE');
  
  const rows = [
    ['Vygenerováno z LLM', stats.generated || 0, ''],
    ['├─ Strukturální validace', stats.passedStructural || '-', stats.failedStructural || '-'],
    ['├─ 🆕 Kontrola obtížnosti', stats.passedDifficulty || '-', stats.failedDifficulty || '-'],
    ['├─ Česká gramatika', stats.passedGrammar || '-', stats.failedGrammar || '-'],
    ['├─ Lokální validátor', stats.passedLocalValidator || '-', stats.failedLocalValidator || '-'],
    ['├─ Anti-repeat filtr', stats.passedAntiRepeat || '-', stats.failedAntiRepeat || '-'],
    ['└─ Sonar fact-check', stats.passedPerplexity || 0, stats.failedPerplexity || 0],
    ['   (přeskočeno)', stats.skippedPerplexity || 0, ''],
  ];
  
  console.log(`\n   ${'─'.repeat(55)}`);
  console.log(`   ${c.bright}Krok${' '.repeat(28)}Prošlo  Zamítnuto${c.reset}`);
  console.log(`   ${'─'.repeat(55)}`);
  
  for (const [name, passed, failed] of rows) {
    const passedStr = passed !== undefined && passed !== '' && passed !== '-' ? `${c.green}${String(passed).padStart(5)}${c.reset}` : '    -';
    const failedStr = failed !== undefined && failed !== '' && failed !== '-' ? `${c.red}${String(failed).padStart(5)}${c.reset}` : '    -';
    console.log(`   ${name.padEnd(32)} ${passedStr}   ${failedStr}`);
  }
  
  console.log(`   ${'─'.repeat(55)}`);
  
  // Celková úspěšnost
  const total = stats.generated || 1;
  const finalPassed = (stats.passedPerplexity || 0) + (stats.skippedPerplexity || 0);
  const successRate = Math.round((finalPassed / total) * 100);
  
  const rateColor = successRate >= 70 ? c.green : successRate >= 40 ? c.yellow : c.red;
  console.log(`\n   ${c.bright}Celková úspěšnost: ${rateColor}${successRate}%${c.reset} (${finalPassed}/${total})\n`);
}

// === 🐛 HLAVNÍ DEBUG TEST ===
async function runDebugMode() {
  printHeader('🐛 DEBUG MODE v3.1: Kompletní validační pipeline');
  
  console.log(`${c.dim}Připojuji k databázi...${c.reset}`);
  const connected = await connectDatabase(questionDatabase);
  if (!connected) {
    console.log(`${c.yellow}⚠️ DB nedostupná, pokračuji v LLM-only módu${c.reset}`);
  }

  const categories = [
    { id: 'adult', name: '👔 DOSPĚLÍ', expectedDifficulty: 'náročné' },
    { id: 'student', name: '🎒 ŠKOLÁCI', expectedDifficulty: 'střední' },
    { id: 'kids', name: '🐣 DĚTI', expectedDifficulty: 'jednoduché' }
  ];

  for (const cat of categories) {
    printSubHeader(`TEST: ${cat.name} (očekáváno: ${cat.expectedDifficulty})`);
    resetValidationStats();
    
    const dbMode = cat.id === 'adult' ? 'adult' : 'kid'; 
    let countBefore = 0;
    
    if (connected) {
      try {
        const countQuery = await testDbPool.query('SELECT COUNT(*) FROM questions WHERE mode = $1', [dbMode]);
        countBefore = parseInt(countQuery.rows[0].count);
      } catch (e) {}
    }

    const startTime = Date.now();
    
    // Spustíme generování
    await preWarmCache(`debug_${cat.id}_${Date.now()}`, cat.id);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    // Počet nových v DB
    let countAfter = countBefore;
    if (connected) {
      try {
        const countQueryAfter = await testDbPool.query('SELECT COUNT(*) FROM questions WHERE mode = $1', [dbMode]);
        countAfter = parseInt(countQueryAfter.rows[0].count);
      } catch (e) {}
    }
    const diff = countAfter - countBefore;

    // Výpis statistik
    const stats = getValidationStats();
    printStatsTable(stats);

    // Výpis historie validace
    const history = getValidationHistory();
    const approved = history.filter(h => h.status === 'APPROVED');
    const rejected = history.filter(h => h.status === 'REJECTED');

    // === SCHVÁLENÉ OTÁZKY ===
    if (approved.length > 0) {
      console.log(`${c.green}✅ SCHVÁLENO (${approved.length}):${c.reset}`);
      approved.forEach((h, i) => {
        console.log(`\n   ${c.dim}[${i + 1}]${c.reset}`);
        printQuestionDetails(h);
        
        // 🆕 Hodnocení kvality pro dospělé
        if (cat.id === 'adult') {
          const quality = assessQuestionQuality(h);
          if (quality.goodIndicators.length > 0) {
            console.log(`   ${c.green}   ✓ ${quality.goodIndicators.join(', ')}${c.reset}`);
          }
          if (quality.issues.length > 0) {
            console.log(`   ${c.yellow}   ⚠️ ${quality.issues.join(', ')}${c.reset}`);
          }
        }
      });
    }

    // === ZAMÍTNUTÉ OTÁZKY ===
    if (rejected.length > 0) {
      console.log(`\n${c.red}❌ ZAMÍTNUTO (${rejected.length}):${c.reset}`);
      rejected.forEach((h, i) => {
        console.log(`\n   ${c.dim}[${i + 1}]${c.reset}`);
        printQuestionDetails(h);
        console.log(`   ${c.red}→ Důvod: ${h.reason}${c.reset}`);
      });
    }

    // === SOUHRN ===
    console.log(`\n${c.cyan}───────────────────────────────────────────────────${c.reset}`);
    console.log(`   ⏱️  Čas: ${duration}s`);
    console.log(`   💾 Nově uloženo do DB: ${diff > 0 ? c.green : c.yellow}${diff}${c.reset}`);
    
    // Kontrola v DB
    if (diff > 0 && connected) {
      console.log(`\n   ${c.bright}📋 Poslední přidané do DB:${c.reset}`);
      try {
        const newQs = await testDbPool.query(`
          SELECT id, question FROM questions 
          WHERE mode = $1 
          ORDER BY id DESC 
          LIMIT $2
        `, [dbMode, Math.min(diff, 3)]);

        newQs.rows.forEach((q) => {
          console.log(`      ${c.dim}[ID: ${q.id}]${c.reset} ${q.question.substring(0, 60)}...`);
        });
      } catch (e) {}
    }
  }

  // Úklid
  try { questionDatabase.closeDatabase(); } catch (e) {}
  try { await testDbPool.end(); } catch (e) {}
}

// === 🚀 RYCHLÝ TEST ===
async function runQuickTest() {
  printHeader('🚀 RYCHLÝ TEST: End-to-End simulace hráče');
  
  await connectDatabase(questionDatabase);
  
  const testSessionId = `quick_test_${Date.now()}`;
  const ageGroup = process.argv[3] || 'adult';

  console.log(`${c.yellow}⏳ Generuji otázky pro kategorii: ${ageGroup}...${c.reset}\n`);
  
  await preWarmCache(testSessionId, ageGroup);
  
  console.log(`\n${c.green}✅ Cache naplněna. Simuluji 5 kol hry:${c.reset}\n`);

  let goodQuestions = 0;
  let trivialQuestions = 0;

  for (let round = 1; round <= 5; round++) {
    const result = await generateQuestion(testSessionId, ageGroup);
    
    if (result._error || result._emergency) {
      console.log(`${c.red}❌ Kolo ${round}: Chyba - ${result.question}${c.reset}`);
      continue;
    }
    
    const sourceIcon = result._fromLLM ? '⚡' : '🗄️';
    const sourceText = result._fromLLM ? 'LLM' : 'DB';
    const sourceColor = result._fromLLM ? c.blue : c.magenta;

    console.log(`${c.cyan}━━━ KOLO ${round} ━━━${c.reset}`);
    console.log(`   ${c.bright}${result.question}${c.reset}`);
    console.log(`   ${c.dim}Zdroj: ${sourceIcon} ${sourceColor}${sourceText}${c.reset}`);
    
    result.options.forEach((opt, index) => {
      const isCorrect = index === result.correct;
      const letter = String.fromCharCode(65 + index);
      
      if (isCorrect) {
        console.log(`   ${c.green}✅ ${letter}) ${opt}${c.reset}`);
      } else {
        console.log(`   ${c.dim}   ${letter}) ${opt}${c.reset}`);
      }
    });
    
    // 🆕 Hodnocení kvality
    if (ageGroup === 'adult') {
      const quality = assessQuestionQuality(result);
      if (quality.isGood) {
        goodQuestions++;
        if (quality.goodIndicators.length > 0) {
          console.log(`   ${c.green}✓ Kvalitní: ${quality.goodIndicators.join(', ')}${c.reset}`);
        }
      } else {
        trivialQuestions++;
        console.log(`   ${c.yellow}⚠️ Problémy: ${quality.issues.join(', ')}${c.reset}`);
      }
    }
    
    console.log('');
  }

  // 🆕 Souhrn kvality pro dospělé
  if (ageGroup === 'adult') {
    printSubHeader('📊 HODNOCENÍ KVALITY');
    const qualityRate = Math.round((goodQuestions / 5) * 100);
    const qualityColor = qualityRate >= 80 ? c.green : qualityRate >= 50 ? c.yellow : c.red;
    console.log(`   Kvalitní otázky: ${qualityColor}${qualityRate}%${c.reset} (${goodQuestions}/5)`);
    if (trivialQuestions > 0) {
      console.log(`   ${c.yellow}⚠️ Triviální/problematické: ${trivialQuestions}${c.reset}`);
    }
  }

  // Statistiky
  const stats = getValidationStats();
  if (stats.generated > 0) {
    printStatsTable(stats);
  }

  try { questionDatabase.closeDatabase(); } catch (e) {}
  try { await testDbPool.end(); } catch (e) {}
}

// === 🆕 TEST KONTROLY OBTÍŽNOSTI ===
async function runDifficultyTest() {
  printHeader('🎯 TEST KONTROLY OBTÍŽNOSTI v3.2');
  
  console.log(`${c.dim}Tento test ověřuje, že filtr správně blokuje triviální otázky a propouští náročné.${c.reset}\n`);
  
  // Simulované otázky pro testování filtru
  const testQuestions = [
    // ═══════════════════════════════════════════════════════════
    // ❌ ZAMÍTNOUT - Triviální (zná každé dítě)
    // ═══════════════════════════════════════════════════════════
    { q: "Jakou barvu má tráva?", expected: false, reason: "Triviální - barva" },
    { q: "Jakou barvu má obloha?", expected: false, reason: "Triviální - barva" },
    { q: "Kolik nohou má pes?", expected: false, reason: "Triviální - počítání" },
    { q: "Kolik má týden dní?", expected: false, reason: "Triviální - kalendář" },
    { q: "Která zelenina je oranžová?", expected: false, reason: "Triviální - zelenina" },
    { q: "Které ovoce je žluté?", expected: false, reason: "Triviální - ovoce" },
    { q: "Je Slunce hvězda?", expected: false, reason: "Triviální - základní fakt" },
    { q: "Kde žije lední medvěd?", expected: false, reason: "Triviální - základní fakt" },
    
    // ═══════════════════════════════════════════════════════════
    // ❌ ZAMÍTNOUT - Příliš snadné pro dospělé
    // ═══════════════════════════════════════════════════════════
    { q: "Kdo napsal Babičku?", expected: false, reason: "Příliš snadné pro ČR" },
    { q: "Jaké je hlavní město Francie?", expected: false, reason: "Příliš snadné (Paříž)" },
    { q: "Ve které zemi jsou pyramidy v Gíze?", expected: false, reason: "Příliš snadné (Egypt)" },
    
    // ═══════════════════════════════════════════════════════════
    // ✅ SCHVÁLIT - Náročné kvízové otázky (HISTORIE)
    // ═══════════════════════════════════════════════════════════
    { q: "Ve kterém roce byla podepsána Mnichovská dohoda?", expected: true, reason: "Historie - 1938" },
    { q: "Který římský císař nechal postavit Koloseum?", expected: true, reason: "Historie - Vespasián" },
    { q: "Ve které bitvě zemřel Jan Lucemburský?", expected: true, reason: "Historie - Kresčak" },
    { q: "Jak se jmenoval první československý prezident?", expected: true, reason: "Historie - Masaryk" },
    
    // ═══════════════════════════════════════════════════════════
    // ✅ SCHVÁLIT - Náročné kvízové otázky (ZEMĚPIS)
    // ═══════════════════════════════════════════════════════════
    { q: "Která řeka protéká nejvíce státy světa?", expected: true, reason: "Zeměpis - Dunaj" },
    { q: "Jaké je hlavní město Myanmaru?", expected: true, reason: "Zeměpis - Naypyidaw" },
    { q: "Ve které zemi leží poušť Atacama?", expected: true, reason: "Zeměpis - Chile" },
    { q: "Který průliv odděluje Evropu od Afriky?", expected: true, reason: "Zeměpis - Gibraltarský" },
    
    // ═══════════════════════════════════════════════════════════
    // ✅ SCHVÁLIT - Náročné kvízové otázky (VĚDA)
    // ═══════════════════════════════════════════════════════════
    { q: "Který prvek má v periodické tabulce značku W?", expected: true, reason: "Chemie - Wolfram" },
    { q: "Jak se nazývá nejmenší kost v lidském těle?", expected: true, reason: "Anatomie - Třmínek" },
    { q: "Kdo objevil penicilin?", expected: true, reason: "Věda - Fleming" },
    
    // ═══════════════════════════════════════════════════════════
    // ✅ SCHVÁLIT - Náročné kvízové otázky (UMĚNÍ/SPORT)
    // ═══════════════════════════════════════════════════════════
    { q: "Který malíř namaloval Guernici?", expected: true, reason: "Umění - Picasso" },
    { q: "Kdo zkomponoval operu Rusalka?", expected: true, reason: "Hudba - Dvořák" },
    { q: "Ve kterém městě se nachází muzeum Prado?", expected: true, reason: "Umění - Madrid" },
    { q: "Ve kterém roce se konaly první zimní olympijské hry?", expected: true, reason: "Sport - 1924" },
    { q: "Ve kterém roce vyhráli čeští hokejisté v Naganu?", expected: true, reason: "Sport - 1998" },
  ];
  
  // Funkce pro kontrolu obtížnosti (kopie z generátoru)
  const checkDifficulty = (question) => {
    const text = question.toLowerCase();
    
    const trivialPatterns = [
      /jakou barvu má/i,
      /jaké barvy je/i,
      /kolik (má|dní|měsíců|hodin|minut)/i,
      /kolik nohou má/i,
      /kolik je \d+\s*[+\-*/]\s*\d+/i,
      /je .+ (zelená|červená|modrá|žlutá)/i,
      /která zelenina/i,
      /které ovoce/i,
      /je mrkev/i,
      /je slunce/i,
      /kolik má týden/i,
      /kolik má rok/i,
      /kde žije lední medvěd/i,
      /kdo napsal babičku/i,
      /hlavní město (francie|německa|itálie)\?/i,
      /ve které zemi jsou pyramidy/i,
    ];
    
    for (const pattern of trivialPatterns) {
      if (pattern.test(text)) {
        return { passes: false, reason: "Triviální vzor" };
      }
    }
    
    if (text.length < 20) {
      return { passes: false, reason: "Příliš krátká" };
    }
    
    return { passes: true, reason: "" };
  };
  
  let passed = 0;
  let failed = 0;
  
  console.log(`${c.bright}Testování filtru triviálních otázek:${c.reset}\n`);
  
  for (const { q, expected, reason } of testQuestions) {
    const result = checkDifficulty(q);
    const actualResult = result.passes;
    const isCorrect = actualResult === expected;
    
    if (isCorrect) {
      passed++;
      const icon = expected ? '✅' : '🚫';
      const color = expected ? c.green : c.yellow;
      console.log(`${icon} ${color}"${q.substring(0, 50)}..."${c.reset}`);
      console.log(`   ${c.dim}→ Správně ${expected ? 'PROŠLA' : 'ZAMÍTNUTA'} (${reason})${c.reset}`);
    } else {
      failed++;
      console.log(`${c.red}❌ "${q.substring(0, 50)}..."${c.reset}`);
      console.log(`   ${c.red}→ Měla být ${expected ? 'SCHVÁLENA' : 'ZAMÍTNUTA'}, ale byla ${actualResult ? 'SCHVÁLENA' : 'ZAMÍTNUTA'}${c.reset}`);
      if (result.reason) {
        console.log(`   ${c.dim}   Důvod filtru: ${result.reason}${c.reset}`);
      }
    }
    console.log('');
  }
  
  // Souhrn
  printSubHeader('📊 VÝSLEDKY TESTU');
  const successRate = Math.round((passed / testQuestions.length) * 100);
  const rateColor = successRate >= 90 ? c.green : successRate >= 70 ? c.yellow : c.red;
  
  console.log(`   Úspěšnost filtru: ${rateColor}${successRate}%${c.reset} (${passed}/${testQuestions.length})`);
  
  if (failed > 0) {
    console.log(`   ${c.red}⚠️ ${failed} testů selhalo - filtr potřebuje úpravu${c.reset}`);
  } else {
    console.log(`   ${c.green}✅ Všechny testy prošly!${c.reset}`);
  }
}

// === 🇨🇿 TEST GRAMATIKY ===
async function runGrammarTest() {
  printHeader('🇨🇿 TEST GRAMATICKÝCH KONTROL');
  
  // Příklady špatných otázek
  const testCases = [
    { q: "Který planet je nejblíže Slunci?", expected: 'FAIL', reason: 'Špatný rod' },
    { q: "Která planeta je nejblíže Slunci?", expected: 'PASS', reason: '' },
    { q: "Jaký je kapitál Česka?", expected: 'FAIL', reason: 'Anglicismus' },
    { q: "Jaké je hlavní město Česka?", expected: 'PASS', reason: '' },
    { q: "Který země má nejvíce obyvatel?", expected: 'FAIL', reason: 'Špatný rod' },
    { q: "Která země má nejvíce obyvatel?", expected: 'PASS', reason: '' },
    { q: "Který moře je největší?", expected: 'FAIL', reason: 'Špatný rod' },
    { q: "Které moře je největší?", expected: 'PASS', reason: '' },
    { q: "Kolik má týden dní", expected: 'FAIL', reason: 'Chybí otazník' },
    { q: "Kolik má týden dní?", expected: 'PASS', reason: '' },
  ];
  
  const checkGrammar = (question) => {
    const errors = [];
    
    const badPatterns = [
      { pattern: /který planet/i, reason: "Špatný rod (planeta je ž.r.)" },
      { pattern: /jaký je kapitál/i, reason: "Anglicismus" },
      { pattern: /který země/i, reason: "Špatný rod (země je ž.r.)" },
      { pattern: /který moře/i, reason: "Špatný rod (moře je s.r.)" },
      { pattern: /který řeka/i, reason: "Špatný rod (řeka je ž.r.)" },
    ];
    
    for (const { pattern, reason } of badPatterns) {
      if (pattern.test(question)) {
        errors.push(reason);
      }
    }
    
    if (!/[?]$/.test(question.trim()) && !/^(kdo|co|kde|kdy|jak|proč|který|která|které|jaký|jaká|jaké|kolik)/i.test(question)) {
      errors.push("Chybí otazník");
    }
    
    return { valid: errors.length === 0, errors };
  };
  
  let passed = 0;
  let failed = 0;
  
  for (const { q, expected, reason } of testCases) {
    const result = checkGrammar(q);
    const actualResult = result.valid ? 'PASS' : 'FAIL';
    const isCorrect = actualResult === expected;
    
    if (isCorrect) {
      passed++;
      console.log(`${c.green}✅${c.reset} "${q.substring(0, 40)}..." → ${actualResult}`);
    } else {
      failed++;
      console.log(`${c.red}❌${c.reset} "${q.substring(0, 40)}..." → ${actualResult} (očekáváno: ${expected})`);
      if (result.errors.length > 0) {
        console.log(`   ${c.dim}Důvod: ${result.errors.join(', ')}${c.reset}`);
      }
    }
  }
  
  console.log(`\n${c.bright}Výsledek: ${passed}/${testCases.length} testů prošlo${c.reset}`);
}

// === 📊 POUZE STATISTIKY Z DB ===
async function runStatsOnly() {
  printHeader('📊 STATISTIKY DATABÁZE');
  
  if (!process.env.DATABASE_URL) {
    console.log(`${c.red}❌ DATABASE_URL není nastavena${c.reset}`);
    return;
  }
  
  try {
    // Celkový počet otázek
    const totalQuery = await testDbPool.query('SELECT COUNT(*) FROM questions');
    console.log(`   📚 Celkem otázek: ${c.bright}${totalQuery.rows[0].count}${c.reset}`);
    
    // Podle módu
    const modeQuery = await testDbPool.query(`
      SELECT mode, COUNT(*) as count 
      FROM questions 
      GROUP BY mode
    `);
    console.log(`\n   ${c.dim}Podle módu:${c.reset}`);
    modeQuery.rows.forEach(row => {
      console.log(`      ${row.mode}: ${row.count}`);
    });
    
    // Podle use_count
    const usageQuery = await testDbPool.query(`
      SELECT 
        CASE 
          WHEN use_count = 0 THEN 'Nepoužité'
          WHEN use_count <= 3 THEN '1-3x použité'
          ELSE '4x+ použité'
        END as usage,
        COUNT(*) as count
      FROM questions
      GROUP BY 
        CASE 
          WHEN use_count = 0 THEN 'Nepoužité'
          WHEN use_count <= 3 THEN '1-3x použité'
          ELSE '4x+ použité'
        END
    `);
    console.log(`\n   ${c.dim}Podle použití:${c.reset}`);
    usageQuery.rows.forEach(row => {
      console.log(`      ${row.usage}: ${row.count}`);
    });
    
    // Poslední přidané
    const recentQuery = await testDbPool.query(`
      SELECT question, created_at 
      FROM questions 
      ORDER BY id DESC 
      LIMIT 5
    `);
    console.log(`\n   ${c.dim}Poslední přidané:${c.reset}`);
    recentQuery.rows.forEach(row => {
      const date = new Date(row.created_at).toLocaleString('cs-CZ');
      console.log(`      ${c.dim}[${date}]${c.reset} ${row.question.substring(0, 50)}...`);
    });
    
    // Used answers tracking
    try {
      const answersQuery = await testDbPool.query(`
        SELECT COUNT(*) FROM used_answers 
        WHERE used_at > NOW() - INTERVAL '3 hours'
      `);
      console.log(`\n   🚫 Blokované odpovědi (3h): ${answersQuery.rows[0].count}`);
    } catch (e) {
      // Tabulka nemusí existovat
    }
    
  } catch (e) {
    console.error(`${c.red}❌ Chyba: ${e.message}${c.reset}`);
  }
  
  await testDbPool.end();
}

// === MAIN ===
async function main() {
  const command = process.argv[2] || 'help';
  
  console.log(`${c.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  console.log(`${c.bright}  🧪 ŠTVANICE Test Suite v3.2${c.reset}`);
  console.log(`${c.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  
  try {
    switch (command) {
      case 'debug': 
        await runDebugMode(); 
        break;
      case 'quick': 
        await runQuickTest(); 
        break;
      case 'stats': 
        await runStatsOnly(); 
        break;
      case 'grammar': 
        await runGrammarTest(); 
        break;
      case 'difficulty':  // 🆕
        await runDifficultyTest(); 
        break;
      default: 
        console.log(`
${c.yellow}Použití:${c.reset}
  node test_ai.js debug       ${c.dim}# Detailní test generování + statistiky${c.reset}
  node test_ai.js quick       ${c.dim}# Rychlý E2E test (default: adult)${c.reset}
  node test_ai.js quick kids  ${c.dim}# Rychlý test pro děti${c.reset}
  node test_ai.js stats       ${c.dim}# Pouze statistiky z DB${c.reset}
  node test_ai.js grammar     ${c.dim}# Test gramatických kontrol${c.reset}
  ${c.cyan}node test_ai.js difficulty${c.reset}  ${c.dim}# 🆕 Test kontroly obtížnosti${c.reset}
`);
    }
  } catch (err) { 
    console.error(`${c.red}❌ Chyba:${c.reset}`, err); 
  }
}

main();
