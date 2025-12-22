import { generateQuestion } from './question_generator.js';

// Jednoduchý testovací skript
async function runTest() {
  console.log("🚀 Spouštím test generátoru otázek...\n");

  // TEST 1: Náhodné téma pro dospělé
  console.log("--- 👨‍🦳 TEST DOSPĚLÝ (Random Topic) ---");
  const q1 = await generateQuestion('general', 'adult');
  console.log("Otázka:", q1.question);
  console.log("Možnosti:", q1.options);
  console.log("\n");

  // TEST 2: Náhodné téma pro děti
  console.log("--- 👶 TEST DÍTĚ (Random Topic) ---");
  const q2 = await generateQuestion('general', 'kid');
  console.log("Otázka:", q2.question);
  console.log("Možnosti:", q2.options);
  console.log("\n");

  // TEST 3: Konkrétní téma (tvůj fotbal) pro děti
  console.log("--- ⚽ TEST KONKRÉTNÍ (Fotbal - Dítě) ---");
  const q3 = await generateQuestion('Sport a pohyb: Fotbal', 'kid');
  console.log("Otázka:", q3.question);
  console.log("Možnosti:", q3.options);
  console.log("\n");
  
  // TEST 4: Konkrétní téma (tvůj fotbal) pro dospělé
  console.log("--- 🍺 TEST KONKRÉTNÍ (Fotbal - Dospělý) ---");
  const q4 = await generateQuestion('Sport a pohyb: Fotbal', 'adult');
  console.log("Otázka:", q4.question);
  console.log("Možnosti:", q4.options);
}

runTest();