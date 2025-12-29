/**
 * 🔄 BACKGROUND GENERATOR - Generování otázek na pozadí
 * 
 * Funkce:
 * - Generuje otázky na pozadí během hry
 * - Automaticky doplňuje cache
 * - Ukládá validované otázky do databáze
 * 
 * Použití:
 *   import { BackgroundGenerator } from './background_generator.js';
 *   const bg = new BackgroundGenerator();
 *   bg.start('adult');
 *   // ... hra běží ...
 *   bg.stop();
 */

import { EventEmitter } from 'events';

// Konfigurace
const CONFIG = {
  // Minimální počet otázek v cache - pod tímto začne generovat
  minCacheSize: 10,
  
  // Cílový počet otázek v cache (pro info)
  targetCacheSize: 30,
  
  // Interval kontroly cache (ms)
  checkInterval: 5000,
  
  // Pauza mezi batch generováními (ms) - aby nezatěžovalo API
  batchCooldown: 10000,
  
  // Maximální počet souběžných generování
  maxConcurrentGenerations: 1,
};

/**
 * Background Generator Class
 */
export class BackgroundGenerator extends EventEmitter {
  constructor(questionGenerator, questionDatabase) {
    super();
    
    this.generator = questionGenerator;  // Reference na question_generator modul
    this.database = questionDatabase;    // Reference na question_database modul
    
    this.isRunning = false;
    this.currentMode = 'adult';
    this.currentDifficulty = 'hard';
    
    this.intervalId = null;
    this.isGenerating = false;
    this.lastGenerationTime = 0;
    
    this.stats = {
      totalGenerated: 0,
      totalSaved: 0,
      generationRuns: 0,
      errors: 0
    };
  }
  
  /**
   * Spustí background generování
   */
  start(mode = 'adult', difficulty = 'hard') {
    if (this.isRunning) {
      console.log('⚠️ Background generator již běží');
      return;
    }
    
    this.currentMode = mode;
    this.currentDifficulty = difficulty;
    this.isRunning = true;
    
    console.log(`🔄 Background Generator spuštěn (mode: ${mode}, difficulty: ${difficulty})`);
    
    // Okamžitá kontrola
    this._checkAndGenerate();
    
    // Pravidelná kontrola
    this.intervalId = setInterval(() => {
      this._checkAndGenerate();
    }, CONFIG.checkInterval);
    
    this.emit('started', { mode, difficulty });
  }
  
  /**
   * Zastaví background generování
   */
  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    console.log(`🛑 Background Generator zastaven`);
    console.log(`   📊 Stats: ${this.stats.totalGenerated} vygenerováno, ${this.stats.totalSaved} uloženo, ${this.stats.errors} chyb`);
    
    this.emit('stopped', this.stats);
  }
  
  /**
   * Kontrola a případné generování
   * 
   * LOGIKA:
   * - Background generator VŽDY generuje NOVÉ otázky (nikdy nebere z DB)
   * - Pokud cache klesne pod minimum, spustí generování
   * - DB je fallback POUZE pro game_integration.js (přímý přístup), ne pro BG
   */
  async _checkAndGenerate() {
    // Už generujeme?
    if (this.isGenerating) {
      return;
    }
    
    // Cooldown mezi generováními
    const now = Date.now();
    if (now - this.lastGenerationTime < CONFIG.batchCooldown) {
      return;
    }
    
    // Zkontroluj stav cache
    const cacheSize = this.generator.getCacheSize();
    
    // Pokud je cache pod minimem, generuj nové
    if (cacheSize < CONFIG.minCacheSize) {
      await this._generateBatch();
    }
  }
  
  /**
   * Generuje nový batch otázek
   */
  async _generateBatch() {
    this.isGenerating = true;
    this.lastGenerationTime = Date.now();
    this.stats.generationRuns++;
    
    console.log(`\n🔄 [BG] Spouštím generování batche na pozadí...`);
    this.emit('generationStarted');
    
    try {
      // Zavolej generátor
      const result = await this.generator.generateAndValidateBatch(
        this.currentMode, 
        null, 
        this.currentDifficulty
      );
      
      if (result.questions && result.questions.length > 0) {
        this.stats.totalGenerated += result.questions.length;
        
        // Ulož do databáze
        const saved = this.database.saveQuestions(result.questions, this.currentMode);
        this.stats.totalSaved += saved;
        
        // Přidej do cache
        this.generator.addToCache(result.questions);
        
        console.log(`✅ [BG] Batch dokončen: ${result.questions.length} otázek (${saved} nových v DB)`);
        this.emit('generationCompleted', { 
          generated: result.questions.length, 
          saved,
          cacheSize: this.generator.getCacheSize()
        });
      } else {
        console.log(`⚠️ [BG] Batch nevygeneroval žádné otázky`);
        this.emit('generationEmpty');
      }
      
    } catch (error) {
      this.stats.errors++;
      console.error(`❌ [BG] Chyba při generování: ${error.message}`);
      this.emit('generationError', error);
    }
    
    this.isGenerating = false;
  }
  
  /**
   * Vrátí session ID pro tracking
   */
  _getSessionId() {
    if (!this._sessionId) {
      this._sessionId = `bg_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    }
    return this._sessionId;
  }
  
  /**
   * Vrátí statistiky
   */
  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      isGenerating: this.isGenerating,
      currentMode: this.currentMode,
      currentDifficulty: this.currentDifficulty,
      cacheSize: this.generator?.getCacheSize() || 0,
      dbCount: this.database?.getQuestionCount(this.currentMode) || 0
    };
  }
  
  /**
   * Manuální trigger generování
   */
  async forceGenerate() {
    if (this.isGenerating) {
      console.log('⚠️ Generování již probíhá');
      return false;
    }
    
    await this._generateBatch();
    return true;
  }
  
  /**
   * Nastaví mód a obtížnost
   */
  setMode(mode, difficulty = 'hard') {
    this.currentMode = mode;
    this.currentDifficulty = difficulty;
    console.log(`🔄 Background Generator: mode=${mode}, difficulty=${difficulty}`);
  }
}

/**
 * Singleton instance pro snadné použití
 */
let _instance = null;

export function getBackgroundGenerator(questionGenerator, questionDatabase) {
  if (!_instance) {
    _instance = new BackgroundGenerator(questionGenerator, questionDatabase);
  }
  return _instance;
}

export function stopBackgroundGenerator() {
  if (_instance) {
    _instance.stop();
  }
}

export { CONFIG as BG_CONFIG };
