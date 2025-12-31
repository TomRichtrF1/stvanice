# 🎮 ŠTVANICE - VERZE 3.0

## 🚀 NOVÁ ARCHITEKTURA: COUNTDOWN + PRE-WARMING

### Co je nového?

Hráč teď vybírá věkovou skupinu **PŘED** založením hry. To nám dává 45 sekund na přípravu AI otázek, zatímco hráči prožívají dramatický countdown.

---

## 📋 NOVÝ FLOW HRY

```
HOSTITEL:
┌─────────┐   ┌──────────────────┐   ┌─────────────────┐   ┌─────────────┐   ┌──────┐
│  LOBBY  │ → │ VÝBĚR KATEGORIE  │ → │ COUNTDOWN (45s) │ → │ VÝBĚR ROLE  │ → │ HRA  │
└─────────┘   └──────────────────┘   └─────────────────┘   └─────────────┘   └──────┘
                     ↓                       ↓
              "👔 Dospělí"           🧠 AI generuje otázky
              "🎒 Větší školáci"     🔊 Dramatické audio
              "📚 Malí školáci"      ⏱️ Countdown na obrazovce
              "🐣 Předškoláci"       📊 Progress bar

HRÁČ 2:
┌─────────┐   ┌─────────────────┐   ┌─────────────┐   ┌──────┐
│  LOBBY  │ → │ COUNTDOWN       │ → │ VÝBĚR ROLE  │ → │ HRA  │
└─────────┘   └─────────────────┘   └─────────────┘   └──────┘
    ↓
 Zadá kód
```

---

## 🎯 KLÍČOVÉ ZMĚNY

### 1. Výběr kategorie PŘED založením hry
- Hostitel vybere věkovou skupinu
- Teprve pak se vytvoří místnost s kódem
- Kategorie je **zamčená** - nelze změnit během hry

### 2. 45 sekundový countdown
- Dramatický odpočet s audio efektem (countdown.mp3)
- Audio začne hrát 30 sekund před koncem
- Hráč 2 vidí stejný countdown když se připojí
- Pod countdownem: nenápadný progress AI generování

### 3. AI otázky od kola 1
- Pre-warming během countdownu
- 12 otázek se generuje a validuje
- Fallback na databázi pokud AI nestihne

### 4. Odveta bez čekání
- Při "Hrát znovu" žádný countdown
- Otázky jsou už připravené
- Okamžitý start další hry

---

## 📁 SOUBORY K NAHRAZENÍ

```
src/
├── App.tsx                    ← NAHRADIT (nový flow)
├── components/
│   ├── CategorySelection.tsx  ← NOVÝ SOUBOR
│   ├── CountdownWaiting.tsx   ← NOVÝ SOUBOR
│   ├── RoleSelection.tsx      ← NAHRADIT (bez výběru kategorie)
│   └── ... (ostatní beze změny)

server.js                      ← NAHRADIT (countdown logika)
question_generator.js          ← NAHRADIT (pre-warming)
question_database.js           ← BEZE ZMĚNY (z verze 2.0)
```

---

## 🔊 AUDIO

Ujistěte se, že existuje soubor:
```
public/sounds/countdown.mp3   (délka přesně 30 sekund)
```

Audio se přehraje automaticky 30 sekund před koncem countdownu.

---

## ⏱️ ČASOVÁNÍ

| Fáze | Trvání | Co se děje |
|------|--------|------------|
| Výběr kategorie | ~5s | Hostitel klikne na tlačítko |
| Countdown | 45s | AI generuje, hráči čekají |
| Čekání na hráče 2 | max 180s | Pokud se nikdo nepřipojí |
| Výběr role | ~5s | Kdo klikne první |
| Výběr náskoku | ~3s | Štvanec vybírá |
| **HRA** | variabilní | AI otázky od kola 1! |

---

## 🧪 TESTOVÁNÍ

1. **Test countdownu:**
   - Vytvořte hru
   - Sledujte countdown a progress AI
   - Po 30s by mělo hrát audio

2. **Test připojení hráče 2:**
   - Hráč 2 se připojí uprostřed countdownu
   - Měl by vidět stejný odpočet

3. **Test AI otázek:**
   - První kolo by mělo mít AI otázku (⚡)
   - Zkontrolujte konzoli serveru

4. **Test odvety:**
   - Po hře klikněte "Hrát znovu"
   - Mělo by to být okamžité (žádný countdown)

---

## 🐛 MOŽNÉ PROBLÉMY

### Bílá obrazovka při přepnutí okna
- Opraveno v App.tsx (resync mechanismus)

### AI nestihne vygenerovat
- Fallback na databázové otázky
- Progress ukazuje stav generování

### Countdown audio nehraje
- Zkontrolujte že existuje `/public/sounds/countdown.mp3`
- Prohlížeč může blokovat autoplay

---

## 📊 MONITORING

V konzoli serveru uvidíte:
```
🎮 Game created: ABC123 (👔 Dospělí)
🚀 Pre-warming started for ABC123 (adult)
🧠 Generating 12 questions (adult/normal)...
📦 After filters: 10 questions
🔍 Validating 10 questions (parallel)...
✅ Validation: 8/10 passed
💾 Saved 6 new questions to database
✅ Pre-warming complete for ABC123: 8 AI questions ready
⏰ Countdown ended for game ABC123
```

---

Vytvořeno: $(date)
Verze: 3.0 - Countdown + Pre-warming Architecture
