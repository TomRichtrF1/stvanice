import { generateQuestion, clearHistory, getHistorySize } from './question_generator.js';

// === 🎨 Pomocné funkce ===
function printSeparator() {
  console.log("═".repeat(70));
}

function printTestHeader(title, emoji) {
  printSeparator();
  console.log(`${emoji} ${title}`);
  printSeparator();
}

function printQuestion(questionData, index) {
  console.log(`\n📝 OTÁZKA #${index}:`);
  console.log(`   ${questionData.question}`);
  console.log(`\n   Možnosti:`);
  questionData.options.forEach((opt, i) => {
    const marker = i === questionData.correct ? "✅" : "  ";
    console.log(`   ${marker} ${String.fromCharCode(65 + i)}) ${opt}`);
  });
  console.log(`\n   Správná odpověď: ${String.fromCharCode(65 + questionData.correct)}) ${questionData.options[questionData.correct]}`);
}

function checkForSpoilers(questionData) {
  const lowerQuestion = questionData.question.toLowerCase();
  const correctAnswer = questionData.options[questionData.correct].toLowerCase();
  const words = correctAnswer.split(/\s+/);
  
  for (const word of words) {
    if (word.length > 4 && lowerQuestion.includes(word)) {
      console.log(`   ⚠️  VAROVÁNÍ: Možný spoiler - "${word}" se objevuje v otázce!`);
      return true;
    }
  }
  return false;
}

// 🆕 Kontrola duplicit v sadě otázek
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

// 🆕 Analýza obtížnosti (heuristika)
function analyzeDifficulty(question) {
  const q = question.question.toLowerCase();
  
  // Kritéria obtížnosti
  const hasYear = /\d{4}/.test(q); // Obsahuje rok?
  const hasNumber = /\d+/.test(q); // Obsahuje číslo?
  const isWhoWhat = q.startsWith('kdo') || q.startsWith('co je');
  const isBasic = ['největší', 'nejmenší', 'hlavní město'].some(word => q.includes(word));
  
  let score = 0;
  if (hasYear) score += 2;
  if (hasNumber) score += 1;
  if (isWhoWhat && !hasYear) score -= 1;
  if (isBasic) score -= 2;
  
  if (score >= 2) return '🔥 TĚŽKÁ';
  if (score >= 0) return '⚖️  STŘEDNÍ';
  return '🟢 LEHKÁ';
}

// === 🚀 HLAVNÍ TEST ===
async function runTest() {
  console.log("\n");
  printTestHeader("🎮 ROZŠÍŘENÝ TEST - ŠTVANICE v2.0", "🚀");
  console.log("Testování: Anti-repeat + Zvýšená obtížnost\n");

  const allQuestions = [];
  let spoilerCount = 0;

  try {
    // ============================================
    // TEST 1: DOSPĚLÝ - Anti-repeat test (10 otázek)
    // ============================================
    printTestHeader("TEST #1: ANTI-REPEAT TEST - 10 otázek pro dospělé", "🔁");
    console.log("Cíl: Ověřit, že se otázky neopakují\n");
    
    clearHistory(); // Vymaz historii před testem
    
    for (let i = 1; i <= 10; i++) {
      const q = await generateQuestion('general', 'adult');
      printQuestion(q, i);
      
      const difficulty = analyzeDifficulty(q);
      console.log(`   📊 Obtížnost: ${difficulty}`);
      
      if (checkForSpoilers(q)) spoilerCount++;
      allQuestions.push(q);
    }
    
    console.log(`\n📚 Velikost historie: ${getHistorySize()} otázek`);

    // 🆕 Kontrola duplicit
    const duplicates = checkForDuplicates(allQuestions);
    if (duplicates.length > 0) {
      console.log("\n⚠️  NALEZENY DUPLICITY:");
      duplicates.forEach(dup => {
        console.log(`   ❌ Otázka #${dup.index1} = Otázka #${dup.index2}`);
        console.log(`      "${dup.question}"`);
      });
    } else {
      console.log("\n✅ Žádné duplicity nenalezeny!");
    }

    // ============================================
    // TEST 2: JUNIOR - Kreativita (5 otázek)
    // ============================================
    printTestHeader("TEST #2: JUNIOR REŽIM - Kontrola kreativity", "👶");
    
    clearHistory();
    const juniorQuestions = [];
    
    for (let i = 1; i <= 5; i++) {
      const q = await generateQuestion('general', 'kid');
      printQuestion(q, i);
      if (checkForSpoilers(q)) spoilerCount++;
      juniorQuestions.push(q);
    }
    
    const juniorDuplicates = checkForDuplicates(juniorQuestions);
    if (juniorDuplicates.length === 0) {
      console.log("\n✅ Junior otázky jsou unikátní!");
    }

    // ============================================
    // TEST 3: Stejné téma 5× (Stress test)
    // ============================================
    printTestHeader("TEST #3: STRESS TEST - 5× stejné téma", "🏋️");
    console.log("Téma: 'Sport: Fotbal' (musí být 5 různých otázek)\n");
    
    clearHistory();
    const footballQuestions = [];
    
    for (let i = 1; i <= 5; i++) {
      const q = await generateQuestion('Sport: Fotbal', 'adult');
      printQuestion(q, i);
      const difficulty = analyzeDifficulty(q);
      console.log(`   📊 Obtížnost: ${difficulty}`);
      footballQuestions.push(q);
    }
    
    const footballDuplicates = checkForDuplicates(footballQuestions);
    if (footballDuplicates.length > 0) {
      console.log("\n❌ VAROVÁNÍ: Opakující se fotbalové otázky!");
      footballDuplicates.forEach(dup => {
        console.log(`   Duplicita: #${dup.index1} = #${dup.index2}`);
      });
    } else {
      console.log("\n✅ Všechny fotbalové otázky jsou unikátní!");
    }

    // ============================================
    // TEST 4: Obtížnostní profil
    // ============================================
    printTestHeader("TEST #4: ANALÝZA OBTÍŽNOSTI - 15 otázek", "📊");
    
    clearHistory();
    const difficultyStats = { easy: 0, medium: 0, hard: 0 };
    
    for (let i = 1; i <= 15; i++) {
      const q = await generateQuestion('general', 'adult');
      const difficulty = analyzeDifficulty(q);
      
      if (difficulty.includes('LEHKÁ')) difficultyStats.easy++;
      else if (difficulty.includes('STŘEDNÍ')) difficultyStats.medium++;
      else if (difficulty.includes('TĚŽKÁ')) difficultyStats.hard++;
      
      console.log(`\n${i}. ${q.question}`);
      console.log(`   📊 ${difficulty}`);
    }
    
    console.log("\n📈 ROZLOŽENÍ OBTÍŽNOSTI:");
    console.log(`   🟢 Lehké:   ${difficultyStats.easy} (${(difficultyStats.easy/15*100).toFixed(0)}%)`);
    console.log(`   ⚖️  Střední: ${difficultyStats.medium} (${(difficultyStats.medium/15*100).toFixed(0)}%)`);
    console.log(`   🔥 Těžké:   ${difficultyStats.hard} (${(difficultyStats.hard/15*100).toFixed(0)}%)`);
    
    if (difficultyStats.easy > 8) {
      console.log("\n⚠️  POZOR: Příliš mnoho lehkých otázek! Zvažte úpravu promptů.");
    } else if (difficultyStats.hard >= 5) {
      console.log("\n✅ VÝBORNĚ! Dobrá rovnováha obtížnosti.");
    }

    // ============================================
    // FINÁLNÍ STATISTIKY
    // ============================================
    printTestHeader("📊 CELKOVÉ VÝSLEDKY", "🏁");
    
    const totalQuestions = allQuestions.length + juniorQuestions.length + footballQuestions.length + 15;
    const totalDuplicates = duplicates.length + juniorDuplicates.length + footballDuplicates.length;
    
    console.log(`\n✅ Celkem vygenerováno: ${totalQuestions} otázek`);
    console.log(`🔁 Detekováno duplicit: ${totalDuplicates}`);
    console.log(`⚠️  Detekováno spoilerů: ${spoilerCount}`);
    console.log(`🎯 Úspěšnost anti-repeat: ${((totalQuestions - totalDuplicates) / totalQuestions * 100).toFixed(1)}%`);
    console.log(`🛡️  Úspěšnost anti-spoiler: ${((totalQuestions - spoilerCount) / totalQuestions * 100).toFixed(1)}%`);
    
    if (totalDuplicates === 0 && spoilerCount <= 2) {
      console.log(`\n🎉 PERFEKTNÍ! Systém funguje výborně!`);
    } else if (totalDuplicates <= 2) {
      console.log(`\n✨ DOBRÉ! Jen drobné nedostatky.`);
    } else {
      console.log(`\n⚠️  VAROVÁNÍ: Systém potřebuje další ladění.`);
    }

    printSeparator();
    console.log("\n✅ Test dokončen!\n");

  } catch (error) {
    console.error("\n❌ KRITICKÁ CHYBA:");
    console.error(error);
    process.exit(1);
  }
}

// === 🎬 SPUŠTĚNÍ ===
console.log("⏳ Spouštím rozšířené testy...\n");
runTest();