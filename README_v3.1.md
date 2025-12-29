# 🎮 ŠTVANICE - VERZE 3.1

## 🔧 OPRAVY A ZMĚNY

### A) Robustnější JSON parsing
- Přidáno 3-úrovňové parsování LLM odpovědí
- Retry logika při selhání (max 2 pokusy)
- DB fallback pokud LLM kompletně selže

### B) Opravený flow - countdown PO výběru role
```
LOBBY → KATEGORIE → ČEKÁNÍ NA HRÁČE → ROLE → COUNTDOWN (35s) → HEADSTART → HRA
                          ↓                      ↓
                    LLM generuje           🔊 Audio (5s po startu)
```

### C) Střídání LLM/DB otázek
| Kolo | Zdroj |
|------|-------|
| 1 | LLM |
| 2 | LLM |
| 3 | LLM |
| 4 | DB |
| 5 | DB |
| 6 | LLM |
| 7 | DB |
| 8 | LLM |
| 9 | DB |
| 10+ | Střídání pokračuje... |

### D) Ikona zdroje: AI → LLM
V GameBoard.tsx změňte text "AI" na "LLM".

---

## 📋 PARAMETRY

| Parametr | Hodnota |
|----------|---------|
| Countdown | **35 sekund** |
| Batch size | **8 otázek** |
| Minimum pro ready | **4 LLM otázky** |
| Audio start | **5s po startu** (při 30s remaining) |
| Odveta | **bez countdownu** |

---

## 📁 SOUBORY K NAHRAZENÍ

```
src/
├── App.tsx                    ← NAHRADIT
├── components/
│   ├── CategorySelection.tsx  ← STEJNÝ (z v3.0)
│   ├── CountdownWaiting.tsx   ← NAHRADIT
│   ├── RoleSelection.tsx      ← STEJNÝ (z v3.0)
│   └── GameBoard.tsx          ← UPRAVIT: "AI" → "LLM"

server.js                      ← NAHRADIT
question_generator.js          ← NAHRADIT
question_database.js           ← BEZE ZMĚNY
```

---

## 🔊 AUDIO

Soubor `public/sounds/countdown.mp3` (30 sekund):
- Spustí se 5 sekund po startu countdownu
- Tedy když `countdown = 30`

---

## 🧪 TESTOVÁNÍ

### 1. Test JSON parse error recovery
```
- Spusťte hru několikrát
- Sledujte konzoli serveru
- Občasný "JSON parse failed" by měl být následován retry
- Pokud retry selže, DB fallback by měl fungovat
```

### 2. Test countdown timing
```
- Vytvořte hru
- Zvolte kategorii → jde do "Čekání na hráče"
- Připojte hráče 2 → jde do "Výběr role"
- Vyberte roli → TEPRVE TEĎ začne countdown (35s)
- Audio po 5 sekundách
```

### 3. Test střídání LLM/DB
```
Konzole serveru by měla ukazovat:
🎯 Game ABC123 - Round 1 (prefer: LLM)
   📤 LLM question (7 remaining)
🎯 Game ABC123 - Round 2 (prefer: LLM)
   📤 LLM question (6 remaining)
🎯 Game ABC123 - Round 3 (prefer: LLM)
   📤 LLM question (5 remaining)
🎯 Game ABC123 - Round 4 (prefer: DB)
   📤 DB question (4 remaining)
...
```

### 4. Test odvety
```
- Dohrajte hru
- Klikněte "Hrát znovu"
- Měl by přejít rovnou na výběr role (BEZ countdownu)
```

---

## 📝 MANUÁLNÍ ÚPRAVA: GameBoard.tsx

Najděte v souboru `GameBoard.tsx` místo kde se zobrazuje badge "AI" a změňte na "LLM":

```tsx
// PŘED:
{question._fromLLM && <span className="...">⚡ AI</span>}

// PO:
{question._fromLLM && <span className="...">⚡ LLM</span>}
```

Podobně pro "DB":
```tsx
{question._fromDb && <span className="...">📦 DB</span>}
```

---

## 🐛 MOŽNÉ PROBLÉMY

### "LLM generation failed" v konzoli
- **Příčina:** Groq API vrátil nevalidní JSON
- **Řešení:** Automatický retry (až 2x), pak DB fallback
- **Ověření:** Hra by měla pokračovat s DB otázkami

### Countdown nezačíná
- **Příčina:** Countdown začíná až po výběru role obou hráčů
- **Řešení:** Ujistěte se že oba hráči jsou připojeni a vybrali role

### Audio nehraje
- **Příčina:** Prohlížeč blokuje autoplay
- **Řešení:** Uživatel musí nejdřív kliknout někam na stránku

---

Verze: 3.1
Datum: $(date)
