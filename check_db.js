import * as db from './question_database.js';

db.initDatabase();
const stats = db.getDatabaseStats();

console.log('\n📊 STAV DATABÁZE:');
console.log('═'.repeat(40));
console.log(`   Celkem otázek:    ${stats.totalQuestions}`);
console.log(`   ADULT otázek:     ${stats.adultQuestions}`);
console.log(`   KID otázek:       ${stats.kidQuestions}`);
console.log(`   Aktivní sessions: ${stats.activeSessions}`);
console.log('═'.repeat(40));

db.closeDatabase();