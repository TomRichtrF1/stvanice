import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cesta k souboru s kódy
const CODES_FILE = path.join(__dirname, 'codes.json');

// Admin kód s permanentní platností
const ADMIN_CODE = 'STVANICEADMIN';

/**
 * Načte databázi kódů ze souboru
 */
function loadCodes() {
  try {
    if (!fs.existsSync(CODES_FILE)) {
      // Pokud soubor neexistuje, vytvoř prázdnou databázi
      const emptyDb = { codes: [] };
      fs.writeFileSync(CODES_FILE, JSON.stringify(emptyDb, null, 2));
      return emptyDb;
    }
    
    const data = fs.readFileSync(CODES_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('❌ Chyba při čtení codes.json:', error);
    return { codes: [] };
  }
}

/**
 * Uloží databázi kódů do souboru
 */
function saveCodes(db) {
  try {
    fs.writeFileSync(CODES_FILE, JSON.stringify(db, null, 2));
  } catch (error) {
    console.error('❌ Chyba při ukládání codes.json:', error);
  }
}

/**
 * ✅ OPRAVENÁ VERZE: Vygeneruje náhodný 12-znakový kód ve formátu XXXX-XXXX-XXXX
 */
export function generateCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  
  // ✅ OPRAVA: Iterujeme 14x (12 znaků + 2 pomlčky)
  for (let i = 0; i < 14; i++) {
    if (i === 4 || i === 9) {  // ✅ OPRAVA: pomlčky na pozicích 4 a 9
      code += '-';
    } else {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  }
  
  return code;
}

/**
 * Vytvoří nový herní kód s tématem a uloží ho
 */
export function createGameCode(topic) {
  const code = generateCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 dní
  
  const gameCode = {
    code,
    topic,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    used: false
  };
  
  // Ulož do databáze
  const db = loadCodes();
  db.codes.push(gameCode);
  saveCodes(db);
  
  console.log(`✅ Vytvořen nový kód: ${code} (téma: ${topic}, platnost do: ${expiresAt.toLocaleDateString('cs-CZ')})`);
  
  return gameCode;
}

/**
 * Validuje formát kódu
 */
function isValidFormat(code) {
  // Admin kód - speciální případ
  if (code === ADMIN_CODE) {
    return true;
  }
  
  // Standardní formát: XXXX-XXXX-XXXX (12 znaků + 2 pomlčky)
  const pattern = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
  return pattern.test(code);
}

/**
 * Zkontroluje platnost kódu
 * @returns { valid: boolean, message: string, topic?: string }
 */
export function validateCode(code) {
  // 1. Kontrola formátu
  if (!isValidFormat(code)) {
    return {
      valid: false,
      message: 'NEPLATNÝ FORMÁT KÓDU! Použij formát XXXX-XXXX-XXXX'
    };
  }
  
  // 2. Admin kód - vždy platný
  if (code === ADMIN_CODE) {
    return {
      valid: true,
      message: '🔓 ADMIN PŘÍSTUP POVOLEN',
      topic: 'admin' // Speciální téma pro admina
    };
  }
  
  // 3. Načti databázi a najdi kód
  const db = loadCodes();
  const gameCode = db.codes.find(c => c.code === code);
  
  if (!gameCode) {
    return {
      valid: false,
      message: 'TENTO KÓD NEBYL NALEZEN V SYSTÉMU'
    };
  }
  
  // 4. Kontrola expirace
  const now = new Date();
  const expiresAt = new Date(gameCode.expiresAt);
  
  if (now > expiresAt) {
    return {
      valid: false,
      message: `PLATNOST TOHOTO HERNÍHO KÓDU VYPRŠELA ${expiresAt.toLocaleDateString('cs-CZ')}`
    };
  }
  
  // 5. Kód je platný!
  return {
    valid: true,
    message: '✅ KÓD JE PLATNÝ',
    topic: gameCode.topic,
    expiresAt: gameCode.expiresAt
  };
}

/**
 * Označí kód jako použitý (volitelné - pro tracking)
 */
export function markCodeAsUsed(code) {
  if (code === ADMIN_CODE) return; // Admin kód neoznačujeme
  
  const db = loadCodes();
  const gameCode = db.codes.find(c => c.code === code);
  
  if (gameCode) {
    gameCode.used = true;
    saveCodes(db);
    console.log(`📝 Kód ${code} označen jako použitý`);
  }
}

/**
 * Smaže expirované kódy (pro údržbu)
 */
export function cleanupExpiredCodes() {
  const db = loadCodes();
  const now = new Date();
  const initialCount = db.codes.length;
  
  db.codes = db.codes.filter(c => new Date(c.expiresAt) > now);
  
  const removed = initialCount - db.codes.length;
  
  if (removed > 0) {
    saveCodes(db);
    console.log(`🧹 Smazáno ${removed} expirovaných kódů`);
  }
  
  return removed;
}

/**
 * Získá všechny platné kódy (pro debugging)
 */
export function getAllValidCodes() {
  const db = loadCodes();
  const now = new Date();
  
  return db.codes.filter(c => new Date(c.expiresAt) > now);
}
