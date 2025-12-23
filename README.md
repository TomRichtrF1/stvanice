# 🎮 ŠTVANICE - Premium Režim (Fáze 1)

## 📦 BALÍČEK OBSAHUJE

### ✅ Nové soubory (3):
1. **CodeManager.ts** - Správa herních kódů (generování, validace, expirace)
2. **TopicSelection.tsx** - UI komponenta pro výběr tématu hry
3. **server.js** (upravený) - API endpointy + session management

### 📚 Dokumentace (2):
1. **INTEGRATION_GUIDE.md** - Hlavní průvodce instalací
2. **DETAILED_CHANGES.md** - Detailní příklady úprav kódu

---

## 🚀 RYCHLÝ START

### 1️⃣ Zkopíruj soubory do projektu

```bash
# CodeManager.ts → root projektu (vedle server.js)
cp CodeManager.ts /path/to/your/project/

# TopicSelection.tsx → src/ nebo src/components/
cp TopicSelection.tsx /path/to/your/project/src/

# server.js → nahraď původní (ZÁLOHA NEJDŘÍV!)
cp server.js.backup server.js  # záloha
cp server.js /path/to/your/project/
```

### 2️⃣ Uprav routing

V **App.tsx** (nebo hlavním routing souboru) přidej:

```typescript
import TopicSelection from './TopicSelection';

// V render sekci mezi 'waiting' a 'role_selection':
{phase === 'topic_selection' && (
  <TopicSelection 
    roomCode={roomCode} 
    socket={socket}
    onTopicSelected={(topic) => console.log('Téma:', topic)}
  />
)}
```

### 3️⃣ Testuj!

```bash
# Vygeneruj testovací kód
curl "http://localhost:3000/api/generate-test-code?topic=Fotbal"

# Nebo použij admin kód
# Kód: STVANICEADMIN (permanentní)
```

---

## ✨ CO NOVÉHO

### Pro hráče:
- ✅ **HRÁT ZDARMA** - Náhodná témata (jako dosud)
- ✅ **ZVOLIT OKRUH OTÁZEK** - Vlastní téma za 16 Kč/měsíc
- ✅ Herní kódy ve formátu `K7P2-M9Q4-X1`
- ✅ Admin kód: `STVANICEADMIN` (pro testování)
- ✅ Rematch bez opětovného zadávání kódu

### Pro vývojáře:
- ✅ API endpoint `/api/validate-code` (POST)
- ✅ API endpoint `/api/generate-test-code` (GET - debug)
- ✅ Databáze kódů v `codes.json`
- ✅ Session tracking v `game.settings.gameCode`
- ✅ Automatické čištění expirovaných kódů

---

## 📖 DOKUMENTACE

### 🔗 Přečti si nejdřív:
1. **INTEGRATION_GUIDE.md** - Krok za krokem instalace
2. **DETAILED_CHANGES.md** - Konkrétní příklady kódu

### 🧪 Testovací checklist:

| Test | Akce | Očekávaný výsledek |
|------|------|-------------------|
| ✅ Free režim | Klikni "HRÁT ZDARMA" | Pokračuje na role selection |
| ✅ Admin kód | Zadej `STVANICEADMIN` | Zelená "KÓD JE PLATNÝ!" |
| ✅ Generovaný kód | Použij API endpoint | Validuje správně |
| ✅ Expirovaný kód | Změň datum v codes.json | Zobrazí "PLATNOST VYPRŠELA" |
| ✅ Rematch | Hraj znovu | Nemusí zadávat kód znovu |

---

## 🐛 ŘEŠENÍ PROBLÉMŮ

### "Cannot find module 'CodeManager.js'"
```bash
# Přejmenuj .ts na .js
mv CodeManager.ts CodeManager.js
```

### TopicSelection se nezobrazí
- Zkontroluj import v App.tsx
- Zkontroluj že server mění phase na `'topic_selection'`
- Zkontroluj console logy (F12)

### Validace kódu nefunguje
```bash
# Test API endpointu
curl -X POST http://localhost:3000/api/validate-code \
  -H "Content-Type: application/json" \
  -d '{"code":"STVANICEADMIN"}'
```

---

## 🎯 CO DÁLE? (Fáze 2)

Po úspěšném otestování Fáze 1 přidáme:

1. **Stripe Checkout** - Platební brána
2. **Webhook** - Automatické generování kódů po platbě
3. **Email notifikace** - Zaslání kódu na email
4. **Success page** - Potvrzení platby + zobrazení kódu

---

## 📞 KONTAKT

Pokud něco nefunguje:
1. Zkontroluj console logy (F12 v browseru)
2. Zkontroluj server logy (terminál)
3. Přečti si DETAILED_CHANGES.md
4. Ozvi se! 🚀

---

## 🏆 STATUS

- ✅ **Fáze 1: HOTOVO** (Code management + UI)
- ⏳ **Fáze 2: ČEKÁ** (Stripe integrace)

---

**Hodně štěstí s integrací! Až to bude fungovat, můžeme přidat Stripe platby.** 💪
