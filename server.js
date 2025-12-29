/**
 * 🎮 ŠTVANICE SERVER
 * * VERZE: 3.2 - OPRAVA WHITE SCREEN (RACE CONDITION)
 */

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Stripe from 'stripe';

// Import question generatoru
import { 
  generateQuestion, 
  clearQuestionCache, 
  getAgeGroups,
  AGE_GROUP_CONFIG,
  endGameSession,
  resetGameSession,
  getSessionsStats,
  connectDatabase,
  preWarmCache,
  getPreWarmStatus
} from './question_generator.js';

// Import databáze
import * as questionDatabase from './question_database.js';

// Import code manageru
import { validateCode, createGameCode, cleanupExpiredCodes } from './CodeManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Připojení databáze k generátoru
connectDatabase(questionDatabase);

// === STRIPE INICIALIZACE ===
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const app = express();

// Middleware
app.use('/webhook', express.raw({ type: 'application/json' }));
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

// Grace period pro odpojené hráče (45 sekund)
const DISCONNECT_GRACE_PERIOD = 45000;
const disconnectedPlayers = new Map();

// Countdown konfigurace
const COUNTDOWN_DURATION = 35; 
const AI_TARGET_QUESTIONS = 8; 
const AI_MIN_READY = 4; 

// Aktivní countdown intervaly
const countdownIntervals = new Map();

// === API ENDPOINTY ===

app.post('/api/validate-code', (req, res) => {
  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ valid: false, message: 'Chybí kód' });
  }
  const result = validateCode(code);
  res.json(result);
});

app.get('/api/generate-test-code', (req, res) => {
  const gameCode = createGameCode('spectator_access');
  res.json({ 
    success: true, 
    code: gameCode.code,
    type: 'spectator_access',
    expiresAt: gameCode.expiresAt
  });
});

app.get('/api/cleanup-codes', (req, res) => {
  const removed = cleanupExpiredCodes();
  res.json({ success: true, removed });
});

app.get('/api/debug/games', (req, res) => {
  const gamesList = Array.from(games.entries()).map(([code, game]) => ({
    code,
    phase: game.phase,
    playersCount: game.players.length,
    spectatorsCount: game.spectators?.length || 0,
    ageGroup: game.settings?.ageGroup,
    countdown: game.countdown,
    aiProgress: game.aiProgress
  }));
  
  res.json({
    totalGames: games.size,
    games: gamesList,
    sessions: getSessionsStats(),
    serverTime: new Date().toISOString()
  });
});

app.get('/api/age-groups', (req, res) => {
  res.json({ ageGroups: getAgeGroups() });
});

// === STRIPE ENDPOINTY ===

app.post('/api/create-checkout-session', async (req, res) => {
  try {
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
            unit_amount: 13900,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${req.headers.origin || 'https://stvanice-823170647fe5.herokuapp.com'}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin || 'https://stvanice-823170647fe5.herokuapp.com'}/`,
      metadata: {
        game_code: gameCode.code,
        expires_at: gameCode.expiresAt,
        type: 'spectator_access'
      }
    });

    res.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('❌ Stripe checkout error:', error);
    res.status(500).json({ error: 'Nepodařilo se vytvořit platbu' });
  }
});

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

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const gameCode = session.metadata.game_code;
    console.log(`✅ Platba potvrzena! Kód: ${gameCode}`);
  }

  res.json({ received: true });
});

app.get('/api/get-session-code', async (req, res) => {
  try {
    const { session_id } = req.query;
    if (!session_id) {
      return res.status(400).json({ error: 'Chybí session_id' });
    }

    const session = await stripe.checkout.sessions.retrieve(session_id);
    if (session.payment_status !== 'paid') {
      return res.status(400).json({ error: 'Platba nebyla dokončena' });
    }

    const gameCode = session.metadata?.game_code;
    const expiresAt = session.metadata?.expires_at;
    if (!gameCode) {
      return res.status(404).json({ error: 'Kód nebyl nalezen' });
    }

    res.json({ code: gameCode, expiresAt });
  } catch (error) {
    console.error('❌ Error v /api/get-session-code:', error);
    res.status(500).json({ error: 'Nepodařilo se načíst kód' });
  }
});

// === POMOCNÉ FUNKCE ===

function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function startCountdown(roomCode) {
  const game = games.get(roomCode);
  if (!game) return;

  if (countdownIntervals.has(roomCode)) {
    return;
  }

  game.countdown = COUNTDOWN_DURATION;
  game.phase = 'countdown';
  
  io.to(roomCode).emit('phase_change', { phase: 'countdown' });
  io.to(roomCode).emit('countdown_started', { 
    countdown: COUNTDOWN_DURATION,
    ageGroup: game.settings.ageGroup 
  });

  const interval = setInterval(() => {
    const currentGame = games.get(roomCode);
    if (!currentGame) {
      clearInterval(interval);
      countdownIntervals.delete(roomCode);
      return;
    }

    currentGame.countdown--;

    const aiStatus = getPreWarmStatus(roomCode);
    currentGame.aiProgress = {
      generated: aiStatus?.generated || 0,
      target: AI_TARGET_QUESTIONS,
      ready: (aiStatus?.generated || 0) >= AI_MIN_READY
    };

    io.to(roomCode).emit('countdown_tick', {
      remaining: currentGame.countdown,
      aiProgress: currentGame.aiProgress,
      playersCount: currentGame.players.length
    });

    if (currentGame.countdown <= 0) {
      clearInterval(interval);
      countdownIntervals.delete(roomCode);
      
      currentGame.phase = 'headstart_selection';
      
      io.to(roomCode).emit('countdown_complete', {
        aiReady: currentGame.aiProgress.ready,
        questionCount: currentGame.aiProgress.generated
      });
      
      io.to(roomCode).emit('phase_change', { phase: 'headstart_selection' });
    }
  }, 1000);

  countdownIntervals.set(roomCode, interval);
}

function stopCountdown(roomCode) {
  if (countdownIntervals.has(roomCode)) {
    clearInterval(countdownIntervals.get(roomCode));
    countdownIntervals.delete(roomCode);
  }
}

function resetGame(roomCode) {
  const game = games.get(roomCode);
  if (!game) return;

  game.phase = 'role_selection';
  game.headstart = null;
  game.currentQuestion = null;
  game.rematchRequested = {};
  game.countdown = 0;
  game.isRematch = true;

  game.players.forEach(player => {
    player.role = null;
    player.position = 0;
    player.answer = null;
    player.ready = false;
  });

  resetGameSession(roomCode);

  preWarmCache(roomCode, game.settings.ageGroup).catch(err => {
    console.error(`❌ Rematch pre-warm failed: ${err.message}`);
  });

  io.to(roomCode).emit('phase_change', { phase: 'role_selection' });
  io.to(roomCode).emit('roles_updated', {
    players: game.players.map(p => ({ id: p.id, role: p.role }))
  });
  io.to(roomCode).emit('rematch_started', { isRematch: true });
}

// === STATICKÉ SOUBORY ===

app.use(express.static(join(__dirname, 'dist')));

app.use((req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

// === SOCKET.IO ===

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('create_game_with_category', ({ ageGroup }) => {
    if (!AGE_GROUP_CONFIG[ageGroup]) {
      socket.emit('error', { message: 'Neplatná věková skupina' });
      return;
    }

    const roomCode = generateRoomCode();
    
    const gameState = {
      code: roomCode,
      players: [{ id: socket.id, role: null, position: 0, answer: null, ready: false }],
      spectators: [],
      phase: 'waiting_for_player',
      settings: {
        ageGroup: ageGroup
      },
      countdown: 0,
      aiProgress: { generated: 0, target: AI_TARGET_QUESTIONS, ready: false },
      headstart: null,
      currentQuestion: null,
      rematchRequested: {},
      isRematch: false
    };

    games.set(roomCode, gameState);
    socket.join(roomCode);
    
    socket.emit('game_created', { 
      code: roomCode,
      ageGroup: ageGroup,
      phase: 'waiting_for_player'
    });
    
    preWarmCache(roomCode, ageGroup).catch(err => {
      console.error(`❌ Pre-warm failed for ${roomCode}:`, err.message);
    });
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
    
    if (game.players.length >= 2 && game.phase === 'waiting_for_player') {
      game.phase = 'role_selection';
      io.to(code).emit('phase_change', { phase: 'role_selection' });
      io.to(code).emit('player_joined', { playersCount: game.players.length });
    }
    
    socket.emit('game_joined', { 
      code,
      ageGroup: game.settings.ageGroup,
      phase: game.phase
    });
    
    socket.emit('settings_changed', game.settings);
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
      if (game.isRematch) {
        game.phase = 'headstart_selection';
        setTimeout(() => {
          io.to(code).emit('phase_change', { phase: 'headstart_selection' });
        }, 500);
      } else {
        setTimeout(() => {
          startCountdown(code);
        }, 500);
      }
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
    
    io.to(code).emit('spectator_player_answered', { 
      role: player.role, 
      answerIndex: answerIndex 
    });

    if (game.players.every(p => p.answer !== null)) {
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
      
      try {
        const newQuestion = await generateQuestion(
          code,
          game.settings.ageGroup
        );
        
        game.currentQuestion = { 
          ...newQuestion, 
          _fromLLM: newQuestion._fromLLM ?? false,
          _fromDb: newQuestion._fromDb ?? true
        };
        
        game.players.forEach(p => p.ready = false);

        io.to(code).emit('next_question', {
          question: game.currentQuestion,
          positions: game.players.map(p => ({ id: p.id, role: p.role, position: p.position }))
        });
      } catch (error) {
        console.error("Critical error generating question:", error);
        game.currentQuestion = { 
          question: "Chyba generování otázky. Omlouváme se.", 
          options: ["A", "B", "C"], 
          correct: 0,
          _fromLLM: false,
          _fromDb: false,
          _error: true
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

  // === SPECTATOR MODE ===
  
  socket.on('join_as_spectator', ({ gameCode, premiumCode }) => {
    const isAdmin = premiumCode === 'STVANICEADMIN';
    const premiumResult = !isAdmin ? validateCode(premiumCode) : { valid: true };
    
    if (!isAdmin && !premiumResult.valid) {
      socket.emit('spectator_error', { message: 'Neplatný kód pro diváckou místnost' });
      return;
    }
    
    const game = games.get(gameCode);
    if (!game) {
      socket.emit('spectator_error', { message: 'Hra s tímto kódem neexistuje' });
      return;
    }
    
    socket.join(gameCode);
    socket.isSpectator = true;
    socket.spectatorGame = gameCode;
    
    if (!game.spectators) game.spectators = [];
    game.spectators.push(socket.id);
    
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
      headstart: game.headstart,
      countdown: game.countdown,
      aiProgress: game.aiProgress
    });
  });

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
      headstart: game.headstart,
      countdown: game.countdown,
      aiProgress: game.aiProgress
    });
  });

  // Pause/Resume
  socket.on('player_paused', ({ code }) => {
    console.log(`📱 Hráč ${socket.id} přepnul do jiného okna`);
  });

  socket.on('player_resumed', ({ code }) => {
    const game = games.get(code);
    if (game) {
      // Najít hráče podle aktuálního ID
      const player = game.players.find(p => p.id === socket.id);
      
      // 🆕 OPRAVA: Pokud server hráče s tímto ID nezná (protože rejoin ještě nedoběhl),
      // ignorujeme požadavek. Pokud bychom pokračovali, vrátili bychom null roli.
      if (!player) {
        console.log(`⚠️ Ignoruji player_resumed od neznámého ID ${socket.id} (čekám na rejoin)`);
        return;
      }

      const myRole = player.role;
      
      console.log(`👁️ Hráč ${socket.id} se vrátil (role: ${myRole}), posílám kompletní resync`);
      
      socket.emit('game_state_sync', {
        phase: game.phase,
        roomCode: code,
        players: game.players,
        playersCount: game.players.length,
        myRole: myRole,
        rolesLocked: game.players.every(p => p.role !== null),
        currentQuestion: game.currentQuestion,
        headstart: game.headstart,
        settings: game.settings,
        ageGroup: game.settings?.ageGroup || 'adult',
        countdown: game.countdown || 0,
        aiProgress: game.aiProgress || { generated: 0, target: 8 },
        isRematch: game.isRematch || false,
        winner: game.winner || null,
        gameOver: game.phase === 'finished'
      });
    } else {
      socket.emit('error', { message: 'Hra již neexistuje' });
    }
  });

  // 🆕 REJOIN MECHANISMUS
  socket.on('rejoin_game', ({ roomCode, oldSocketId }) => {
    console.log(`♻️ Pokus o rejoin: Nový Socket ${socket.id} se hlásí jako Starý ${oldSocketId} do hry ${roomCode}`);
    
    const game = games.get(roomCode);
    if (!game) {
      socket.emit('rejoin_failed', { message: 'Hra již neexistuje nebo vypršel časový limit.' });
      return;
    }
    
    const disconnectInfo = disconnectedPlayers.get(oldSocketId);
    const playerIndex = game.players.findIndex(p => p.id === oldSocketId);
    
    if (playerIndex !== -1) {
      if (disconnectInfo) {
        console.log(`✅ Zrušen timeout pro hráče ${oldSocketId}`);
        clearTimeout(disconnectInfo.timeout);
        disconnectedPlayers.delete(oldSocketId);
      }
      
      game.players[playerIndex].id = socket.id;
      
      socket.join(roomCode);
      console.log(`✅ Úspěšný rejoin! Hráč ${oldSocketId} je nyní ${socket.id}`);
      
      const me = game.players[playerIndex];
      
      socket.emit('game_state_sync', {
        phase: game.phase,
        roomCode: roomCode,
        players: game.players,
        playersCount: game.players.length,
        myRole: me.role,
        rolesLocked: game.players.every(p => p.role !== null),
        currentQuestion: game.currentQuestion,
        headstart: game.headstart,
        settings: game.settings,
        ageGroup: game.settings?.ageGroup || 'adult',
        countdown: game.countdown || 0,
        aiProgress: game.aiProgress || { generated: 0, target: 8 },
        isRematch: game.isRematch || false,
        winner: game.winner || null,
        gameOver: game.phase === 'finished'
      });
      
      io.to(roomCode).emit('player_connection_restored', { playerId: socket.id });
    } else {
      console.log(`⚠️ Rejoin selhal - hráč ${oldSocketId} nenalezen ve hře ${roomCode}`);
      socket.emit('rejoin_failed', { message: 'Nepodařilo se obnovit relaci hráče.' });
    }
  });

  // 🆕 ÚMYSLNÝ ODCHOD (reload/zavření) - okamžité ukončení bez grace period
  socket.on('player_leaving', ({ code }) => {
    console.log(`👋 Hráč ${socket.id} záměrně opouští hru ${code}`);
    
    const game = games.get(code);
    if (!game) return;
    
    const playerIndex = game.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1) return;
    
    // Zrušit případný běžící grace period
    const disconnectInfo = disconnectedPlayers.get(socket.id);
    if (disconnectInfo) {
      clearTimeout(disconnectInfo.timeout);
      disconnectedPlayers.delete(socket.id);
    }
    
    // Okamžitě ukončit hru
    console.log(`💀 Okamžité ukončení hry ${code} (hráč záměrně odešel)`);
    stopCountdown(code);
    endGameSession(code);
    io.to(code).emit('player_disconnected');
    games.delete(code);
  });

  // ODPOJENÍ
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);

    if (socket.isSpectator && socket.spectatorGame) {
      const game = games.get(socket.spectatorGame);
      if (game && game.spectators) {
        game.spectators = game.spectators.filter(id => id !== socket.id);
      }
      return;
    }

    games.forEach((game, code) => {
      const playerIndex = game.players.findIndex(p => p.id === socket.id);
      if (playerIndex !== -1) {
        console.log(`🕐 Grace period pro ${socket.id} v hře ${code}`);
        
        const timeout = setTimeout(() => {
          const currentGame = games.get(code);
          if (currentGame) {
            console.log(`💀 Grace period vypršel, ukončuji hru ${code}`);
            
            stopCountdown(code);
            endGameSession(code);
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
        
        io.to(code).emit('player_connection_unstable', {
          playerId: socket.id,
          gracePeriod: DISCONNECT_GRACE_PERIOD
        });
      }
    });
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log('ŠTVANICE Server v3.2 running');
});