/**
 * 🔬 PERPLEXITY-ONLY GENERATOR - Testovací verze
 * 
 * Účel: Ověřit, zda Perplexity API může samo generovat kvalitní otázky
 * s automatickým fact-checkingem (má přístup k internetu).
 * 
 * Tento soubor je POUZE PRO TESTOVÁNÍ - neovlivňuje hlavní logiku hry.
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// === 🔧 PERPLEXITY KONFIGURACE ===
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const PERPLEXITY_MODEL = "sonar-pro";  // Nejlepší model s web access
const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";

// === 🗄️ DATABASE (volitelné) ===
let questionDatabase = null;
let useDatabase = false;

export function connectDatabase(dbModule) {
  try {
    questionDatabase = dbModule;
    questionDatabase.initDatabase();
    useDatabase = true;
    console.log('🗄️ Databáze připojena k perplexity_generator');
    return true;
  } catch (error) {
    console.warn('⚠️ Databáze není dostupná:', error.message);
    useDatabase = false;
    return false;
  }
}

// === 📊 STATISTIKY ===
const stats = {
  totalGenerated: 0,
  successfulQuestions: 0,
  failedQuestions: 0,
  savedToDb: 0,
  apiCalls: 0,
  totalTime: 0
};

export function getStats() {
  return { ...stats };
}

export function resetStats() {
  stats.totalGenerated = 0;
  stats.successfulQuestions = 0;
  stats.failedQuestions = 0;
  stats.savedToDb = 0;
  stats.apiCalls = 0;
  stats.totalTime = 0;
}

// === 🎯 KATEGORIE (kopie z hlavního generátoru) ===
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

// === 🔧 POMOCNÉ FUNKCE ===

function getRandomCategory() {
  const keys = Object.keys(ADULT_CATEGORIES);
  const key = keys[Math.floor(Math.random() * keys.length)];
  return { key, ...ADULT_CATEGORIES[key] };
}

function getRandomAspect(category) {
  const aspects = category.aspects;
  return aspects[Math.floor(Math.random() * aspects.length)];
}

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// === 🌐 PERPLEXITY API VOLÁNÍ ===

async function callPerplexityAPI(systemPrompt, userPrompt, temperature = 0.7) {
  if (!PERPLEXITY_API_KEY) {
    throw new Error('PERPLEXITY_API_KEY není nastavený v .env');
  }
  
  stats.apiCalls++;
  const startTime = Date.now();
  
  try {
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
        temperature: temperature,
        max_tokens: 4000,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Perplexity API error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    const elapsed = Date.now() - startTime;
    stats.totalTime += elapsed;
    
    return {
      content: data.choices[0].message.content,
      elapsed,
      citations: data.citations || []
    };
    
  } catch (error) {
    console.error('❌ Perplexity API chyba:', error.message);
    throw error;
  }
}

// === 🎯 GENEROVÁNÍ OTÁZEK ===

/**
 * Vygeneruje batch otázek pomocí Perplexity
 * 
 * @param {number} count - Počet otázek k vygenerování
 * @param {string|null} categoryKey - Konkrétní kategorie nebo null pro náhodné
 * @returns {Promise<Array>} Pole otázek
 */
export async function generateQuestionsBatch(count = 5, categoryKey = null) {
  
  // Vyber kategorie
  const categories = [];
  for (let i = 0; i < count; i++) {
    if (categoryKey && ADULT_CATEGORIES[categoryKey]) {
      const cat = { key: categoryKey, ...ADULT_CATEGORIES[categoryKey] };
      categories.push({ category: cat, aspect: getRandomAspect(cat) });
    } else {
      const cat = getRandomCategory();
      categories.push({ category: cat, aspect: getRandomAspect(cat) });
    }
  }
  
  // Vytvoř prompt s požadavky na kategorie
  const categoryRequests = categories.map((c, i) => 
    `${i + 1}. Kategorie: ${c.category.name}, Aspekt: ${c.aspect}`
  ).join('\n');
  
  const systemPrompt = `Jsi expert na tvorbu kvízových otázek v češtině. Máš přístup k internetu a můžeš ověřovat fakta.

TVÝM ÚKOLEM JE:
1. Vygenerovat fakticky správné kvízové otázky
2. Každá otázka musí mít právě 3 odpovědi (A, B, C)
3. Právě jedna odpověď je správná
4. Využij svůj přístup k internetu pro ověření faktů

PRAVIDLA KVALITY:
- Otázky musí být 100% fakticky správné (ověř na internetu!)
- Odpovědi maximálně 4 slova
- V textu otázky NIKDY nezmiňuj správnou odpověď
- Všechny 3 možnosti musí být věrohodné (žádné absurdní)
- Špatné odpovědi musí být jednoznačně špatné
- Otázky musí být zajímavé a vzdělávací

FORMÁT ODPOVĚDI (POUZE PLATNÝ JSON, nic jiného):
{
  "questions": [
    {
      "question": "Text otázky?",
      "options": ["Odpověď A", "Odpověď B", "Odpověď C"],
      "correct": 0,
      "category": "název_kategorie",
      "aspect": "název_aspektu",
      "source": "Krátké zdůvodnění proč je odpověď správná"
    }
  ]
}

Index "correct": 0 = první odpověď, 1 = druhá, 2 = třetí.`;

  const userPrompt = `Vygeneruj ${count} kvízových otázek pro tyto kategorie a aspekty:

${categoryRequests}

DŮLEŽITÉ:
- Ověř každou odpověď na internetu před odpovědí
- Odpověz POUZE platným JSON bez dalšího textu
- Každá otázka musí být z jiného tématu (různorodost)`;

  console.log(`\n🌐 Volám Perplexity API (${count} otázek)...`);
  
  try {
    const response = await callPerplexityAPI(systemPrompt, userPrompt, 0.7);
    
    console.log(`   ⏱️ Odpověď za ${response.elapsed}ms`);
    if (response.citations.length > 0) {
      console.log(`   📚 Citace: ${response.citations.length} zdrojů`);
    }
    
    // Parse JSON
    let rawContent = response.content;
    rawContent = rawContent.replace(/```json/g, '').replace(/```/g, '').trim();
    
    const parsed = JSON.parse(rawContent);
    
    if (!parsed.questions || !Array.isArray(parsed.questions)) {
      throw new Error('Chybí pole "questions" v odpovědi');
    }
    
    // Validace otázek
    const validQuestions = parsed.questions.filter(q => {
      if (!q.question || !q.options || q.options.length !== 3) return false;
      if (typeof q.correct !== 'number' || q.correct < 0 || q.correct > 2) return false;
      return true;
    });
    
    console.log(`   ✅ Validních otázek: ${validQuestions.length}/${parsed.questions.length}`);
    
    stats.totalGenerated += parsed.questions.length;
    stats.successfulQuestions += validQuestions.length;
    stats.failedQuestions += (parsed.questions.length - validQuestions.length);
    
    // Označ jako z Perplexity
    const markedQuestions = validQuestions.map(q => ({
      ...q,
      _fromPerplexity: true,
      _fromLLM: true,
      _fromDb: false
    }));
    
    return markedQuestions;
    
  } catch (error) {
    console.error(`   ❌ Chyba: ${error.message}`);
    stats.failedQuestions += count;
    return [];
  }
}

/**
 * Vygeneruje jednu otázku
 */
export async function generateSingleQuestion(categoryKey = null) {
  const questions = await generateQuestionsBatch(1, categoryKey);
  return questions[0] || null;
}

/**
 * Vygeneruje otázky a uloží do databáze
 */
export async function generateAndSave(count = 5, categoryKey = null) {
  const questions = await generateQuestionsBatch(count, categoryKey);
  
  if (questions.length === 0) {
    console.log('⚠️ Žádné otázky k uložení');
    return { generated: 0, saved: 0 };
  }
  
  // Uložení do DB
  if (useDatabase && questionDatabase) {
    try {
      const saved = questionDatabase.saveQuestions(questions, 'adult', 'normal');
      stats.savedToDb += saved;
      console.log(`💾 Uloženo ${saved}/${questions.length} otázek do DB`);
      return { generated: questions.length, saved };
    } catch (error) {
      console.error(`❌ Chyba při ukládání: ${error.message}`);
      return { generated: questions.length, saved: 0 };
    }
  } else {
    console.log('⚠️ DB není připojena, otázky neuloženy');
    return { generated: questions.length, saved: 0 };
  }
}

// === 🧪 TESTOVACÍ FUNKCE ===

/**
 * Interaktivní test - vygeneruje a zobrazí otázky
 */
export async function runTest(count = 3) {
  console.log('\n' + '='.repeat(60));
  console.log('🔬 PERPLEXITY GENERATOR TEST');
  console.log('='.repeat(60));
  
  resetStats();
  
  const questions = await generateQuestionsBatch(count);
  
  console.log('\n📋 VYGENEROVANÉ OTÁZKY:');
  console.log('-'.repeat(60));
  
  questions.forEach((q, i) => {
    console.log(`\n${i + 1}. [${q.category || '?'}] ${q.question}`);
    q.options.forEach((opt, j) => {
      const marker = j === q.correct ? '✓' : ' ';
      const color = j === q.correct ? '\x1b[32m' : '\x1b[0m';
      console.log(`   ${color}${marker} ${String.fromCharCode(65 + j)}) ${opt}\x1b[0m`);
    });
    if (q.source) {
      console.log(`   📚 Zdroj: ${q.source}`);
    }
  });
  
  console.log('\n' + '-'.repeat(60));
  console.log('📊 STATISTIKY:');
  console.log(`   Vygenerováno: ${stats.successfulQuestions}/${stats.totalGenerated}`);
  console.log(`   API volání: ${stats.apiCalls}`);
  console.log(`   Celkový čas: ${stats.totalTime}ms`);
  console.log(`   Průměr/otázka: ${Math.round(stats.totalTime / Math.max(stats.successfulQuestions, 1))}ms`);
  console.log('='.repeat(60));
  
  return questions;
}

// === EXPORT ===
export { ADULT_CATEGORIES };
