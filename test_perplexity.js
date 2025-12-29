#!/usr/bin/env node
/**
 * 🧪 PERPLEXITY GENERATOR - 100% PERPLEXITY PIPELINE
 * 
 * Generuje kvízové otázky pouze pomocí Perplexity API.
 * Podporuje všechny módy: adult, easy, medium, hard
 * 
 * Použití:
 *   node test_perplexity.js                    # Test adult (24 otázek, bez ukládání)
 *   node test_perplexity.js save               # Test adult + uložení do DB
 *   node test_perplexity.js fill 100           # 100 adult otázek do DB
 *   node test_perplexity.js fill 100 easy      # 100 easy otázek (4-6 let)
 *   node test_perplexity.js fill 100 medium    # 100 medium otázek (7-10 let)
 *   node test_perplexity.js fill 100 hard      # 100 hard otázek (11-14 let)
 *   node test_perplexity.js stats              # Statistiky DB
 */

import dotenv from 'dotenv';
import * as questionDatabase from './question_database.js';

dotenv.config();

// === 🔧 API KONFIGURACE (100% PERPLEXITY) ===
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const PERPLEXITY_MODEL = "sonar-pro";
const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";

// === 📊 KONFIGURACE ===
const BATCH_SIZE = 24;

// === 🎨 BARVY PRO TERMINÁL ===
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
  bgGreen: '\x1b[42m',
  bgRed: '\x1b[41m',
  bgYellow: '\x1b[43m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
};

// === 📊 STATISTIKY ===
const stats = {
  generated: 0,
  afterFilters: 0,
  afterSelfCritique: 0,
  final: 0,
  savedToDb: 0,
  apiCalls: { batch: 0, critique: 0 },
  time: { batch: 0, critique: 0, total: 0 }
};

function resetStats() {
  stats.generated = 0;
  stats.afterFilters = 0;
  stats.afterSelfCritique = 0;
  stats.final = 0;
  stats.savedToDb = 0;
  stats.apiCalls = { batch: 0, critique: 0 };
  stats.time = { batch: 0, critique: 0, total: 0 };
}

// === 🎯 ADULT KATEGORIE ===
const ADULT_CATEGORIES = {
  "motorsport": {
    name: "Motorsport",
    aspects: ["Historický moment", "Konkrétní okruh", "Kuriozita", "Tým nebo stáj", "Rekord", "Legendární závodník"]
  },
  "team_sports": {
    name: "Týmové sporty",
    aspects: ["Historický moment", "Stadion nebo aréna", "Klub nebo tým", "Rekord", "Legendární hráč", "Mistrovství"]
  },
  "film": {
    name: "Film a seriály",
    aspects: ["Herec nebo herečka", "Režisér", "Ocenění Oscar", "Rekord tržeb", "Konkrétní film", "Soundtrack"]
  },
  "music": {
    name: "Hudba",
    aspects: ["Zpěvák nebo zpěvačka", "Kapela", "Ocenění Grammy", "Album nebo píseň", "Koncert", "Rekord prodejů"]
  },
  "history": {
    name: "Historie",
    aspects: ["Klíčová událost", "Významná osobnost", "Konkrétní rok", "První nebo poslední", "Válka", "Objev"]
  },
  "geography": {
    name: "Zeměpis",
    aspects: ["Hlavní město", "Řeka nebo jezero", "Hora nebo pohoří", "Hranice", "Přírodní památka", "Rekord"]
  },
  "science": {
    name: "Věda a technologie",
    aspects: ["Historický objev", "Vědec nebo vynálezce", "Teorie nebo zákon", "Nobelova cena", "Experiment", "Vynález"]
  },
  "food": {
    name: "Gastronomie",
    aspects: ["Původ pokrmu", "Ingredience", "Národní pokrm", "Slavný šéfkuchař", "Michelin", "Nápoje"]
  },
  "literature": {
    name: "Literatura",
    aspects: ["Klasické dílo", "Autor", "Literární žánr", "Ocenění Nobel", "Bestseller", "Slavný citát"]
  },
  "art": {
    name: "Umění a architektura",
    aspects: ["Slavný obraz", "Malíř nebo sochař", "Umělecký směr", "Muzeum", "Architektura", "Aukční rekord"]
  },
  "nature": {
    name: "Zvířata a příroda",
    aspects: ["Savci", "Ptáci", "Mořští živočichové", "Rekord největší", "Vyhynulé druhy", "Migrace"]
  },
  "business": {
    name: "Byznys a ekonomika",
    aspects: ["Slavná firma", "CEO", "Značka", "Startup příběh", "Krach nebo bankrot", "Akvizice"]
  }
};

// === 🎯 JUNIOR KATEGORIE ===

// 🐣 EASY (4-6 let)
const JUNIOR_CATEGORIES_EASY = {
  "animals_simple": {
    name: "Zvířátka",
    aspects: ["Zvuky zvířat", "Barvy zvířat", "Kde bydlí", "Co jedí", "Domácí mazlíčci", "Kolik má nohou"]
  },
  "fairytales_cz": {
    name: "České pohádky",
    aspects: ["Krteček", "Pat a Mat", "Rumcajs", "Mach a Šebestová", "Bob a Bobek", "Rákosníček"]
  },
  "colors_shapes": {
    name: "Barvy a tvary",
    aspects: ["Základní barvy", "Tvary kolem nás", "Co je kulaté", "Barvy v přírodě", "Duhové barvy"]
  },
  "food_simple": {
    name: "Jídlo",
    aspects: ["Ovoce", "Zelenina", "Co je zdravé", "Snídaně", "Oblíbená jídla"]
  },
  "nature_simple": {
    name: "Příroda",
    aspects: ["Roční období", "Počasí", "Stromy", "Květiny", "Den a noc"]
  }
};

// 📚 MEDIUM (7-10 let)
const JUNIOR_CATEGORIES_MEDIUM = {
  "animals": {
    name: "Zvířata",
    aspects: ["Savci", "Ptáci", "Mořští živočichové", "Zvířata v ZOO", "Rekord největší", "Mláďata"]
  },
  "fairytales": {
    name: "Pohádky a filmy",
    aspects: ["České pohádky", "Disney postavy", "Pixar filmy", "Princezny a princové", "Zvířecí hrdinové"]
  },
  "world_simple": {
    name: "Svět kolem nás",
    aspects: ["Hlavní města", "Kontinenty", "Oceány", "Slavné stavby", "Řeky a hory"]
  },
  "body_simple": {
    name: "Lidské tělo",
    aspects: ["Orgány", "Pět smyslů", "Kosti", "Zuby", "Srdce", "Mozek"]
  },
  "space_simple": {
    name: "Vesmír",
    aspects: ["Planety", "Slunce", "Měsíc", "Hvězdy", "Astronauti", "Rakety"]
  },
  "science_simple": {
    name: "Věda a příroda",
    aspects: ["Dinosauři", "Sopky", "Elektřina", "Magnety", "Voda a led", "Rostliny"]
  }
};

// 🎒 HARD (11-14 let)
const JUNIOR_CATEGORIES_HARD = {
  "animals": {
    name: "Zvířata",
    aspects: ["Savci", "Ptáci", "Mořští živočichové", "Hmyz", "Rekord největší", "Vyhynulé druhy"]
  },
  "fairytales": {
    name: "Pohádky a filmy",
    aspects: ["České pohádky", "Disney", "Pixar", "Marvel", "Harry Potter", "Star Wars"]
  },
  "body": {
    name: "Lidské tělo",
    aspects: ["Kosti", "Orgány", "Svaly", "Mozek", "Srdce a krev", "Výživa"]
  },
  "world": {
    name: "Svět kolem nás",
    aspects: ["Hlavní města", "Kontinenty", "Oceány", "Řeky", "Hory", "Slavné stavby"]
  },
  "space": {
    name: "Vesmír",
    aspects: ["Planety", "Slunce", "Měsíc", "Hvězdy", "Galaxie", "Astronauti", "Komety"]
  },
  "sports_kids": {
    name: "Sport",
    aspects: ["Fotbal", "Hokej", "Olympijské hry", "Slavní sportovci", "Rekordy"]
  },
  "science_kids": {
    name: "Věda",
    aspects: ["Dinosauři", "Sopky", "Elektřina", "Barvy a světlo", "Vynálezy", "Ekologie"]
  },
  "history_kids": {
    name: "Historie",
    aspects: ["Rytíři a hrady", "Egypt a faraoni", "Vikingové", "Pravěk", "Slavní objevitelé"]
  }
};

// Konfigurace obtížností
const MODE_CONFIG = {
  adult: {
    name: "🎓 Adult (18+)",
    dbMode: "adult",
    dbDifficulty: "normal",
    categories: ADULT_CATEGORIES,
    maxWords: 4,
    style: "dospělé publikum"
  },
  easy: {
    name: "🐣 Easy (4-6 let)",
    dbMode: "kid",
    dbDifficulty: "easy",
    categories: JUNIOR_CATEGORIES_EASY,
    maxWords: 2,
    style: "předškoláky (4-6 let)"
  },
  medium: {
    name: "📚 Medium (7-10 let)",
    dbMode: "kid",
    dbDifficulty: "medium",
    categories: JUNIOR_CATEGORIES_MEDIUM,
    maxWords: 3,
    style: "školáky (7-10 let)"
  },
  hard: {
    name: "🎒 Hard (11-14 let)",
    dbMode: "kid",
    dbDifficulty: "hard",
    categories: JUNIOR_CATEGORIES_HARD,
    maxWords: 4,
    style: "teenagery (11-14 let)"
  }
};

// === 🔧 POMOCNÉ FUNKCE ===

function selectRandomCategoryAspectPairs(categories, count) {
  const pairs = [];
  const categoryKeys = Object.keys(categories);
  
  for (let i = 0; i < count; i++) {
    const catKey = categoryKeys[Math.floor(Math.random() * categoryKeys.length)];
    const category = categories[catKey];
    const aspect = category.aspects[Math.floor(Math.random() * category.aspects.length)];
    
    pairs.push({
      categoryKey: catKey,
      categoryName: category.name,
      aspect: aspect
    });
  }
  
  return pairs;
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// === 📝 SYSTEM PROMPTS ===

function buildSystemPrompt(mode) {
  const config = MODE_CONFIG[mode];
  
  if (mode === 'adult') {
    return `Jsi expert na tvorbu kvízových otázek v češtině pro dospělé. Máš přístup k internetu a MUSÍŠ ověřovat fakta!

# PRAVIDLA KVALITY

## Otázka:
- Musí mít JEDNOZNAČNOU faktickou odpověď
- Nesmí obsahovat správnou odpověď v textu
- Musí být zajímavá a vzdělávací

## Odpovědi:
- PŘESNĚ 3 možnosti (A, B, C)
- Maximálně ${config.maxWords} slova (max 25 znaků!)
- PRÁVĚ JEDNA správná
- Špatné odpovědi musí být věrohodné ale JEDNOZNAČNĚ špatné

## ZAKÁZÁNO:
- Subjektivní otázky ("nejlepší", "nejkrásnější")
- Otázky s více možnými odpověďmi

# DŮLEŽITÉ
Využij svůj přístup k internetu pro ověření KAŽDÉHO faktu!`;
  }
  
  // JUNIOR prompts
  return `Jsi expert na tvorbu kvízových otázek v češtině pro ${config.style}. Máš přístup k internetu a MUSÍŠ ověřovat fakta!

# PRAVIDLA PRO ${config.name.toUpperCase()}

## Otázka:
- Musí být JEDNODUCHÁ a srozumitelná pro děti
- Musí mít JEDNOZNAČNOU odpověď
- Nesmí obsahovat správnou odpověď v textu
- Musí být zábavná a vzdělávací

## Odpovědi:
- PŘESNĚ 3 možnosti (A, B, C)
- Maximálně ${config.maxWords} slova (max 20 znaků!)
- PRÁVĚ JEDNA správná
- Špatné odpovědi musí být věrohodné ale JEDNOZNAČNĚ špatné

## 🚨 KRITICKÁ PRAVIDLA:
- NEVYMÝŠLEJ si fakta ani postavy!
- Ptej se POUZE na věci, které děti PROKAZATELNĚ znají
- U pohádek se ptej JEN na HLAVNÍ známé postavy (Krteček, Rumcajs, Elsa, Simba...)

## ❌ ZAKÁZANÉ FORMULACE:
- "Co jí kočka/pes?" → Více odpovědí správně!
- "Jaká je zelenina?" → Více odpovědí správně!
- "Co létá?" → Více odpovědí správně!
- "Kdo je hlavní postava večerníčku?" → BEZ názvu je to špatně!

## ✅ SPRÁVNÉ FORMULACE:
- "Kolik nohou má pavouk?" → 8 (konkrétní číslo)
- "Jakou barvu má banán?" → Žlutá (jednoznačná)
- "Jak se jmenuje hlavní postava večerníčku O KRTEČKOVI?" → Krteček

# DŮLEŽITÉ
Využij svůj přístup k internetu pro ověření KAŽDÉHO faktu!`;
}

// === 🌐 PERPLEXITY API ===

async function callPerplexityBatch(systemPrompt, userPrompt) {
  if (!PERPLEXITY_API_KEY) {
    throw new Error('PERPLEXITY_API_KEY není nastavený');
  }
  
  stats.apiCalls.batch++;
  const startTime = Date.now();
  
  console.log(`${c.cyan}🌐 Volám Perplexity API (${BATCH_SIZE} otázek)...${c.reset}`);
  
  const response = await fetch(PERPLEXITY_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: PERPLEXITY_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.85,
      max_tokens: 8000,
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Perplexity API error: ${response.status} - ${errorText}`);
  }
  
  const data = await response.json();
  const elapsed = Date.now() - startTime;
  stats.time.batch += elapsed;
  
  console.log(`${c.green}   ✅ Odpověď za ${elapsed}ms${c.reset}`);
  if (data.citations && data.citations.length > 0) {
    console.log(`${c.blue}   📚 Citace: ${data.citations.length} zdrojů${c.reset}`);
  }
  
  return data.choices[0].message.content;
}

// === 🛡️ FILTRY ===

function filterLongAnswers(questions, maxLength = 25) {
  return questions.filter(q => {
    const tooLong = q.options.some(opt => opt.length > maxLength);
    if (tooLong) {
      console.log(`${c.yellow}   ⚠️ Dlouhá odpověď: "${q.question.substring(0, 40)}..."${c.reset}`);
      return false;
    }
    return true;
  });
}

const usedCorrectAnswers = new Set();

function filterDuplicateAnswers(questions) {
  const seenAnswers = new Set();
  const filtered = [];
  
  for (const q of questions) {
    const correctAnswer = q.options[q.correct].toLowerCase().trim();
    
    if (seenAnswers.has(correctAnswer) || usedCorrectAnswers.has(correctAnswer)) {
      console.log(`${c.yellow}   ⚠️ Duplicitní odpověď: "${correctAnswer}"${c.reset}`);
      continue;
    }
    
    seenAnswers.add(correctAnswer);
    filtered.push(q);
  }
  
  return filtered;
}

function filterSimilarQuestions(questions, threshold = 0.5) {
  const dominated = new Set();
  
  for (let i = 0; i < questions.length; i++) {
    if (dominated.has(i)) continue;
    
    const words1 = new Set(
      questions[i].question.toLowerCase().split(/\s+/).filter(w => w.length > 3)
    );
    
    for (let j = i + 1; j < questions.length; j++) {
      if (dominated.has(j)) continue;
      
      const words2 = new Set(
        questions[j].question.toLowerCase().split(/\s+/).filter(w => w.length > 3)
      );
      
      const intersection = [...words1].filter(w => words2.has(w)).length;
      const union = new Set([...words1, ...words2]).size;
      const similarity = union > 0 ? intersection / union : 0;
      
      if (similarity > threshold) {
        dominated.add(j);
      }
    }
  }
  
  return questions.filter((_, i) => !dominated.has(i));
}

function filterAnswerInQuestion(questions) {
  return questions.filter(q => {
    const questionLower = q.question.toLowerCase();
    const correctAnswer = q.options[q.correct].toLowerCase();
    
    if (correctAnswer.length > 3 && questionLower.includes(correctAnswer)) {
      console.log(`${c.yellow}   ⚠️ Odpověď v otázce: "${correctAnswer}"${c.reset}`);
      return false;
    }
    return true;
  });
}

// === 🔍 SELF-CRITIQUE (PERPLEXITY) ===

async function selfCritiqueQuestion(question, mode) {
  const config = MODE_CONFIG[mode];
  
  const critiquePrompt = `Zkontroluj tuto kvízovou otázku pro ${config.style}. Ověř fakta na internetu!

OTÁZKA: "${question.question}"
MOŽNOSTI:
A) ${question.options[0]}
B) ${question.options[1]}
C) ${question.options[2]}
OZNAČENÁ SPRÁVNÁ: ${question.options[question.correct]}

KONTROLUJ:
1. FAKTICKÁ SPRÁVNOST: Je označená odpověď skutečně správná? (OVĚŘ NA INTERNETU!)
2. JEDNOZNAČNOST: Je pouze jedna odpověď správná?
3. SROZUMITELNOST: Je otázka jasná pro cílovou skupinu?
4. GRAMATIKA: Je čeština správná?

ZAMÍTNI pokud je jakýkoli problém.

VERDIKT: Odpověz POUZE slovem PASS nebo FAIL.`;

  try {
    stats.apiCalls.critique++;
    const startTime = Date.now();
    
    const response = await fetch(PERPLEXITY_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: PERPLEXITY_MODEL,
        messages: [{ role: "user", content: critiquePrompt }],
        temperature: 0.1,
        max_tokens: 100,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Perplexity API error: ${response.status}`);
    }
    
    const data = await response.json();
    stats.time.critique += Date.now() - startTime;

    const result = data.choices[0].message.content.trim();
    return result.toUpperCase().includes("PASS");
    
  } catch (error) {
    console.warn(`${c.yellow}   ⚠️ Critique error: ${error.message}${c.reset}`);
    return true;
  }
}

async function runSelfCritiqueBatch(questions, mode) {
  console.log(`\n${c.cyan}🔍 Perplexity Self-Critique pro ${questions.length} otázek...${c.reset}`);
  
  const passed = [];
  
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    process.stdout.write(`   [${i + 1}/${questions.length}] `);
    
    const ok = await selfCritiqueQuestion(q, mode);
    
    if (ok) {
      process.stdout.write(`${c.green}✓${c.reset}\n`);
      passed.push(q);
    } else {
      process.stdout.write(`${c.red}✗${c.reset}\n`);
    }
    
    // Rate limiting
    await new Promise(r => setTimeout(r, 200));
  }
  
  console.log(`${c.green}   ✅ Prošlo: ${passed.length}/${questions.length}${c.reset}`);
  return passed;
}

// === 🔀 SHUFFLE ODPOVĚDÍ ===

function shuffleQuestionAnswers(questions) {
  return questions.map(q => {
    const pairs = q.options.map((opt, i) => ({
      text: opt,
      isCorrect: i === q.correct
    }));
    
    shuffleArray(pairs);
    
    return {
      ...q,
      options: pairs.map(p => p.text),
      correct: pairs.findIndex(p => p.isCorrect)
    };
  });
}

// === 🚀 HLAVNÍ GENEROVÁNÍ ===

async function generateFullBatch(mode = 'adult', saveToDb = false) {
  const config = MODE_CONFIG[mode];
  
  console.log('\n' + c.bgMagenta + c.white + c.bright + ' '.repeat(70) + c.reset);
  console.log(c.bgMagenta + c.white + c.bright + `  🧪 PERPLEXITY PIPELINE - ${config.name}` + ' '.repeat(40) + c.reset);
  console.log(c.bgMagenta + c.white + c.bright + ' '.repeat(70) + c.reset + '\n');
  
  resetStats();
  const totalStart = Date.now();
  
  // 1. Vyber kategorie a aspekty
  const pairs = selectRandomCategoryAspectPairs(config.categories, BATCH_SIZE);
  const aspectList = pairs.map((p, i) => `${i + 1}. ${p.categoryName} - ${p.aspect}`).join("\n");
  
  console.log(`${c.cyan}📚 Vybrané kategorie:${c.reset}`);
  const uniqueCats = [...new Set(pairs.map(p => p.categoryName))];
  console.log(`   ${uniqueCats.join(', ')}\n`);
  
  // 2. Připrav prompty
  const systemPrompt = buildSystemPrompt(mode);
  
  const userPrompt = `
# ÚKOL
Vygeneruj PŘESNĚ ${BATCH_SIZE} kvízových otázek pro ${config.style}.

# ZADÁNÍ (${BATCH_SIZE} kombinací)
${aspectList}

# KRITICKÁ PRAVIDLA
- KAŽDÁ otázka MUSÍ být o JINÉM tématu
- KAŽDÁ otázka MUSÍ mít JINOU správnou odpověď
- OVĚŘ KAŽDÝ FAKT NA INTERNETU!

# PRAVIDLA KVALITY
- Odpovědi maximálně ${config.maxWords} slova
- V otázce NIKDY nezmiňuj správnou odpověď

# VÝSTUPNÍ FORMÁT (POUZE PLATNÝ JSON)
{
  "questions": [
    {"question": "Text otázky", "options": ["A", "B", "C"], "correct": 0, "category": "název", "aspect": "aspekt"}
  ]
}

ODPOVĚZ POUZE PLATNÝM JSON BEZ DALŠÍHO TEXTU.
`;

  // 3. Volej Perplexity
  let rawContent;
  try {
    rawContent = await callPerplexityBatch(systemPrompt, userPrompt);
  } catch (error) {
    console.error(`${c.red}${c.bright}❌ Perplexity selhalo: ${error.message}${c.reset}`);
    return [];
  }
  
  // 4. Parse JSON
  console.log(`\n${c.cyan}📋 Parsuju JSON...${c.reset}`);
  rawContent = rawContent.replace(/```json/g, '').replace(/```/g, '').trim();
  
  let parsed;
  try {
    parsed = JSON.parse(rawContent);
  } catch (e) {
    console.error(`${c.red}❌ JSON parse error: ${e.message}${c.reset}`);
    return [];
  }
  
  if (!parsed.questions || !Array.isArray(parsed.questions)) {
    console.error(`${c.red}❌ Chybí pole "questions"${c.reset}`);
    return [];
  }
  
  // 5. Základní validace
  let questions = parsed.questions.filter(q => {
    if (!q.question || !q.options || q.options.length !== 3) return false;
    if (typeof q.correct !== 'number' || q.correct < 0 || q.correct > 2) return false;
    return true;
  });
  
  stats.generated = questions.length;
  console.log(`${c.green}   ✅ Vygenerováno: ${questions.length}/${parsed.questions.length}${c.reset}\n`);
  
  // 6. FILTRY
  console.log(`${c.cyan}🛡️ Aplikuji filtry...${c.reset}`);
  
  const maxLen = mode === 'adult' ? 25 : 20;
  questions = filterLongAnswers(questions, maxLen);
  questions = filterDuplicateAnswers(questions);
  questions = filterSimilarQuestions(questions);
  questions = filterAnswerInQuestion(questions);
  
  stats.afterFilters = questions.length;
  console.log(`   ${c.yellow}Po filtrech: ${questions.length}${c.reset}`);
  
  // 7. SELF-CRITIQUE
  questions = await runSelfCritiqueBatch(questions, mode);
  stats.afterSelfCritique = questions.length;
  
  // 8. SHUFFLE ODPOVĚDÍ
  console.log(`\n${c.cyan}🔀 Zamíchávám odpovědi...${c.reset}`);
  questions = shuffleQuestionAnswers(questions);
  
  // Označ zdroj
  questions = questions.map(q => ({
    ...q,
    _fromPerplexity: true,
    _fromLLM: true,
    _fromDb: false
  }));
  
  stats.final = questions.length;
  stats.time.total = Date.now() - totalStart;
  
  // 9. Ulož do DB
  if (saveToDb && questions.length > 0) {
    try {
      questionDatabase.initDatabase();
      const saved = questionDatabase.saveQuestions(questions, config.dbMode, config.dbDifficulty);
      stats.savedToDb = saved;
      console.log(`\n${c.green}${c.bright}💾 Uloženo ${saved} otázek do DB (${config.dbMode}/${config.dbDifficulty})${c.reset}`);
    } catch (e) {
      console.error(`${c.red}❌ DB error: ${e.message}${c.reset}`);
    }
  }
  
  // 10. Statistiky
  printStats(mode);
  
  return questions;
}

function printStats(mode) {
  const config = MODE_CONFIG[mode];
  
  console.log('\n' + c.cyan + c.bright + '═'.repeat(70) + c.reset);
  console.log(c.cyan + c.bright + `  📊 STATISTIKY - ${config.name}` + c.reset);
  console.log(c.cyan + c.bright + '═'.repeat(70) + c.reset);
  
  console.log(`\n${c.white}${c.bright}Pipeline:${c.reset}`);
  console.log(`   Vygenerováno:       ${c.yellow}${stats.generated}${c.reset}`);
  console.log(`   Po filtrech:        ${c.yellow}${stats.afterFilters}${c.reset}`);
  console.log(`   Po Self-Critique:   ${c.green}${c.bright}${stats.afterSelfCritique}${c.reset}`);
  console.log(`   ${c.bright}FINÁLNÍ:           ${c.green}${stats.final}${c.reset}`);
  
  const successRate = stats.generated > 0 ? (stats.final / stats.generated * 100).toFixed(1) : 0;
  console.log(`\n${c.white}${c.bright}Úspěšnost: ${c.green}${successRate}%${c.reset}`);
  
  console.log(`\n${c.white}${c.bright}API volání:${c.reset}`);
  console.log(`   Batch:    ${c.cyan}${stats.apiCalls.batch}${c.reset} (${stats.time.batch}ms)`);
  console.log(`   Critique: ${c.cyan}${stats.apiCalls.critique}${c.reset} (${stats.time.critique}ms)`);
  console.log(`   ${c.bright}Celkem:  ${c.cyan}${stats.time.total}ms${c.reset}`);
  
  if (stats.savedToDb > 0) {
    console.log(`\n${c.green}${c.bright}💾 Uloženo do DB: ${stats.savedToDb}${c.reset}`);
  }
  
  console.log('\n' + c.cyan + '═'.repeat(70) + c.reset + '\n');
}

// === 🚀 CLI ===

async function main() {
  const args = process.argv.slice(2);
  
  if (!PERPLEXITY_API_KEY) {
    console.error(`${c.red}${c.bright}❌ PERPLEXITY_API_KEY není nastavený${c.reset}`);
    process.exit(1);
  }
  
  console.log(`${c.green}✓ Perplexity API klíč nalezen${c.reset}\n`);
  
  const command = args[0]?.toLowerCase() || 'test';
  
  switch (command) {
    case 'save': {
      const mode = args[1] || 'adult';
      if (!MODE_CONFIG[mode]) {
        console.error(`${c.red}Neznámý mód: ${mode}. Použij: adult, easy, medium, hard${c.reset}`);
        break;
      }
      await generateFullBatch(mode, true);
      break;
    }
    
    case 'fill': {
      const count = parseInt(args[1]) || 100;
      const mode = args[2] || 'adult';
      
      if (!MODE_CONFIG[mode]) {
        console.error(`${c.red}Neznámý mód: ${mode}. Použij: adult, easy, medium, hard${c.reset}`);
        break;
      }
      
      const config = MODE_CONFIG[mode];
      const batches = Math.ceil(count / BATCH_SIZE);
      
      console.log(`${c.magenta}${c.bright}📦 Plnění DB: ${count} otázek ${config.name} (${batches} batchů)${c.reset}\n`);
      
      let totalSaved = 0;
      for (let i = 0; i < batches; i++) {
        console.log(`\n${c.cyan}━━━ BATCH ${i + 1}/${batches} ━━━${c.reset}`);
        await generateFullBatch(mode, true);
        totalSaved += stats.savedToDb;
        
        if (i < batches - 1) {
          console.log(`${c.yellow}⏳ Pauza 3s...${c.reset}`);
          await new Promise(r => setTimeout(r, 3000));
        }
      }
      console.log(`\n${c.green}${c.bright}✅ Celkem uloženo: ${totalSaved} otázek${c.reset}\n`);
      break;
    }
    
    // 🆕 LOOP - Nekonečné generování pro jednu kategorii (pro paralelní běh)
    case 'loop': {
      const mode = args[1] || 'adult';
      const targetCount = parseInt(args[2]) || 1000;  // Cílový počet
      
      if (!MODE_CONFIG[mode]) {
        console.error(`${c.red}Neznámý mód: ${mode}. Použij: adult, easy, medium, hard${c.reset}`);
        break;
      }
      
      const config = MODE_CONFIG[mode];
      questionDatabase.initDatabase();
      
      console.log(`\n${c.bgMagenta}${c.white}${c.bright}  🔄 LOOP MODE - ${config.name}  ${c.reset}`);
      console.log(`${c.cyan}   Cíl: ${targetCount} otázek${c.reset}`);
      console.log(`${c.yellow}   Pro zastavení stiskni Ctrl+C${c.reset}\n`);
      
      let totalSaved = 0;
      let batchNum = 0;
      
      while (true) {
        batchNum++;
        
        // Zkontroluj aktuální stav DB
        const currentStats = questionDatabase.getDatabaseStats();
        let currentCount = 0;
        
        if (mode === 'adult') {
          currentCount = currentStats.adultQuestions || 0;
        } else {
          // Pro kid módy najdi v byDifficulty
          const difficultyEntry = currentStats.byDifficulty?.find(
            d => d.mode === 'kid' && d.difficulty === config.dbDifficulty
          );
          currentCount = difficultyEntry?.count || 0;
        }
        
        console.log(`\n${c.cyan}━━━ BATCH ${batchNum} | Aktuálně: ${currentCount}/${targetCount} ━━━${c.reset}`);
        
        if (currentCount >= targetCount) {
          console.log(`\n${c.green}${c.bright}🎉 HOTOVO! Dosaženo ${currentCount} otázek pro ${mode}${c.reset}\n`);
          break;
        }
        
        try {
          await generateFullBatch(mode, true);
          totalSaved += stats.savedToDb;
          
          // Pauza mezi batchi (náhodná pro rozložení zátěže při paralelním běhu)
          const pause = 2000 + Math.random() * 2000;
          console.log(`${c.dim}⏳ Pauza ${Math.round(pause/1000)}s před dalším batchem...${c.reset}`);
          await new Promise(r => setTimeout(r, pause));
          
        } catch (error) {
          console.error(`${c.red}❌ Chyba v batchi: ${error.message}${c.reset}`);
          console.log(`${c.yellow}⏳ Čekám 10s před retry...${c.reset}`);
          await new Promise(r => setTimeout(r, 10000));
        }
      }
      
      console.log(`\n${c.green}${c.bright}✅ Loop ukončen. Celkem uloženo: ${totalSaved} otázek${c.reset}\n`);
      break;
    }
    
    case 'stats': {
      questionDatabase.initDatabase();
      const dbStats = questionDatabase.getDatabaseStats();
      console.log(`\n${c.cyan}${c.bright}📊 Statistiky DB:${c.reset}`);
      console.log(`   Celkem: ${c.green}${dbStats.totalQuestions}${c.reset}`);
      console.log(`   Adult:  ${c.yellow}${dbStats.adultQuestions}${c.reset}`);
      console.log(`   Kid:    ${c.yellow}${dbStats.kidQuestions}${c.reset}\n`);
      break;
    }
    
    case 'help': {
      console.log(`
${c.cyan}${c.bright}🧪 100% PERPLEXITY PIPELINE${c.reset}

${c.white}Použití:${c.reset}
  ${c.yellow}node test_perplexity.js${c.reset}                  Test adult (bez ukládání)
  ${c.yellow}node test_perplexity.js save${c.reset}             Batch adult + uložení
  ${c.yellow}node test_perplexity.js save easy${c.reset}        Batch easy + uložení
  ${c.yellow}node test_perplexity.js fill 100${c.reset}         100 adult otázek do DB
  ${c.yellow}node test_perplexity.js fill 100 easy${c.reset}    100 easy otázek do DB
  ${c.yellow}node test_perplexity.js fill 100 medium${c.reset}  100 medium otázek do DB
  ${c.yellow}node test_perplexity.js fill 100 hard${c.reset}    100 hard otázek do DB
  ${c.yellow}node test_perplexity.js stats${c.reset}            Statistiky DB

${c.white}${c.bright}🔄 PARALELNÍ GENEROVÁNÍ (každý v jiném terminálu):${c.reset}
  ${c.green}node test_perplexity.js loop adult 2000${c.reset}   Generuj adult do 2000
  ${c.green}node test_perplexity.js loop easy 1000${c.reset}    Generuj easy do 1000
  ${c.green}node test_perplexity.js loop medium 1000${c.reset}  Generuj medium do 1000
  ${c.green}node test_perplexity.js loop hard 1000${c.reset}    Generuj hard do 1000

${c.white}Módy:${c.reset}
  ${c.green}adult${c.reset}   - Dospělí (18+)
  ${c.green}easy${c.reset}    - Předškoláci (4-6 let)
  ${c.green}medium${c.reset}  - Mladší školáci (7-10 let)
  ${c.green}hard${c.reset}    - Starší školáci (11-14 let)
`);
      break;
    }
    
    default: {
      // Test bez ukládání
      const mode = args[0] && MODE_CONFIG[args[0]] ? args[0] : 'adult';
      await generateFullBatch(mode, false);
    }
  }
}

main().catch(error => {
  console.error(`${c.red}${c.bright}❌ Kritická chyba: ${error.message}${c.reset}`);
  process.exit(1);
});
