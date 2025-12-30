/**
 * 🔍 QUESTION VALIDATOR - Obsahová validace otázek
 * VERZE: 1.0
 * 
 * Filtry:
 * - Odpověď nesmí být v textu otázky
 * - Všechny odpovědi musí být unikátní
 * - Zákaz subjektivních/spekulativních otázek
 * - Minimální kvalita (délka, formát)
 */

/**
 * Kontrola: Odpověď nesmí být obsažena v textu otázky
 */
function checkAnswerNotInQuestion(question, options, correctIndex) {
  const questionLower = question.toLowerCase();
  const correctAnswer = options[correctIndex].toLowerCase();
  
  // Rozdělit odpověď na slova a zkontrolovat každé (ignorovat krátká slova)
  const answerWords = correctAnswer.split(/\s+/).filter(w => w.length > 3);
  
  for (const word of answerWords) {
    if (questionLower.includes(word)) {
      return { valid: false, reason: `Odpověď "${word}" je obsažena v otázce` };
    }
  }
  
  // Kontrola celé odpovědi
  if (correctAnswer.length > 3 && questionLower.includes(correctAnswer)) {
    return { valid: false, reason: `Celá odpověď je obsažena v otázce` };
  }
  
  return { valid: true };
}

/**
 * Kontrola: Všechny odpovědi musí být unikátní
 */
function checkUniqueOptions(options) {
  const normalized = options.map(o => o.toLowerCase().trim());
  const unique = new Set(normalized);
  
  if (unique.size !== options.length) {
    return { valid: false, reason: 'Duplicitní odpovědi' };
  }
  
  return { valid: true };
}

/**
 * Kontrola: Zákaz subjektivních/obecných otázek
 */
function checkNotSubjective(question) {
  const subjectivePatterns = [
    /kdo je (nej|nejlepší|nejkrásnější|nejhorší|nejvíce|nejoblíbenější)/i,
    /co je (nej|nejlepší|nejkrásnější|nejhorší|nejoblíbenější)/i,
    /jaký je (nej|nejlepší|nejkrásnější|nejoblíbenější)/i,
    /která? je (nej|nejlepší|nejkrásnější|nejoblíbenější)/i,
    /které? je (nej|nejlepší|nejoblíbenější)/i,
    /co (myslíš|si myslíš|preferuješ|máš rád)/i,
    /jaký je tvůj (názor|oblíbený|nejoblíbenější)/i,
    /co je lepší/i,
    /která?.* je (hezčí|lepší|horší)/i,
    /kdo vyhraje/i,
    /kdo zvítězí/i,
    /co bude v/i,
    /jak dopadne/i,
    /tvůj názor/i,
    /podle tebe/i,
    /co si myslíš/i,
  ];
  
  for (const pattern of subjectivePatterns) {
    if (pattern.test(question)) {
      return { valid: false, reason: `Subjektivní/spekulativní otázka` };
    }
  }
  
  return { valid: true };
}

/**
 * Kontrola: Minimální délka a kvalita
 */
function checkQuestionQuality(question, options) {
  // Otázka musí mít alespoň 15 znaků
  if (question.length < 15) {
    return { valid: false, reason: 'Otázka je příliš krátká' };
  }
  
  // Otázka musí obsahovat otazník nebo být tázací
  const isTazaci = /^(kdo|co|kde|kdy|jak|proč|který|která|které|jaký|jaká|jaké|kolik|čí|kam|odkud)/i.test(question);
  if (!question.includes('?') && !isTazaci) {
    return { valid: false, reason: 'Neplatný formát otázky (chybí otazník nebo tázací slovo)' };
  }
  
  // Každá odpověď musí mít alespoň 1 znak
  for (let i = 0; i < options.length; i++) {
    if (!options[i] || options[i].trim().length === 0) {
      return { valid: false, reason: `Prázdná odpověď na pozici ${i}` };
    }
  }
  
  // Odpovědi nesmí být příliš dlouhé (max 50 znaků)
  for (const opt of options) {
    if (opt.length > 50) {
      return { valid: false, reason: 'Odpověď je příliš dlouhá (max 50 znaků)' };
    }
  }
  
  return { valid: true };
}

/**
 * Kontrola: Správný index správné odpovědi
 */
function checkCorrectIndex(correct, optionsLength) {
  if (typeof correct !== 'number' || correct < 0 || correct >= optionsLength) {
    return { valid: false, reason: `Neplatný index správné odpovědi: ${correct}` };
  }
  return { valid: true };
}

/**
 * Hlavní validační funkce - spustí všechny kontroly
 */
export function validateQuestion(q) {
  // Základní strukturální kontrola
  if (!q || !q.question || !Array.isArray(q.options)) {
    return { valid: false, reason: 'Neplatná struktura otázky' };
  }
  
  if (q.options.length !== 3) {
    return { valid: false, reason: `Špatný počet odpovědí: ${q.options.length} (očekáváno 3)` };
  }
  
  const checks = [
    checkCorrectIndex(q.correct, q.options.length),
    checkAnswerNotInQuestion(q.question, q.options, q.correct),
    checkUniqueOptions(q.options),
    checkNotSubjective(q.question),
    checkQuestionQuality(q.question, q.options),
  ];
  
  for (const check of checks) {
    if (!check.valid) {
      return check;
    }
  }
  
  return { valid: true };
}

/**
 * Batch validace - vrátí pouze platné otázky
 */
export function filterValidQuestions(questions) {
  if (!Array.isArray(questions)) {
    console.warn('⚠️ filterValidQuestions: vstup není pole');
    return [];
  }
  
  const valid = [];
  const rejected = [];
  
  for (const q of questions) {
    const result = validateQuestion(q);
    if (result.valid) {
      valid.push(q);
    } else {
      rejected.push({ 
        question: q.question?.substring(0, 50) + '...', 
        reason: result.reason 
      });
    }
  }
  
  if (rejected.length > 0) {
    console.log(`🚫 Zamítnuto ${rejected.length}/${questions.length} otázek:`);
    rejected.forEach(r => console.log(`   - ${r.reason}: "${r.question}"`));
  }
  
  return valid;
}

/**
 * Validace pro debug účely - vrátí detailní report
 */
export function validateQuestionDetailed(q) {
  const results = {
    structure: { valid: true },
    correctIndex: checkCorrectIndex(q.correct, q.options?.length || 0),
    answerNotInQuestion: q.options ? checkAnswerNotInQuestion(q.question, q.options, q.correct) : { valid: false, reason: 'Chybí options' },
    uniqueOptions: q.options ? checkUniqueOptions(q.options) : { valid: false, reason: 'Chybí options' },
    notSubjective: checkNotSubjective(q.question || ''),
    quality: q.options ? checkQuestionQuality(q.question, q.options) : { valid: false, reason: 'Chybí options' },
  };
  
  const allValid = Object.values(results).every(r => r.valid);
  
  return {
    valid: allValid,
    checks: results,
  };
}
