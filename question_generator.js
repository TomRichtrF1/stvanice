import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// === 🧠 PAMĚŤ NEDÁVNÝCH OTÁZEK (Anti-repeat) ===
const recentQuestions = [];
const recentEntities = []; // Nová paměť pro jména, osoby, místa
const MAX_HISTORY = 50; // Zvýšeno z 30 na 50
const MAX_ENTITY_HISTORY = 100; // Pamatuj si 100 entit

function addToHistory(question) {
  recentQuestions.push(question.toLowerCase());
  if (recentQuestions.length > MAX_HISTORY) {
    recentQuestions.shift(); // Odstraň nejstarší
  }
  
  // === 🆕 EXTRAHUJ A PAMATUJ SI ENTITY (jména, místa) ===
  // Ignorujeme první slovo věty (vždy má velké písmeno)
  const firstSpaceIndex = question.indexOf(' ');
  const withoutFirstWord = firstSpaceIndex > 0 ? question.substring(firstSpaceIndex + 1) : '';
  
  // Hledáme slova začínající velkým písmenem (min. 4 znaky = skutečná jména)
  const entities = withoutFirstWord.match(/\b[A-ZČŘŠŽÝÁÍÉÚŮ][a-zčřšžýáíéúůěň]{3,}(?:\s+[A-ZČŘŠŽÝÁÍÉÚŮ][a-zčřšžýáíéúůěň]+)*/g);
  
  if (entities) {
    entities.forEach(entity => {
      const lowerEntity = entity.toLowerCase();
      recentEntities.push(lowerEntity);
      if (recentEntities.length > MAX_ENTITY_HISTORY) {
        recentEntities.shift();
      }
    });
  }
}

function isQuestionUnique(question) {
  const lowerQuestion = question.toLowerCase();
  
  // 1. Kontrola přesné shody
  if (recentQuestions.includes(lowerQuestion)) {
    console.log("⚠️ DUPLICITA: Přesná shoda s historií!");
    return false;
  }
  
  // 2. 🆕 KONTROLA OPAKOVANÝCH ENTIT (jména, osoby)
  // Ignorujeme první slovo věty (vždy má velké písmeno)
  const firstSpaceIndex = question.indexOf(' ');
  const withoutFirstWord = firstSpaceIndex > 0 ? question.substring(firstSpaceIndex + 1) : '';
  
  const entities = withoutFirstWord.match(/\b[A-ZČŘŠŽÝÁÍÉÚŮ][a-zčřšžýáíéúůěň]{3,}(?:\s+[A-ZČŘŠŽÝÁÍÉÚŮ][a-zčřšžýáíéúůěň]+)*/g);
  
  if (entities) {
    for (const entity of entities) {
      const lowerEntity = entity.toLowerCase();
      // Počítáme kolikrát se entita objevila
      const entityCount = recentEntities.filter(e => e === lowerEntity).length;
      
      if (entityCount >= 3) { // Změněno z 2 na 3
        console.log(`⚠️ DUPLICITA ENTITY: "${entity}" se již objevil ${entityCount}x!`);
        return false;
      }
    }
  }
  
  // 3. Kontrola podobnosti (klíčová slova)
  for (const oldQ of recentQuestions) {
    const similarity = calculateSimilarity(lowerQuestion, oldQ);
    if (similarity > 0.7) { // 70% podobnost = duplicita
      console.log(`⚠️ DUPLICITA: ${(similarity * 100).toFixed(0)}% podobnost s předchozí otázkou!`);
      return false;
    }
  }
  
  return true;
}

function calculateSimilarity(str1, str2) {
  const words1 = new Set(str1.split(/\s+/).filter(w => w.length > 3));
  const words2 = new Set(str2.split(/\s+/).filter(w => w.length > 3));
  
  if (words1.size === 0 || words2.size === 0) return 0;
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  return intersection.size / Math.max(words1.size, words2.size);
}

// === 🎲 VYLEPŠENÁ DATABÁZE TÉMAT S VÁHAMI ===
const weightedTopics = [
  // SPORT (vysoká váha - populární)
  ["Sport: Fotbal", 8],
  ["Sport: Hokej", 6],
  ["Sport: Basketbal", 4],
  ["Sport: Tenis", 5],
  ["Sport: Atletika", 4],
  ["Sport: Zimní olympijské sporty", 4],
  ["Sport: Letní olympijské sporty", 4],
  ["Sport: Motorsport (F1, MotoGP)", 2],
  ["Sport: Box a bojové sporty", 3],
  
  // PŘÍRODA & ZVÍŘATA (střední-vysoká váha)
  ["Zvířata: Savci", 6],
  ["Zvířata: Ptáci", 4],
  ["Zvířata: Mořský svět", 5],
  ["Zvířata: Dinosauři a vymřelá zvířata", 6],
  ["Zvířata: Domácí mazlíčci", 5],
  ["Příroda: Tropické deštné lesy", 3],
  ["Příroda: Savany a pouště", 3],
  ["Příroda: Hory a sopky", 4],
  ["Příroda: Oceány a moře", 4],
  ["Příroda: Flóra a fauna", 4],
  
  // ZEMĚPIS (vysoká váha - populární)
  ["Zeměpis: Evropa", 7],
  ["Zeměpis: Asie", 5],
  ["Zeměpis: Amerika", 5],
  ["Zeměpis: Afrika", 4],
  ["Zeměpis: Hlavní města světa", 7],
  ["Zeměpis: Řeky a jezera", 4],
  ["Zeměpis: Hory a pohoří", 4],
  
  // HISTORIE (střední váha)
  ["Historie: Starověk (Egypt, Řím, Řecko)", 5],
  ["Historie: Středověk a rytíři", 5],
  ["Historie: Vikingové", 4],
  ["Historie: Moderní historie", 4],
  ["Historie: Piráti", 5],
  ["Historie: První a Druhá světová válka", 4],
  ["Historie: České dějiny", 6],
  ["Historie: Starověké civilizace (Mayové, Aztékové)", 3],
  ["Historie: Titanic a slavné lodě", 4],
  
  // FILM & ZÁBAVA (velmi vysoká váha - populární!)
  ["Film: Hollywoodská kinematografie", 8],
  ["Film: Slavné filmy a seriály", 7],
  ["Popkultura: Videohry", 6],
  ["Popkultura: Komiksy a superhrdiny", 6],
  ["Popkultura: YouTube a internet", 5],
  ["Popkultura: Anime a manga", 2],
  
  // HUDBA (střední-vysoká váha)
  ["Hudba: Rock a pop", 6],
  ["Hudba: Hip hop a rap", 4],
  ["Hudba: Klasická hudba", 3],
  ["Hudba: Slavné kapely a zpěváci", 6],
  ["Hudba: Hudební nástroje", 4],
  ["Hudba: Hudební historie", 3],
  
  // VĚDA (střední váha)
  ["Vesmír: Planety sluneční soustavy", 6],
  ["Vesmír: Hvězdy a galaxie", 4],
  ["Vesmír: Kosmonautika", 5],
  ["Fyzika: Základní principy", 3],
  ["Chemie: Chemické prvky", 3],
  ["Biologie: Lidské tělo", 7],
  ["Technologie: Historie internetu", 4],
  ["Technologie: Umělá inteligence", 3],
  ["Technologie: Mobilní telefony", 5],
  
  // GASTRONOMIE (střední váha)
  ["Gastronomie: Evropská kuchyně", 7],
  ["Gastronomie: Asijská kuchyně", 4],
  ["Gastronomie: Fast food", 5],
  ["Gastronomie: Sladkosti a čokoláda", 6],
  ["Gastronomie: Pivo a víno", 4],
  ["Gastronomie: Historie", 6],
  
  // UMĚNÍ & KULTURA (nižší váha)
  ["Umění: Slavní malíři", 3],
  ["Umění: Architektura", 3],
  ["Literatura: Slavné knihy", 4],
  ["Literatura: Pohádky", 5],
  
  // DOPRAVA (střední váha)
  ["Doprava: Auta a automobilky", 5],
  ["Doprava: Letadla", 4],
  ["Doprava: Vlaky", 3],
  ["Doprava: Lodě", 3],
  ["Doprava: Historické vynálezy a průkopnické objevy", 4],
  
  // ZAJÍMAVOSTI (střední váha)
  ["Mytologie: Řecká mytologie", 5],
  ["Mytologie: Severská mytologie", 4],
  ["Rekordy: Guinness World Records", 7],
  ["UNESCO: Světové památky", 3],
  ["Olympiáda: Olympijské hry", 4],
  ["Co je zažito: Největší mýtusy a omyly", 7],
];

// === 🎰 FUNKCE PRO VÁŽENÝ NÁHODNÝ VÝBĚR ===
function selectWeightedTopic() {
  const totalWeight = weightedTopics.reduce((sum, [_, weight]) => sum + weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const [topic, weight] of weightedTopics) {
    random -= weight;
    if (random <= 0) {
      return topic;
    }
  }
  
  return weightedTopics[0][0];
}

// === 🛡️ VALIDACE ANTI-SPOILER ===
function containsSpoiler(question, options) {
  const lowerQuestion = question.toLowerCase();
  
  for (const option of options) {
    const lowerOption = option.toLowerCase();
    const words = lowerOption.split(/\s+/);
    
    for (const word of words) {
      if (word.length > 4 && lowerQuestion.includes(word)) {
        console.log(`⚠️ SPOILER DETECTED: "${word}" v otázce!`);
        return true;
      }
    }
  }
  
  return false;
}

// === 🎯 FALLBACK OTÁZKY ===
const fallbackQuestions = {
  adult: [
    { 
      question: 'Který prvek má chemickou značku "Au"?', 
      options: ['Stříbro', 'Zlato', 'Měď'], 
      correct: 1 
    },
    { 
      question: 'Ve kterém roce padla Berlínská zeď?', 
      options: ['1987', '1989', '1991'], 
      correct: 1 
    },
  ],
  kid: [
    { 
      question: 'Jakou barvu má slunce?', 
      options: ['Modrou', 'Žlutou', 'Zelenou'], 
      correct: 1 
    },
  ]
};

// === 🚀 HLAVNÍ GENERÁTOR OTÁZEK ===
export async function generateQuestion(topic = 'general', mode = 'adult', maxRetries = 5) {
  
  let selectedTopic = topic;
  
  if (topic === 'general') {
    selectedTopic = selectWeightedTopic();
    console.log(`🎲 Vážený výběr tématu: "${selectedTopic}"`);
  } else {
    console.log(`🎯 Uživatelské téma: "${selectedTopic}"`);
  }

  // === 🎭 PERSONA A PROMPT PODLE REŽIMU ===
  let systemPersona = "";
  let userPrompt = "";
  
  if (mode === 'kid') {
    console.log("👶 Režim: JUNIOR (6-12 let)");
    
    systemPersona = `Jsi zkušený tvůrce vzdělávacích her pro děti ve věku 6-12 let.

JAZYK: Piš VŽDY gramaticky správnou češtinou. Používej jednoduché, jasné věty.

Tvoje otázky jsou:
- ZÁBAVNÉ a SROZUMITELNÉ
- Bez složitých pojmů a cizích slov
- Bez letopočtů (místo "v roce 1969" řekni "před dávnou dobou")
- Používají příklady z dětského světa (pohádky, Disney, zvířata, hry)

KRITICKÉ PRAVIDLO: V otázce NIKDY nezmiňuj slova, která jsou v odpovědích!`;

    userPrompt = `Téma: "${selectedTopic}"

Vytvoř JEDNU UNIKÁTNÍ kvízovou otázku pro děti (6-12 let).

⚠️ DŮLEŽITÉ: Buď KREATIVNÍ! Každá otázka musí být JINÁ než všechny předchozí.
Vyhni se klišé jako "Jaká je největší/nejmenší/nejrychlejší...".

PŘÍKLADY DOBRÝCH OTÁZEK:
- "Co používají medvědi k chytání ryb v řece?"
- "Ve kterém filmu pes pomáhá zachránit dalmatiny?"
- "Kolik nohou má pavouk?"

ZAKÁZANÉ FORMULACE:
❌ "Jaké zvíře, například klokan..." (prozrazuje odpověď!)
❌ "Která země v Evropě..." pokud je "Francie" odpověď
❌ Opakující se vzorce otázek

Formát odpovědi (POUZE JSON):
{
  "question": "Kreativní otázka pro děti",
  "options": ["Odpověď A", "Odpověď B", "Odpověď C"],
  "correct": 0
}`;

  } else {
    console.log("👨‍🦳 Režim: DOSPĚLÝ");
    
    systemPersona = `Jsi profesionální autor otázek pro náročné pub kvízy.

POŽADOVANÁ OBTÍŽNOST: STŘEDNÍ až TĚŽŠÍ
- Ne "Jaké je hlavní město Francie?" (příliš lehké)
- Ano "Ve kterém městě se nachází slavná opera La Scala?" (vyžaduje znalost)
- Ano "Který fotbalista získal Zlatý míč v roce 2018?" (konkrétní)

Tvoje otázky musí:
1. Testovat SKUTEČNÉ znalosti, ne jen hádat
2. Být SPECIFICKÉ (přesný rok, jméno, místo)
3. Obsahovat "fun facts" nebo překvapivé souvislosti
4. Vyžadovat zamyšlení, ne intuici

KRITICKÉ PRAVIDLO: Každá otázka musí být UNIKÁTNÍ! Vyhni se opakování.`;

    userPrompt = `Téma: "${selectedTopic}"

Vytvoř JEDNU NÁROČNOU kvízovou otázku pro dospělé.

⚠️ KREATIVITA: Vyhni se běžným otázkám! Buď originální a překvapivý.

PŘÍKLADY KVALITNÍCH OBTÍŽNÝCH OTÁZEK:
✅ "Který fotbalista je jediný, kdo vyhrál Zlatý míč i jako obránce?"
✅ "Jaký film se stal první animovanou snímkem nominovaným na Oscara za nejlepší film?"
✅ "Kolik titulů mistra světa vyhrál Michael Schumacher?"
✅ "Ve kterém roce byla založena sociální síť Facebook?"

ŠPATNÉ OTÁZKY (příliš lehké):
❌ "Kdo vyhrál MS ve fotbale 2022?" (nedávná událost)
❌ "Jaké je hlavní město Německa?" (základní znalost)
❌ "Který sport se hraje s oranžovým míčem?" (příliš triviální)

ZAKÁZANÉ:
- Otázky s odpovědí delší než 5 slov
- Otázky prozrazující odpověď
- Opakující se vzorce

Formát (POUZE JSON):
{
  "question": "Náročná originální otázka",
  "options": ["Odpověď A", "Odpověď B", "Odpověď C"],
  "correct": 1
}`;
  }

  // === 🔄 RETRY LOOP S ANTI-REPEAT ===
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Pokus ${attempt}/${maxRetries}...`);
      
      // 🎛️ RŮZNÉ PARAMETRY PRO JUNIOR vs DOSPĚLÝ
      const temperature = mode === 'kid' ? 0.7 : 1.0;
      const frequencyPenalty = mode === 'kid' ? 0.3 : 0.5;
      const presencePenalty = mode === 'kid' ? 0.3 : 0.5;
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPersona },
          { role: "user", content: userPrompt }
        ],
        temperature: temperature,
        presence_penalty: presencePenalty,
        frequency_penalty: frequencyPenalty,
        max_tokens: 300,
      });

      let rawContent = response.choices[0].message.content;
      rawContent = rawContent.replace(/```json/g, "").replace(/```/g, "").trim();

      const parsed = JSON.parse(rawContent);
      
      // === ✅ VALIDACE ===
      if (!parsed.question || !parsed.options || parsed.options.length !== 3) {
        throw new Error("Neplatná struktura JSON");
      }
      
      // 🔔 POSLEDNÍ POKUS = VŽDY AKCEPTOVAT!
      if (attempt === maxRetries) {
        console.log("🔔 Poslední pokus - akceptuji bez dalších kontrol!");
        addToHistory(parsed.question);
        return parsed;
      }
      
      // 🆕 Anti-repeat check (jen pro pokusy 1-4)
      if (!isQuestionUnique(parsed.question)) {
        console.log("⚠️ Otázka je příliš podobná předchozí, zkouším znovu...");
        continue;
      }
      
      // Anti-spoiler check
      if (containsSpoiler(parsed.question, parsed.options)) {
        console.log("⚠️ Otázka prozrazuje odpověď, zkouším znovu...");
        continue;
      }
      
      // Kontrola délky odpovědí
      const tooLongOptions = parsed.options.filter(opt => opt.split(' ').length > 5);
      if (tooLongOptions.length > 0) {
        console.log("⚠️ Příliš dlouhé odpovědi, zkouším znovu...");
        continue;
      }
      
      // 🆕 Přidej do historie
      addToHistory(parsed.question);
      
      console.log("✅ Otázka vygenerována úspěšně!");
      return parsed;

    } catch (error) {
      console.error(`❌ Pokus ${attempt} selhal:`, error.message);
      
      if (attempt === maxRetries) {
        console.log("🆘 Všechny pokusy selhaly, používám fallback...");
        const fallbacks = mode === 'kid' ? fallbackQuestions.kid : fallbackQuestions.adult;
        return fallbacks[Math.floor(Math.random() * fallbacks.length)];
      }
    }
  }
  
  // 🆘 SAFETY FALLBACK: Pokud jsme prošli loop bez return
  console.log("🆘 Loop skončil bez return, používám fallback...");
  const fallbacks = mode === 'kid' ? fallbackQuestions.kid : fallbackQuestions.adult;
  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

// 🆕 Export pro testing
export function clearHistory() {
  recentQuestions.length = 0;
  console.log("🧹 Historie otázek vymazána");
}

export function getHistorySize() {
  return recentQuestions.length;
}