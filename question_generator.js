import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

// === 🔧 GROQ KONFIGURACE ===
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const MODEL = "llama-3.3-70b-versatile";

// === 🎯 BATCH KONFIGURACE ===
const BATCH_SIZE = 24;

// === 🧠 PAMĚŤ PRO ANTI-REPEAT ===
const recentQuestions = [];
const recentEntities = [];
const MAX_QUESTION_HISTORY = 200;
const MAX_ENTITY_HISTORY = 300;

// === 🛡️ TVRDÁ VALIDACE - POUŽITÉ ODPOVĚDI ===
const usedCorrectAnswers = new Set();
const MAX_ANSWER_HISTORY = 100;

// === 📦 CACHE PRO BATCH OTÁZKY ===
let questionCache = [];

// === 🎯 ROZŠÍŘENÉ KATEGORIE - ADULT (12 kategorií) ===
const ADULT_CATEGORIES = {
  "motorsport": {
    name: "Motorsport",
    aspects: [
      "Historický moment", "Konkrétní okruh", "Kuriozita", "Tým nebo stáj",
      "Pravidlo nebo rozhodnutí", "Rekord", "Slavný souboj", "Nehoda nebo drama",
      "Šampionát roku", "Technický prvek", "Sponzoři a byznys", "Legendární závodník"
    ]
  },
  "team_sports": {
    name: "Týmové sporty",
    aspects: [
      "Historický moment", "Stadion nebo aréna", "Kuriozita", "Klub nebo tým",
      "Pravidlo nebo rozhodnutí", "Rekord", "Slavné rivalství", "Přestup nebo transfer",
      "Mistrovství roku", "Trenér", "Národní tým", "Legendární hráč"
    ]
  },
  "film": {
    name: "Film a seriály",
    aspects: [
      "Milník kinematografie", "Herec nebo herečka", "Zákulisí natáčení", "Režisér",
      "Ocenění Oscar", "Rekord tržeb", "Filmová dvojice", "Skandál",
      "Konkrétní film", "Soundtrack", "Filmové studio", "Adaptace knihy"
    ]
  },
  "music": {
    name: "Hudba",
    aspects: [
      "Historický milník", "Zpěvák nebo zpěvačka", "Kuriozita", "Kapela",
      "Ocenění Grammy", "Rekord prodejů", "Spolupráce nebo rivalita", "Skandál",
      "Album nebo píseň", "Hudební nástroj", "Žánr a historie", "Koncert nebo turné"
    ]
  },
  "history": {
    name: "Historie",
    aspects: [
      "Klíčová událost", "Místo nebo lokalita", "Málo známý fakt", "Významná osobnost",
      "Politické rozhodnutí", "První nebo poslední", "Rivalita nebo konflikt", "Tragédie",
      "Konkrétní rok", "Vynález té doby", "Kultura období", "Důsledky pro dnešek"
    ]
  },
  "geography": {
    name: "Zeměpis",
    aspects: [
      "Hlavní město", "Řeka nebo jezero", "Kuriozita", "Hora nebo pohoří",
      "Hranice nebo sousedé", "Rekord největší", "Historická souvislost", "Přírodní památka",
      "Obyvatelstvo nebo jazyk", "Vlajka nebo symbol", "Ekonomika", "Slavná osobnost"
    ]
  },
  "science": {
    name: "Věda a technologie",
    aspects: [
      "Historický objev", "Vědec nebo vynálezce", "Paradox nebo kuriozita", "Instituce",
      "Teorie nebo zákon", "Rekord", "Vědecký závod", "Selhání nebo nehoda",
      "Experiment", "Praktická aplikace", "Nobelova cena", "Budoucnost"
    ]
  },
  "food": {
    name: "Gastronomie",
    aspects: [
      "Původ pokrmu", "Země nebo region", "Kuriozita", "Ingredience",
      "Tradiční příprava", "Rekord nejdražší", "Slavný šéfkuchař", "Kontroverzní jídlo",
      "Národní pokrm", "Nápoje", "Michelin", "Jídlo v popkultuře"
    ]
  },
  "literature": {
    name: "Literatura",
    aspects: [
      "Klasické dílo", "Autor nebo spisovatelka", "Kuriozita", "Literární žánr",
      "Ocenění Nobel", "Bestseller", "Literární postavy", "Kontroverzní kniha",
      "Poezie", "Adaptace na film", "Slavný citát", "Nakladatelství"
    ]
  },
  "art": {
    name: "Umění a architektura",
    aspects: [
      "Slavný obraz", "Malíř nebo sochař", "Kuriozita", "Umělecký směr",
      "Aukční rekord", "Muzeum nebo galerie", "Architektonický skvost", "Padělky nebo krádeže",
      "Socha", "Design", "Street art", "Mecenáš umění"
    ]
  },
  "nature": {
    name: "Zvířata a příroda",
    aspects: [
      "Savci", "Ptáci", "Mořští živočichové", "Hmyz",
      "Rekord největší", "Vyhynulé druhy", "Kuriózní chování", "Národní zvíře",
      "Migrace", "Symbióza", "Nebezpečná zvířata", "Ochrana přírody"
    ]
  },
  "business": {
    name: "Byznys a ekonomika",
    aspects: [
      "Slavná firma", "CEO nebo podnikatel", "Kuriozita", "Značka",
      "Rekord tržní hodnoty", "Krach nebo bankrot", "Rivalita firem", "Akvizice",
      "Startup příběh", "Vynález produktu", "Reklama", "Burzovní historie"
    ]
  }
};

// === 🎯 ROZŠÍŘENÉ KATEGORIE - JUNIOR (8 kategorií) ===
const JUNIOR_CATEGORIES = {
  "animals": {
    name: "Zvířata",
    aspects: [
      "Savci", "Ptáci", "Mořští živočichové", "Hmyz",
      "Domácí mazlíčci", "Zvířata v ZOO", "Kde žijí", "Co jedí",
      "Rekord největší", "Zvířata z pohádek", "Mláďata", "Zvuky zvířat"
    ]
  },
  "fairytales": {
    name: "Pohádky a filmy",
    aspects: [
      "České pohádky", "Disney postavy", "Pixar filmy", "Kouzelné předměty",
      "Záporáci", "Princezny a princové", "Zvířecí hrdinové", "Písničky z pohádek",
      "Kde se odehrává", "Jak to končí", "Kdo natočil", "Kamarádi hrdiny"
    ]
  },
  "body": {
    name: "Lidské tělo",
    aspects: [
      "Kosti", "Orgány", "Pět smyslů", "Svaly",
      "Výživa", "Zdraví a hygiena", "Jak rosteme", "Zajímavosti o těle",
      "Mozek", "Srdce a krev", "Zuby", "Spánek"
    ]
  },
  "world": {
    name: "Svět kolem nás",
    aspects: [
      "Hlavní města", "Kontinenty", "Oceány a moře", "Vlajky",
      "Jazyky", "Slavné stavby", "Zvířata podle kontinentů", "Počasí",
      "Řeky", "Hory", "Ostrovy", "Pouště a pralesy"
    ]
  },
  "space": {
    name: "Vesmír",
    aspects: [
      "Planety", "Slunce", "Měsíc", "Hvězdy",
      "Astronauti", "Rakety a sondy", "Galaxie", "Zatmění",
      "Komety", "Souhvězdí", "Vesmírné rekordy", "Život ve vesmíru"
    ]
  },
  "sports_kids": {
    name: "Sport pro děti",
    aspects: [
      "Fotbal", "Hokej", "Plavání", "Atletika",
      "Olympijské hry", "Pravidla her", "Slavní sportovci", "Míče a vybavení",
      "Zimní sporty", "Týmy a kluby", "Rekordy", "Sport ve škole"
    ]
  },
  "science_kids": {
    name: "Věda pro děti",
    aspects: [
      "Dinosauři", "Sopky a zemětřesení", "Elektřina", "Magnety",
      "Barvy a světlo", "Voda a led", "Rostliny", "Počasí proč",
      "Jednoduché stroje", "Zajímavé pokusy", "Vynálezy pro děti", "Ekologie"
    ]
  },
  "history_kids": {
    name: "Historie pro děti",
    aspects: [
      "Rytíři a hrady", "Piráti", "Egypt a faraoni", "Vikingové",
      "Dinosauří doba", "Pravěk", "Staré Řecko", "Římané",
      "Indiáni", "Středověk", "Králové a královny", "Slavní objevitelé"
    ]
  }
};

// === 🔧 POMOCNÉ FUNKCE ===

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function selectRandomCategoryAspectPairs(categories, count) {
  const allPairs = [];
  
  for (const [key, cat] of Object.entries(categories)) {
    for (const aspect of cat.aspects) {
      allPairs.push({
        categoryKey: key,
        categoryName: cat.name,
        aspect: aspect
      });
    }
  }
  
  const shuffled = shuffleArray(allPairs);
  return shuffled.slice(0, count);
}

function addToHistory(question) {
  recentQuestions.push(question.toLowerCase());
  if (recentQuestions.length > MAX_QUESTION_HISTORY) {
    recentQuestions.shift();
  }
}

function extractEntities(question) {
  const words = question.split(/\s+/);
  const entities = words.filter(w => w.length > 4 && /^[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/.test(w));
  return entities.slice(0, 3);
}

function addEntitiesToHistory(question) {
  const entities = extractEntities(question);
  entities.forEach(e => {
    const normalized = e.toLowerCase();
    if (!recentEntities.includes(normalized)) {
      recentEntities.push(normalized);
      if (recentEntities.length > MAX_ENTITY_HISTORY) {
        recentEntities.shift();
      }
    }
  });
}

function getRecentEntitiesForPrompt() {
  if (recentEntities.length === 0) return "";
  
  const sample = recentEntities.slice(-50);
  return `
# ZAKÁZANÉ ENTITY (nepoužívej tyto):
${sample.join(", ")}
`;
}

// === 📝 SYSTEM PROMPTS ===

function buildAdultSystemPrompt() {
  return `Jsi expert na tvorbu kvízových otázek pro dospělé hráče (střední obtížnost).

PRAVIDLA:
1. Otázky musí být v ČEŠTINĚ
2. Fakticky 100% správné
3. Střední obtížnost - ne příliš lehké, ne příliš těžké
4. Odpovědi max 4 slova
5. Všechny 3 možnosti musí být věrohodné (žádná hloupá odpověď)
6. Index "correct" je 0, 1 nebo 2 (náhodně)

KRITICKÉ PRAVIDLO - ODPOVĚĎ NESMÍ BÝT V OTÁZCE:
- Text správné odpovědi se NESMÍ objevit v textu otázky!
- Ani částečně, ani jako součást jiného slova
- Příklad ŠPATNÉ otázky: "Co je typ sluneční erupce?" s odpovědí "Sluneční erupce" → ZAKÁZÁNO!
- Příklad DOBRÉ otázky: "Jak se nazývá výbuch plazmatu ze Slunce?" → "Sluneční erupce"

KRITICKÉ PRAVIDLO - EXKLUZIVITA ODPOVĚDI:
- POUZE JEDNA z nabízených odpovědí smí být správná!
- Ostatní 2 odpovědi MUSÍ být prokazatelně ŠPATNÉ
- Před generováním si ověř: "Mohla by být i jiná nabízená odpověď správná?" Pokud ano, ZMĚŇ OTÁZKU!

ZAKÁZANÉ TYPY OTÁZEK (nikdy negeneruj):
- Subjektivní otázky bez jednoznačné odpovědi ("Které jídlo je nejchutnější?")
- Otázky o pocitech, názorech nebo preferencích
- Otázky s více možnými správnými odpověďmi
- Vágní otázky typu "Co je známé svými bohatými chuťmi?" (to může být cokoliv)
- Otázky s "nejlepší", "nejoblíbenější", "nejznámější" BEZ konkrétního měřitelného kritéria
- Obecné otázky kde více odpovědí vyhovuje ("Která kniha byla zfilmována?" - spousta knih byla zfilmována!)

SPRÁVNÉ OTÁZKY MAJÍ:
- Jednoznačně ověřitelnou faktickou odpověď
- Konkrétní kritérium (rok, místo, jméno, číslo, událost)
- POUZE JEDNU správnou odpověď z nabízených možností
- Text odpovědi se NEOBJEVUJE v otázce

KATEGORIE: Sport, Film, Hudba, Historie, Zeměpis, Věda, Gastronomie, Literatura, Umění, Příroda, Byznys`;
}

function buildJuniorSystemPrompt() {
  return `Jsi expert na tvorbu kvízových otázek pro děti 8-14 let.

PRAVIDLA:
1. Otázky musí být v ČEŠTINĚ
2. Jednoduchý jazyk bez cizích slov
3. Zábavná a vzdělávací témata
4. Odpovědi max 3 slova
5. Všechny 3 možnosti musí být věrohodné
6. Index "correct" je 0, 1 nebo 2 (náhodně)

KRITICKÉ PRAVIDLO - ODPOVĚĎ NESMÍ BÝT V OTÁZCE:
- Text správné odpovědi se NESMÍ objevit v textu otázky!
- Ani částečně, ani jako součást jiného slova
- Příklad ŠPATNÉ otázky: "Jaké zvíře je tygr?" s odpovědí "Tygr" → ZAKÁZÁNO!
- Příklad DOBRÉ otázky: "Která kočkovitá šelma má oranžové pruhy?" → "Tygr"

KRITICKÉ PRAVIDLO - EXKLUZIVITA ODPOVĚDI:
- POUZE JEDNA z nabízených odpovědí smí být správná!
- Ostatní 2 odpovědi MUSÍ být prokazatelně ŠPATNÉ
- Před generováním si ověř: "Mohla by být i jiná nabízená odpověď správná?" Pokud ano, ZMĚŇ OTÁZKU!

ZAKÁZANÉ TYPY OTÁZEK (nikdy negeneruj):
- Subjektivní otázky bez jednoznačné odpovědi ("Co je nejhezčí?")
- Otázky o pocitech, názorech nebo preferencích
- Otázky s více možnými správnými odpověďmi
- Vágní otázky bez konkrétní odpovědi
- Obecné otázky kde více odpovědí vyhovuje ("Které zvíře žije v lese?" - spousta zvířat žije v lese!)

SPRÁVNÉ OTÁZKY MAJÍ:
- Jednoznačně ověřitelnou faktickou odpověď
- Konkrétní kritérium (počet, barva, jméno, místo)
- POUZE JEDNU správnou odpověď z nabízených možností
- Text odpovědi se NEOBJEVUJE v otázce

KATEGORIE: Zvířata, Pohádky, Lidské tělo, Svět, Vesmír, Sport, Věda pro děti, Historie pro děti`;
}

// === 🛡️ FILTRY ===

function filterDuplicateAnswers(questions) {
  const seenAnswers = new Set();
  const filtered = [];
  
  for (const q of questions) {
    const correctAnswer = q.options[q.correct].toLowerCase().trim();
    
    if (seenAnswers.has(correctAnswer)) {
      console.log(`⚠️ Duplicitní odpověď odfiltrována: "${correctAnswer}"`);
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
      
      const intersection = [...words1].filter(w => words2.has(w)).length;
      const similarity = intersection / Math.min(words1.size, words2.size);
      
      if (similarity > threshold) {
        console.log(`⚠️ Podobné otázky [${i+1}] ~ [${j+1}] - odstraňuji druhou`);
        dominated.add(j);
      }
    }
  }
  
  return questions.filter((_, i) => !dominated.has(i));
}

// === 🚀 BATCH GENEROVÁNÍ ===

async function generateBatch(mode = 'adult', selectedCategory = null) {
  const allCategories = mode === 'kid' ? JUNIOR_CATEGORIES : ADULT_CATEGORIES;
  
  // Pokud je vybraná konkrétní kategorie, použij jen tu
  let categories;
  if (selectedCategory && allCategories[selectedCategory]) {
    categories = { [selectedCategory]: allCategories[selectedCategory] };
    console.log(`📚 Vybraná kategorie: ${allCategories[selectedCategory].name}`);
  } else {
    categories = allCategories;
    console.log(`📚 Mix všech kategorií`);
  }
  
  const pairs = selectRandomCategoryAspectPairs(categories, BATCH_SIZE);
  
  console.log(`\n📦 BATCH GENEROVÁNÍ - ${mode.toUpperCase()} (${BATCH_SIZE} otázek)`);
  console.log(`🎲 Vybrané aspekty: ${[...new Set(pairs.map(p => p.aspect))].join(', ')}`);
  
  const aspectList = pairs.map((p, i) => `${i + 1}. ${p.categoryName} - ${p.aspect}`).join("\n");
  
  const systemPrompt = mode === 'kid' 
    ? buildJuniorSystemPrompt() 
    : buildAdultSystemPrompt();
  
  const userPrompt = `
# ÚKOL
Vygeneruj PŘESNĚ ${BATCH_SIZE} kvízových otázek. Každá otázka MUSÍ odpovídat zadané kategorii a aspektu.

# ZADÁNÍ (${BATCH_SIZE} kombinací)
${aspectList}

# KRITICKÁ PRAVIDLA
- KAŽDÁ otázka MUSÍ být o JINÉM tématu
- NIKDY NEOPAKUJ stejnou osobu, zemi, nebo místo
- KAŽDÁ otázka MUSÍ mít JINOU správnou odpověď
${getRecentEntitiesForPrompt()}

# PRAVIDLA KVALITY
- Otázky musí být fakticky správné
- Odpovědi maximálně 4 slova
- V otázce NIKDY nezmiňuj správnou odpověď
- Všechny 3 možnosti musí být věrohodné

# VÝSTUPNÍ FORMÁT (POUZE PLATNÝ JSON)
{
  "questions": [
    {"question": "Text otázky 1", "options": ["A", "B", "C"], "correct": 0},
    {"question": "Text otázky 2", "options": ["A", "B", "C"], "correct": 1}
  ]
}

ODPOVĚZ POUZE PLATNÝM JSON BEZ DALŠÍHO TEXTU.
`;

  return await callGroqBatch(systemPrompt, userPrompt, mode);
}

async function callGroqBatch(systemPrompt, userPrompt, mode) {
  const maxRetries = 5;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Volám Groq API... pokus ${attempt}/${maxRetries}`);
      const startTime = Date.now();
      
      const response = await groq.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: mode === 'kid' ? 0.7 : 0.85,
        max_tokens: 5000,
      });
      
      const elapsed = Date.now() - startTime;
      console.log(`✅ Groq odpověděl za ${elapsed}ms`);
      
      let rawContent = response.choices[0].message.content;
      rawContent = rawContent.replace(/```json/g, "").replace(/```/g, "").trim();
      
      const parsed = JSON.parse(rawContent);
      
      if (!parsed.questions || !Array.isArray(parsed.questions)) {
        throw new Error("Chybí pole 'questions'");
      }
      
      // Validace otázek
      const validQuestions = parsed.questions.filter(q => {
        if (!q.question || !q.options || q.options.length !== 3) return false;
        if (typeof q.correct !== 'number' || q.correct < 0 || q.correct > 2) return false;
        return true;
      });
      
      console.log(`📊 Validních otázek: ${validQuestions.length}/${parsed.questions.length}`);
      
      if (validQuestions.length < 18) {
        throw new Error(`Málo validních otázek: ${validQuestions.length}`);
      }
      
      // Filtrování
      let filtered = filterDuplicateAnswers(validQuestions);
      console.log(`🛡️ Po filtraci duplicit: ${filtered.length} otázek`);
      
      filtered = filterSimilarQuestions(filtered);
      console.log(`🛡️ Po filtraci podobných: ${filtered.length} otázek`);
      
      // Přidej entity do historie
      filtered.forEach(q => {
        addToHistory(q.question);
        addEntitiesToHistory(q.question);
      });
      
      return filtered;
      
    } catch (error) {
      console.error(`❌ Pokus ${attempt} selhal:`, error.message);
      
      if (attempt === maxRetries) {
        console.error(`💀 Všechny pokusy selhaly`);
        throw error;
      }
      
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
  
  return [];
}

// === 📤 SPRÁVA CACHE A ODPOVĚDÍ ===

function addToUsedAnswers(answer) {
  const normalized = answer.toLowerCase().trim();
  usedCorrectAnswers.add(normalized);
  
  if (usedCorrectAnswers.size > MAX_ANSWER_HISTORY) {
    const firstKey = usedCorrectAnswers.values().next().value;
    usedCorrectAnswers.delete(firstKey);
  }
}

function isAnswerUsed(answer) {
  return usedCorrectAnswers.has(answer.toLowerCase().trim());
}

function selectUnusedQuestionFromCache() {
  for (let i = 0; i < questionCache.length; i++) {
    const q = questionCache[i];
    const correctAnswer = q.options[q.correct];
    
    if (!isAnswerUsed(correctAnswer)) {
      questionCache.splice(i, 1);
      addToUsedAnswers(correctAnswer);
      return q;
    }
  }
  
  return null;
}

// === 📤 HLAVNÍ EXPORTOVANÉ FUNKCE ===

export async function initializeBatch(mode = 'adult', category = null) {
  try {
    questionCache = await generateBatch(mode, category);
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
 * Hlavní funkce pro získání otázky
 * @param {string} mode - 'adult' nebo 'kid'
 * @param {string|null} category - null = všechny kategorie, nebo konkrétní klíč kategorie
 */
export async function generateQuestion(mode = 'adult', category = null) {
  // Pokud je cache prázdná, inicializuj batch
  if (questionCache.length === 0) {
    console.log(`📦 Cache prázdná, generuji batch...`);
    const success = await initializeBatch(mode, category);
    
    if (!success || questionCache.length === 0) {
      console.error(`💀 Nelze vygenerovat otázky`);
      return {
        question: "Chyba při generování otázky. Omlouváme se.",
        options: ["Zkusit znovu", "Počkat", "Restartovat"],
        correct: 0
      };
    }
  }
  
  // Vyber otázku s nepoužitou odpovědí
  let question = selectUnusedQuestionFromCache();
  
  if (!question) {
    console.log(`🔄 Všechny odpovědi z cache byly použity, generuji nový batch...`);
    const success = await initializeBatch(mode, category);
    
    if (success && questionCache.length > 0) {
      question = selectUnusedQuestionFromCache();
    }
  }
  
  if (!question) {
    console.log(`⚠️ Extrémní situace - čistím historii odpovědí`);
    usedCorrectAnswers.clear();
    question = questionCache.shift();
    if (question) {
      addToUsedAnswers(question.options[question.correct]);
    }
  }
  
  if (question) {
    console.log(`📤 Otázka z cache (zbývá: ${questionCache.length}, použitých odpovědí: ${usedCorrectAnswers.size})`);
    return question;
  }
  
  return {
    question: "Nepodařilo se načíst otázku. Zkuste to znovu.",
    options: ["OK", "Zkusit znovu", "Pokračovat"],
    correct: 0
  };
}

export function clearHistory() {
  recentQuestions.length = 0;
  recentEntities.length = 0;
  questionCache.length = 0;
  usedCorrectAnswers.clear();
  console.log("🧹 Historie vyčištěna");
}

export function getCacheSize() {
  return questionCache.length;
}

export function getUsedAnswersSize() {
  return usedCorrectAnswers.size;
}

// === 📚 EXPORT KATEGORIÍ PRO FRONTEND ===
export function getCategories(mode = 'adult') {
  const categories = mode === 'kid' ? JUNIOR_CATEGORIES : ADULT_CATEGORIES;
  return Object.entries(categories).map(([key, cat]) => ({
    key,
    name: cat.name,
    aspectCount: cat.aspects.length
  }));
}

export { ADULT_CATEGORIES, JUNIOR_CATEGORIES };
