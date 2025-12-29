/**
 * 🔍 TEST: Chain-of-Verification Pipeline v2
 * 
 * Testuje novou validační pipeline s rozdělenými odpovědnostmi:
 * 
 * 1. Groq generuje otázky
 * 2. Groq Self-Critique kontroluje FORMÁLNÍ kvalitu:
 *    - Gramatika
 *    - Srozumitelnost
 *    - Zjevná nejednoznačnost (všechny 3 odpovědi správné)
 *    - Kvalita distraktorů
 * 3. Perplexity ověřuje FAKTA:
 *    - Je odpověď fakticky správná?
 *    - Nejsou i ostatní možnosti správné?
 */

import { 
  generateQuestion, 
  clearHistory, 
  getValidationStats, 
  resetValidationStats 
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

function printStats(stats) {
  console.log(`${COLORS.magenta}📊 STATISTIKY VALIDACE:${COLORS.reset}`);
  console.log(`   Vygenerováno celkem:     ${stats.generated}`);
  console.log();
  console.log(`   ${COLORS.cyan}Self-Critique (formální):${COLORS.reset}`);
  console.log(`     PASS:  ${COLORS.green}${stats.passedSelfCritique}${COLORS.reset}`);
  console.log(`     FAIL:  ${COLORS.red}${stats.failedSelfCritique}${COLORS.reset}`);
  console.log();
  console.log(`   ${COLORS.cyan}Perplexity (fakta):${COLORS.reset}`);
  console.log(`     PASS:  ${COLORS.green}${stats.passedPerplexity}${COLORS.reset}`);
  console.log(`     FAIL:  ${COLORS.red}${stats.failedPerplexity}${COLORS.reset}`);
  console.log(`     SKIP:  ${stats.skippedPerplexity}`);
  
  const scTotal = stats.passedSelfCritique + stats.failedSelfCritique;
  const scRate = scTotal > 0 ? ((stats.passedSelfCritique / scTotal) * 100).toFixed(1) : 0;
  
  const ppxTotal = stats.passedPerplexity + stats.failedPerplexity;
  const ppxRate = ppxTotal > 0 ? ((stats.passedPerplexity / ppxTotal) * 100).toFixed(1) : 0;
  
  console.log();
  console.log(`   ${COLORS.cyan}Úspěšnost Self-Critique:${COLORS.reset} ${scRate}%`);
  console.log(`   ${COLORS.cyan}Úspěšnost Perplexity:${COLORS.reset}    ${ppxRate}%`);
}

async function runTest() {
  printHeader('🔍 TEST: Chain-of-Verification Pipeline v2');
  
  console.log('📌 Konfigurace:');
  console.log('   - Mode: ADULT');
  console.log('   - Self-Critique: Groq - kontroluje FORMÁLNÍ kvalitu');
  console.log('     (gramatika, srozumitelnost, zjevná nejednoznačnost)');
  console.log('   - Fact-Check: Perplexity - ověřuje FAKTA online');
  console.log('     (faktická správnost, jednoznačnost odpovědi)');
  console.log('   - Počet otázek: 5\n');
  
  // Reset
  clearHistory();
  resetValidationStats();
  
  const questions = [];
  const startTime = Date.now();
  
  // Generuj 5 otázek
  for (let i = 1; i <= 5; i++) {
    console.log(`${COLORS.cyan}--- Generuji otázku ${i}/5 ---${COLORS.reset}`);
    
    try {
      const q = await generateQuestion('adult');
      
      if (q && q.question !== "Nepodařilo se načíst otázku. Zkuste to znovu.") {
        questions.push(q);
        printQuestion(q, i);
      } else {
        console.log(`${COLORS.red}❌ Otázka ${i} se nepodařila vygenerovat${COLORS.reset}\n`);
      }
    } catch (error) {
      console.error(`${COLORS.red}❌ Chyba: ${error.message}${COLORS.reset}\n`);
    }
  }
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  
  // Výsledky
  printHeader('📋 VÝSLEDKY TESTU');
  
  console.log(`⏱️  Čas: ${elapsed}s`);
  console.log(`📤 Úspěšně vygenerováno: ${questions.length}/5 otázek\n`);
  
  // Statistiky validace
  const stats = getValidationStats();
  printStats(stats);
  
  // Shrnutí
  printHeader('✅ TEST DOKONČEN');
  
  const scTotal = stats.passedSelfCritique + stats.failedSelfCritique;
  const scRate = scTotal > 0 ? ((stats.passedSelfCritique / scTotal) * 100).toFixed(1) : 0;
  
  if (questions.length >= 4) {
    console.log(`${COLORS.green}✅ Pipeline funguje! Vygenerováno ${questions.length}/5 validních otázek.${COLORS.reset}`);
  } else {
    console.log(`${COLORS.yellow}⚠️ Nízký počet otázek (${questions.length}/5). Zkontroluj API klíče a logy.${COLORS.reset}`);
  }
  
  console.log();
  console.log(`${COLORS.cyan}📈 Self-Critique úspěšnost: ${scRate}%${COLORS.reset}`);
  if (parseFloat(scRate) < 30) {
    console.log(`${COLORS.yellow}   ⚠️ Stále nízká - možná další úprava promptu${COLORS.reset}`);
  } else if (parseFloat(scRate) >= 50) {
    console.log(`${COLORS.green}   ✅ Dobrá úspěšnost!${COLORS.reset}`);
  }
  
  console.log(`\n${COLORS.cyan}💡 Tip: Projdi si otázky výše a ověř jejich kvalitu manuálně.${COLORS.reset}\n`);
}

// Spuštění
runTest().catch(console.error);
