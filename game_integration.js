/**
 * 🎮 GAME INTEGRATION EXAMPLE
 * 
 * Ukázka jak použít question_generator s databází a background generátorem
 * v reálné herní aplikaci.
 * 
 * Tento soubor ukazuje:
 * - Inicializaci systému
 * - Získávání otázek během hry
 * - Background generování
 * - Správu session
 */

import * as questionGenerator from './question_generator.js';
import * as questionDatabase from './question_database.js';
import { BackgroundGenerator } from './background_generator.js';

/**
 * GameQuestionManager - hlavní třída pro správu otázek ve hře
 */
class GameQuestionManager {
  constructor() {
    this.backgroundGenerator = null;
    this.sessionId = null;
    this.isInitialized = false;
    this.mode = 'adult';
    this.difficulty = 'hard';
  }
  
  /**
   * Inicializace systému
   */
  async initialize(mode = 'adult', difficulty = 'hard') {
    console.log('🎮 Inicializace GameQuestionManager...');
    
    this.mode = mode;
    this.difficulty = difficulty;
    this.sessionId = `game_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    // 1. Inicializace databáze
    try {
      questionDatabase.initDatabase();
      questionGenerator.connectDatabase(questionDatabase);
      console.log('   ✅ Databáze připojena');
    } catch (error) {
      console.warn('   ⚠️ Databáze není dostupná, pokračuji bez ní');
    }
    
    // 2. Inicializace background generatoru
    this.backgroundGenerator = new BackgroundGenerator(questionGenerator, questionDatabase);
    
    // Event handlers
    this.backgroundGenerator.on('generationCompleted', (data) => {
      console.log(`   🔄 [BG] +${data.generated} otázek (cache: ${data.cacheSize})`);
    });
    
    // 3. Kontrola stavu databáze
    const dbCount = questionGenerator.getDatabaseQuestionCount(this.mode);
    console.log(`   📊 Otázek v DB: ${dbCount}`);
    
    // 4. Pokud je málo otázek v DB, začni generovat
    if (dbCount < 100) {
      console.log('   🔄 Spouštím background generování...');
      this.backgroundGenerator.start(this.mode, this.difficulty);
    }
    
    this.isInitialized = true;
    console.log('   ✅ GameQuestionManager připraven\n');
    
    return this;
  }
  
  /**
   * Získá otázku pro hráče
   * 
   * PRIORITA ZDROJŮ:
   * 1. CACHE - čerstvé otázky z posledního batche (PRIMÁRNÍ)
   * 2. DATABÁZE - fallback, per-session deduplikace (hráč nevidí otázku 2x)
   * 3. GENEROVÁNÍ - poslední možnost, trvá dlouho
   * 
   * Background generator běží paralelně a doplňuje cache.
   */
  async getQuestion() {
    if (!this.isInitialized) {
      throw new Error('GameQuestionManager není inicializován. Zavolej initialize() první.');
    }
    
    // Pro EASY mód - vždy z JSON databáze (bez LLM)
    if (this.mode === 'kid' && this.difficulty === 'easy') {
      return await questionGenerator.generateQuestion('kid', null, 'easy');
    }
    
    // === PRIORITA 1: CACHE (čerstvé otázky) ===
    const cacheSize = questionGenerator.getCacheSize();
    
    if (cacheSize > 0) {
      const question = await questionGenerator.generateQuestion(this.mode, null, this.difficulty);
      
      // Pokud cache klesá pod 5, urychlit background generování
      if (cacheSize < 5 && !this.backgroundGenerator.isGenerating) {
        this.backgroundGenerator.forceGenerate();
      }
      
      return question;
    }
    
    // === PRIORITA 2: DATABÁZE (fallback) ===
    // Per-session deduplikace - hráč nevidí stejnou otázku 2x
    if (questionGenerator.isDatabaseConnected()) {
      const dbQuestion = questionGenerator.getQuestionFromDatabase(this.mode, null, this.sessionId);
      
      if (dbQuestion) {
        console.log(`📂 Otázka z DB (cache prázdná)`);
        
        // Spusť background generování pro doplnění cache
        if (!this.backgroundGenerator.isRunning) {
          this.backgroundGenerator.start(this.mode, this.difficulty);
        }
        
        return dbQuestion;
      }
    }
    
    // === PRIORITA 3: GENEROVÁNÍ (poslední možnost) ===
    console.log('⏳ Cache prázdná, DB prázdná/nepřipojená - generuji nové otázky...');
    return await questionGenerator.generateQuestion(this.mode, null, this.difficulty);
  }
  
  /**
   * Získá více otázek najednou (pro prefetch)
   */
  async getQuestions(count = 10) {
    const questions = [];
    
    for (let i = 0; i < count; i++) {
      const q = await this.getQuestion();
      if (q && !q.question.includes('Chyba')) {
        questions.push(q);
      }
    }
    
    return questions;
  }
  
  /**
   * Statistiky
   */
  getStats() {
    return {
      session: this.sessionId,
      mode: this.mode,
      difficulty: this.difficulty,
      ...questionGenerator.getSystemStats(),
      backgroundGenerator: this.backgroundGenerator?.getStats()
    };
  }
  
  /**
   * Změna módu
   */
  setMode(mode, difficulty = 'hard') {
    this.mode = mode;
    this.difficulty = difficulty;
    
    if (this.backgroundGenerator) {
      this.backgroundGenerator.setMode(mode, difficulty);
    }
    
    // Vyčistit cache pro nový mód
    questionGenerator.clearHistory();
  }
  
  /**
   * Ukončení
   */
  shutdown() {
    console.log('🎮 Ukončuji GameQuestionManager...');
    
    if (this.backgroundGenerator) {
      this.backgroundGenerator.stop();
    }
    
    questionDatabase.closeDatabase();
    
    console.log('   ✅ Ukončeno\n');
  }
}

// === PŘÍKLAD POUŽITÍ ===

async function exampleUsage() {
  console.log('═'.repeat(60));
  console.log('  🎮 PŘÍKLAD POUŽITÍ - GameQuestionManager');
  console.log('═'.repeat(60) + '\n');
  
  // 1. Vytvoření a inicializace
  const game = new GameQuestionManager();
  await game.initialize('adult', 'hard');
  
  // 2. Získání otázek
  console.log('📤 Získávám 3 otázky...\n');
  
  for (let i = 1; i <= 3; i++) {
    const q = await game.getQuestion();
    
    console.log(`Otázka ${i}: ${q.question}`);
    console.log(`  A) ${q.options[0]}${q.correct === 0 ? ' ✓' : ''}`);
    console.log(`  B) ${q.options[1]}${q.correct === 1 ? ' ✓' : ''}`);
    console.log(`  C) ${q.options[2]}${q.correct === 2 ? ' ✓' : ''}`);
    console.log();
    
    // Simulace času na odpověď
    await new Promise(r => setTimeout(r, 500));
  }
  
  // 3. Statistiky
  console.log('📊 Statistiky:');
  const stats = game.getStats();
  console.log(`  - Session: ${stats.session}`);
  console.log(`  - Cache: ${stats.cache.size} otázek`);
  console.log(`  - DB: ${stats.database.questionCount} otázek`);
  
  // 4. Ukončení
  game.shutdown();
}

// Export pro použití v aplikaci
export { GameQuestionManager };

// Spuštění příkladu pokud je skript spuštěn přímo
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  exampleUsage().catch(console.error);
}
