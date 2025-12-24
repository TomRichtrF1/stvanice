import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Stripe from 'stripe';
import fs from 'fs';
import path from 'path';
// ZDE JE IMPORT NAŠEHO NOVÉHO MOZKU:
import { generateQuestion } from './question_generator.js';
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

// === API ENDPOINTY ===

// Endpoint pro validaci herního kódu
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
  const { topic } = req.query;
  
  if (!topic) {
    return res.status(400).json({ error: 'Chybí téma (parametr ?topic=...)' });
  }
  
  const gameCode = createGameCode(topic);
  res.json({ 
    success: true, 
    code: gameCode.code,
    topic: gameCode.topic,
    expiresAt: gameCode.expiresAt
  });
});

// Endpoint pro čištění expirovaných kódů (CRON job)
app.get('/api/cleanup-codes', (req, res) => {
  const removed = cleanupExpiredCodes();
  res.json({ success: true, removed });
});

// === STRIPE ENDPOINTY ===

// ✅✅✅ NOVÁ VERZE: Vytvoření kódu JIŽ PŘI VYTVOŘENÍ PLATBY ✅✅✅
app.post('/api/create-checkout-session', async (req, res) => {
  try {
    // 🎫 VYGENERUJ KÓD JIŽ TEĎKA (před platbou)
    const gameCode = createGameCode('premium');
    
    console.log(`🎫 Vytvořen předběžný kód pro checkout: ${gameCode.code}`);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'czk',
            product_data: {
              name: 'Štvanice - Premium Herní Kód',
              description: 'Měsíční přístup k vlastním tématům otázek',
            },
            unit_amount: 3900, // 39 Kč v haléřích
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
        topic: gameCode.topic
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
    
    console.log(`✅ Platba potvrzena! Kód z metadata: ${gameCode}`);
    console.log(`💡 Kód je platný 30 dní a umožňuje zadávat vlastní témata`);
    
    // Kód je již vytvořen v codes.json (při vytvoření checkout session)
    // Můžeš zde poslat email s kódem (např. přes SendGrid)
    // sendEmail(session.customer_email, gameCode);
  }

  res.json({ received: true });
});

// ✅✅✅ NOVÁ VERZE: Success page - KÓD Z STRIPE METADATA ✅✅✅
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
  
  // ✅ Zachováme nastavení (mode, topic, gameCode), aby se nemuselo znovu klikat
  // Toto zajistí, že při rematchi nemusí hráči zadávat kód znovu!

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
      spectators: [], // 🎬 NOVÉ: Seznam diváků
      phase: 'lobby',
      
      // === NOVÉ NASTAVENÍ ===
      settings: {
        mode: 'adult', // Výchozí: dospělí
        topic: 'general', // Výchozí: náhodná témata
        isPremium: false, // Jestli je použit premium kód
        gameCode: null // Aktivní premium kód (pro session tracking)
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

  // === NOVÝ POSLUCHAČ PRO ZMĚNU MÓDU (DÍTĚ/DOSPĚLÝ) ===
  socket.on('update_settings', ({ code, mode }) => {
    const game = games.get(code);
    if (game) {
      game.settings.mode = mode; // Uložíme 'kid' nebo 'adult'
      // Řekneme všem v lobby, že se změnilo nastavení (aby se jim vizuálně změnilo tlačítko/ikona)
      io.to(code).emit('settings_changed', game.settings);
      console.log(`Game ${code} mode switched to: ${mode}`);
    }
  });

  // === NOVÝ POSLUCHAČ PRO VÝBĚR TÉMATU ===
  socket.on('select_topic', ({ code, topic, isPremium, gameCode }) => {
    const game = games.get(code);
    if (!game) return;

    game.settings.topic = topic;
    game.settings.isPremium = isPremium || false;
    game.settings.gameCode = gameCode || null;

    // Pokud je to premium s kódem, logujeme pro tracking
    if (isPremium && gameCode) {
      console.log(`✨ Premium session started: ${code} | Code: ${gameCode} | Topic: "${topic}"`);
    } else {
      console.log(`🎲 Free session started: ${code} | Topic: general`);
    }

    // Oznámíme všem hráčům změnu nastavení
    io.to(code).emit('settings_changed', game.settings);
    
    // Přejdeme na další fázi (role selection)
    game.phase = 'role_selection';
    io.to(code).emit('phase_change', { phase: 'role_selection' });
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
    
    // Po připojení nového hráče mu pošleme aktuální nastavení (aby viděl správný mód)
    socket.emit('settings_changed', game.settings);

    if (game.players.length === 2) {
      game.phase = 'topic_selection'; // ✅ ZMĚNA: Nejdřív výběr tématu
      io.to(code).emit('phase_change', { phase: 'topic_selection' });
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

      // 2. Až PO 3,5 SEKUNDÁCH pošleme výsledky (barvičky)
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
      }, 3000); // 3 sekundy čekáme (délka znělky)
    }
  });

  // TADY JE VELKÁ ZMĚNA - POUŽITÍ AI GENERÁTORU
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
      
      // === VOLÁNÍ AI MOZKU S AKTUÁLNÍM NASTAVENÍM ===
      // Zde posíláme téma i mód (kid/adult) do generátoru
      try {
        const newQuestion = await generateQuestion(game.settings.topic, game.settings.mode);
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
    console.log(`🎬 Spectator request for game: ${gameCode}`);
    
    // 1. Ověř premium kód
    const isAdmin = premiumCode === 'STVANECADMIN';
    const premiumResult = !isAdmin ? validateCode(premiumCode) : { valid: true };
    
    if (!isAdmin && !premiumResult.valid) {
      socket.emit('spectator_error', { message: 'Neplatný premium kód' });
      return;
    }
    
    // 2. Ověř že hra existuje
    const game = games.get(gameCode);
    if (!game) {
      socket.emit('spectator_error', { message: 'Hra neexistuje' });
      return;
    }
    
    // 3. Připoj do room jako spectator
    socket.join(gameCode);
    socket.isSpectator = true;
    socket.spectatorGame = gameCode;
    
    // Přidej do seznamu diváků
    if (!game.spectators) game.spectators = [];
    game.spectators.push(socket.id);
    
    console.log(`🎬 Spectator joined game ${gameCode}. Total spectators: ${game.spectators.length}`);
    
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

    // Hráč odchází - ukončí hru
    games.forEach((game, code) => {
      const playerIndex = game.players.findIndex(p => p.id === socket.id);
      if (playerIndex !== -1) {
        io.to(code).emit('player_disconnected');
        games.delete(code);
      }
    });
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔════════════════════════════════════════╗
║   ŠTVANICE Server Running              ║
║   Mode: AI ENABLED 🧠                  ║
║   Payment: METADATA STORAGE 🎫         ║
╚════════════════════════════════════════╝
  `);
  console.log(`Visit: http://localhost:${PORT}`);
});
