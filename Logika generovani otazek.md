# Logika generování otázek

Dokumentace systému `question_generator.js` - hybridního generátoru kvízových otázek pro vědomostní soutěž.

---

## Přehled

Generátor kombinuje dva zdroje otázek:
- **LLM** (Groq/Llama 3.3 70B) - dynamicky generované otázky
- **Databáze** - předgenerované a ověřené otázky

Systém zajišťuje, že hráč nikdy neuvidí prázdnou obrazovku díky 5úrovňové fallback kaskádě.

---

## Věkové skupiny

| Klíč | Název | Věk | Obtížnost | Počet kategorií |
|------|-------|-----|-----------|-----------------|
| `adult` | Dospělí | 18+ | Náročné (AZ-kvíz, Riskuj!) | 140 |
| `student` | Školáci | 12-18 let | Střední (učivo ZŠ/SŠ) | 90 |
| `kids` | Děti | 6-12 let | Jednoduché, zábavné | 45 |

Každá skupina má vlastní strukturovanou sadu kategorií a témat definovanou v konstantách `CATEGORIES_ADULT`, `CATEGORIES_STUDENT` a `CATEGORIES_KIDS`.

### Mapování na databázi

Databáze používá historickou strukturu se sloupci `mode` a `difficulty`. Věkové skupiny jsou mapovány takto:

| Věková skupina | DB: mode | DB: difficulty | Počet otázek |
|----------------|----------|----------------|--------------|
| Dospělí | `adult` | `normal` | 2 347 |
| Studenti | `kid` | `normal` | 889 |
| Děti | `kid` | `easy` | 1 076 |

**Poznámka:** Hodnota `kid` v databázi pokrývá dvě věkové skupiny - studenty i děti. Rozlišení zajišťuje sloupec `difficulty`.

---

## Střídání LLM/DB

Systém pravidelně střídá zdroje otázek podle čísla kola:

```
Liché kolo (1, 3, 5, 7...)  → preferuje LLM
Sudé kolo  (2, 4, 6, 8...)  → preferuje DB
```

**Fallback mechanismus:** Pokud preferovaný zdroj nemá dostupnou otázku, automaticky se použije druhý zdroj.

```javascript
function shouldUseLLM(round) {
  return round % 2 === 1;  // Liché = LLM, Sudé = DB
}
```

---

## Rotace témat

### Princip
- Při každém generování batche (5 otázek) se vybere 5 **různých témat**
- Témata se vybírají náhodně, ale **bez opakování** dokud se nevyčerpají všechna
- Po vyčerpání všech témat dané kategorie proběhne automatický reset

### Perzistence
- Použitá témata se ukládají do databáze
- Rotace přežije restart serveru
- Každá věková skupina má oddělený tracking (prefix `adult:`, `student:`, `kids:`)

### Zápis do DB
Témata se zapisují do DB až **po úspěšné validaci** otázek - ne při výběru. To zabraňuje "propálení" témat při selhání LLM.

---

## Anti-Repeat systém

Systém zabraňuje opakování odpovědí na dvou úrovních:

### 1. Globální blacklist
- Odpovědi blokované na **3 hodiny** (`BLACKLIST_DURATION`)
- Platí napříč všemi hrami
- Automatické čištění každou hodinu

### 2. Lokální session
- V rámci jedné hry (`gameId`) se odpověď neopakuje
- Sleduje se v `GameSession.usedAnswers`

### Normalizace textu
Pro porovnání odpovědí se používá normalizace:
- Převod na lowercase
- Odstranění diakritiky
- Odstranění speciálních znaků

```javascript
function normalizeText(text) {
  return text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '').trim();
}
```

---

## Validace otázek

Otázky procházejí víceúrovňovou validací:

### 1. Strukturální validace
- Má vlastnost `question` (text otázky)
- Má pole `options` s přesně 3 možnostmi
- Má `correct` jako číslo (index správné odpovědi)

### 2. Odpověď není v otázce
- Kontroluje, zda správná odpověď není obsažena v textu otázky
- Zabraňuje "prozrazeným" odpovědím

### 3. Kontrola obtížnosti (jen pro dospělé)
Regex vzory filtrují triviální otázky:
- "Jakou barvu má..."
- "Kolik nohou má..."
- "Hlavní město Francie?"
- Příliš krátké otázky (< 20 znaků)

### 4. Fact-checking (Perplexity Sonar)
- API volání na Perplexity Sonar Pro
- Ověřuje faktickou správnost odpovědi
- Kontroluje, že ostatní možnosti jsou skutečně špatné
- Tolerance pro běžný kvíz (ignoruje okrajové případy)

---

## Zamíchání odpovědí

Fisher-Yates shuffle zajišťuje náhodné pořadí odpovědí:

```javascript
function shuffleOptions(question) {
  const correctAnswer = question.options[question.correct];
  const shuffled = [...question.options];

  // Fisher-Yates shuffle
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return {
    ...question,
    options: shuffled,
    correct: shuffled.indexOf(correctAnswer)
  };
}
```

Správná odpověď tak není vždy na pozici A.

---

## Fallback kaskáda

Systém má 5 úrovní zálohy pro maximální spolehlivost:

```
1. Cache (LLM nebo DB podle kola)
       ↓ (prázdná)
2. Fallback cache (druhý zdroj)
       ↓ (prázdná)
3. Live generace z LLM (až 3 pokusy)
       ↓ (selhání)
4. Live fallback z DB
       ↓ (selhání)
5. Emergency otázka
```

### Emergency otázka
Hardcoded záložní otázka pro případ totálního selhání:
```javascript
const EMERGENCY_QUESTION = {
  question: "Které město je hlavním městem České republiky?",
  options: ["Brno", "Praha", "Ostrava"],
  correct: 1,
  _emergency: true
};
```

---

## Architektura generování

```
generateQuestion(gameId, ageGroup)
       │
       ├─► Inkrementace čítače kol
       │
       ├─► Kontrola cache (LLM/DB střídání)
       │
       ├─► Background refill (pokud cache < 5)
       │
       ├─► Live generace (pokud cache prázdná)
       │        │
       │        └─► generateBatchFromLLM()
       │               ├─► getNextTopic() × 5
       │               ├─► buildPromptForAgeGroup()
       │               ├─► Groq API (Llama 3.3 70B)
       │               ├─► JSON parsing + retry (max 3×)
       │               ├─► Validace + filtrace
       │               ├─► validateWithSonar()
       │               └─► shuffleOptions()
       │
       ├─► DB Live Fallback
       │
       ├─► Blokace odpovědi (global + session)
       │
       └─► Emergency fallback
```

---

## Cache management

### Konstanty
```javascript
const BATCH_SIZE = 5;        // Počet otázek generovaných najednou
const DB_FETCH_BATCH = 20;   // Over-fetch z DB pro lepší filtrování
const MIN_CACHE_SIZE = 5;    // Minimální velikost cache pro pre-generování
const MAX_RETRIES = 3;       // Počet pokusů o opravu JSON z LLM
```

### Pre-warming
Funkce `preWarmCache(gameId, ageGroup)` předgeneruje otázky před startem hry:
1. Načte otázky z DB do `dbCache`
2. Spustí background generaci LLM do `llmCache`

### Background refill
Když cache klesne pod `MIN_CACHE_SIZE`, automaticky se spustí:
- `startBackgroundGeneration()` pro LLM
- `refillDbCache()` pro DB

---

## Použité API a služby

| Služba | Model | Účel |
|--------|-------|------|
| Groq | `llama-3.3-70b-versatile` | Generování otázek |
| Perplexity | `sonar-pro` | Fact-checking |
| Lokální DB | - | Ukládání a rotace otázek |

---

## Metadata otázek

Každá otázka může mít tyto příznaky:

| Příznak | Význam |
|---------|--------|
| `_fromLLM: true` | Vygenerováno LLM |
| `_fromDb: true` | Načteno z databáze |
| `_emergency: true` | Záložní hardcoded otázka |
| `_id` | ID otázky v databázi |

---

## Statistiky validace

Systém sleduje statistiky pro monitoring:

```javascript
let validationStats = {
  generated: 0,           // Celkem vygenerováno
  passedSelfCritique: 0,  // Prošlo vlastní kontrolou
  failedSelfCritique: 0,  // Neprošlo vlastní kontrolou
  passedPerplexity: 0,    // Prošlo fact-checkingem
  failedPerplexity: 0,    // Neprošlo fact-checkingem
  skippedPerplexity: 0    // Přeskočeno (API nedostupné)
};
```

Export funkcí:
- `getValidationStats()` - vrátí aktuální statistiky
- `getValidationHistory()` - vrátí historii zamítnutých otázek
- `resetValidationStats()` - resetuje statistiky

---

## Exportované funkce

| Funkce | Popis |
|--------|-------|
| `generateQuestion(gameId, ageGroup)` | Hlavní generátor - vrátí jednu otázku |
| `preWarmCache(gameId, ageGroup)` | Předgeneruje cache před hrou |
| `connectDatabase(dbModule)` | Připojí databázový modul |
| `endGameSession(gameId)` | Ukončí herní session |
| `resetGameSession(gameId)` | Resetuje herní session |
| `getCacheStatus(gameId)` | Vrátí stav cache |
| `getAgeGroups()` | Vrátí seznam věkových skupin |
| `getValidationStats()` | Vrátí statistiky validace |
| `getValidationHistory()` | Vrátí historii zamítnutých otázek |
| `resetValidationStats()` | Resetuje statistiky |
