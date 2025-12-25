import { 
  generateQuestion, 
  initializeBatch,
  getCacheSize,
  clearHistory, 
  getHistorySize,
  getEntityHistorySize,
  validatePremiumTopic 
} from './question_generator.js';

// === 🎨 POMOCNÉ FUNKCE ===

function printSeparator() {
  console.log("═".repeat(75));
}

function printTestHeader(title, emoji) {
  console.log("\n");
  printSeparator();
  console.log(`${emoji} ${title}`);
  printSeparator();
}

function printSubHeader(title) {
  console.log(`\n--- ${title} ---\n`);
}

function printQuestion(questionData, index) {
  console.log(`\n📝 OTÁZKA #${index}:`);
  console.log(`   ${questionData.question}`);
  console.log(`   Možnosti:`);
  questionData.options.forEach((opt, i) => {
    const marker = i === questionData.correct ? "✅" : "  ";
    console.log(`   ${marker} ${String.fromCharCode(65 + i)}) ${opt}`);
  });
}

function printQuestionCompact(questionData, index) {
  console.log(`   ${index}. ${questionData.question}`);
  questionData.options.forEach((opt, i) => {
    const marker = i === questionData.correct ? "✅" : "  ";
    console.log(`      ${marker} ${String.fromCharCode(65 + i)}) ${opt}`);
  });
}

function checkForSpoilers(questionData) {
  const lowerQuestion = questionData.question.toLowerCase();
  const correctAnswer = questionData.options[questionData.correct].toLowerCase();
  const words = correctAnswer.split(/\s+/);
  
  for (const word of words) {
    if (word.length > 4 && lowerQuestion.includes(word)) {
      return true;
    }
  }
  return false;
}

function checkForDuplicates(questions) {
  const duplicates = [];
  for (let i = 0; i < questions.length; i++) {
    for (let j = i + 1; j < questions.length; j++) {
      const q1 = questions[i].question.toLowerCase();
      const q2 = questions[j].question.toLowerCase();
      
      if (q1 === q2) {
        duplicates.push({ 
          index1: i + 1, 
          index2: j + 1, 
          question: questions[i].question 
        });
      }
    }
  }
  return duplicates;
}

function checkForSimilarQuestions(questions, threshold = 0.5) {
  const similar = [];
  
  for (let i = 0; i < questions.length; i++) {
    for (let j = i + 1; j < questions.length; j++) {
      const words1 = new Set(questions[i].question.toLowerCase().split(/\s+/).filter(w => w.length > 3));
      const words2 = new Set(questions[j].question.toLowerCase().split(/\s+/).filter(w => w.length > 3));
      
      if (words1.size === 0 || words2.size === 0) continue;
      
      const intersection = new Set([...words1].filter(x => words2.has(x)));
      const similarity = intersection.size / Math.max(words1.size, words2.size);
      
      if (similarity > threshold) {
        similar.push({
          index1: i + 1,
          index2: j + 1,
          similarity: (similarity * 100).toFixed(0) + "%",
          q1: questions[i].question,
          q2: questions[j].question
        });
      }
    }
  }
  return similar;
}

function extractEntities(questions) {
  const entities = [];
  
  for (const q of questions) {
    const text = q.question + " " + q.options.join(" ");
    const matches = text.match(/\b[A-ZČŘŠŽÝÁÍÉÚŮ][a-zčřšžýáíéúůěň]{3,}(?:\s+[A-ZČŘŠŽÝÁÍÉÚŮ][a-zčřšžýáíéúůěň]+)*/g);
    if (matches) {
      entities.push(...matches);
    }
  }
  
  return entities;
}

function countEntityRepetitions(entities) {
  const counts = {};
  entities.forEach(e => {
    const lower = e.toLowerCase();
    counts[lower] = (counts[lower] || 0) + 1;
  });
  
  return Object.entries(counts)
    .filter(([_, count]) => count > 2)
    .sort((a, b) => b[1] - a[1]);
}

// === 📊 STATISTIKY ===

class TestStats {
  constructor() {
    this.totalQuestions = 0;
    this.duplicates = 0;
    this.spoilers = 0;
    this.similarPairs = 0;
    this.apiCalls = 0;
    this.errors = 0;
    this.testResults = [];
  }
  
  addResult(testName, passed, details = "") {
    this.testResults.push({ testName, passed, details });
  }
  
  printSummary() {
    printTestHeader("📊 CELKOVÉ VÝSLEDKY", "🏁");
    
    console.log(`\n📈 STATISTIKY:`);
    console.log(`   Celkem otázek:     ${this.totalQuestions}`);
    console.log(`   API volání:        ${this.apiCalls}`);
    console.log(`   Duplicity:         ${this.duplicates}`);
    console.log(`   Spoilery:          ${this.spoilers}`);
    console.log(`   Podobné páry:      ${this.similarPairs}`);
    console.log(`   Chyby:             ${this.errors}`);
    
    console.log(`\n📋 VÝSLEDKY TESTŮ:`);
    let passed = 0;
    let failed = 0;
    
    this.testResults.forEach(r => {
      const icon = r.passed ? "✅" : "❌";
      console.log(`   ${icon} ${r.testName}`);
      if (r.details) console.log(`      ${r.details}`);
      if (r.passed) passed++; else failed++;
    });
    
    console.log(`\n🎯 CELKOVÝ VÝSLEDEK: ${passed}/${passed + failed} testů prošlo`);
    
    if (failed === 0) {
      console.log(`\n🎉 PERFEKTNÍ! Všechny testy prošly!`);
    } else if (failed <= 2) {
      console.log(`\n✨ DOBRÉ! Jen drobné nedostatky.`);
    } else {
      console.log(`\n⚠️  VAROVÁNÍ: Systém potřebuje další ladění.`);
    }
  }
}

// === 🚀 HLAVNÍ TESTY ===

async function runTest() {
  const stats = new TestStats();
  
  console.log("\n");
  printTestHeader("🎮 ŠTVANICE v3.0 - TEST NOVÉ ARCHITEKTURY", "🚀");
  console.log("Testování: Groq Llama + Batch generování + Kategorie/Aspekty\n");
  console.log("Model: llama-3.3-70b-versatile");
  console.log("Provider: Groq\n");

  try {
    // ============================================
    // TEST 1: ZDARMA ADULT BATCH
    // ============================================
    printTestHeader("TEST #1: ZDARMA ADULT - Batch 12 otázek", "🎲");
    console.log("Cíl: Vygenerovat batch 12 otázek z MIXU kategorií\n");
    
    clearHistory();
    const startTime1 = Date.now();
    
    const success1 = await initializeBatch('general', 'adult');
    stats.apiCalls++;
    
    const duration1 = Date.now() - startTime1;
    console.log(`⏱️  Doba generování: ${duration1}ms`);
    
    if (!success1) {
      console.log("❌ Batch selhal!");
      stats.errors++;
      stats.addResult("ZDARMA ADULT Batch", false, "Inicializace selhala");
    } else {
      const cacheSize = getCacheSize();
      console.log(`📦 Cache size: ${cacheSize} otázek`);
      
      const adultQuestions = [];
      for (let i = 1; i <= Math.min(cacheSize, 12); i++) {
        const q = await generateQuestion('general', 'adult');
        printQuestionCompact(q, i);
        adultQuestions.push(q);
        stats.totalQuestions++;
        if (checkForSpoilers(q)) stats.spoilers++;
      }
      
      // Kontroly
      const dups = checkForDuplicates(adultQuestions);
      const similar = checkForSimilarQuestions(adultQuestions);
      stats.duplicates += dups.length;
      stats.similarPairs += similar.length;
      
      if (dups.length > 0) {
        console.log(`\n⚠️  Nalezeny duplicity: ${dups.length}`);
      }
      if (similar.length > 0) {
        console.log(`\n⚠️  Podobné otázky: ${similar.length}`);
        similar.forEach(s => console.log(`      #${s.index1} ~ #${s.index2} (${s.similarity})`));
      }
      
      const passed = dups.length === 0 && adultQuestions.length >= 10;
      stats.addResult("ZDARMA ADULT Batch", passed, 
        `${adultQuestions.length} otázek, ${dups.length} duplicit, ${duration1}ms`);
    }

    // ============================================
    // TEST 2: ZDARMA JUNIOR BATCH
    // ============================================
    printTestHeader("TEST #2: ZDARMA JUNIOR - Batch 12 otázek", "👶");
    console.log("Cíl: Vygenerovat batch 12 otázek pro děti\n");
    
    clearHistory();
    const startTime2 = Date.now();
    
    const success2 = await initializeBatch('general', 'kid');
    stats.apiCalls++;
    
    const duration2 = Date.now() - startTime2;
    console.log(`⏱️  Doba generování: ${duration2}ms`);
    
    if (!success2) {
      console.log("❌ Batch selhal!");
      stats.errors++;
      stats.addResult("ZDARMA JUNIOR Batch", false, "Inicializace selhala");
    } else {
      const juniorQuestions = [];
      const cacheSize = getCacheSize();
      
      for (let i = 1; i <= Math.min(cacheSize, 12); i++) {
        const q = await generateQuestion('general', 'kid');
        printQuestionCompact(q, i);
        juniorQuestions.push(q);
        stats.totalQuestions++;
        if (checkForSpoilers(q)) stats.spoilers++;
      }
      
      const dups = checkForDuplicates(juniorQuestions);
      stats.duplicates += dups.length;
      
      const passed = dups.length === 0 && juniorQuestions.length >= 10;
      stats.addResult("ZDARMA JUNIOR Batch", passed,
        `${juniorQuestions.length} otázek, ${dups.length} duplicit, ${duration2}ms`);
    }

    // ============================================
    // TEST 3: PREMIUM BATCH - Formula 1
    // ============================================
    printTestHeader("TEST #3: PREMIUM - Téma 'Formula 1'", "🏎️");
    console.log("Cíl: 12 otázek o F1, každá o jiném ASPEKTU\n");
    
    clearHistory();
    const startTime3 = Date.now();
    
    const success3 = await initializeBatch('Formula 1', 'adult');
    stats.apiCalls++;
    
    const duration3 = Date.now() - startTime3;
    console.log(`⏱️  Doba generování: ${duration3}ms`);
    
    if (!success3) {
      console.log("❌ Batch selhal!");
      stats.errors++;
      stats.addResult("PREMIUM F1 Batch", false, "Inicializace selhala");
    } else {
      const f1Questions = [];
      const cacheSize = getCacheSize();
      
      for (let i = 1; i <= Math.min(cacheSize, 12); i++) {
        const q = await generateQuestion('Formula 1', 'adult');
        printQuestionCompact(q, i);
        f1Questions.push(q);
        stats.totalQuestions++;
        if (checkForSpoilers(q)) stats.spoilers++;
      }
      
      // Kontrola diverzity entit
      const entities = extractEntities(f1Questions);
      const repeated = countEntityRepetitions(entities);
      
      if (repeated.length > 0) {
        console.log(`\n⚠️  Opakované entity (>2×):`);
        repeated.forEach(([entity, count]) => {
          console.log(`      "${entity}": ${count}×`);
        });
      }
      
      const dups = checkForDuplicates(f1Questions);
      stats.duplicates += dups.length;
      
      const passed = dups.length === 0 && repeated.length <= 2 && f1Questions.length >= 10;
      stats.addResult("PREMIUM F1 Batch", passed,
        `${f1Questions.length} otázek, ${repeated.length} opakovaných entit`);
    }

    // ============================================
    // TEST 4: PREMIUM JUNIOR - České pohádky
    // ============================================
    printTestHeader("TEST #4: PREMIUM JUNIOR - Téma 'České pohádky'", "🏰");
    console.log("Cíl: 12 otázek o českých pohádkách pro děti\n");
    
    clearHistory();
    const startTime4 = Date.now();
    
    const success4 = await initializeBatch('České pohádky', 'kid');
    stats.apiCalls++;
    
    const duration4 = Date.now() - startTime4;
    console.log(`⏱️  Doba generování: ${duration4}ms`);
    
    if (!success4) {
      console.log("❌ Batch selhal!");
      stats.errors++;
      stats.addResult("PREMIUM JUNIOR Batch", false, "Inicializace selhala");
    } else {
      const pohadkyQuestions = [];
      const cacheSize = getCacheSize();
      
      for (let i = 1; i <= Math.min(cacheSize, 12); i++) {
        const q = await generateQuestion('České pohádky', 'kid');
        printQuestionCompact(q, i);
        pohadkyQuestions.push(q);
        stats.totalQuestions++;
      }
      
      const dups = checkForDuplicates(pohadkyQuestions);
      stats.duplicates += dups.length;
      
      const passed = dups.length === 0 && pohadkyQuestions.length >= 10;
      stats.addResult("PREMIUM JUNIOR Batch", passed,
        `${pohadkyQuestions.length} otázek, ${duration4}ms`);
    }

    // ============================================
    // TEST 5: VALIDACE PREMIUM TÉMAT
    // ============================================
    printTestHeader("TEST #5: VALIDACE PREMIUM TÉMAT", "🔍");
    console.log("Cíl: Ověřit frontend validaci edge cases\n");
    
    const testCases = [
      { topic: "", expected: false, desc: "Prázdné téma" },
      { topic: "ab", expected: false, desc: "Příliš krátké (2 znaky)" },
      { topic: "F1", expected: false, desc: "Příliš krátké (2 znaky)" },
      { topic: "Formula 1", expected: true, desc: "Validní téma" },
      { topic: "Historie italské kuchyně", expected: true, desc: "Validní dlouhé téma" },
      { topic: "12345", expected: false, desc: "Pouze čísla" },
      { topic: "@#$%^", expected: false, desc: "Speciální znaky" },
      { topic: "a".repeat(60), expected: false, desc: "Příliš dlouhé (60 znaků)" },
      { topic: "Současný evropský fotbal", expected: true, desc: "Validní téma" },
    ];
    
    let validationPassed = 0;
    let validationFailed = 0;
    
    for (const tc of testCases) {
      const result = validatePremiumTopic(tc.topic);
      const passed = result.isValid === tc.expected;
      
      const icon = passed ? "✅" : "❌";
      const status = result.isValid ? "VALID" : "INVALID";
      console.log(`   ${icon} "${tc.topic.substring(0, 30)}${tc.topic.length > 30 ? '...' : ''}" → ${status}`);
      console.log(`      ${tc.desc}`);
      
      if (passed) validationPassed++; else validationFailed++;
    }
    
    console.log(`\n📊 Validace: ${validationPassed}/${testCases.length} správně`);
    stats.addResult("Validace témat", validationFailed === 0,
      `${validationPassed}/${testCases.length} správně`);

    // ============================================
    // TEST 6: ANTI-REPEAT NAPŘÍČ BATCHI
    // ============================================
    printTestHeader("TEST #6: ANTI-REPEAT NAPŘÍČ 2 BATCHI", "🔄");
    console.log("Cíl: Ověřit, že se entity neopakují mezi batchi\n");
    
    clearHistory();
    
    // První batch
    console.log("📦 Batch #1:");
    await initializeBatch('general', 'adult');
    stats.apiCalls++;
    
    const batch1 = [];
    for (let i = 0; i < 6; i++) {
      const q = await generateQuestion('general', 'adult');
      batch1.push(q);
      stats.totalQuestions++;
    }
    console.log(`   Vygenerováno ${batch1.length} otázek`);
    
    // Druhý batch (bez clearHistory!)
    console.log("\n📦 Batch #2 (bez mazání historie):");
    await initializeBatch('general', 'adult');
    stats.apiCalls++;
    
    const batch2 = [];
    for (let i = 0; i < 6; i++) {
      const q = await generateQuestion('general', 'adult');
      batch2.push(q);
      stats.totalQuestions++;
    }
    console.log(`   Vygenerováno ${batch2.length} otázek`);
    
    // Kontrola napříč batchi
    const allFromBothBatches = [...batch1, ...batch2];
    const crossDups = checkForDuplicates(allFromBothBatches);
    const crossSimilar = checkForSimilarQuestions(allFromBothBatches, 0.6);
    
    console.log(`\n📊 Historie: ${getHistorySize()} otázek, ${getEntityHistorySize()} entit`);
    console.log(`   Duplicity napříč batchi: ${crossDups.length}`);
    console.log(`   Podobné napříč batchi: ${crossSimilar.length}`);
    
    stats.duplicates += crossDups.length;
    stats.similarPairs += crossSimilar.length;
    
    const passed6 = crossDups.length === 0;
    stats.addResult("Anti-repeat napříč batchi", passed6,
      `${crossDups.length} duplicit, ${crossSimilar.length} podobných`);

    // ============================================
    // TEST 7: RYCHLOST - CACHE VS NOVÝ BATCH
    // ============================================
    printTestHeader("TEST #7: RYCHLOST - CACHE VS API", "⚡");
    console.log("Cíl: Porovnat rychlost čtení z cache vs API call\n");
    
    clearHistory();
    
    // Měření API call
    const apiStart = Date.now();
    await initializeBatch('general', 'adult');
    const apiDuration = Date.now() - apiStart;
    stats.apiCalls++;
    
    console.log(`   🌐 API call (12 otázek): ${apiDuration}ms`);
    
    // Měření čtení z cache
    const cacheStart = Date.now();
    for (let i = 0; i < 5; i++) {
      await generateQuestion('general', 'adult');
      stats.totalQuestions++;
    }
    const cacheDuration = Date.now() - cacheStart;
    
    console.log(`   💾 Cache read (5 otázek): ${cacheDuration}ms`);
    console.log(`   📊 Průměr z cache: ${(cacheDuration / 5).toFixed(1)}ms/otázka`);
    console.log(`   📊 Průměr z API: ${(apiDuration / 12).toFixed(1)}ms/otázka`);
    
    const speedImprovement = apiDuration / 12 / (cacheDuration / 5 || 1);
    console.log(`   🚀 Cache je ${speedImprovement.toFixed(0)}× rychlejší`);
    
    stats.addResult("Rychlost cache", cacheDuration < apiDuration,
      `Cache: ${cacheDuration}ms vs API: ${apiDuration}ms`);

    // ============================================
    // FINÁLNÍ VÝSLEDKY
    // ============================================
    stats.printSummary();
    
    printSeparator();
    console.log("\n✅ Test dokončen!\n");

  } catch (error) {
    console.error("\n❌ KRITICKÁ CHYBA:");
    console.error(error.message);
    console.error(error.stack);
    stats.errors++;
    stats.printSummary();
    process.exit(1);
  }
}

// === 🎬 SPUŠTĚNÍ ===
console.log("⏳ Spouštím testy nové architektury...\n");
console.log("📌 Požadavky:");
console.log("   - GROQ_API_KEY v .env souboru");
console.log("   - npm install groq-sdk\n");

runTest();
