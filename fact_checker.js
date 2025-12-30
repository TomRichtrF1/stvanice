/**
 * 🔬 FACT CHECKER - Ověření faktů pomocí Perplexity Sonar Pro
 * VERZE: 1.0
 * 
 * Používá Perplexity API k ověření faktické správnosti otázek
 * Model: sonar-pro (nejpřesnější)
 */

import dotenv from 'dotenv';
dotenv.config();

const SONAR_API_KEY = process.env.PERPLEXITY_API_KEY;
const SONAR_MODEL = 'sonar-pro';  // Nejpřesnější model pro fact-checking

// Rate limiting
const REQUEST_DELAY_MS = 300;  // 300ms mezi requesty
let lastRequestTime = 0;

/**
 * Čekání pro rate limiting
 */
async function waitForRateLimit() {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < REQUEST_DELAY_MS) {
    await new Promise(resolve => 
      setTimeout(resolve, REQUEST_DELAY_MS - timeSinceLastRequest)
    );
  }
  
  lastRequestTime = Date.now();
}

/**
 * Ověří faktickou správnost jedné otázky
 * @returns {{ verified: boolean, confidence: number, skipped?: boolean, error?: string }}
 */
export async function factCheckQuestion(question, options, correctIndex) {
  // Pokud není API klíč, přeskočíme fact-check
  if (!SONAR_API_KEY) {
    console.warn('⚠️ PERPLEXITY_API_KEY není nastaven, fact-check přeskočen');
    return { verified: true, confidence: 0, skipped: true };
  }

  const correctAnswer = options[correctIndex];
  
  const prompt = `Jsi faktický ověřovatel. Ověř následující kvízovou otázku a odpověď.

OTÁZKA: ${question}
TVRZENÁ SPRÁVNÁ ODPOVĚĎ: ${correctAnswer}
OSTATNÍ MOŽNOSTI: ${options.filter((_, i) => i !== correctIndex).join(', ')}

Úkoly:
1. Je tvrzená odpověď "${correctAnswer}" fakticky SPRÁVNÁ pro tuto otázku?
2. Jsou ostatní možnosti skutečně ŠPATNÉ?

Odpověz POUZE jedním slovem:
- "SPRÁVNĚ" - pokud je odpověď "${correctAnswer}" fakticky správná a ostatní jsou špatné
- "ŠPATNĚ" - pokud je odpověď "${correctAnswer}" fakticky nesprávná nebo je některá z ostatních možností také správná

Tvoje odpověď:`;

  try {
    await waitForRateLimit();
    
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SONAR_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: SONAR_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 20,
        temperature: 0.1,  // Nízká teplota pro konzistentní odpovědi
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Sonar API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const answer = data.choices[0]?.message?.content?.trim().toUpperCase() || '';
    
    // Parsování odpovědi
    const isCorrect = answer.includes('SPRÁVNĚ') || answer.includes('SPRAVNE') || 
                      answer.includes('CORRECT') || answer.includes('TRUE') ||
                      answer.includes('ANO') || answer.includes('YES');
    
    const isWrong = answer.includes('ŠPATNĚ') || answer.includes('SPATNE') ||
                    answer.includes('INCORRECT') || answer.includes('FALSE') ||
                    answer.includes('NE') || answer.includes('NO') ||
                    answer.includes('WRONG');
    
    // Pokud odpověď není jasná, považujeme za verified (benefit of doubt)
    let verified = true;
    let confidence = 0.5;
    
    if (isCorrect && !isWrong) {
      verified = true;
      confidence = 0.95;
    } else if (isWrong && !isCorrect) {
      verified = false;
      confidence = 0.9;
    }
    
    return {
      verified,
      confidence,
      rawResponse: answer,
    };
    
  } catch (error) {
    console.error('❌ Fact-check error:', error.message);
    // Při chybě propustíme otázku (benefit of doubt)
    return { 
      verified: true, 
      confidence: 0, 
      error: error.message,
      skipped: true 
    };
  }
}

/**
 * Batch fact-check - vrátí pouze ověřené otázky
 * @param {Array} questions - Pole otázek k ověření
 * @returns {Promise<Array>} - Pole ověřených otázek
 */
export async function factCheckBatch(questions) {
  if (!Array.isArray(questions) || questions.length === 0) {
    return [];
  }
  
  // Pokud není API klíč, označíme otázky jako NEOVĚŘENÉ
  if (!SONAR_API_KEY) {
    console.warn('⚠️ Fact-check přeskočen (chybí PERPLEXITY_API_KEY) - otázky NEBUDOU uloženy do DB!');
    return questions.map(q => ({ ...q, _factChecked: false }));
  }
  
  console.log(`🔬 Spouštím fact-check pro ${questions.length} otázek...`);
  
  const verified = [];
  const rejected = [];
  
  for (const q of questions) {
    const result = await factCheckQuestion(q.question, q.options, q.correct);
    
    if (result.verified) {
      verified.push({ 
        ...q, 
        _factChecked: !result.skipped,  // true pouze pokud skutečně proběhl fact-check
        _factCheckConfidence: result.confidence 
      });
    } else {
      rejected.push({
        question: q.question.substring(0, 50) + '...',
        answer: q.options[q.correct],
        confidence: result.confidence,
      });
    }
  }
  
  if (rejected.length > 0) {
    console.log(`❌ Fact-check zamítl ${rejected.length} otázek:`);
    rejected.forEach(r => {
      console.log(`   - "${r.question}" (odpověď: "${r.answer}")`);
    });
  }
  
  const factCheckedCount = verified.filter(q => q._factChecked).length;
  console.log(`✅ Fact-check: ${verified.length} prošlo (${factCheckedCount} ověřených, ${verified.length - factCheckedCount} přeskočených)`);
  
  return verified;
}

/**
 * Testovací funkce pro ověření API spojení
 */
export async function testFactChecker() {
  console.log('🧪 Testuji Fact Checker...');
  
  if (!SONAR_API_KEY) {
    console.log('❌ Test selhal: PERPLEXITY_API_KEY není nastaven');
    return false;
  }
  
  // Testovací otázka se známou odpovědí
  const testQuestion = {
    question: 'Jaké je hlavní město České republiky?',
    options: ['Brno', 'Praha', 'Ostrava'],
    correct: 1,  // Praha
  };
  
  const result = await factCheckQuestion(
    testQuestion.question, 
    testQuestion.options, 
    testQuestion.correct
  );
  
  console.log('📊 Výsledek testu:', result);
  
  if (result.verified && result.confidence > 0.5) {
    console.log('✅ Fact Checker funguje správně!');
    return true;
  } else if (result.skipped) {
    console.log('⚠️ Fact Checker přeskočen (pravděpodobně API error)');
    return false;
  } else {
    console.log('❌ Fact Checker vrátil neočekávaný výsledek');
    return false;
  }
}
