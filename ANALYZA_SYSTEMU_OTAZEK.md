# Analýza systému otázek - Hra Štvanice

## Struktura aplikace

### Backend (Node.js)

| Soubor | Řádky | Popis |
|--------|-------|-------|
| `question_generator.js` | 1252 | LLM orchestrátor |
| `question_validator.js` | 205 | Lokální validace |
| `question_database.js` | 478 | PostgreSQL ORM |
| `server.js` | 540 | WebSocket server |

### Frontend (React + TypeScript)

| Komponenta | Řádky | Popis |
|------------|-------|-------|
| `CategorySelection.tsx` | 193 | Výběr věkové kategorie |
| `GameBoard.tsx` | 457 | Herní logika |
| `SpectatorView.tsx` | 1081 | Pohled diváka |
| `RoleSelection.tsx` | 292 | Výběr role |
| Další komponenty | ~1258 | Lobby, FAQ, atd. |

---

## Generování otázek (LLM pipeline)

### Použité modely

- **Generátor**: Groq API - `llama-3.3-70b-versatile`
- **Fact-checker**: Perplexity API - `sonar-pro` (má přístup k webu)

### Konfigurace

```javascript
const BATCH_SIZE = 5;                    // Otázek najednou
const DB_FETCH_BATCH = 20;               // Over-fetch pro filtrování
const MIN_CACHE_SIZE = 5;                // Trigger pre-warmingu
const BLACKLIST_DURATION = 3 * 60 * 60 * 1000;  // 3 hodiny
const MAX_RETRIES = 3;                   // JSON opravy
```

### Proces generování

1. **Výběr témat** - 5 témat z globální rotace (`getNextTopic()`)
2. **Sestavení promptu** - dle věkové skupiny (`buildPromptForAgeGroup()`)
3. **Volání Groq API** - temperature: 0.9
4. **JSON parsing** - s retry (max 3 pokusy)
5. **Strukturální validace** - 3 odpovědi, index 0-2
6. **Kontrola obsahu** - odpověď nesmí být v otázce
7. **Filtr triviálních otázek** - pouze pro dospělé
8. **Fact-check** - Perplexity Sonar
9. **Uložení do DB** - + zamíchání odpovědí

### Klíčové funkce

- `generateBatchFromLLM()` - hlavní generátor (řádky 943-1050)
- `buildPromptForAgeGroup()` - tvorba promptu (řádky 807-938)
- `validateWithSonar()` - fact-checking (řádky 700-789)
- `preWarmCache()` - předehřátí cache při vytvoření lobby

---

## Věkové kategorie

| Kategorie | Emoji | Počet témat | Obtížnost | DB mode | Popis |
|-----------|-------|-------------|-----------|---------|-------|
| **adult** | 👔 | 200 | těžká | 'adult' | Pro znalce |
| **student** | 🎒 | 100 | střední | 'kid' | Středoškoláci (15-18) |
| **kids** | 🐣 | 40 | snadná | 'kid' | Děti (6-12) |

### Konfigurace v kódu

```javascript
const AGE_GROUP_CONFIG = {
  adult: {
    name: "👔 Dospělí",
    mode: 'adult',
    difficulty: 'normal'
  },
  student: {
    name: "🎒 Školáci",
    mode: 'kid',
    difficulty: 'normal'
  },
  kids: {
    name: "🐣 Děti",
    mode: 'kid',
    difficulty: 'easy'
  }
};
```

---

## Témata otázek

### Dospělí - ADULT_TOPICS (200 témat)

| Kategorie | Počet | Příklady |
|-----------|-------|----------|
| Historie | 40 | české dějiny 20. století, světové války, starověký Řím, středověká Evropa |
| Zeměpis | 30 | hlavní města světa, řeky a jezera, pohoří, ostrovy, pouště |
| Přírodní vědy | 35 | chemické prvky, lidské tělo, astronomie, fyzikální zákony, genetika |
| Umění a kultura | 30 | renesanční malířství, film, architektura, sochařství |
| Literatura | 20 | česká literatura, světová literatura, drama |
| Hudba | 20 | barokní hudba, jazz a blues, opera |
| Sport | 15 | olympijské hry, fotbal, tenis |
| Moderní témata | 10 | kryptoměny, startup kultura |

### Školáci - STUDENT_TOPICS (100 témat)

| Kategorie | Počet |
|-----------|-------|
| Historie | 20 |
| Zeměpis | 15 |
| Přírodní vědy | 20 |
| Matematika | 10 |
| Umění | 10 |
| Literatura | 10 |
| Hudba | 5 |
| Sport | 10 |

### Děti - KIDS_TOPICS (40 témat)

| Kategorie | Počet | Příklady |
|-----------|-------|----------|
| Zvířata | 10 | domácí zvířata, zvířata v zoo, mořští živočichové |
| Příroda | 8 | roční období, počasí, stromy a květiny |
| Pohádky | 8 | české pohádky, Disney, klasické příběhy |
| Člověk | 4 | lidské tělo, smysly |
| Věda pro děti | 5 | planety, dinosauři |
| Sport | 5 | olympijské sporty, míčové hry |

### Rotace témat

```javascript
async function getNextTopic(skipDbWrite, ageGroup) {
  // 1. Výběr sady témat podle věkové skupiny
  const topics = topicSets[ageGroup];
  const prefix = `${ageGroup}:`;  // Izolace kategorií

  // 2. Načtení použitých témat z DB
  const usedTopics = await questionDatabase.getUsedTopics();

  // 3. Filtr dostupných témat
  const available = topics.filter(t => !usedSet.has(t));

  // 4. Reset pokud všechna použita
  if (available.length === 0) {
    await resetTopicsForCategory(ageGroup);
  }

  // 5. Náhodný výběr z dostupných
  return available[Math.floor(Math.random() * available.length)];
}
```

---

## Validace otázek

### Lokální validátor (5 kontrol)

| Funkce | Popis |
|--------|-------|
| `checkCorrectIndex()` | Index správné odpovědi musí být 0, 1 nebo 2 |
| `checkAnswerNotInQuestion()` | Odpověď nesmí být obsažena v textu otázky |
| `checkUniqueOptions()` | Všechny odpovědi musí být unikátní |
| `checkNotSubjective()` | Zákaz subjektivních otázek ("nejlepší", "nejkrásnější") |
| `checkQuestionQuality()` | Min. 15 znaků otázka, max. 50 na odpověď |

### Perplexity fact-check

```javascript
async function validateWithSonar(questionData) {
  const prompt = `Jsi FACT-CHECKER kvízových otázek...

  1. Je "${correctAnswer}" FAKTICKY SPRÁVNÁ?
  2. Jsou ostatní možnosti FAKTICKY ŠPATNÉ?
  3. Nemůže být správná i jiná?

  VÝSTUP: {"valid": true/false, "reason": "..."}`;

  // Volání Perplexity API
  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    model: 'sonar-pro',
    temperature: 0
  });
}
```

### Statistiky validace

```javascript
let validationStats = {
  generated: 0,              // Vygenerováno z LLM
  passedSelfCritique: 0,     // Prošly lokální validací
  failedSelfCritique: 0,     // Selhaly lokální validaci
  passedPerplexity: 0,       // Prošly fact-checkem
  failedPerplexity: 0,       // Selhaly fact-checkem
  skippedPerplexity: 0       // Přeskočeny (bez klíče)
};
```

---

## Databáze

### Technologie

- **Produkce**: PostgreSQL na Heroku
- **Vývoj**: SQLite lokálně

### Schéma - tabulka `questions`

```sql
CREATE TABLE questions (
  id SERIAL PRIMARY KEY,
  question TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  correct INTEGER NOT NULL CHECK(correct >= 0 AND correct <= 2),
  category TEXT,
  aspect TEXT,
  mode TEXT DEFAULT 'adult',           -- 'adult' nebo 'kid'
  difficulty TEXT DEFAULT 'normal',    -- 'easy', 'normal', 'hard'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP,
  use_count INTEGER DEFAULT 0,         -- Rotace počítadlo
  hash TEXT UNIQUE                     -- Deduplikace
);
```

### Schéma - tabulka `used_answers`

```sql
CREATE TABLE used_answers (
  id SERIAL PRIMARY KEY,
  answer_hash TEXT NOT NULL,
  used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Schéma - tabulka `topic_rotation`

```sql
CREATE TABLE topic_rotation (
  id SERIAL PRIMARY KEY,
  topic TEXT NOT NULL UNIQUE,
  used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Klíčové operace

| Funkce | Popis |
|--------|-------|
| `saveQuestions()` | Uložení s deduplikací (ON CONFLICT DO NOTHING) |
| `getQuestionsWithRotation()` | Načtení s preferencí nízkého use_count |
| `markQuestionAsUsed()` | Inkrementace use_count |
| `recordUsedAnswer()` | Záznam použité odpovědi |
| `isAnswerRecentlyUsed()` | Kontrola 3h blacklistu |
| `cleanupOldAnswers()` | Čištění starých záznamů (24h) |

---

## Anti-repeat systém (3 úrovně)

### 1. Session blacklist (paměť)

- Doba: 3 hodiny
- Ukládá: hash odpovědí v RAM
- Účel: Prevence opakování během jedné session

### 2. DB used_answers

- Tabulka: `used_answers`
- Ukládá: hash odpovědí s časovým razítkem
- Čištění: po 24 hodinách

### 3. Question rotation

- Pole: `use_count` v tabulce `questions`
- Fungování: Preferuje otázky s nižším počtem použití
- Reset: Automatický po vyčerpání všech otázek

---

## Shrnutí architektury

### Silné stránky

1. **Hybrid LLM + DB** - flexibilní strategie získávání otázek
2. **Globální rotace témat** - zajišťuje pestrost bez opakování
3. **Multi-layer validace** - lokální + fact-check s Perplexity
4. **Anti-repeat na 3 úrovních** - session + memory + DB
5. **Inteligentní fallback** - graceful degradation při výpadcích
6. **Pre-warming cache** - otázky připraveny před začátkem hry

### Střídání LLM / DB

Otázky se střídají pravidelně mezi LLM a databází:

```javascript
function shouldUseLLM(round) {
  return round % 2 === 1;  // Liché = LLM, Sudé = DB
}
```

| Kolo | round % 2 | Zdroj |
|------|-----------|-------|
| 1 | 1 (liché) | LLM |
| 2 | 0 (sudé) | DB |
| 3 | 1 (liché) | LLM |
| 4 | 0 (sudé) | DB |
| 5 | 1 (liché) | LLM |
| 6 | 0 (sudé) | DB |
| ... | ... | ... |

**Fallback logika:**
- Pokud preferovaný zdroj (LLM/DB) je prázdný, použije se druhý
- Pokud oba prázdné → live generace z LLM
- Pokud i ta selže → DB live fallback

### Tok dat

```
[Vytvoření lobby]
       ↓
[preWarmCache(ageGroup)]
       ↓
┌──────────────────────────────────────┐
│  1. DB cache: 20 kandidátů → 5 do cache  │
│  2. LLM cache: Background generace       │
└──────────────────────────────────────┘
       ↓
[Požadavek na otázku (kolo N)]
       ↓
┌──────────────────────────────────────┐
│  Střídání podle kola:                    │
│  - Liché kolo (1,3,5...) → preferuj LLM  │
│  - Sudé kolo (2,4,6...) → preferuj DB    │
│  - Fallback na druhý zdroj pokud prázdný │
└──────────────────────────────────────┘
       ↓
[Validace + Uložení + Odeslání klientovi]
```

---

*Dokument vygenerován: Leden 2026*
