import { 
  generateQuestion, 
  initializeBatch,
  getCacheSize,
  clearHistory,
  getUsedAnswersSize
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

function checkForDuplicateAnswers(questions) {
  const duplicates = [];
  const seenAnswers = new Map();
  
  for (let i = 0; i < questions.length; i++) {
    const correctAnswer = questions[i].options[questions[i].correct].toLowerCase().trim();
    
    if (seenAnswers.has(correctAnswer)) {
      duplicates.push({
        index1: seenAnswers.get(correctAnswer) + 1,
        index2: i + 1,
        answer: correctAnswer
      });
    } else {
      seenAnswers.set(correctAnswer, i);
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
    this.duplicateQuestions = 0;
    this.duplicateAnswers = 0;
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
    console.log(`   Celkem otázek:        ${this.totalQuestions}`);
    console.log(`   API volání:           ${this.apiCalls}`);
    console.log(`   Duplicitní otázky:    ${this.duplicateQuestions}`);
    console.log(`   Duplicitní odpovědi:  ${this.duplicateAnswers}`);
    console.log(`   Spoilery:             ${this.spoilers}`);
    console.log(`   Podobné páry:         ${this.similarPairs}`);
    console.log(`   Chyby:                ${this.errors}`);
    
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
  printTestHeader("🎮 ŠTVANICE v4.0 - TEST ZJEDNODUŠENÉ ARCHITEKTURY", "🚀");
  console.log("Testování: Groq Llama + Batch generování + Rozšířené kategorie\n");
  console.log("Model: llama-3.3-70b-versatile");
  console.log("Provider: Groq");
  console.log("Režimy: ADULT (12 kategorií), JUNIOR (8 kategorií)\n");

  try {
    // ============================================
    // TEST 1: ADULT BATCH (24 otázek)
    // ============================================
    printTestHeader("TEST #1: ADULT MODE - Batch 24 otázek", "🎲");
    console.log("Cíl: Vygenerovat batch 24 otázek z 12 kategorií pro dospělé\n");
    console.log("Kategorie: Motorsport, Týmové sporty, Film, Hudba, Historie,");
    console.log("           Zeměpis, Věda, Gastronomie, Literatura, Umění,");
    console.log("           Zvířata a příroda, Byznys\n");
    
    clearHistory();
    const startTime1 = Date.now();
    
    const success1 = await initializeBatch('adult');
    stats.apiCalls++;
    
    const duration1 = Date.now() - startTime1;
    console.log(`⏱️  Doba generování: ${duration1}ms`);
    
    if (!success1) {
      console.log("❌ Batch selhal!");
      stats.errors++;
      stats.addResult("ADULT Batch", false, "Inicializace selhala");
    } else {
      const cacheSize = getCacheSize();
      console.log(`📦 Cache size: ${cacheSize} otázek\n`);
      
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
      const dupAnswers = checkForDuplicateAnswers(adultQuestions);
      const similar = checkForSimilarQuestions(adultQuestions);
      stats.duplicateQuestions += dups.length;
      stats.duplicateAnswers += dupAnswers.length;
      stats.similarPairs += similar.length;
      
      console.log(`\n📊 Analýza kvality:`);
      console.log(`   Duplicitní otázky: ${dups.length}`);
      console.log(`   Duplicitní odpovědi: ${dupAnswers.length}`);
      console.log(`   Podobné otázky: ${similar.length}`);
      console.log(`   Použité odpovědi v historii: ${getUsedAnswersSize()}`);
      
      if (dupAnswers.length > 0) {
        console.log(`\n⚠️  Nalezeny duplicitní odpovědi:`);
        dupAnswers.forEach(d => console.log(`      #${d.index1} a #${d.index2}: "${d.answer}"`));
      }
      
      const passed = dups.length === 0 && dupAnswers.length === 0 && adultQuestions.length >= 10;
      stats.addResult("ADULT Batch", passed,
        `${adultQuestions.length} otázek, ${dups.length} dup. otázek, ${dupAnswers.length} dup. odpovědí, ${duration1}ms`);
    }

    // ============================================
    // TEST 2: JUNIOR BATCH (24 otázek)
    // ============================================
    printTestHeader("TEST #2: JUNIOR MODE - Batch 24 otázek", "👶");
    console.log("Cíl: Vygenerovat batch 24 otázek z 8 kategorií pro děti 8-14 let\n");
    console.log("Kategorie: Zvířata, Pohádky a filmy, Lidské tělo, Svět kolem nás,");
    console.log("           Vesmír, Sport pro děti, Věda pro děti, Historie pro děti\n");
    
    clearHistory();
    const startTime2 = Date.now();
    
    const success2 = await initializeBatch('kid');
    stats.apiCalls++;
    
    const duration2 = Date.now() - startTime2;
    console.log(`⏱️  Doba generování: ${duration2}ms`);
    
    if (!success2) {
      console.log("❌ Batch selhal!");
      stats.errors++;
      stats.addResult("JUNIOR Batch", false, "Inicializace selhala");
    } else {
      const cacheSize = getCacheSize();
      console.log(`📦 Cache size: ${cacheSize} otázek\n`);
      
      const juniorQuestions = [];
      for (let i = 1; i <= Math.min(cacheSize, 12); i++) {
        const q = await generateQuestion('general', 'kid');
        printQuestionCompact(q, i);
        juniorQuestions.push(q);
        stats.totalQuestions++;
        if (checkForSpoilers(q)) stats.spoilers++;
      }
      
      const dups = checkForDuplicates(juniorQuestions);
      const dupAnswers = checkForDuplicateAnswers(juniorQuestions);
      stats.duplicateQuestions += dups.length;
      stats.duplicateAnswers += dupAnswers.length;
      
      console.log(`\n📊 Analýza kvality:`);
      console.log(`   Duplicitní otázky: ${dups.length}`);
      console.log(`   Duplicitní odpovědi: ${dupAnswers.length}`);
      console.log(`   Použité odpovědi v historii: ${getUsedAnswersSize()}`);
      
      const passed = dups.length === 0 && dupAnswers.length === 0 && juniorQuestions.length >= 10;
      stats.addResult("JUNIOR Batch", passed,
        `${juniorQuestions.length} otázek, ${dups.length} dup. otázek, ${dupAnswers.length} dup. odpovědí, ${duration2}ms`);
    }

    // ============================================
    // TEST 3: ANTI-REPEAT NAPŘÍČ BATCHI
    // ============================================
    printTestHeader("TEST #3: ANTI-REPEAT NAPŘÍČ 2 BATCHI", "🔄");
    console.log("Cíl: Ověřit, že se odpovědi neopakují mezi batchi (tvrdá validace)\n");
    
    clearHistory();
    
    // První batch
    console.log("📦 Batch #1:");
    await initializeBatch('adult');
    stats.apiCalls++;
    
    const batch1 = [];
    for (let i = 0; i < 8; i++) {
      const q = await generateQuestion('general', 'adult');
      batch1.push(q);
      stats.totalQuestions++;
    }
    console.log(`   Vygenerováno ${batch1.length} otázek`);
    console.log(`   Použité odpovědi: ${getUsedAnswersSize()}`);
    
    // Druhý batch (BEZ clearHistory - odpovědi by se neměly opakovat!)
    console.log("\n📦 Batch #2 (bez mazání historie odpovědí):");
    await initializeBatch('adult');
    stats.apiCalls++;
    
    const batch2 = [];
    for (let i = 0; i < 8; i++) {
      const q = await generateQuestion('general', 'adult');
      batch2.push(q);
      stats.totalQuestions++;
    }
    console.log(`   Vygenerováno ${batch2.length} otázek`);
    console.log(`   Použité odpovědi: ${getUsedAnswersSize()}`);
    
    // Kontrola napříč batchi
    const allFromBothBatches = [...batch1, ...batch2];
    const crossDupQuestions = checkForDuplicates(allFromBothBatches);
    const crossDupAnswers = checkForDuplicateAnswers(allFromBothBatches);
    const crossSimilar = checkForSimilarQuestions(allFromBothBatches, 0.6);
    
    console.log(`\n📊 Výsledky cross-batch analýzy:`);
    console.log(`   Duplicitní otázky napříč batchi: ${crossDupQuestions.length}`);
    console.log(`   Duplicitní odpovědi napříč batchi: ${crossDupAnswers.length}`);
    console.log(`   Podobné otázky napříč batchi: ${crossSimilar.length}`);
    
    if (crossDupAnswers.length > 0) {
      console.log(`\n⚠️  Nalezeny duplicitní odpovědi napříč batchi:`);
      crossDupAnswers.forEach(d => console.log(`      #${d.index1} a #${d.index2}: "${d.answer}"`));
    }
    
    stats.duplicateQuestions += crossDupQuestions.length;
    stats.duplicateAnswers += crossDupAnswers.length;
    stats.similarPairs += crossSimilar.length;
    
    const passed3 = crossDupAnswers.length === 0;
    stats.addResult("Anti-repeat napříč batchi", passed3,
      `${crossDupAnswers.length} duplicitních odpovědí, ${crossSimilar.length} podobných otázek`);

    // ============================================
    // TEST 4: RYCHLOST - CACHE VS API
    // ============================================
    printTestHeader("TEST #4: RYCHLOST - CACHE VS API", "⚡");
    console.log("Cíl: Porovnat rychlost čtení z cache vs API call\n");
    
    clearHistory();
    
    // Měření API call
    const apiStart = Date.now();
    await initializeBatch('adult');
    const apiDuration = Date.now() - apiStart;
    stats.apiCalls++;
    
    console.log(`   🌐 API call (24 otázek): ${apiDuration}ms`);
    
    // Měření čtení z cache
    const cacheStart = Date.now();
    for (let i = 0; i < 10; i++) {
      await generateQuestion('general', 'adult');
      stats.totalQuestions++;
    }
    const cacheDuration = Date.now() - cacheStart;
    
    console.log(`   💾 Cache read (10 otázek): ${cacheDuration}ms`);
    console.log(`   📊 Průměr z cache: ${(cacheDuration / 10).toFixed(1)}ms/otázka`);
    console.log(`   📊 Průměr z API: ${(apiDuration / 24).toFixed(1)}ms/otázka`);
    
    const speedImprovement = (apiDuration / 24) / ((cacheDuration / 10) || 1);
    console.log(`   🚀 Cache je ${speedImprovement.toFixed(0)}× rychlejší`);
    
    stats.addResult("Rychlost cache", cacheDuration < apiDuration,
      `Cache: ${cacheDuration}ms vs API: ${apiDuration}ms`);

    // ============================================
    // TEST 5: SIMULACE HRY (10 kol)
    // ============================================
    printTestHeader("TEST #5: SIMULACE HRY - 10 kol", "🎮");
    console.log("Cíl: Simulovat reálnou hru s 10 otázkami za sebou\n");
    
    clearHistory();
    
    const gameQuestions = [];
    const gameStart = Date.now();
    
    console.log("🎯 Průběh hry:");
    for (let round = 1; round <= 10; round++) {
      const q = await generateQuestion('general', 'adult');
      gameQuestions.push(q);
      stats.totalQuestions++;
      
      const correctAnswer = q.options[q.correct];
      console.log(`   Kolo ${round}: "${q.question.substring(0, 50)}..." → ${correctAnswer}`);
    }
    
    const gameDuration = Date.now() - gameStart;
    
    // Analýza
    const gameDupAnswers = checkForDuplicateAnswers(gameQuestions);
    const gameSimilar = checkForSimilarQuestions(gameQuestions, 0.5);
    
    console.log(`\n📊 Statistiky hry:`);
    console.log(`   Celková doba: ${gameDuration}ms`);
    console.log(`   Průměr na otázku: ${(gameDuration / 10).toFixed(0)}ms`);
    console.log(`   Duplicitní odpovědi: ${gameDupAnswers.length}`);
    console.log(`   Podobné otázky: ${gameSimilar.length}`);
    console.log(`   Cache zbývá: ${getCacheSize()} otázek`);
    
    stats.duplicateAnswers += gameDupAnswers.length;
    
    const passed5 = gameDupAnswers.length === 0 && gameDuration < 30000;
    stats.addResult("Simulace hry (10 kol)", passed5,
      `${gameDuration}ms celkem, ${gameDupAnswers.length} duplicitních odpovědí`);

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
console.log("📌 Změny v4.0:");
console.log("   - Odstraněn PREMIUM režim (vlastní témata)");
console.log("   - Rozšířené kategorie: 12 ADULT, 8 JUNIOR");
console.log("   - Tvrdá validace duplicitních odpovědí\n");

runTest();
