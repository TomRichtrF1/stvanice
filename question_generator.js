import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

// === 🔧 GROQ KONFIGURACE ===
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const MODEL = "llama-3.3-70b-versatile";

// === 🧠 PAMĚŤ PRO ANTI-REPEAT (10 batchů = 120 otázek) ===
const recentQuestions = [];
const recentEntities = [];
const MAX_QUESTION_HISTORY = 120;
const MAX_ENTITY_HISTORY = 200;

// === 📦 CACHE PRO BATCH OTÁZKY ===
let questionCache = [];

// === 🎯 KATEGORIE A ASPEKTY - ADULT ===
const ADULT_CATEGORIES = {
  "motorsport": {
    name: "Motorsport",
    aspects: [
      "Historický moment",
      "Konkrétní okruh (trať)",
      "Kuriozita nebo zajímavost",
      "Tým nebo stáj",
      "Pravidlo nebo kontroverzní rozhodnutí",
      "Rekord",
      "Slavný souboj dvou závodníků",
      "Nehoda nebo drama",
      "Šampionát konkrétního roku",
      "Technický prvek vozu",
      "Sponzoři a byznys",
      "Legendární závodník a jeho kariéra"
    ]
  },
  "team_sports": {
    name: "Týmové sporty",
    aspects: [
      "Historický moment nebo zápas",
      "Stadion nebo aréna",
      "Kuriozita nebo zajímavost",
      "Klub nebo tým",
      "Pravidlo nebo kontroverzní rozhodnutí",
      "Rekord individuální nebo týmový",
      "Slavné rivalství",
      "Přestup nebo transfer",
      "Mistrovství nebo turnaj konkrétního roku",
      "Trenér nebo manažer",
      "Národní tým",
      "Legendární hráč a jeho kariéra"
    ]
  },
  "film": {
    name: "Film a seriály",
    aspects: [
      "Historický milník kinematografie",
      "Herec nebo herečka",
      "Kuriozita ze zákulisí natáčení",
      "Režisér",
      "Ocenění Oscar nebo Zlatý glóbus",
      "Rekord v tržbách nebo délce",
      "Slavná filmová dvojice nebo rivalita",
      "Kontroverzní moment nebo skandál",
      "Konkrétní film a jeho detaily",
      "Hudba nebo soundtrack",
      "Filmové studio nebo produkce",
      "Adaptace knihy na film"
    ]
  },
  "music": {
    name: "Hudba",
    aspects: [
      "Historický milník",
      "Zpěvák nebo zpěvačka",
      "Kuriozita nebo zajímavost",
      "Kapela nebo hudební skupina",
      "Ocenění Grammy nebo Brit Awards",
      "Rekord v prodejích nebo koncertech",
      "Slavná spolupráce nebo rivalita",
      "Kontroverzní moment nebo skandál",
      "Konkrétní album nebo píseň",
      "Hudební nástroj nebo produkce",
      "Hudební žánr a jeho historie",
      "Koncert nebo turné"
    ]
  },
  "history": {
    name: "Historie",
    aspects: [
      "Klíčová událost nebo bitva",
      "Místo nebo lokalita",
      "Kuriozita nebo málo známý fakt",
      "Významná osobnost",
      "Politické rozhodnutí nebo smlouva",
      "První nebo poslední svého druhu",
      "Rivalita nebo konflikt dvou stran",
      "Tragédie nebo katastrofa",
      "Konkrétní rok nebo období",
      "Vynález nebo technologie té doby",
      "Kultura a umění období",
      "Důsledky události pro dnešek"
    ]
  },
  "geography": {
    name: "Zeměpis",
    aspects: [
      "Hlavní město",
      "Řeka nebo jezero",
      "Kuriozita nebo zajímavost",
      "Hora nebo pohoří",
      "Hranice nebo sousední země",
      "Rekord největší nejmenší nejvyšší",
      "Historická souvislost místa",
      "Přírodní úkaz nebo památka",
      "Obyvatelstvo nebo jazyk",
      "Vlajka nebo symbol",
      "Ekonomika nebo průmysl",
      "Slavná osobnost z dané země"
    ]
  },
  "science": {
    name: "Věda a technologie",
    aspects: [
      "Historický objev",
      "Vědec nebo vynálezce",
      "Kuriozita nebo paradox",
      "Instituce nebo laboratoř",
      "Teorie nebo zákon",
      "Rekord první největší nejmenší",
      "Rivalita nebo závod",
      "Nehoda nebo selhání",
      "Konkrétní rok nebo experiment",
      "Praktická aplikace v životě",
      "Nobelova cena",
      "Budoucnost a predikce"
    ]
  },
  "food": {
    name: "Gastronomie",
    aspects: [
      "Historický původ pokrmu",
      "Země nebo region",
      "Kuriozita nebo zajímavost",
      "Ingredience nebo surovina",
      "Tradiční příprava nebo recept",
      "Rekord nejdražší největší",
      "Slavný šéfkuchař nebo restaurace",
      "Kontroverzní jídlo nebo trend",
      "Národní pokrm konkrétní země",
      "Nápoj víno pivo káva",
      "Michelin a ocenění",
      "Jídlo v popkultuře"
    ]
  }
};

// === 🎯 KATEGORIE A ASPEKTY - JUNIOR ===
const JUNIOR_CATEGORIES = {
  "animals": {
    name: "Zvířata",
    aspects: [
      "Savci",
      "Ptáci",
      "Mořští živočichové",
      "Hmyz",
      "Domácí mazlíčci",
      "Zvířata v ZOO",
      "Kde žijí a biotopy",
      "Co jedí",
      "Rekordy největší nejrychlejší",
      "Zvířata z pohádek",
      "Mláďata a jak se jmenují",
      "Zvuky zvířat"
    ]
  },
  "fairytales": {
    name: "Pohádky a filmy",
    aspects: [
      "České pohádky",
      "Disney postavy",
      "Pixar filmy",
      "Kouzelné předměty",
      "Záporáci",
      "Princezny a princové",
      "Zvířecí hrdinové",
      "Písničky z pohádek",
      "Kde se odehrává",
      "Jak to končí",
      "Kdo napsal nebo natočil",
      "Kamarádi hlavního hrdiny"
    ]
  },
  "body": {
    name: "Lidské tělo",
    aspects: [
      "Kosti a kostra",
      "Orgány",
      "Smysly pět smyslů",
      "Svaly",
      "Co jíme a výživa",
      "Zdraví a hygiena",
      "Jak rosteme",
      "Zajímavosti o těle",
      "Co dělá mozek",
      "Srdce a krev",
      "Zuby",
      "Spánek"
    ]
  },
  "world": {
    name: "Svět kolem nás",
    aspects: [
      "Hlavní města",
      "Kontinenty",
      "Oceány a moře",
      "Vlajky",
      "Jazyky",
      "Slavné stavby",
      "Zvířata podle kontinentů",
      "Počasí a klima",
      "Řeky",
      "Hory",
      "Ostrovy",
      "Pouště a pralesy"
    ]
  },
  "space": {
    name: "Vesmír",
    aspects: [
      "Planety",
      "Slunce",
      "Měsíc",
      "Hvězdy",
      "Astronauti",
      "Rakety a sondy",
      "Galaxie",
      "Zatmění",
      "Komety",
      "Souhvězdí",
      "Vesmírné rekordy",
      "Život ve vesmíru"
    ]
  },
  "sports_kids": {
    name: "Sport pro děti",
    aspects: [
      "Fotbal",
      "Hokej",
      "Plavání",
      "Atletika běh skok",
      "Olympijské hry",
      "Pravidla her",
      "Slavní sportovci",
      "Míče a vybavení",
      "Zimní sporty",
      "Týmy a kluby",
      "Rekordy",
      "Sport ve škole"
    ]
  }
};

// === 🔀 POMOCNÉ FUNKCE ===

/**
 * Zamíchá pole (Fisher-Yates shuffle)
 */
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Přidá otázku do historie pro anti-repeat
 */
function addToHistory(question) {
  recentQuestions.push(question.toLowerCase());
  if (recentQuestions.length > MAX_QUESTION_HISTORY) {
    recentQuestions.shift();
  }
  
  // Extrahuj entity (jména, místa)
  const firstSpaceIndex = question.indexOf(' ');
  const withoutFirstWord = firstSpaceIndex > 0 ? question.substring(firstSpaceIndex + 1) : '';
  const entities = withoutFirstWord.match(/\b[A-ZČŘŠŽÝÁÍÉÚŮ][a-zčřšžýáíéúůěň]{3,}(?:\s+[A-ZČŘŠŽÝÁÍÉÚŮ][a-zčřšžýáíéúůěň]+)*/g);
  
  if (entities) {
    entities.forEach(entity => {
      recentEntities.push(entity.toLowerCase());
      if (recentEntities.length > MAX_ENTITY_HISTORY) {
        recentEntities.shift();
      }
    });
  }
}

/**
 * Přidá celý batch do historie
 */
function addBatchToHistory(questions) {
  questions.forEach(q => addToHistory(q.question));
}

/**
 * Vybere 12 náhodných kombinací [kategorie + aspekt] napříč všemi kategoriemi
 */
function selectRandomCategoryAspectPairs(categories, count = 12) {
  const allPairs = [];
  
  // Vytvoř všechny možné páry [kategorie, aspekt]
  for (const [catKey, catData] of Object.entries(categories)) {
    for (const aspect of catData.aspects) {
      allPairs.push({
        categoryKey: catKey,
        categoryName: catData.name,
        aspect: aspect
      });
    }
  }
  
  // Zamíchej a vyber prvních N
  const shuffled = shuffleArray(allPairs);
  return shuffled.slice(0, count);
}

/**
 * Formátuje seznam entit z historie pro prompt
 */
function getRecentEntitiesForPrompt() {
  if (recentEntities.length === 0) return "";
  
  const uniqueEntities = [...new Set(recentEntities.slice(-50))];
  return `\nNEPOUŽÍVEJ tyto entity (již byly použity): ${uniqueEntities.join(", ")}`;
}

// === 🛡️ VRSTVA 1: FILTR DUPLICITNÍCH ODPOVĚDÍ ===

/**
 * Odfiltruje otázky se stejnou správnou odpovědí
 */
function filterDuplicateAnswers(questions) {
  const seenAnswers = new Set();
  const filtered = [];
  
  for (const q of questions) {
    const correctAnswer = q.options[q.correct].toLowerCase().trim();
    
    if (seenAnswers.has(correctAnswer)) {
      console.log(`⚠️ Duplicitní odpověď odfiltrována: "${correctAnswer}"`);
      continue; // Přeskoč duplicitu
    }
    
    seenAnswers.add(correctAnswer);
    filtered.push(q);
  }
  
  return filtered;
}

// === 🛡️ VRSTVA 2: FILTR PODOBNÝCH OTÁZEK ===

/**
 * Odfiltruje otázky s příliš podobným textem
 */
function filterSimilarQuestions(questions, threshold = 0.5) {
  const dominated = new Set(); // Indexy otázek k odstranění
  
  for (let i = 0; i < questions.length; i++) {
    if (dominated.has(i)) continue;
    
    const words1 = new Set(
      questions[i].question.toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 3)
    );
    
    for (let j = i + 1; j < questions.length; j++) {
      if (dominated.has(j)) continue;
      
      const words2 = new Set(
        questions[j].question.toLowerCase()
          .split(/\s+/)
          .filter(w => w.length > 3)
      );
      
      if (words1.size === 0 || words2.size === 0) continue;
      
      // Spočítej překryv
      const intersection = [...words1].filter(w => words2.has(w)).length;
      const similarity = intersection / Math.min(words1.size, words2.size);
      
      if (similarity > threshold) {
        console.log(`⚠️ Podobné otázky [${i+1}] ~ [${j+1}] (${(similarity*100).toFixed(0)}%) - odstraňuji druhou`);
        dominated.add(j); // Odstraň tu druhou
      }
    }
  }
  
  return questions.filter((_, i) => !dominated.has(i));
}

// === 🚀 BATCH GENEROVÁNÍ - ZDARMA REŽIM ===

/**
 * Generuje batch 12 otázek pro ZDARMA režim (mix napříč kategoriemi)
 */
async function generateFreeBatch(mode = 'adult') {
  const categories = mode === 'kid' ? JUNIOR_CATEGORIES : ADULT_CATEGORIES;
  const pairs = selectRandomCategoryAspectPairs(categories, 12);
  
  console.log(`\n📦 BATCH GENEROVÁNÍ - ZDARMA ${mode.toUpperCase()}`);
  console.log(`🎲 Vybrané kombinace:`);
  pairs.forEach((p, i) => console.log(`   ${i + 1}. ${p.categoryName} → ${p.aspect}`));
  
  // Formátuj aspekty pro prompt
  const aspectList = pairs.map((p, i) => `${i + 1}. Kategorie "${p.categoryName}" - Aspekt: "${p.aspect}"`).join("\n");
  
  const systemPrompt = mode === 'kid' 
    ? buildJuniorSystemPrompt() 
    : buildAdultSystemPrompt();
  
  const userPrompt = `
# ÚKOL
Vygeneruj PŘESNĚ 12 kvízových otázek. Každá otázka MUSÍ odpovídat zadané kategorii a aspektu.

# ZADÁNÍ (12 kombinací kategorie + aspekt)
${aspectList}

# KRITICKÁ PRAVIDLA DIVERZITY
- KAŽDÁ otázka MUSÍ být o JINÉM tématu
- NIKDY NEOPAKUJ stejnou osobu, zemi, nebo místo ve více otázkách
- NIKDY NEPOUŽÍVEJ stejnou entitu dvakrát
${getRecentEntitiesForPrompt()}

# KRITICKÉ PRAVIDLO - UNIKÁTNÍ ODPOVĚDI
⚠️ KAŽDÁ otázka MUSÍ mít JINOU správnou odpověď!
⚠️ Nikdy negeneruj dvě otázky kde odpověď je stejná entita

# PRAVIDLA KVALITY
- Otázky musí být fakticky správné
- Odpovědi maximálně 4 slova
- V otázce NIKDY nezmiňuj správnou odpověď
- Všechny 3 možnosti musí být věrohodné

# VÝSTUPNÍ FORMÁT (POUZE PLATNÝ JSON)
{
  "questions": [
    {"question": "Text otázky 1", "options": ["A", "B", "C"], "correct": 0},
    {"question": "Text otázky 2", "options": ["A", "B", "C"], "correct": 1},
    ... (celkem 12 otázek)
  ]
}

ODPOVĚZ POUZE PLATNÝM JSON BEZ DALŠÍHO TEXTU.
`;

  return await callGroqBatch(systemPrompt, userPrompt, mode);
}

// === 🚀 BATCH GENEROVÁNÍ - PREMIUM REŽIM ===

/**
 * Generuje batch 12 otázek pro PREMIUM režim (jedno téma od uživatele)
 */
async function generatePremiumBatch(userTopic, mode = 'adult') {
  console.log(`\n📦 BATCH GENEROVÁNÍ - PREMIUM ${mode.toUpperCase()}`);
  console.log(`🎯 Uživatelské téma: "${userTopic}"`);
  
  const systemPrompt = mode === 'kid' 
    ? buildJuniorSystemPrompt() 
    : buildAdultSystemPrompt();
  
  const userPrompt = `
# ÚKOL
Téma od uživatele: "${userTopic}"

Vygeneruj PŘESNĚ 12 kvízových otázek na toto téma.

# KRITICKÁ PRAVIDLA DIVERZITY
NEJPRVE identifikuj 12 různých ASPEKTŮ tohoto tématu.
Například pro "Formula 1": jezdci, týmy, okruhy, pravidla, historie, technika, rekordy, nehody, šampionáty, rivality, kuriozity, byznys.

KAŽDÁ otázka MUSÍ pokrývat JINÝ aspekt tématu!
- NIKDY NEOPAKUJ stejnou osobu ve více než 1 otázce
- NIKDY NEOPAKUJ stejné místo ve více než 1 otázce
- NIKDY NEOPAKUJ stejný rok ve více než 1 otázce
${getRecentEntitiesForPrompt()}

# KRITICKÉ PRAVIDLO - UNIKÁTNÍ ODPOVĚDI
⚠️ KAŽDÁ otázka MUSÍ mít JINOU správnou odpověď!
⚠️ Nikdy negeneruj dvě otázky se stejným tématem (např. dvě o cenách/ocenění)
⚠️ Příklad CO NEDĚLAT:
   ❌ Otázka 1: "Která filmová cena je nejprestižnější?" → Oscar
   ❌ Otázka 2: "Jaké ocenění je v Hollywoodu nejvýznamnější?" → Oscar
   (Obě jsou o stejném tématu a mají stejnou odpověď - ZAKÁZÁNO!)

# PRAVIDLA KVALITY
- Otázky musí být fakticky správné
- Odpovědi maximálně 4 slova
- V otázce NIKDY nezmiňuj správnou odpověď
- Všechny 3 možnosti musí být věrohodné
- Variuj obtížnost (mix lehčích a těžších)

# VÝSTUPNÍ FORMÁT (POUZE PLATNÝ JSON)
{
  "questions": [
    {"question": "Text otázky 1", "options": ["A", "B", "C"], "correct": 0},
    {"question": "Text otázky 2", "options": ["A", "B", "C"], "correct": 1},
    ... (celkem 12 otázek)
  ]
}

ODPOVĚZ POUZE PLATNÝM JSON BEZ DALŠÍHO TEXTU.
`;

  return await callGroqBatch(systemPrompt, userPrompt, mode);
}

// === 📝 SYSTEM PROMPTY ===

function buildAdultSystemPrompt() {
  return `# ROLE
Jsi profesionální autor otázek pro náročné pub kvízy.

# JAZYK
- Piš VŽDY gramaticky správnou češtinou
- Používej české názvy kde je to běžné (Paříž, Londýn, Mnichov)

# OBTÍŽNOST
- STŘEDNÍ až TĚŽŠÍ
- NE "Jaké je hlavní město Francie?" (příliš lehké)
- ANO "Ve kterém městě se nachází opera La Scala?" (vyžaduje znalost)

# KVALITA OTÁZEK
- Testuj SKUTEČNÉ znalosti
- Buď SPECIFICKÝ (přesný rok, jméno, místo)
- Obsahuj zajímavé "fun facts"
- Vyžaduj zamyšlení, ne intuici`;
}

function buildJuniorSystemPrompt() {
  return `# ROLE
Jsi tvůrce vědomostních kvízů pro děti 8-12 let.

# JAZYK
- Piš VŽDY gramaticky správnou češtinou
- Jednoduché, jasné věty
- Vyhni se složitým cizím slovům

# OBTÍŽNOST
- Otázky pro první stupeň ZŠ
- Co by mělo znát dítě 8-12 let
- Zajímavé a poučné

# PRAVIDLA
- Otázky musí mít FAKTICKOU odpověď
- ZAKÁZANÉ: filosofické otázky, abstraktní otázky
- ZAKÁZANÉ: "Co by chtěl být...", "Kdyby byl..."`;
}

// === 🔌 GROQ API VOLÁNÍ ===

async function callGroqBatch(systemPrompt, userPrompt, mode, maxRetries = 5) {
  const temperature = mode === 'kid' ? 0.7 : 0.9;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Volám Groq API (${MODEL})... pokus ${attempt}/${maxRetries}`);
      const startTime = Date.now();
      
      const response = await groq.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: temperature,
        max_tokens: 2500,
      });
      
      const duration = Date.now() - startTime;
      console.log(`✅ Groq odpověděl za ${duration}ms`);
      
      let rawContent = response.choices[0].message.content;
      rawContent = rawContent.replace(/```json/g, "").replace(/```/g, "").trim();
      
      // Pokus o opravu běžných JSON chyb
      rawContent = fixCommonJsonErrors(rawContent);
      
      const parsed = JSON.parse(rawContent);
      
      // Validace struktury
      if (!parsed.questions || !Array.isArray(parsed.questions)) {
        throw new Error("Neplatná struktura: chybí pole 'questions'");
      }
      
      if (parsed.questions.length < 10) {
        throw new Error(`Nedostatek otázek: ${parsed.questions.length}/12`);
      }
      
      // Validace jednotlivých otázek
      let validQuestions = parsed.questions.filter(q => 
        q.question && 
        q.options && 
        Array.isArray(q.options) && 
        q.options.length === 3 &&
        typeof q.correct === 'number' &&
        q.correct >= 0 && 
        q.correct <= 2
      );
      
      console.log(`📊 Validních otázek: ${validQuestions.length}/${parsed.questions.length}`);
      
      // 🛡️ VRSTVA 1: Filtruj duplicitní odpovědi
      const beforeDuplicates = validQuestions.length;
      validQuestions = filterDuplicateAnswers(validQuestions);
      if (validQuestions.length < beforeDuplicates) {
        console.log(`🛡️ Vrstva 1: Odstraněno ${beforeDuplicates - validQuestions.length} duplicitních odpovědí`);
      }
      
      // 🛡️ VRSTVA 2: Filtruj podobné otázky
      const beforeSimilar = validQuestions.length;
      validQuestions = filterSimilarQuestions(validQuestions, 0.5);
      if (validQuestions.length < beforeSimilar) {
        console.log(`🛡️ Vrstva 2: Odstraněno ${beforeSimilar - validQuestions.length} podobných otázek`);
      }
      
      console.log(`📊 Po filtraci duplicit: ${validQuestions.length} otázek`);
      
      if (validQuestions.length < 8) {
        throw new Error(`Příliš málo unikátních otázek: ${validQuestions.length}`);
      }
      
      // Přidej do historie
      addBatchToHistory(validQuestions);
      
      return validQuestions;
      
    } catch (error) {
      console.error(`❌ Pokus ${attempt} selhal:`, error.message);
      
      if (attempt === maxRetries) {
        console.error(`❌ Všechny ${maxRetries} pokusy selhaly`);
        throw error;
      }
      
      console.log(`🔄 Zkouším znovu...`);
    }
  }
}

/**
 * Pokusí se opravit běžné JSON chyby z LLM výstupu
 */
function fixCommonJsonErrors(jsonString) {
  let fixed = jsonString;
  
  // Odstraň trailing čárky před ] nebo }
  fixed = fixed.replace(/,\s*]/g, ']');
  fixed = fixed.replace(/,\s*}/g, '}');
  
  // Oprav chybějící čárky mezi objekty v poli
  fixed = fixed.replace(/}\s*{/g, '},{');
  
  // Oprav chybějící čárky mezi položkami pole
  fixed = fixed.replace(/"\s*\n\s*"/g, '",\n"');
  
  // Odstraň případné BOM nebo neviditelné znaky
  fixed = fixed.replace(/^\uFEFF/, '');
  
  return fixed;
}

// === 🎯 GENEROVÁNÍ JEDNOTLIVÉ OTÁZKY (fallback když dojde cache) ===

async function generateSingleQuestion(topic = 'general', mode = 'adult') {
  console.log(`\n🔄 Generuji JEDNOTLIVOU otázku (${mode})...`);
  
  const categories = mode === 'kid' ? JUNIOR_CATEGORIES : ADULT_CATEGORIES;
  const categoryKeys = Object.keys(categories);
  const randomCatKey = categoryKeys[Math.floor(Math.random() * categoryKeys.length)];
  const randomCat = categories[randomCatKey];
  const randomAspect = randomCat.aspects[Math.floor(Math.random() * randomCat.aspects.length)];
  
  const systemPrompt = mode === 'kid' 
    ? buildJuniorSystemPrompt() 
    : buildAdultSystemPrompt();
  
  const topicInstruction = topic === 'general' 
    ? `Kategorie: "${randomCat.name}", Aspekt: "${randomAspect}"`
    : `Téma od uživatele: "${topic}"`;
  
  const userPrompt = `
# ÚKOL
Vygeneruj JEDNU kvízovou otázku.

${topicInstruction}

# PRAVIDLA
- Otázka musí být fakticky správná
- Odpovědi maximálně 4 slova
- V otázce NIKDY nezmiňuj správnou odpověď
${getRecentEntitiesForPrompt()}

# VÝSTUPNÍ FORMÁT (POUZE JSON)
{
  "question": "Text otázky",
  "options": ["Odpověď A", "Odpověď B", "Odpověď C"],
  "correct": 0
}
`;

  try {
    const response = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: mode === 'kid' ? 0.7 : 0.9,
      max_tokens: 300,
    });
    
    let rawContent = response.choices[0].message.content;
    rawContent = rawContent.replace(/```json/g, "").replace(/```/g, "").trim();
    
    const parsed = JSON.parse(rawContent);
    
    if (!parsed.question || !parsed.options || parsed.options.length !== 3) {
      throw new Error("Neplatná struktura JSON");
    }
    
    addToHistory(parsed.question);
    console.log(`✅ Jednotlivá otázka vygenerována`);
    
    return parsed;
    
  } catch (error) {
    console.error(`❌ Jednotlivá otázka selhala:`, error.message);
    throw error;
  }
}

// === 📤 HLAVNÍ EXPORTOVANÉ FUNKCE ===

/**
 * Inicializuje batch otázek
 * @param {string} topic - 'general' pro zdarma, nebo custom téma pro premium
 * @param {string} mode - 'adult' nebo 'kid'
 * @returns {Promise<boolean>} - true pokud se batch úspěšně vygeneroval
 */
export async function initializeBatch(topic = 'general', mode = 'adult') {
  try {
    if (topic === 'general') {
      questionCache = await generateFreeBatch(mode);
    } else {
      questionCache = await generatePremiumBatch(topic, mode);
    }
    
    // Zamíchej pořadí otázek v cache
    questionCache = shuffleArray(questionCache);
    
    console.log(`📦 Cache naplněna: ${questionCache.length} otázek`);
    return true;
    
  } catch (error) {
    console.error(`❌ Inicializace batch selhala:`, error.message);
    questionCache = [];
    return false;
  }
}

/**
 * Hlavní funkce pro získání otázky (kompatibilní s původním API)
 * @param {string} topic - 'general' nebo custom téma
 * @param {string} mode - 'adult' nebo 'kid'
 * @returns {Promise<Object>} - otázka s options a correct
 */
export async function generateQuestion(topic = 'general', mode = 'adult') {
  // Pokud je cache prázdná, inicializuj batch
  if (questionCache.length === 0) {
    console.log(`📦 Cache prázdná, generuji batch...`);
    const success = await initializeBatch(topic, mode);
    
    if (!success || questionCache.length === 0) {
      // Batch selhal, zkus jednotlivou otázku
      console.log(`⚠️ Batch selhal, zkouším jednotlivou otázku...`);
      try {
        return await generateSingleQuestion(topic, mode);
      } catch (error) {
        // Úplný fallback - chybová hláška
        console.error(`❌ KRITICKÁ CHYBA: Nelze vygenerovat otázku`);
        throw new Error("SELHAL GENERÁTOR OTÁZEK. ZKUSTE TO PROSÍM POZDĚJI. ADMINISTRÁTORA JSME INFORMOVALI.");
      }
    }
  }
  
  // Vrať otázku z cache
  const question = questionCache.shift();
  console.log(`📤 Otázka z cache (zbývá: ${questionCache.length})`);
  
  // Pokud dochází cache a je to poslední otázka, generuj další jednotlivě
  if (questionCache.length === 0) {
    console.log(`⚠️ Cache vyprázdněna`);
  }
  
  return question;
}

/**
 * Vrátí počet otázek v cache
 */
export function getCacheSize() {
  return questionCache.length;
}

/**
 * Vymaže historii (pro testování)
 */
export function clearHistory() {
  recentQuestions.length = 0;
  recentEntities.length = 0;
  questionCache.length = 0;
  console.log("🧹 Historie a cache vymazána");
}

/**
 * Vrátí velikost historie
 */
export function getHistorySize() {
  return recentQuestions.length;
}

/**
 * Vrátí velikost entity historie
 */
export function getEntityHistorySize() {
  return recentEntities.length;
}

/**
 * Validace premium tématu (pro frontend)
 */
export function validatePremiumTopic(topic) {
  const errors = [];
  
  if (!topic || topic.trim().length === 0) {
    errors.push("Téma nesmí být prázdné");
  }
  
  if (topic && topic.length < 3) {
    errors.push("Téma je příliš krátké");
  }
  
  if (topic && topic.length > 50) {
    errors.push("Téma je příliš dlouhé");
  }
  
  if (topic && /^\d+$/.test(topic)) {
    errors.push("Téma nesmí obsahovat pouze čísla");
  }
  
  if (topic && /^[^a-zA-Zá-žÁ-Ž0-9\s]+$/.test(topic)) {
    errors.push("Téma obsahuje neplatné znaky");
  }
  
  // Blacklist vulgarit (základní)
  const vulgarWords = ['kurva', 'píča', 'kokot', 'debil', 'kráva', 'prdel'];
  const lowerTopic = topic?.toLowerCase() || '';
  if (vulgarWords.some(word => lowerTopic.includes(word))) {
    errors.push("Téma obsahuje nevhodná slova");
  }
  
  return {
    isValid: errors.length === 0,
    errors: errors,
    warning: errors.length > 0 
      ? "Takto zadané téma pravděpodobně nepřinese dobrý zážitek ze hry. Doporučujeme jej upravit. Například 'Historie italské kuchyně' či 'Současný evropský fotbal'."
      : null
  };
}
