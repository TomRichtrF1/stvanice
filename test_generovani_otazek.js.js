import dotenv from 'dotenv';
import pg from 'pg'; 
import { 
  generateQuestion, 
  connectDatabase,
  resetGameSession
} from './question_generator.js';
import * as realDb from './question_database.js';

dotenv.config();

// === NASTAVENÍ SIMULACE ===
const GAME_ID = `test_couple_${Date.now()}`; // Unikátní ID pro tuto dvojici
const POCET_KOL = 20; // Kolik kol si zahrají (aby se vyčerpaly batche)
const AGE_GROUP = 'adult';

// === BAREVNÝ VÝSTUP ===
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
  blue: "\x1b[34m"
};

const dbCheckPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// === LOGOVÁNÍ ===
const originalConsoleLog = console.log;
let capturedLogs = [];

function startLogCapture() {
  capturedLogs = [];
  console.log = (...args) => {
    const msg = args.join(' ');
    // Chytáme jen to, co nás zajímá pro ladění
    if (msg.includes('Saved') || msg.includes('Uloženo') || msg.includes('❌') || msg.includes('🚫') || msg.includes('Preferuji')) {
      capturedLogs.push(msg);
    }
  };
}

function stopLogCapture() {
  console.log = originalConsoleLog;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log(`\n${colors.cyan}═══════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}🧪 SIMULACE JEDNÉ HRY (JEDEN PÁR HRÁČŮ)${colors.reset}`);
  console.log(`   Game ID: ${GAME_ID}`);
  console.log(`   Cíl: Ukázat, jak se plní DB a Cache v průběhu ${POCET_KOL} kol.`);
  console.log(`${colors.cyan}═══════════════════════════════════════════════════════════${colors.reset}\n`);

  // 1. Připojení k DB
  const dbConnected = await connectDatabase(realDb);
  if (!dbConnected) {
    console.error("❌ Databáze není připojena.");
    process.exit(1);
  }

  // 2. Zjištění výchozího stavu
  let lastMaxId = 0;
  try {
    const r = await dbCheckPool.query('SELECT MAX(id) as max_id FROM questions');
    lastMaxId = r.rows[0].max_id || 0;
  } catch(e) {}

  console.log(`${colors.gray}Startovní ID otázky v DB: ${lastMaxId}${colors.reset}\n`);

  // 3. Hlavní herní smyčka
  for (let kolo = 1; kolo <= POCET_KOL; kolo++) {
    // Určení typu kola (Liché=LLM, Sudé=DB)
    const isLlmRound = kolo % 2 !== 0;
    const roundType = isLlmRound ? "🤖 LLM TAH" : "🗄️ DB TAH";
    const roundColor = isLlmRound ? colors.yellow : colors.blue;

    console.log(`${roundColor}⚡ KOLO ${kolo}: ${roundType}${colors.reset}`);
    
    startLogCapture();
    const startTime = Date.now();
    
    // Volání generátoru (stále stejné Game ID!)
    const q = await generateQuestion(GAME_ID, AGE_GROUP);
    
    // 🆕 OPRAVA: Explicitní zápis každé otázky vytažené z Cache do DB
    if (q && q._fromLLM) {
        await realDb.saveQuestions([q], AGE_GROUP, 'normal');
    }
    
    // Čekáme chvilku, protože ukládání batchů probíhá na pozadí
    if (isLlmRound) await sleep(2000); 
    
    stopLogCapture();

    // Výpis otázky
    if (q) {
      const source = q._fromLLM ? "✨ Z LLM/Cache" : (q._fromDb ? "📚 Z DB" : "🚨 EMERGENCY");
      console.log(`   Otázka: "${colors.bright}${q.question}${colors.reset}"`);
      
      // Zobrazení odpovědí s označením správné
      q.options.forEach((opt, idx) => {
        const isCorrect = idx === q.correct;
        const color = isCorrect ? colors.green : colors.gray;
        const icon = isCorrect ? "✔" : " ";
        const letter = String.fromCharCode(65 + idx); // A, B, C
        console.log(`      ${color}${icon} ${letter}) ${opt}${colors.reset}`);
      });

      console.log(`   Zdroj: ${source} | ID: ${q._id || 'Nové'}`);
    } else {
      console.log(`   ❌ Chyba generování`);
    }

    // KONTROLA DATABÁZE (Co se uložilo v tomto kole?)
    // Protože se ukládá v dávkách (batches), uvidíme zápisy jen občas!
    const currentMaxIdRes = await dbCheckPool.query('SELECT MAX(id) as max_id FROM questions');
    const currentMaxId = currentMaxIdRes.rows[0].max_id || 0;

    if (currentMaxId > lastMaxId) {
      const count = currentMaxId - lastMaxId;
      console.log(`   ${colors.green}💾 V tomto kole proběhl zápis do DB! Přibylo ${count} otázek.${colors.reset}`);
      
      // Výpis novinek
      const newQs = await dbCheckPool.query(`SELECT question, category FROM questions WHERE id > $1`, [lastMaxId]);
      newQs.rows.forEach(row => {
        console.log(`      + [DB] ${row.category || '?'}: ${row.question.substring(0, 40)}...`);
      });

      lastMaxId = currentMaxId;
    } else if (isLlmRound) {
      console.log(`   ${colors.gray}(Žádný zápis do DB - otázka byla vytažena z Cache)${colors.reset}`);
    }

    // Výpis interních logů (pro kontrolu validace)
    if (capturedLogs.length > 0) {
        // Filtrujeme jen zajímavé logy
        const fails = capturedLogs.filter(l => l.includes('❌') || l.includes('🚫'));
        if (fails.length > 0) {
            console.log(`   ${colors.red}Zamítnuto na pozadí:${colors.reset}`);
            fails.forEach(f => console.log(`   ${f.replace('❌ Rejected by Sonar:', '🛑')}`));
        }
    }

    console.log(`${colors.gray}-----------------------------------------------------------${colors.reset}`);
  }

  // Závěr
  console.log(`\n${colors.bright}🏁 Simulace dokončena.${colors.reset}`);
  realDb.closeDatabase();
  await dbCheckPool.end();
  process.exit(0);
}

main();