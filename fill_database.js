/**
 * 🔄 FILL DATABASE - Automatické plnění databáze otázkami
 * 
 * SJEDNOCENÁ ARCHITEKTURA - LLM + Perplexity pro VŠECHNY MÓDY
 * 
 * Spuštění:
 *   node fill_database.js                    # Výchozí: adult
 *   node fill_database.js adult              # Dospělí
 *   node fill_database.js easy               # Děti 4-6 let
 *   node fill_database.js medium             # Děti 7-10 let
 *   node fill_database.js hard               # Děti 11-14 let
 *   node fill_database.js all                # Všechny módy postupně
 * 
 * Zastavení: Ctrl+C
 */

import * as questionGenerator from './question_generator.js';
import * as questionDatabase from './question_database.js';

// === KONFIGURACE PRO KAŽDÝ MÓD ===
const MODE_CONFIGS = {
  adult: {
    mode: 'adult',
    difficulty: 'normal',
    targetQuestions: 2000,  // ✅ Sníženo z 5000
    description: '🎓 ADULT (18+)',
    dbMode: 'adult'
  },
  easy: {
    mode: 'kid',
    difficulty: 'easy',
    targetQuestions: 1000,  // ✅ Sníženo z 3000
    description: '🐣 EASY (4-6 let)',
    dbMode: 'kid'
  },
  medium: {
    mode: 'kid',
    difficulty: 'medium',
    targetQuestions: 1000,  // ✅ Sníženo z 3000
    description: '📚 MEDIUM (7-10 let)',
    dbMode: 'kid'
  },
  hard: {
    mode: 'kid',
    difficulty: 'hard',
    targetQuestions: 1000,  // ✅ Sníženo z 3000
    description: '🎒 HARD (11-14 let)',
    dbMode: 'kid'
  }
};

// === GLOBÁLNÍ KONFIGURACE ===
const GLOBAL_CONFIG = {
  pauseBetweenBatches: 30000,       // Pauza mezi batchi (ms) - 30 sekund
  maxBatchesPerSession: 200,        // Maximální počet batchů (pojistka)
};

// === AKTUÁLNÍ KONFIGURACE ===
let currentConfig = null;

// === STATISTIKY ===
let stats = {
  startTime: Date.now(),
  batchesGenerated: 0,
  totalQuestionsGenerated: 0,
  totalQuestionsSaved: 0,
  errors: 0,
};

function resetStats() {
  stats = {
    startTime: Date.now(),
    batchesGenerated: 0,
    totalQuestionsGenerated: 0,
    totalQuestionsSaved: 0,
    errors: 0,
  };
}

function printStats() {
  const elapsed = Math.round((Date.now() - stats.startTime) / 1000 / 60);
  const dbCount = questionDatabase.getQuestionCount(currentConfig.dbMode);
  
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📊 STATISTIKY - ${currentConfig.description} (běží ${elapsed} min)`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`   Batchů vygenerováno:  ${stats.batchesGenerated}`);
  console.log(`   Otázek vygenerováno:  ${stats.totalQuestionsGenerated}`);
  console.log(`   Otázek uloženo:       ${stats.totalQuestionsSaved}`);
  console.log(`   Chyb:                 ${stats.errors}`);
  console.log(`   ─────────────────────────────────`);
  console.log(`   📦 OTÁZEK V DATABÁZI: ${dbCount}`);
  console.log(`   🎯 CÍL:               ${currentConfig.targetQuestions}`);
  console.log(`${'═'.repeat(60)}\n`);
}

async function generateOneBatch() {
  console.log(`\n🔄 Generuji batch #${stats.batchesGenerated + 1} pro ${currentConfig.description}...`);
  
  try {
    const result = await questionGenerator.generateAndValidateBatch(
      currentConfig.mode,
      null,
      currentConfig.difficulty
    );
    
    stats.batchesGenerated++;
    stats.totalQuestionsGenerated += result.questions?.length || 0;
    
    // Počet uložených (saveQuestions vypisuje do konzole)
    if (result.questions && result.questions.length > 0) {
      stats.totalQuestionsSaved += result.questions.length;
    }
    
    console.log(`✅ Batch #${stats.batchesGenerated} dokončen: ${result.questions?.length || 0} otázek`);
    
    return { success: true, count: result.questions?.length || 0 };
    
  } catch (error) {
    stats.errors++;
    console.error(`❌ Chyba při generování: ${error.message}`);
    
    // 🛑 KRITICKÁ CHYBA - zastavit proces při jakékoliv chybě Perplexity
    if (error.message.includes('PERPLEXITY_FATAL')) {
      console.error(`\n${'🛑'.repeat(30)}`);
      console.error(`🛑 KRITICKÁ CHYBA API - ZASTAVUJI PROCES`);
      console.error(`🛑 Důvod: ${error.message}`);
      console.error(`🛑 Zkontroluj API klíč v .env souboru!`);
      console.error(`${'🛑'.repeat(30)}\n`);
      return { success: false, fatal: true, error: error.message };
    }
    
    return { success: false, fatal: false, count: 0 };
  }
}

async function runForMode(modeKey) {
  currentConfig = MODE_CONFIGS[modeKey];
  if (!currentConfig) {
    console.error(`❌ Neznámý mód: ${modeKey}`);
    console.log(`Dostupné módy: ${Object.keys(MODE_CONFIGS).join(', ')}, all`);
    return false;
  }
  
  resetStats();
  
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🚀 FILL DATABASE - ${currentConfig.description}`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`   Mode:        ${currentConfig.mode}`);
  console.log(`   Difficulty:  ${currentConfig.difficulty}`);
  console.log(`   Cíl:         ${currentConfig.targetQuestions} otázek`);
  console.log(`   Pauza:       ${GLOBAL_CONFIG.pauseBetweenBatches / 1000}s mezi batchi`);
  console.log(`${'═'.repeat(60)}\n`);
  
  const initialCount = questionDatabase.getQuestionCount(currentConfig.dbMode);
  console.log(`📦 Aktuální počet otázek (${currentConfig.dbMode}): ${initialCount}`);
  
  if (initialCount >= currentConfig.targetQuestions) {
    console.log(`✅ Cíl již splněn! (${initialCount} >= ${currentConfig.targetQuestions})`);
    return true;
  }
  
  console.log(`\n⏳ Začínám generování... (Ctrl+C pro zastavení)\n`);
  
  // Hlavní smyčka
  for (let i = 0; i < GLOBAL_CONFIG.maxBatchesPerSession; i++) {
    // Kontrola cíle
    const currentCount = questionDatabase.getQuestionCount(currentConfig.dbMode);
    if (currentCount >= currentConfig.targetQuestions) {
      console.log(`\n🎉 CÍL SPLNĚN! ${currentCount} otázek v databázi.`);
      break;
    }
    
    // Generuj batch
    const result = await generateOneBatch();
    
    // 🛑 KRITICKÁ CHYBA - okamžitě zastavit
    if (result.fatal) {
      console.log(`\n🛑 PROCES ZASTAVEN KVŮLI KRITICKÉ CHYBĚ`);
      printStats();
      return false;
    }
    
    // Statistiky každých 5 batchů
    if ((i + 1) % 5 === 0) {
      printStats();
    }
    
    // Pauza před dalším batchem
    if (i < GLOBAL_CONFIG.maxBatchesPerSession - 1) {
      const remaining = currentConfig.targetQuestions - questionDatabase.getQuestionCount(currentConfig.dbMode);
      console.log(`⏸️ Pauza ${GLOBAL_CONFIG.pauseBetweenBatches / 1000}s... (zbývá ~${remaining} otázek do cíle)`);
      await new Promise(r => setTimeout(r, GLOBAL_CONFIG.pauseBetweenBatches));
    }
  }
  
  // Finální statistiky
  printStats();
  return true;
}

async function main() {
  // Parsuj argument příkazové řádky
  const modeArg = process.argv[2] || 'adult';
  
  // Inicializace databáze
  console.log('🗄️ Inicializuji databázi...');
  questionDatabase.initDatabase();
  questionGenerator.connectDatabase(questionDatabase);
  
  if (modeArg === 'all') {
    // Spusť pro všechny módy postupně
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`🌟 GENEROVÁNÍ PRO VŠECHNY MÓDY`);
    console.log(`${'═'.repeat(60)}`);
    
    const modes = ['easy', 'medium', 'hard', 'adult'];
    for (const mode of modes) {
      const success = await runForMode(mode);
      if (!success) {
        console.log(`\n⚠️ Mód ${mode} selhal, zastavuji.`);
        break;
      }
      console.log(`\n${'─'.repeat(60)}\n`);
    }
  } else {
    // Spusť pro jeden mód
    await runForMode(modeArg);
  }
  
  console.log('🏁 Hotovo!');
  questionDatabase.closeDatabase();
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n⚠️ Zastavuji...');
  if (currentConfig) {
    printStats();
  }
  questionDatabase.closeDatabase();
  process.exit(0);
});

// Spuštění
main().catch(console.error);
