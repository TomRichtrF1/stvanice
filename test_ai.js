import { 
  generateQuestion, 
  initializeBatch,
  getCacheSize,
  clearHistory,
  clearQuestionCache,
  getUsedAnswersSize,
  getJuniorDifficultyOptions,
  JUNIOR_DIFFICULTY_CONFIG
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

function checkForAnswerInQuestion(questionData) {
  const lowerQuestion = questionData.question.toLowerCase();
  const correctAnswer = questionData.options[questionData.correct].toLowerCase().trim();
  
  // Kontrola celé odpovědi
  if (lowerQuestion.includes(correctAnswer)) {
    return { found: true, type: 'full', answer: correctAnswer };
  }
  
  // Kontrola klíčových slov (5+ znaků)
  const answerWords = correctAnswer
    .split(/\s+/)
    .filter(w => w.length > 4)
    .filter(w => !['který', 'která', 'které', 'jaký', 'jaká', 'jaké'].includes(w));
  
  for (const word of answerWords) {
    const wordBase = word.length > 5 ? word.substring(0, 5) : word;
    if (lowerQuestion.includes(wordBase)) {
      return { found: true, type: 'word', word: word, base: wordBase };
    }
  }
  
  return { found: false };
}

function checkForAmbiguousQuestion(questionData) {
  const questionText = questionData.question;
  
  const suspiciousPatterns = [
    { pattern: /kter[ýáéí]\s+.{0,30}\s+je\s+(známý|známá|známé|proslulý|proslulá)/i, reason: "známý/proslulý" },
    { pattern: /kter[ýáéí]\s+\w+\s+(působí|působil|hraje|hrál|zpívá|zpíval)\s+(v|ve|na)/i, reason: "působí/hraje v" },
    { pattern: /jakou?\s+(zeleninu|ovoce|jídlo|potravinu|ingredienci)\s+(máme|dáváme|přidáváme|používáme)/i, reason: "jakou zeleninu máme" },
    { pattern: /jaké?\s+zvíře\s+(žije|bydlí|je|najdeme|vidíme)\s+(v|ve|na)/i, reason: "jaké zvíře žije v" },
    { pattern: /jaké?\s+zvíře\s+je\s+(nejčastěji|obvykle|typicky|běžně)/i, reason: "jaké zvíře je nejčastěji" },
    { pattern: /co\s+patří\s+mezi/i, reason: "co patří mezi" },
    { pattern: /co\s+se\s+(nachází|vyskytuje|objevuje)\s+(v|ve|na)/i, reason: "co se nachází v" },
    { pattern: /co\s+je\s+(typické|charakteristické|příznačné)\s+pro/i, reason: "co je typické pro" },
    { pattern: /co\s+(můžeme|lze|je možné)\s+(vidět|najít|spatřit)\s+(v|ve|na)/i, reason: "co můžeme vidět v" },
    { pattern: /co\s+je\s+(znečištění|součást|druh|typ|forma)/i, reason: "co je součást/druh" },
    { pattern: /kter[ýáéí]\s+(kniha|film|píseň|skladba)\s+(byla|byl|je)\s+(zfilmována|natočen|vydána)/i, reason: "která kniha byla zfilmována" },
    { pattern: /jaký\s+sport\s+se\s+(hraje|provozuje)/i, reason: "jaký sport se hraje" },
    
    // === NOVÉ VZORY v5.2 ===
    { pattern: /kdo\s+je\s+hlavní\s+postava\s+(večerníčku|pohádky|příběhu|seriálu)\??$/i, reason: "hlavní postava bez názvu" },
    { pattern: /co\s+(svítí|je|vidíme|najdeme)\s+(na\s+)?(obloze|nebi)/i, reason: "co svítí na obloze" },
    { pattern: /co\s+(je|roste|žije|najdeme)\s+(na|v|ve)\s+(stromě|stromu|lese|vodě|moři|řece)/i, reason: "co je v lese/vodě" },
    { pattern: /co\s+je\s+(největší|nejmenší|hlavní)\s+část/i, reason: "největší část" },
    { pattern: /jakou\s+barvu\s+má\s+(les|obloha|moře|příroda|zahrada)/i, reason: "barva přírody" },
    { pattern: /co\s+dělá\s+(pes|kočka|pták|zvíře)\??$/i, reason: "co dělá zvíře" },
    { pattern: /kde\s+žije\s+(zvíře|pták|ryba)\??$/i, reason: "kde žije (obecné)" },
    { pattern: /co\s+(jí|žere|konzumuje)\s+(zvíře|pták)\??$/i, reason: "co jí zvíře (obecné)" },
    { pattern: /jakou\s+vlajku\s+má/i, reason: "popis vlajky" },
    
    // === NOVÉ VZORY v5.3 ===
    { pattern: /co\s+(jí|žere|pije)\s+(kočka|pes|pták|kráva|králík|myš|had)\??$/i, reason: "co jí konkrétní zvíře" },
    { pattern: /jak[áéý]\s+je\s+(zelenina|ovoce|jídlo|potravina|květina|rostlina|strom)\??$/i, reason: "jaká je zelenina/ovoce" },
    { pattern: /co\s+je\s+(zelenina|ovoce|jídlo|květina)\??$/i, reason: "co je zelenina/ovoce" },
    { pattern: /jaké\s+je\s+(ovoce|zelenina|jídlo)\??$/i, reason: "jaké je ovoce/zelenina" },
    { pattern: /kter[éá]\s+(zvíře|zelenina|ovoce)\s+je\??$/i, reason: "které zvíře/zelenina je" },
    
    // === NOVÉ VZORY v5.4 ===
    { pattern: /jakou\s+barvu\s+má\s+.{0,20}vlajka/i, reason: "barva vlajky" },
    { pattern: /kdo\s+je\s+slavn[ýá]\s+(sportovec|herec|zpěvák|umělec|vědec|politik|spisovatel)/i, reason: "kdo je slavný X" },
    { pattern: /kter[ýá]\s+(sportovec|herec|zpěvák|umělec)\s+je\s+slavn/i, reason: "který X je slavný" },
    { pattern: /kdo\s+je\s+znám[ýá]\s+(sportovec|herec|zpěvák|umělec|vědec)/i, reason: "kdo je známý X" },
    { pattern: /jaké\s+barvy\s+má\s+.{0,20}vlajka/i, reason: "barvy vlajky" },
    
    // === NOVÉ VZORY v5.5 ===
    { pattern: /kdo\s+je\s+(považován|pokládán)\s+za\s+(jednoho|jednu)\s+(z|ze)\s+(nej|nejlepš)/i, reason: "jeden z nejlepších" },
    { pattern: /co\s+(létá|plave|běhá|skáče|leze)\??$/i, reason: "co létá/plave" },
    { pattern: /jak\s+se\s+jmenuje\s+(domácí\s+)?(mazlíček|zvíře|zvířátko)\??$/i, reason: "jméno mazlíčka" },
    { pattern: /co\s+(děti|lidé|lidi)\s+(rád[yia]?|rádi)\s+(jedí|jí|pijí)\??$/i, reason: "co děti rády jedí" },
    { pattern: /jak\s+se\s+jmenuje\s+znám[ýá]\s+(pták|zvíře|rostlina|strom|květina)/i, reason: "jméno známého X" },
    { pattern: /co\s+je\s+(jednoduch[ýá]|složit[ýá]|snadn[ýá]|těžk[ýá])\s+\w+\??$/i, reason: "co je jednoduché X" },
    { pattern: /co\s+je\s+(zdraví|láska|štěstí|radost|smutek|strach|život|smrt)\??$/i, reason: "co je zdraví/láska" },
    { pattern: /co\s+je\s+(přátelství|rodina|domov|svoboda|pravda)\??$/i, reason: "co je abstraktní pojem" },
    { pattern: /^co\s+(létá|plave|běží|roste|kvete|svítí|hřeje)\??$/i, reason: "co létá/svítí" },
    { pattern: /kdo\s+je\s+(nejlepší|největší|nejznámější|nejslavnější)\s+(sportovec|herec|zpěvák)/i, reason: "kdo je nejlepší X" },
  ];
  
  for (const { pattern, reason } of suspiciousPatterns) {
    if (pattern.test(questionText)) {
      return { found: true, reason };
    }
  }
  
  return { found: false };
}

function checkForPotentialHallucination(questionData) {
  const questionText = questionData.question.toLowerCase();
  
  const hallucinationPatterns = [
    { pattern: /jak\s+se\s+jmenuje\s+(kůň|pes|kočka|pták|myš|králík|medvěd|vlk|liška)\s+(z|ve|v)\s+(pohádky|pohádce|filmu|příběhu|seriálu)/i, reason: "jméno zvířete z pohádky" },
    { pattern: /jaké?\s+(je\s+)?jméno\s+(koně|psa|kočky|ptáka|zvířete)\s+(z|ve|v)/i, reason: "jméno zvířete" },
    { pattern: /jak\s+se\s+jmenuje\s+(přítel|pomocník|sluha|strážce)\s+.{0,30}\s+(z|ve|v)\s+(pohádky|pohádce|filmu)/i, reason: "jméno vedlejší postavy" },
    { pattern: /jaká\s+je\s+barva\s+(koně|pláště|šatů|oblečení)\s+.{0,20}\s+(z|ve|v)\s+(pohádky|pohádce|filmu)/i, reason: "barva věci z pohádky" },
    { pattern: /jak\s+se\s+jmenuje\s+(zámek|hrad|dům|vesnice|město|les)\s+(z|ve|v)\s+(pohádky|pohádce|filmu)/i, reason: "jméno místa z pohádky" },
  ];
  
  const knownMainCharacters = [
    'krteček', 'krtečka', 'krtek', 'rumcajs', 'manka', 'cipísek',
    'mach', 'šebestová', 'pat', 'mat', 'bob', 'bobek', 'rákosníček',
    'křemílek', 'vochomůrka', 'kubula', 'sněhurka', 'popelka',
    'ariel', 'elsa', 'anna', 'simba', 'nemo', 'buzz', 'woody',
    'shrek', 'fiona', 'harry potter', 'hermiona', 'pinocchio', 'bambi'
  ];
  
  for (const { pattern, reason } of hallucinationPatterns) {
    if (pattern.test(questionData.question)) {
      const containsKnownCharacter = knownMainCharacters.some(char => 
        questionText.includes(char)
      );
      
      if (!containsKnownCharacter) {
        return { found: true, reason };
      }
    }
  }
  
  return { found: false };
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
    this.answersInQuestion = 0;
    this.ambiguousQuestions = 0;
    this.potentialHallucinations = 0;
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
    console.log(`   Odpověď v otázce:     ${this.answersInQuestion}`);
    console.log(`   Vágní otázky:         ${this.ambiguousQuestions}`);
    console.log(`   Potenc. halucinace:   ${this.potentialHallucinations}`);
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
  printTestHeader("🎮 ŠTVANICE v5.5 - TEST S ROZŠÍŘENÝMI FILTRY", "🚀");
  console.log("Testování: Groq Llama + Batch generování + Junior obtížnosti\n");
  console.log("Model: llama-3.3-70b-versatile");
  console.log("Provider: Groq");
  console.log("Režimy: ADULT (12 kategorií), JUNIOR 3 úrovně:\n");
  
  // Zobraz junior obtížnosti
  const difficulties = getJuniorDifficultyOptions();
  difficulties.forEach(d => {
    console.log(`   ${d.name} - ${d.age} (${d.description})`);
  });
  console.log("");

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
    
    const success1 = await initializeBatch('adult', null, 'hard');
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
      let answerInQuestionCount = 0;
      let ambiguousCount = 0;
      let hallucinationCount = 0;
      
      for (let i = 1; i <= Math.min(cacheSize, 12); i++) {
        const q = await generateQuestion('adult', null, 'hard');
        printQuestionCompact(q, i);
        adultQuestions.push(q);
        stats.totalQuestions++;
        
        if (checkForSpoilers(q)) stats.spoilers++;
        
        const answerCheck = checkForAnswerInQuestion(q);
        if (answerCheck.found) {
          answerInQuestionCount++;
          console.log(`      ⚠️ ODPOVĚĎ V OTÁZCE: ${answerCheck.type === 'full' ? answerCheck.answer : answerCheck.word}`);
        }
        
        const ambiguousCheck = checkForAmbiguousQuestion(q);
        if (ambiguousCheck.found) {
          ambiguousCount++;
          console.log(`      ⚠️ VÁGNÍ OTÁZKA: ${ambiguousCheck.reason}`);
        }
        
        const hallucinationCheck = checkForPotentialHallucination(q);
        if (hallucinationCheck.found) {
          hallucinationCount++;
          console.log(`      🚨 POTENCIÁLNÍ HALUCINACE: ${hallucinationCheck.reason}`);
        }
      }
      
      stats.answersInQuestion += answerInQuestionCount;
      stats.ambiguousQuestions += ambiguousCount;
      stats.potentialHallucinations += hallucinationCount;
      
      const dups = checkForDuplicates(adultQuestions);
      const dupAnswers = checkForDuplicateAnswers(adultQuestions);
      const similar = checkForSimilarQuestions(adultQuestions, 0.6);
      stats.duplicateQuestions += dups.length;
      stats.duplicateAnswers += dupAnswers.length;
      stats.similarPairs += similar.length;
      
      console.log(`\n📊 Analýza kvality:`);
      console.log(`   Duplicitní otázky: ${dups.length}`);
      console.log(`   Duplicitní odpovědi: ${dupAnswers.length}`);
      console.log(`   Podobné otázky: ${similar.length}`);
      console.log(`   Odpověď v otázce: ${answerInQuestionCount}`);
      console.log(`   Vágní otázky: ${ambiguousCount}`);
      console.log(`   Potenc. halucinace: ${hallucinationCount}`);
      console.log(`   Použité odpovědi v historii: ${getUsedAnswersSize()}`);
      
      if (dupAnswers.length > 0) {
        console.log(`\n⚠️  Nalezeny duplicitní odpovědi:`);
        dupAnswers.forEach(d => console.log(`      #${d.index1} a #${d.index2}: "${d.answer}"`));
      }
      
      const passed = dups.length === 0 && dupAnswers.length === 0 && adultQuestions.length >= 10;
      stats.addResult("ADULT Batch", passed,
        `${adultQuestions.length} otázek, ${dups.length} dup., ${dupAnswers.length} dup.odp., ${ambiguousCount} vágních, ${hallucinationCount} haluc., ${duration1}ms`);
    }

    // ============================================
    // TEST 2: JUNIOR EASY (Drobečci 4-6 let)
    // ============================================
    printTestHeader("TEST #2: JUNIOR EASY - 🐣 Drobečci (4-6 let)", "👶");
    console.log("Cíl: Vygenerovat otázky pro předškoláky\n");
    console.log("Kategorie: Zvířátka, České pohádky, Barvy a tvary, Jídlo, Příroda\n");
    
    clearHistory();
    const startTime2 = Date.now();
    
    const success2 = await initializeBatch('kid', null, 'easy');
    stats.apiCalls++;
    
    const duration2 = Date.now() - startTime2;
    console.log(`⏱️  Doba generování: ${duration2}ms`);
    
    if (!success2) {
      console.log("❌ Batch selhal!");
      stats.errors++;
      stats.addResult("JUNIOR EASY (Drobečci)", false, "Inicializace selhala");
    } else {
      const cacheSize = getCacheSize();
      console.log(`📦 Cache size: ${cacheSize} otázek\n`);
      
      const easyQuestions = [];
      let ambiguousCount = 0;
      let hallucinationCount = 0;
      
      for (let i = 1; i <= Math.min(cacheSize, 8); i++) {
        const q = await generateQuestion('kid', null, 'easy');
        printQuestionCompact(q, i);
        easyQuestions.push(q);
        stats.totalQuestions++;
        if (checkForSpoilers(q)) stats.spoilers++;
        
        const ambiguousCheck = checkForAmbiguousQuestion(q);
        if (ambiguousCheck.found) {
          ambiguousCount++;
          console.log(`      ⚠️ VÁGNÍ OTÁZKA: ${ambiguousCheck.reason}`);
        }
        
        const hallucinationCheck = checkForPotentialHallucination(q);
        if (hallucinationCheck.found) {
          hallucinationCount++;
          console.log(`      🚨 POTENCIÁLNÍ HALUCINACE: ${hallucinationCheck.reason}`);
        }
      }
      
      stats.ambiguousQuestions += ambiguousCount;
      stats.potentialHallucinations += hallucinationCount;
      
      const dups = checkForDuplicates(easyQuestions);
      const dupAnswers = checkForDuplicateAnswers(easyQuestions);
      stats.duplicateQuestions += dups.length;
      stats.duplicateAnswers += dupAnswers.length;
      
      console.log(`\n📊 Analýza kvality:`);
      console.log(`   Duplicitní otázky: ${dups.length}`);
      console.log(`   Duplicitní odpovědi: ${dupAnswers.length}`);
      console.log(`   Vágní otázky: ${ambiguousCount}`);
      console.log(`   Potenc. halucinace: ${hallucinationCount}`);
      console.log(`   Použité odpovědi v historii: ${getUsedAnswersSize()}`);
      
      const passed = dups.length === 0 && dupAnswers.length === 0 && easyQuestions.length >= 6;
      stats.addResult("JUNIOR EASY (Drobečci)", passed,
        `${easyQuestions.length} otázek, ${dups.length} dup., ${ambiguousCount} vágních, ${hallucinationCount} haluc., ${duration2}ms`);
    }

    // ============================================
    // TEST 3: JUNIOR MEDIUM (Školáci 7-10 let)
    // ============================================
    printTestHeader("TEST #3: JUNIOR MEDIUM - 📚 Školáci (7-10 let)", "📚");
    console.log("Cíl: Vygenerovat otázky pro 1.-4. třídu ZŠ\n");
    console.log("Kategorie: Zvířata, Pohádky, Svět, Lidské tělo, Vesmír, Věda\n");
    
    clearHistory();
    const startTime3 = Date.now();
    
    const success3 = await initializeBatch('kid', null, 'medium');
    stats.apiCalls++;
    
    const duration3 = Date.now() - startTime3;
    console.log(`⏱️  Doba generování: ${duration3}ms`);
    
    if (!success3) {
      console.log("❌ Batch selhal!");
      stats.errors++;
      stats.addResult("JUNIOR MEDIUM (Školáci)", false, "Inicializace selhala");
    } else {
      const cacheSize = getCacheSize();
      console.log(`📦 Cache size: ${cacheSize} otázek\n`);
      
      const mediumQuestions = [];
      let ambiguousCount = 0;
      let hallucinationCount = 0;
      
      for (let i = 1; i <= Math.min(cacheSize, 8); i++) {
        const q = await generateQuestion('kid', null, 'medium');
        printQuestionCompact(q, i);
        mediumQuestions.push(q);
        stats.totalQuestions++;
        if (checkForSpoilers(q)) stats.spoilers++;
        
        const ambiguousCheck = checkForAmbiguousQuestion(q);
        if (ambiguousCheck.found) {
          ambiguousCount++;
          console.log(`      ⚠️ VÁGNÍ OTÁZKA: ${ambiguousCheck.reason}`);
        }
        
        const hallucinationCheck = checkForPotentialHallucination(q);
        if (hallucinationCheck.found) {
          hallucinationCount++;
          console.log(`      🚨 POTENCIÁLNÍ HALUCINACE: ${hallucinationCheck.reason}`);
        }
      }
      
      stats.ambiguousQuestions += ambiguousCount;
      stats.potentialHallucinations += hallucinationCount;
      
      const dups = checkForDuplicates(mediumQuestions);
      const dupAnswers = checkForDuplicateAnswers(mediumQuestions);
      stats.duplicateQuestions += dups.length;
      stats.duplicateAnswers += dupAnswers.length;
      
      console.log(`\n📊 Analýza kvality:`);
      console.log(`   Duplicitní otázky: ${dups.length}`);
      console.log(`   Duplicitní odpovědi: ${dupAnswers.length}`);
      console.log(`   Vágní otázky: ${ambiguousCount}`);
      console.log(`   Potenc. halucinace: ${hallucinationCount}`);
      
      const passed = dups.length === 0 && dupAnswers.length === 0 && mediumQuestions.length >= 6;
      stats.addResult("JUNIOR MEDIUM (Školáci)", passed,
        `${mediumQuestions.length} otázek, ${dups.length} dup., ${ambiguousCount} vágních, ${hallucinationCount} haluc., ${duration3}ms`);
    }

    // ============================================
    // TEST 4: JUNIOR HARD (Kluci a holky 11-14 let)
    // ============================================
    printTestHeader("TEST #4: JUNIOR HARD - 🎒 Kluci a holky (11-14 let)", "🎒");
    console.log("Cíl: Vygenerovat otázky pro 5.-9. třídu ZŠ\n");
    console.log("Kategorie: Zvířata, Pohádky, Lidské tělo, Svět, Vesmír, Sport, Věda, Historie\n");
    
    clearHistory();
    const startTime4 = Date.now();
    
    const success4 = await initializeBatch('kid', null, 'hard');
    stats.apiCalls++;
    
    const duration4 = Date.now() - startTime4;
    console.log(`⏱️  Doba generování: ${duration4}ms`);
    
    if (!success4) {
      console.log("❌ Batch selhal!");
      stats.errors++;
      stats.addResult("JUNIOR HARD (Kluci a holky)", false, "Inicializace selhala");
    } else {
      const cacheSize = getCacheSize();
      console.log(`📦 Cache size: ${cacheSize} otázek\n`);
      
      const hardQuestions = [];
      let ambiguousCount = 0;
      let hallucinationCount = 0;
      
      for (let i = 1; i <= Math.min(cacheSize, 8); i++) {
        const q = await generateQuestion('kid', null, 'hard');
        printQuestionCompact(q, i);
        hardQuestions.push(q);
        stats.totalQuestions++;
        if (checkForSpoilers(q)) stats.spoilers++;
        
        const ambiguousCheck = checkForAmbiguousQuestion(q);
        if (ambiguousCheck.found) {
          ambiguousCount++;
          console.log(`      ⚠️ VÁGNÍ OTÁZKA: ${ambiguousCheck.reason}`);
        }
        
        const hallucinationCheck = checkForPotentialHallucination(q);
        if (hallucinationCheck.found) {
          hallucinationCount++;
          console.log(`      🚨 POTENCIÁLNÍ HALUCINACE: ${hallucinationCheck.reason}`);
        }
      }
      
      stats.ambiguousQuestions += ambiguousCount;
      stats.potentialHallucinations += hallucinationCount;
      
      const dups = checkForDuplicates(hardQuestions);
      const dupAnswers = checkForDuplicateAnswers(hardQuestions);
      stats.duplicateQuestions += dups.length;
      stats.duplicateAnswers += dupAnswers.length;
      
      console.log(`\n📊 Analýza kvality:`);
      console.log(`   Duplicitní otázky: ${dups.length}`);
      console.log(`   Duplicitní odpovědi: ${dupAnswers.length}`);
      console.log(`   Vágní otázky: ${ambiguousCount}`);
      console.log(`   Potenc. halucinace: ${hallucinationCount}`);
      
      const passed = dups.length === 0 && dupAnswers.length === 0 && hardQuestions.length >= 6;
      stats.addResult("JUNIOR HARD (Kluci a holky)", passed,
        `${hardQuestions.length} otázek, ${dups.length} dup., ${ambiguousCount} vágních, ${hallucinationCount} haluc., ${duration4}ms`);
    }

    // ============================================
    // TEST 5: ANTI-REPEAT NAPŘÍČ BATCHI
    // ============================================
    printTestHeader("TEST #5: ANTI-REPEAT NAPŘÍČ 2 BATCHI", "🔄");
    console.log("Cíl: Ověřit, že se odpovědi neopakují mezi batchi (tvrdá validace)\n");
    
    clearHistory();
    
    // První batch
    console.log("📦 Batch #1:");
    await initializeBatch('adult', null, 'hard');
    stats.apiCalls++;
    
    const batch1 = [];
    for (let i = 0; i < 8; i++) {
      const q = await generateQuestion('adult', null, 'hard');
      batch1.push(q);
      stats.totalQuestions++;
    }
    console.log(`   Vygenerováno ${batch1.length} otázek`);
    console.log(`   Použité odpovědi: ${getUsedAnswersSize()}`);
    
    // Druhý batch (BEZ clearHistory - odpovědi by se neměly opakovat!)
    console.log("\n📦 Batch #2 (bez mazání historie odpovědí):");
    await initializeBatch('adult', null, 'hard');
    stats.apiCalls++;
    
    const batch2 = [];
    for (let i = 0; i < 8; i++) {
      const q = await generateQuestion('adult', null, 'hard');
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
    
    const passed5 = crossDupAnswers.length === 0;
    stats.addResult("Anti-repeat napříč batchi", passed5,
      `${crossDupAnswers.length} duplicitních odpovědí, ${crossSimilar.length} podobných otázek`);

    // ============================================
    // TEST 6: RYCHLOST - CACHE VS API
    // ============================================
    printTestHeader("TEST #6: RYCHLOST - CACHE VS API", "⚡");
    console.log("Cíl: Porovnat rychlost čtení z cache vs API call\n");
    
    clearHistory();
    
    // Měření API call
    const apiStart = Date.now();
    await initializeBatch('adult', null, 'hard');
    const apiDuration = Date.now() - apiStart;
    stats.apiCalls++;
    
    console.log(`   🌐 API call (24 otázek): ${apiDuration}ms`);
    
    // Měření čtení z cache
    const cacheStart = Date.now();
    for (let i = 0; i < 10; i++) {
      await generateQuestion('adult', null, 'hard');
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
    // TEST 7: SIMULACE HRY (10 kol)
    // ============================================
    printTestHeader("TEST #7: SIMULACE HRY - 10 kol", "🎮");
    console.log("Cíl: Simulovat reálnou hru s 10 otázkami za sebou\n");
    
    clearHistory();
    
    const gameQuestions = [];
    const gameStart = Date.now();
    
    console.log("🎯 Průběh hry:");
    for (let round = 1; round <= 10; round++) {
      const q = await generateQuestion('adult', null, 'hard');
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
    
    const passed7 = gameDupAnswers.length === 0 && gameDuration < 30000;
    stats.addResult("Simulace hry (10 kol)", passed7,
      `${gameDuration}ms celkem, ${gameDupAnswers.length} duplicitních odpovědí`);

    // ============================================
    // TEST 8: CACHE RESET PŘI ZMĚNĚ REŽIMU
    // ============================================
    printTestHeader("TEST #8: CACHE RESET PŘI ZMĚNĚ REŽIMU", "🗑️");
    console.log("Cíl: Ověřit, že clearQuestionCache() funguje správně\n");
    
    clearHistory();
    
    // Naplň cache
    await initializeBatch('adult', null, 'hard');
    stats.apiCalls++;
    const cacheBefore = getCacheSize();
    console.log(`   📦 Cache před resetem: ${cacheBefore} otázek`);
    
    // Reset cache
    clearQuestionCache();
    const cacheAfter = getCacheSize();
    console.log(`   🗑️ Cache po resetu: ${cacheAfter} otázek`);
    
    const passed8 = cacheBefore > 0 && cacheAfter === 0;
    stats.addResult("Cache reset", passed8,
      `Před: ${cacheBefore}, Po: ${cacheAfter}`);

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
console.log("📌 Změny v5.5:");
console.log("   - Blokace: 'Kdo je považován za jednoho z nejlepších...'");
console.log("   - Blokace: 'Co létá/plave/běhá?' (příliš obecné)");
console.log("   - Blokace: 'Jak se jmenuje domácí mazlíček?'");
console.log("   - Blokace: 'Co děti rády jedí?'");
console.log("   - Blokace: 'Co je zdraví/láska/štěstí?' (filozofické)");
console.log("   - Blokace: 'Kdo je nejlepší sportovec?'");
console.log("   - Celkem 42 vzorů pro vágní otázky\n");

runTest();
