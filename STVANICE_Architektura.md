# 🎯 ŠTVANICE - Architektura Generátoru Otázek

**Verze:** 2.0 | **Datum:** Prosinec 2024

---

## 1. Přehled systému

Systém generování otázek pro hru ŠTVANICE je navržen jako **hybridní řešení** kombinující:

| Komponenta | Technologie | Účel |
|------------|-------------|------|
| LLM Generátor | Groq API (llama-3.3-70b) | Generování nových otázek |
| Fact-checker | Perplexity API (sonar-pro) | Ověření faktické správnosti |
| Databáze | PostgreSQL (Heroku) | Úložiště ověřených otázek |
| Cache | In-memory (Node.js) | Rychlý přístup během hry |

### Klíčové principy:
- ✅ **Dual-source architektura:** LLM + DB
- ✅ **Multi-layer validace:** Lokální → Fact-check
- ✅ **Anti-repeat:** Globální blacklist + DB tracking
- ✅ **Inteligentní střídání:** LLM/DB podle kola
- ✅ **Graceful degradation:** Emergency fallback

---

## 2. Souborová struktura

```
├── question_generator.js   # Hlavní orchestrátor
├── question_validator.js   # Lokální validace (regex)
├── question_database.js    # PostgreSQL operace
└── server.js               # Express + Socket.IO
```

---

## 3. Konfigurace

### 3.1 Hlavní konstanty

| Konstanta | Hodnota | Popis |
|-----------|---------|-------|
| `BATCH_SIZE` | 5 | Otázek na jedno LLM volání |
| `DB_FETCH_BATCH` | 20 | Over-fetch kandidátů z DB |
| `MIN_CACHE_SIZE` | 3 | Trigger pro background generování |
| `BLACKLIST_DURATION` | 3 hodiny | Doba blokace odpovědi |
| `MAX_RETRIES` | 3 | Pokusy opravit JSON z LLM |
| `answerDedupeHours` | 3 hodiny | DB persistentní blacklist |

### 3.2 Věkové kategorie

| Klíč | Název | DB Mode | Obtížnost |
|------|-------|---------|-----------|
| `adult` | 👔 Dospělí | adult | normal |
| `student` | 🎒 Školáci | kid | normal |
| `kids` | 🐣 Děti | kid | easy |

---

## 4. Střídání zdrojů LLM/DB

### 4.1 Vzor střídání

```
Kolo 1-3:  LLM  (round <= 3)
Kolo 4-5:  DB   (round <= 5)
Kolo 6+:   Střídání (sudé = LLM, liché = DB)
```

| Kolo | Zdroj | Logika |
|------|-------|--------|
| 1 | 🔵 LLM | `round <= 3` |
| 2 | 🔵 LLM | `round <= 3` |
| 3 | 🔵 LLM | `round <= 3` |
| 4 | 🟢 DB | `round <= 5` |
| 5 | 🟢 DB | `round <= 5` |
| 6 | 🔵 LLM | `round % 2 === 0` |
| 7 | 🟢 DB | `round % 2 !== 0` |
| 8 | 🔵 LLM | `round % 2 === 0` |
| 9 | 🟢 DB | `round % 2 !== 0` |

### 4.2 Fallback logika

```
1. Preferovaný zdroj prázdný → Druhý zdroj
2. Oba prázdné → Live LLM generace
3. LLM selhalo → DB Live Fallback
4. Vše selhalo → Emergency Question
```

---

## 5. Tok dat (Data Flow)

### 5.1 Životní cyklus otázky

```
┌─────────────────────────────────────────────────────────────┐
│ 1. PRE-WARMING (při vytvoření lobby)                        │
│    ├── DB: Stáhne 20 kandidátů → filtr → 5 do cache         │
│    └── LLM: Background generace 5 otázek                    │
├─────────────────────────────────────────────────────────────┤
│ 2. LLM GENEROVÁNÍ                                           │
│    └── Groq API → batch 5 otázek (JSON)                     │
├─────────────────────────────────────────────────────────────┤
│ 3. VALIDAČNÍ PIPELINE                                       │
│    ├── Strukturální validace (JSON struktura)               │
│    ├── Lokální validátor (regex filtry)                     │
│    ├── Anti-repeat filtr (blacklist check)                  │
│    └── Fact-check (Perplexity Sonar)                        │
├─────────────────────────────────────────────────────────────┤
│ 4. ULOŽENÍ                                                  │
│    ├── Do cache (pro okamžité použití)                      │
│    └── Do DB (pro budoucí použití)                          │
├─────────────────────────────────────────────────────────────┤
│ 5. VÝBĚR PODLE KOLA                                         │
│    └── getSourceForRound(round) → LLM nebo DB cache         │
├─────────────────────────────────────────────────────────────┤
│ 6. BLOKACE ODPOVĚDI                                         │
│    ├── Global blacklist (in-memory, 3h)                     │
│    ├── Session history                                      │
│    └── DB used_answers (persistentní, 3h)                   │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Over-fetch & Filter strategie

```javascript
// Problém: "Božena Němcová" se opakuje v různých hrách
// Řešení: Over-fetch & Filter

const candidates = await db.getQuestions(20);  // Over-fetch
const filtered = filterQuestions(candidates);  // Filter
const toCache = filtered.slice(0, 5);          // Slice
```

---

## 6. Anti-repeat mechanismus

### 6.1 Tři úrovně ochrany

| Úroveň | Persistence | Popis |
|--------|-------------|-------|
| **Session history** | Jedna hra | `Set<hash>` použitých odpovědí |
| **Global blacklist** | In-memory (3h) | `Map<hash, timestamp>` |
| **DB tracking** | Persistentní (3h) | Tabulka `used_answers` |

### 6.2 Normalizace textu

```javascript
function normalizeText(text) {
  return text
    .toLowerCase()                              // malá písmena
    .normalize('NFD')                           // rozložit diakritiku
    .replace(/[\u0300-\u036f]/g, '')            // odstranit diakritiku
    .replace(/[^a-z0-9]/g, '')                  // jen alfanumerické
    .trim();
}

// "Božena Němcová" → "bozenaneмcova"
```

### 6.3 DB schéma

```sql
CREATE TABLE used_answers (
  id SERIAL PRIMARY KEY,
  answer_hash TEXT NOT NULL,
  used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_used_answers_hash ON used_answers(answer_hash);
CREATE INDEX idx_used_answers_time ON used_answers(used_at);
```

---

## 7. Validace a Fact-checking

### 7.1 Lokální validátor

| Kontrola | Popis |
|----------|-------|
| `checkAnswerNotInQuestion` | Odpověď nesmí být v otázce |
| `checkUniqueOptions` | 3 unikátní odpovědi |
| `checkNotSubjective` | Zákaz "kdo je nejlepší..." |
| `checkQuestionQuality` | Min. 15 znaků, max. 50 znaků |
| `checkCorrectIndex` | Index 0, 1 nebo 2 |

### 7.2 Fact-checker (Sonar)

```javascript
const prompt = `
  Ověř tuto kvízovou otázku:
  Otázka: "${question}"
  Správná odpověď: "${correctAnswer}"
  
  1. Je odpověď fakticky SPRÁVNÁ?
  2. Jsou ostatní možnosti NESPRÁVNÉ?
  3. Je otázka jednoznačná?
  
  Odpověz JSON: {"valid": true/false, "reason": "..."}
`;
```

---

## 8. Databázové schéma

### 8.1 Tabulka `questions`

| Sloupec | Typ | Popis |
|---------|-----|-------|
| `id` | SERIAL PK | Primární klíč |
| `question` | TEXT | Text otázky |
| `option_a/b/c` | TEXT | Tři odpovědi |
| `correct` | INTEGER (0-2) | Index správné |
| `mode` | TEXT | 'adult' / 'kid' |
| `difficulty` | TEXT | 'easy' / 'normal' / 'hard' |
| `use_count` | INTEGER | Počet použití (rotace) |
| `hash` | TEXT UNIQUE | Deduplikační hash |

### 8.2 Rotace otázek

```sql
SELECT * FROM questions 
WHERE mode = $1 AND use_count < $2
ORDER BY use_count ASC, RANDOM()
LIMIT $3;
```

---

## 9. Emergency Fallback

```javascript
const EMERGENCY_QUESTION = {
  question: "Které město je hlavním městem České republiky?",
  options: ["Brno", "Praha", "Ostrava"],
  correct: 1,
  _emergency: true
};
```

Použije se **pouze** pokud selže:
1. LLM generace (+ 3 retry)
2. DB Live Fallback
3. Emergency Question ← **poslední záchrana**

---

## 10. Statistiky

Endpoint: `GET /api/stats`

```json
{
  "generated": 150,
  "passedPerplexity": 120,
  "failedPerplexity": 15,
  "skippedPerplexity": 10,
  "localValidatorRejected": 5
}
```

---

## 11. Diagram architektury

```
┌──────────────────────────────────────────────────────────────────────┐
│                        🎮 KLIENT (React)                              │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ Socket.IO
┌───────────────────────────────▼──────────────────────────────────────┐
│                        🖥️ SERVER (Node.js)                           │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ generateQuestion(gameId, ageGroup)                              │ │
│  │                                                                 │ │
│  │   ┌─────────────┐     ┌─────────────┐                          │ │
│  │   │  LLM Cache  │     │  DB Cache   │                          │ │
│  │   └──────┬──────┘     └──────┬──────┘                          │ │
│  │          │    Střídání       │                                  │ │
│  │          │   LLM/DB dle      │                                  │ │
│  │          │     kola          │                                  │ │
│  │          ▼                   ▼                                  │ │
│  │   ┌──────────────────────────────────────────┐                  │ │
│  │   │           Anti-repeat Filtr              │                  │ │
│  │   │  • Global Blacklist (3h)                 │                  │ │
│  │   │  • Session History                       │                  │ │
│  │   │  • DB used_answers                       │                  │ │
│  │   └──────────────────────────────────────────┘                  │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Groq API    │     │ Perplexity API  │     │   PostgreSQL    │
│ llama-3.3-70b │     │   sonar-pro     │     │  (Heroku DB)    │
│               │     │                 │     │                 │
│ Generování    │     │  Fact-check     │     │ questions       │
│ otázek        │     │                 │     │ used_answers    │
└───────────────┘     └─────────────────┘     └─────────────────┘
```

---

## 12. Shrnutí

| Feature | Status |
|---------|--------|
| Hybridní zdroj (LLM + DB) | ✅ |
| Lokální validace | ✅ |
| Fact-checking (Sonar) | ✅ |
| Anti-repeat (3 úrovně) | ✅ |
| Střídání LLM/DB | ✅ |
| Over-fetch & Filter | ✅ |
| Emergency Fallback | ✅ |
| Sebeučení (LLM → DB) | ✅ |
| Statistiky | ✅ |

---

*Dokument vytvořen: Prosinec 2024*
