import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Stripe from 'stripe';
import fs from 'fs';
import path from 'path';
// ZDE JE IMPORT NAŠEHO NOVÉHO MOZKU:
import { generateQuestion, getCategories, clearQuestionCache, getJuniorDifficultyOptions, ADULT_CATEGORIES, JUNIOR_CATEGORIES, JUNIOR_DIFFICULTY_CONFIG } from './question_generator.js';
// IMPORT CODE MANAGERU:
import { validateCode, createGameCode, cleanupExpiredCodes } from './CodeManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// === STRIPE INICIALIZACE ===
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const app = express();

// Middleware pro parsování JSON (KROMĚ webhooků!)
app.use('/webhook', express.raw({ type: 'application/json' })); // Webhook potřebuje raw body
app.use(express.json());
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  transports: ['websocket', 'polling']
});

const PORT = process.env.PORT || 3000;

const games = new Map();

// 🕐 Grace period pro odpojené hráče (15 sekund)
const DISCONNECT_GRACE_PERIOD = 15000;
const disconnectedPlayers = new Map(); // socketId -> { gameCode, timeout, timestamp }

// === API ENDPOINTY ===

// Endpoint pro validaci herního kódu (pro diváckou místnost)
app.post('/api/validate-code', (req, res) => {
  const { code } = req.body;
  
  if (!code) {
    return res.status(400).json({ valid: false, message: 'Chybí kód' });
  }
  
  const result = validateCode(code);
  res.json(result);
});

// Endpoint pro testovací generování kódu (DEBUG - ODSTRANIT V PRODUKCI)
app.get('/api/generate-test-code', (req, res) => {
  const gameCode = createGameCode('spectator_access');
  res.json({ 
    success: true, 
    code: gameCode.code,
    type: 'spectator_access',
    expiresAt: gameCode.expiresAt
  });
});

// Endpoint pro čištění expirovaných kódů (CRON job)
app.get('/api/cleanup-codes', (req, res) => {
  const removed = cleanupExpiredCodes();
  res.json({ success: true, removed });
});

// 🔍 DEBUG: Endpoint pro kontrolu aktivních her
app.get('/api/debug/games', (req, res) => {
  const gamesList = Array.from(games.entries()).map(([code, game]) => ({
    code,
    phase: game.phase,
    playersCount: game.players.length,
    spectatorsCount: game.spectators?.length || 0,
    mode: game.settings?.mode
  }));
  
  res.json({
    totalGames: games.size,
    games: gamesList,
    serverTime: new Date().toISOString()
  });
});

// 📚 API: Získání kategorií podle módu
app.get('/api/categories/:mode', (req, res) => {
  const { mode } = req.params;
  const { difficulty } = req.query; // Pro junior: easy, medium, hard
  
  let categories;
  if (mode === 'kid' && difficulty && JUNIOR_DIFFICULTY_CONFIG[difficulty]) {
    categories = JUNIOR_DIFFICULTY_CONFIG[difficulty].categories;
  } else {
    categories = mode === 'kid' ? JUNIOR_CATEGORIES : ADULT_CATEGORIES;
  }
  
  const categoryList = Object.entries(categories).map(([key, cat]) => ({
    key,
    name: cat.name,
    aspectCount: cat.aspects.length
  }));
  
  res.json({ mode, difficulty, categories: categoryList });
});

// 🎓 API: Získání možností obtížnosti pro Junior režim
app.get('/api/junior-difficulties', (req, res) => {
  const difficulties = Object.entries(JUNIOR_DIFFICULTY_CONFIG).map(([key, config]) => ({
    key,
    name: config.name,
    age: config.age,
    description: config.description
  }));
  
  res.json({ difficulties });
});

// === STRIPE ENDPOINTY ===

// ✅ VSTUPENKA DO DIVÁCKÉ MÍSTNOSTI - 139 Kč/měsíc
app.post('/api/create-checkout-session', async (req, res) => {
  try {
    // 🎫 VYGENERUJ KÓD PRO DIVÁCKOU MÍSTNOST
    const gameCode = createGameCode('spectator_access');
    
    console.log(`🎫 Vytvořen kód pro diváckou místnost: ${gameCode.code}`);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'czk',
            product_data: {
              name: 'Štvanice - Vstupenka do divácké místnosti',
              description: 'Měsíční přístup do divácké místnosti pro sledování her',
            },
            unit_amount: 13900, // 139 Kč v haléřích
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${req.headers.origin || 'https://stvanice-823170647fe5.herokuapp.com'}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin || 'https://stvanice-823170647fe5.herokuapp.com'}/`,
      
      // ✅ KÓD ULOŽÍME DO METADATA!
      metadata: {
        game_code: gameCode.code,
        expires_at: gameCode.expiresAt,
        type: 'spectator_access'
      }
    });

    console.log(`✅ Stripe session vytvořena s kódem v metadata: ${session.id}`);

    res.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('❌ Stripe checkout error:', error);
    res.status(500).json({ error: 'Nepodařilo se vytvořit platbu' });
  }
});

// Stripe Webhook - přijímá notifikace o platbách
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('❌ Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const gameCode = session.metadata.game_code;
    
    console.log(`✅ Platba potvrzena! Kód pro diváckou místnost: ${gameCode}`);
    console.log(`💡 Kód je platný 30 dní a umožňuje přístup do divácké místnosti`);
  }

  res.json({ received: true });
});

// ✅ Success page - KÓD Z STRIPE METADATA
app.get('/api/get-session-code', async (req, res) => {
  try {
    const { session_id } = req.query;
    
    if (!session_id) {
      console.error('❌ /api/get-session-code - Chybí session_id');
      return res.status(400).json({ error: 'Chybí session_id' });
    }

    console.log(`🔍 /api/get-session-code - Načítám session: ${session_id}`);

    // Získej session ze Stripe
    const session = await stripe.checkout.sessions.retrieve(session_id);
    
    console.log(`💳 Payment status: ${session.payment_status}`);
    console.log(`📦 Metadata:`, session.metadata);
    
    if (session.payment_status !== 'paid') {
      console.error('❌ Platba nebyla dokončena');
      return res.status(400).json({ error: 'Platba nebyla dokončena' });
    }

    // ✅ KÓD JE V METADATA!
    const gameCode = session.metadata?.game_code;
    const expiresAt = session.metadata?.expires_at;

    if (!gameCode) {
      console.error('❌ Kód nenalezen v session metadata');
      console.error('Session metadata obsah:', session.metadata);
      return res.status(404).json({ error: 'Kód nebyl nalezen v platební session' });
    }

    console.log(`✅ Kód úspěšně načten z metadata: ${gameCode}`);

    res.json({ 
      code: gameCode,
      expiresAt: expiresAt
    });
  } catch (error) {
    console.error('❌ Error v /api/get-session-code:', error);
    console.error('Stack:', error.stack);
    res.status(500).json({ 
      error: 'Nepodařilo se načíst kód: ' + error.message 
    });
  }
});

function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Funkce pro reset hry
function resetGame(roomCode) {
  const game = games.get(roomCode);
  if (!game) return;

  game.phase = 'role_selection';
  game.headstart = null;
  game.currentQuestion = null;
  game.rematchRequested = {};

  game.players.forEach(player => {
    player.role = null;
    player.position = 0;
    player.answer = null;
    player.ready = false;
  });

  io.to(roomCode).emit('phase_change', { phase: 'role_selection' });
  io.to(roomCode).emit('roles_updated', {
      players: game.players.map(p => ({ id: p.id, role: p.role }))
  });
}

app.use(express.static(join(__dirname, 'dist')));

app.use((req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('create_game', () => {
    const roomCode = generateRoomCode();
    const gameState = {
      code: roomCode,
      players: [{ id: socket.id, role: null, position: 0, answer: null, ready: false }],
      spectators: [], // 🎬 Seznam diváků
      phase: 'lobby',
      
      // === NASTAVENÍ HRY ===
      settings: {
        mode: 'adult',           // Výchozí: dospělí
        topic: 'general',        // Zachováno pro kompatibilitu
        category: null,          // null = mix všech, nebo 'motorsport', 'film', ...
        juniorDifficulty: 'hard' // 'easy' | 'medium' | 'hard' (pouze pro mode='kid')
      },
      
      headstart: null,
      currentQuestion: null,
      rematchRequested: {}
    };

    games.set(roomCode, gameState);
    socket.join(roomCode);
    socket.emit('game_created', { code: roomCode });
    console.log(`Game created: ${roomCode}`);
  });

  // === ZMĚNA MÓDU (JUNIOR/DOSPĚLÝ) - POVOLENO I V ROLE_SELECTION ===
  socket.on('update_settings', ({ code, mode }) => {
    const game = games.get(code);
    if (!game) return;
    
    // ✅ Povolit změnu pouze ve fázích waiting a role_selection
    if (game.phase !== 'lobby' && game.phase !== 'waiting' && game.phase !== 'role_selection') {
      console.log(`⚠️ Settings change rejected - game in phase: ${game.phase}`);
      return;
    }
    
    // 🗑️ Pokud se mění mód, vyčistit cache otázek (nový batch pro nový mód)
    if (game.settings.mode !== mode) {
      clearQuestionCache();
      console.log(`🗑️ Cache cleared due to mode change: ${game.settings.mode} → ${mode}`);
    }
    
    game.settings.mode = mode; // Uložíme 'kid' nebo 'adult'
    // Při změně módu resetuj kategorii (jiné kategorie pro adult/junior)
    game.settings.category = null;
    // Řekneme všem v lobby, že se změnilo nastavení
    io.to(code).emit('settings_changed', game.settings);
    console.log(`Game ${code} mode switched to: ${mode}, category reset to null`);
  });

  // === 📚 ZMĚNA KATEGORIE OTÁZEK ===
  socket.on('update_category', ({ code, category }) => {
    const game = games.get(code);
    if (!game) return;
    
    // Povolit změnu pouze ve fázích lobby, waiting a role_selection
    if (game.phase !== 'lobby' && game.phase !== 'waiting' && game.phase !== 'role_selection') {
      console.log(`⚠️ Category change rejected - game in phase: ${game.phase}`);
      return;
    }
    
    // Ověř že kategorie existuje pro daný mód
    const categories = game.settings.mode === 'kid' ? JUNIOR_CATEGORIES : ADULT_CATEGORIES;
    if (category !== null && !categories[category]) {
      console.log(`⚠️ Invalid category: ${category} for mode: ${game.settings.mode}`);
      return;
    }
    
    // 🗑️ Pokud se mění kategorie, vyčistit cache otázek (nový batch pro novou kategorii)
    if (game.settings.category !== category) {
      clearQuestionCache();
      const oldName = game.settings.category ? categories[game.settings.category]?.name : 'Mix';
      const newName = category ? categories[category].name : 'Mix';
      console.log(`🗑️ Cache cleared due to category change: ${oldName} → ${newName}`);
    }
    
    game.settings.category = category;
    io.to(code).emit('settings_changed', game.settings);
    
    const categoryName = category ? categories[category].name : 'Mix všech';
    console.log(`📚 Game ${code} category: ${categoryName}`);
  });

  // === 🎓 ZMĚNA OBTÍŽNOSTI JUNIOR REŽIMU ===
  socket.on('update_junior_difficulty', ({ code, difficulty }) => {
    const game = games.get(code);
    if (!game) return;
    
    // Povolit změnu pouze ve fázích lobby, waiting a role_selection
    if (game.phase !== 'lobby' && game.phase !== 'waiting' && game.phase !== 'role_selection') {
      console.log(`⚠️ Junior difficulty change rejected - game in phase: ${game.phase}`);
      return;
    }
    
    // Ověř že difficulty je validní
    const validDifficulties = ['easy', 'medium', 'hard'];
    if (!validDifficulties.includes(difficulty)) {
      console.log(`⚠️ Invalid junior difficulty: ${difficulty}`);
      return;
    }
    
    // 🗑️ Pokud se mění obtížnost, vyčistit cache otázek
    if (game.settings.juniorDifficulty !== difficulty) {
      clearQuestionCache();
      console.log(`🗑️ Cache cleared due to junior difficulty change: ${game.settings.juniorDifficulty} → ${difficulty}`);
    }
    
    game.settings.juniorDifficulty = difficulty;
    // Při změně obtížnosti také resetovat kategorii (jiné kategorie pro různé obtížnosti)
    game.settings.category = null;
    io.to(code).emit('settings_changed', game.settings);
    
    const difficultyConfig = JUNIOR_DIFFICULTY_CONFIG[difficulty];
    console.log(`🎓 Game ${code} junior difficulty: ${difficultyConfig?.name || difficulty}`);
  });

  socket.on('join_game', (code) => {
    const game = games.get(code);

    if (!game) {
      socket.emit('error', { message: 'Hra nebyla nalezena' });
      return;
    }

    if (game.players.length >= 2) {
      socket.emit('error', { message: 'Hra je plná' });
      return;
    }

    game.players.push({ id: socket.id, role: null, position: 0, answer: null, ready: false });
    socket.join(code);
    
    // Po připojení nového hráče mu pošleme aktuální nastavení
    socket.emit('settings_changed', game.settings);

    // ✅ ZMĚNA: Po připojení druhého hráče ROVNOU na role_selection (bez topic_selection)
    if (game.players.length === 2) {
      game.phase = 'role_selection';
      io.to(code).emit('phase_change', { phase: 'role_selection' });
    }

    socket.emit('game_joined', { code });
    console.log(`Player joined game: ${code}`);
  });

  socket.on('select_role', ({ code, role }) => {
    const game = games.get(code);
    if (!game || game.phase !== 'role_selection') return;

    const player = game.players.find(p => p.id === socket.id);
    if (!player || player.role) return;

    const roleAlreadyTaken = game.players.some(p => p.role === role);
    if (roleAlreadyTaken) {
      socket.emit('error', { message: 'Tato role je již obsazena' });
      return;
    }

    player.role = role;

    const otherPlayer = game.players.find(p => p.id !== socket.id && !p.role);
    if (otherPlayer) {
      otherPlayer.role = role === 'hunter' ? 'prey' : 'hunter';
    }

    io.to(code).emit('roles_updated', {
      players: game.players.map(p => ({ id: p.id, role: p.role }))
    });

    if (game.players.every(p => p.role)) {
      game.phase = 'headstart_selection';
      setTimeout(() => {
        io.to(code).emit('phase_change', { phase: 'headstart_selection' });
      }, 1000);
    }
  });

  socket.on('select_headstart', ({ code, headstart }) => {
    const game = games.get(code);
    if (!game || game.phase !== 'headstart_selection') return;

    const player = game.players.find(p => p.id === socket.id);
    if (!player || player.role !== 'prey') return;

    game.headstart = headstart;

    const preyPlayer = game.players.find(p => p.role === 'prey');
    preyPlayer.position = headstart;

    game.phase = 'waiting_for_ready';
    game.currentQuestion = null; 
    
    game.players.forEach(p => p.ready = false);

    io.to(code).emit('game_start', {
      headstart,
      positions: game.players.map(p => ({ id: p.id, role: p.role, position: p.position })),
      question: null 
    });
  });

  socket.on('submit_answer', ({ code, answerIndex }) => {
    const game = games.get(code);
    if (!game || game.phase !== 'playing') return;

    const player = game.players.find(p => p.id === socket.id);
    if (!player || player.answer !== null) return;

    player.answer = answerIndex;

    io.to(code).emit('player_answered', { playerId: socket.id });
    
    // 🎬 SPECTATOR: Pošli detailní info o odpovědi (role + odpověď)
    io.to(code).emit('spectator_player_answered', { 
      role: player.role, 
      answerIndex: answerIndex 
    });

    if (game.players.every(p => p.answer !== null)) {
      // 1. HNED pošleme signál: "Všichni odpověděli, pusť napětí!"
      io.to(code).emit('start_resolution');

      const results = game.players.map(p => {
        const isCorrect = p.answer === game.currentQuestion.correct && p.answer !== 999;
        if (isCorrect) {
          p.position += 1;
        }
        return {
          id: p.id,
          role: p.role,
          answer: p.answer,
          correct: isCorrect,
          position: p.position
        };
      });

      // 2. Až PO 3 SEKUNDÁCH pošleme výsledky
      setTimeout(() => {
        io.to(code).emit('round_results', {
          results,
          correctAnswer: game.currentQuestion.correct
        });

        const hunter = game.players.find(p => p.role === 'hunter');
        const prey = game.players.find(p => p.role === 'prey');

        let winner = null;
        if (hunter.position >= prey.position) {
          winner = 'hunter';
        } else if (prey.position >= 8) {
          winner = 'prey';
        }

        if (winner) {
          game.phase = 'finished';
          game.rematchRequested = {};
          setTimeout(() => {
            io.to(code).emit('game_over', { winner });
          }, 2000); 
        } else {
          game.players.forEach(p => {
            p.answer = null;
            p.ready = false;
          });
          game.phase = 'waiting_for_ready';
          io.to(code).emit('waiting_for_ready');
        }
      }, 3000);
    }
  });

  // POUŽITÍ AI GENERÁTORU - VŽDY 'general' TÉMA
  socket.on('playerReady', async ({ code }) => {
    const game = games.get(code);
    if (!game || game.phase !== 'waiting_for_ready') return;

    const player = game.players.find(p => p.id === socket.id);
    if (!player) return;

    player.ready = true;

    io.to(code).emit('ready_status', {
      readyCount: game.players.filter(p => p.ready).length,
      totalPlayers: game.players.length
    });

    if (game.players.every(p => p.ready)) {
      game.phase = 'playing';
      
      // === VOLÁNÍ AI MOZKU - S PODPOROU KATEGORIE A JUNIOR OBTÍŽNOSTI ===
      try {
        const newQuestion = await generateQuestion(
          game.settings.mode, 
          game.settings.category,
          game.settings.juniorDifficulty
        );
        game.currentQuestion = newQuestion;
        
        game.players.forEach(p => p.ready = false);

        io.to(code).emit('next_question', {
          question: game.currentQuestion,
          positions: game.players.map(p => ({ id: p.id, role: p.role, position: p.position }))
        });
      } catch (error) {
        console.error("Critical error generating question:", error);
        // Fallback pro jistotu, aby hra nespadla
        game.currentQuestion = { 
           question: "Chyba generování otázky. Omlouváme se.", 
           options: ["A", "B", "C"], 
           correct: 0 
        };
        io.to(code).emit('next_question', {
            question: game.currentQuestion,
            positions: game.players.map(p => ({ id: p.id, role: p.role, position: p.position }))
        });
      }
    }
  });

  socket.on('play_again', ({ code }) => {
    resetGame(code);
  });

  // === 🎬 SPECTATOR MODE ===
  socket.on('join_as_spectator', ({ gameCode, premiumCode }) => {
    console.log(`\n🎬 ========== SPECTATOR REQUEST ==========`);
    console.log(`   Game code: ${gameCode}`);
    console.log(`   Premium code: ${premiumCode}`);
    console.log(`   Socket ID: ${socket.id}`);
    console.log(`   Active games: [${Array.from(games.keys()).join(', ') || 'none'}]`);
    
    // 1. Ověř premium kód
    const isAdmin = premiumCode === 'STVANICEADMIN';
    console.log(`   Is admin: ${isAdmin}`);
    
    const premiumResult = !isAdmin ? validateCode(premiumCode) : { valid: true };
    console.log(`   Premium valid: ${premiumResult.valid}`);
    
    if (!isAdmin && !premiumResult.valid) {
      console.log(`❌ Invalid premium code`);
      socket.emit('spectator_error', { message: 'Neplatný kód pro diváckou místnost' });
      return;
    }
    
    // 2. Ověř že hra existuje
    const game = games.get(gameCode);
    if (!game) {
      console.log(`❌ Game NOT FOUND: ${gameCode}`);
      console.log(`   Available games: ${Array.from(games.keys()).join(', ') || 'NONE'}`);
      socket.emit('spectator_error', { message: 'Hra s tímto kódem neexistuje nebo již skončila' });
      return;
    }
    
    console.log(`✅ Game FOUND! Phase: ${game.phase}, Players: ${game.players.length}`);
    
    // 3. Připoj do room jako spectator
    socket.join(gameCode);
    socket.isSpectator = true;
    socket.spectatorGame = gameCode;
    
    // Přidej do seznamu diváků
    if (!game.spectators) game.spectators = [];
    game.spectators.push(socket.id);
    
    console.log(`✅ Spectator joined! Total spectators: ${game.spectators.length}`);
    console.log(`🎬 ==========================================\n`);
    
    // 4. Pošli aktuální stav hry
    socket.emit('spectator_joined', {
      phase: game.phase,
      players: game.players.map(p => ({ 
        id: p.id, 
        role: p.role, 
        position: p.position,
        answer: p.answer,
        ready: p.ready
      })),
      currentQuestion: game.currentQuestion,
      settings: game.settings,
      headstart: game.headstart
    });
  });

  // Spectator žádá o aktuální stav (refresh)
  socket.on('spectator_refresh', ({ gameCode }) => {
    const game = games.get(gameCode);
    if (!game || !socket.isSpectator) return;
    
    socket.emit('spectator_state', {
      phase: game.phase,
      players: game.players.map(p => ({ 
        id: p.id, 
        role: p.role, 
        position: p.position,
        answer: p.answer,
        ready: p.ready
      })),
      currentQuestion: game.currentQuestion,
      settings: game.settings,
      headstart: game.headstart
    });
  });

  // 🔄 Pokus o reconnect - zrušení grace period
  socket.on('player_reconnect', ({ code }) => {
    const game = games.get(code);
    if (!game) return;
    
    // Zkontroluj, jestli je hráč v disconnected stavu
    const disconnectInfo = disconnectedPlayers.get(socket.id);
    if (disconnectInfo && disconnectInfo.gameCode === code) {
      clearTimeout(disconnectInfo.timeout);
      disconnectedPlayers.delete(socket.id);
      console.log(`🔄 Hráč ${socket.id} se reconnectoval do hry ${code} (grace period zrušen)`);
      
      // Přidej hráče zpět do místnosti
      socket.join(code);
    }
  });

  // 📱 Hráč přepnul do jiného okna (pause)
  socket.on('player_paused', ({ code }) => {
    console.log(`📱 Hráč ${socket.id} přepnul do jiného okna (hra ${code})`);
    // Jen logujeme, neděláme nic - socket zůstává připojený
  });

  // 📱 Hráč se vrátil do okna
  socket.on('player_resumed', ({ code }) => {
    console.log(`📱 Hráč ${socket.id} se vrátil do hry ${code}`);
    // Můžeme případně refreshnout stav
    const game = games.get(code);
    if (game) {
      socket.emit('game_state_sync', {
        phase: game.phase,
        players: game.players,
        currentQuestion: game.currentQuestion,
        headstart: game.headstart
      });
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);

    // 🎬 Odstraň spectatora pokud odchází
    if (socket.isSpectator && socket.spectatorGame) {
      const game = games.get(socket.spectatorGame);
      if (game && game.spectators) {
        game.spectators = game.spectators.filter(id => id !== socket.id);
        console.log(`🎬 Spectator left game ${socket.spectatorGame}. Remaining: ${game.spectators.length}`);
      }
      return; // Spectator neukončuje hru
    }

    // 🕐 Hráč odchází - GRACE PERIOD
    games.forEach((game, code) => {
      const playerIndex = game.players.findIndex(p => p.id === socket.id);
      if (playerIndex !== -1) {
        console.log(`🕐 Hráč ${socket.id} se odpojil z hry ${code}. Grace period: ${DISCONNECT_GRACE_PERIOD/1000}s`);
        
        // Nastav grace period timeout
        const timeout = setTimeout(() => {
          // Po uplynutí grace period - ukončit hru
          const currentGame = games.get(code);
          if (currentGame) {
            console.log(`💀 Grace period vypršel pro hráče ${socket.id}. Ukončuji hru ${code}`);
            io.to(code).emit('player_disconnected');
            games.delete(code);
          }
          disconnectedPlayers.delete(socket.id);
        }, DISCONNECT_GRACE_PERIOD);
        
        disconnectedPlayers.set(socket.id, {
          gameCode: code,
          timeout: timeout,
          timestamp: Date.now()
        });
        
        // Informovat druhého hráče že soupeř se možná odpojil
        io.to(code).emit('player_connection_unstable', {
          playerId: socket.id,
          gracePeriod: DISCONNECT_GRACE_PERIOD
        });
      }
    });
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔════════════════════════════════════════╗
║   ŠTVANICE Server Running              ║
║   Mode: AI ENABLED 🧠                  ║
║   Spectator: 139 Kč/month 🎬           ║
╚════════════════════════════════════════╝
  `);
  console.log(`Visit: http://localhost:${PORT}`);
});
