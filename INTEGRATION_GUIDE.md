# 🎮 ŠTVANICE - Integrace Premium Režimu (Fáze 1)

## 📦 CO BYLO VYTVOŘENO

### Nové soubory:
1. **CodeManager.ts** - Správa herních kódů
2. **TopicSelection.tsx** - UI komponenta pro výběr tématu
3. **server.js** (upravený) - API endpointy a session management

---

## 🔧 INSTALACE - KROK ZA KROKEM

### 1. Zkopíruj soubory do projektu

```bash
# Zkopíruj CodeManager.ts do root projektu (vedle server.js)
cp CodeManager.ts /path/to/your/project/

# Zkopíruj TopicSelection.tsx do src/ nebo src/components/
cp TopicSelection.tsx /path/to/your/project/src/

# NEBO src/components/ (záleží na tvé struktuře)
cp TopicSelection.tsx /path/to/your/project/src/components/
```

### 2. Nahraď původní server.js

```bash
# ZÁLOHA NEJDŘÍV!
cp server.js server.js.backup

# Pak nahraď
cp server.js /path/to/your/project/
```

---

## 🎯 ÚPRAVY OSTATNÍCH SOUBORŮ

### A) **WaitingRoom.tsx** - Přidání přechodu na TopicSelection

Musíš upravit flow, aby po výběru Junior/Dospělý **NEJPRVE** šel hráč na TopicSelection, a teprve pak na role selection.

#### Kde upravit:

V `WaitingRoom.tsx` najdi část, kde se mění `phase` na `'role_selection'` (např. když se připojí druhý hráč).

#### Změň na:

```typescript
if (game.players.length === 2) {
  game.phase = 'topic_selection'; // ZMĚNA: Nejdřív téma
  io.to(code).emit('phase_change', { phase: 'topic_selection' });
}
```

#### Import TopicSelection:

```typescript
import TopicSelection from './TopicSelection'; 
// NEBO './components/TopicSelection' (podle struktury)
```

---

### B) **App.tsx** (nebo hlavní routing komponenta)

Musíš přidat routing pro novou fázi `'topic_selection'`.

#### Příklad:

```typescript
{phase === 'lobby' && <Lobby onCreateGame={...} onJoinGame={...} />}
{phase === 'waiting' && <WaitingRoom roomCode={roomCode} socket={socket} />}

{/* NOVÁ FÁZE */}
{phase === 'topic_selection' && (
  <TopicSelection 
    roomCode={roomCode} 
    socket={socket}
    onTopicSelected={(topic) => {
      console.log('Téma vybráno:', topic);
      // Po výběru tématu pokračujeme na role selection
    }}
  />
)}

{phase === 'role_selection' && <RoleSelection ... />}
```

---

### C) **GameBoard.tsx** - Žádné změny!

GameBoard.tsx nemusíš upravovat. Téma se už předává automaticky přes `game.settings.topic` v serveru.

---

## 🧪 TESTOVÁNÍ

### 1. Vygeneruj testovací kód

Server má endpoint pro debug generování kódů:

```bash
# Vytvoř kód s tématem "Fotbal"
curl "http://localhost:3000/api/generate-test-code?topic=Fotbal"

# Dostaneš:
{
  "success": true,
  "code": "K7P2-M9Q4-X1",
  "topic": "Fotbal",
  "expiresAt": "2025-01-23T13:00:00.000Z"
}
```

### 2. Vyzkoušej flow

1. **Vytvoř hru**
2. **Připoj se jako druhý hráč**
3. **Vyber Junior/Dospělý**
4. **Měla by se zobrazit TopicSelection**
5. **Zkus:**
   - "HRÁT ZDARMA" → mělo by fungovat
   - "UŽ MÁM KÓD" → zadej vygenerovaný kód
   - Admin kód: `STVANICEADMIN` → vždy platný

### 3. Ověř databázi kódů

Po vygenerování kódu se vytvoří soubor `codes.json` v root projektu:

```bash
cat codes.json
```

Měl bys vidět:

```json
{
  "codes": [
    {
      "code": "K7P2-M9Q4-X1",
      "topic": "Fotbal",
      "createdAt": "2024-12-23T13:00:00.000Z",
      "expiresAt": "2025-01-23T13:00:00.000Z",
      "used": false
    }
  ]
}
```

---

## 🐛 ŘEŠENÍ PROBLÉMŮ

### "Cannot find module './CodeManager.js'"

Server.js hledá CodeManager jako `.js` (protože používá ES modules), ale my máme `.ts`.

**Řešení:**

Buď:
1. Přejmenuj `CodeManager.ts` → `CodeManager.js` (funguje to, TypeScript není nutný)
2. NEBO zkompiluj TypeScript do JS (`tsc CodeManager.ts`)

### "fetch is not defined" (v TopicSelection)

Pokud používáš starší Node.js (<18), přidej:

```bash
npm install node-fetch
```

A v TopicSelection.tsx:

```typescript
import fetch from 'node-fetch';
```

### "codes.json" se nevytváří

Zkontroluj oprávnění v adresáři projektu:

```bash
ls -la codes.json
```

Pokud neexistuje, CodeManager ho vytvoří automaticky při prvním volání.

---

## 📝 CO DĚLAT DÁLE (Fáze 2 - Stripe)

Až Fáze 1 funguje, přidáme:

1. **Stripe Checkout** - tlačítko "KOUPIT KÓD" bude volat Stripe
2. **Webhook** - po zaplacení server vygeneruje kód
3. **Email notifikace** - uživatel dostane kód na email

---

## 🎉 HOTOVO PRO FÁZI 1!

Teď máš:
- ✅ Výběr mezi zdarma/premium
- ✅ Validaci herních kódů
- ✅ Admin kód pro testování
- ✅ Session tracking (rematch bez opětovného zadávání kódu)
- ✅ Debug endpoint pro generování kódů

**Ozvi se, až to bude fungovat, a pustíme se do Stripe integrace!** 🚀
