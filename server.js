import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import cors from 'cors';
import Stripe from 'stripe';

dotenv.config();

// === STRIPE INIT ===
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  console.log('✅ Stripe inicializován');
} else {
  console.warn('⚠️ STRIPE_SECRET_KEY chybí - platby nebudou fungovat');
}

// === DEBUG ENV ===
console.log('--- 🔧 DEBUG START ---');
if (!process.env.DATABASE_URL) console.error('❌ CHYBA: DATABASE_URL chybí!');
else console.log('✅ DATABASE_URL nalezeno.');
if (!process.env.GROQ_API_KEY) console.error('❌ CHYBA: GROQ_API_KEY chybí!');
else console.log('✅ GROQ_API_KEY nalezen.');
console.log('----------------------');

import { 
  generateQuestion, 
  connectDatabase,
  getValidationStats,
  endGameSession,
  resetGameSession,
  preWarmCache, 
  getAgeGroups,
  getCacheStatus
} from './question_generator.js';

import * as questionDatabase from './question_database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

app.get('/health', (req, res) => res.status(200).send('OK'));
app.get('/api/stats', (req, res) => res.json(getValidationStats()));

// === STRIPE API ENDPOINTS ===
const ticketCodes = new Map();

function generateTicketCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

app.get('/api/get-session-code', async (req, res) => {
  const { session_id } = req.query;
  if (!session_id) return res.json({ error: 'Chybí session_id' });
  
  if (ticketCodes.has(session_id)) {
    return res.json(ticketCodes.get(session_id));
  }
  
  if (!stripe) {
    const code = generateTicketCode();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const ticketData = { code, expiresAt, sessionId: session_id };
    ticketCodes.set(session_id, ticketData);
    return res.json(ticketData);
  }
  
  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);
    if (session.payment_status !== 'paid') return res.json({ error: 'Platba nebyla dokončena' });
    
    const code = generateTicketCode();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const ticketData = { code, expiresAt, sessionId: session_id, email: session.customer_details?.email };
    ticketCodes.set(session_id, ticketData);
    
    if (questionDatabase && questionDatabase.saveTicketCode) {
      await questionDatabase.saveTicketCode(code, session_id, expiresAt);
    }
    return res.json(ticketData);
  } catch (error) {
    console.error('❌ Stripe error:', error.message);
    return res.json({ error: 'Chyba ověření platby' });
  }
});

app.get('/api/verify-ticket', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.json({ valid: false, error: 'Chybí kód' });
  if (code.toUpperCase() === 'STVANICEADMIN') return res.json({ valid: true, isAdmin: true });
  
  for (const [sessionId, ticket] of ticketCodes) {
    if (ticket.code === code.toUpperCase()) {
      const expires = new Date(ticket.expiresAt);
      if (expires > new Date()) return res.json({ valid: true, expiresAt: ticket.expiresAt });
      else return res.json({ valid: false, error: 'Kód vypršel' });
    }
  }
  
  if (questionDatabase && questionDatabase.verifyTicketCode) {
    const result = await questionDatabase.verifyTicketCode(code);
    return res.json(result);
  }
  return res.json({ valid: false, error: 'Neplatný kód' });
});

app.get(/.*/, (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; 
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

const activeRooms = new Map();
const visibilityTimeouts = new Map();
const spectators = new Map();

// === KONFIGURACE ===
const RESOLUTION_DELAY_MS = 3000;
const GAME_OVER_DELAY_MS = 7000;
const VISIBILITY_TIMEOUT_MS = 60000;
const ADMIN_PREMIUM_CODE = 'STVANICEADMIN';

io.on('connection', (socket) => {
  console.log(`🔌 User connected: ${socket.id}`);

  // === CREATE GAME ===
  socket.on('create_game_with_category', async ({ ageGroup }) => {
    try {
      const roomCode = generateRoomCode();
      const selectedAgeGroup = ageGroup || 'adult';

      socket.join(roomCode);
      
      activeRooms.set(roomCode, {
        roomCode,
        players: [{ 
          id: socket.id, 
          role: null, 
          position: 0, 
          ready: false,
          connected: true, 
          hasAnswered: false, 
          lastAnswer: null
        }],
        ageGroup: selectedAgeGroup,
        phase: 'waiting_for_player',
        gameStarted: false,
        currentRound: 0,
        scores: { hunter: 0, prey: 0 },
        settings: { headstart: 3 },
        currentQuestion: null,
        createdAt: Date.now(),
        waitingForReady: false,
        gameOverPending: false,
        isRematch: false
      });

      console.log(`✅ Hra založena: ${roomCode} [${selectedAgeGroup}]`);
      socket.emit('game_created', { code: roomCode, ageGroup: selectedAgeGroup, phase: 'waiting_for_player' });

      // Pre-warm cache (bezpečně, aby to neshodilo handler)
      try {
        preWarmCache(roomCode, selectedAgeGroup).catch(e => console.warn("Pre-warm warning:", e.message));
      } catch (e) {
        console.warn("Pre-warm failed to start");
      }

    } catch (err) {
      console.error("❌ Chyba založení:", err);
      socket.emit('error', { message: 'Chyba serveru.' });
    }
  });

  // === JOIN GAME ===
  socket.on('join_game', (roomCode) => {
    const room = activeRooms.get(roomCode);
    if (!room) {
      socket.emit('error', { message: 'Místnost nenalezena.' });
      return;
    }
    
    if (room.players.length >= 2 && !room.players.some(p => !p.connected)) {
      socket.emit('error', { message: 'Plno.' });
      return;
    }

    socket.join(roomCode);
    if (room.players.length < 2) {
      room.players.push({ 
        id: socket.id, role: null, position: 0, ready: false, connected: true, hasAnswered: false, lastAnswer: null
      });
    }

    socket.emit('game_joined', { code: roomCode, ageGroup: room.ageGroup, phase: room.phase });
    io.to(roomCode).emit('player_joined', { playersCount: room.players.length });

    if (room.players.length === 2 && room.phase === 'waiting_for_player') {
      room.phase = 'role_selection';
      io.to(roomCode).emit('phase_change', { phase: 'role_selection' });
    }
  });

  // === SELECT ROLE ===
  socket.on('select_role', ({ code, role }) => {
    const room = activeRooms.get(code);
    if (!room) return;
    
    const roleAlreadyTaken = room.players.some(p => p.role === role && p.id !== socket.id);
    if (roleAlreadyTaken) {
      socket.emit('role_taken', { role, message: 'Role je obsazená!' });
      return;
    }
    
    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      player.role = role;
      const otherPlayer = room.players.find(p => p.id !== socket.id && !p.role);
      if (otherPlayer) otherPlayer.role = role === 'hunter' ? 'prey' : 'hunter';
      
      io.to(code).emit('roles_updated', { players: room.players });

      if (room.players.every(p => p.role) && room.players.length === 2 && room.phase === 'role_selection') {
        if (room.isRematch) {
          room.phase = 'headstart_selection';
          io.to(code).emit('phase_change', { phase: 'headstart_selection' });
        } else {
          room.phase = 'countdown';
          io.to(code).emit('phase_change', { phase: 'countdown' });
          let countdown = 35;
          const initialAiProgress = getCacheStatus(code);
          io.to(code).emit('countdown_started', { countdown, ageGroup: room.ageGroup, aiProgress: initialAiProgress });
          
          const timer = setInterval(() => {
            countdown--;
            if (activeRooms.has(code)) {
              io.to(code).emit('countdown_tick', { remaining: countdown, aiProgress: getCacheStatus(code), playersCount: room.players.length });
            } else clearInterval(timer);
            if (countdown <= 0) {
              clearInterval(timer);
              if (activeRooms.has(code)) {
                room.phase = 'headstart_selection';
                io.to(code).emit('phase_change', { phase: 'headstart_selection' });
              }
            }
          }, 1000);
        }
      }
    }
  });

  // === SELECT HEADSTART ===
  socket.on('select_headstart', async ({ code, headstart }) => {
    const room = activeRooms.get(code);
    if (!room) return;

    try {
      room.settings.headstart = headstart;
      const hunter = room.players.find(p => p.role === 'hunter');
      const prey = room.players.find(p => p.role === 'prey');
      if (hunter) hunter.position = 0;
      if (prey) prey.position = headstart;

      console.log(`🎲 Start hry ${code}...`);
      const question = await generateQuestion(code, room.ageGroup);
      room.currentQuestion = question;
      room.phase = 'playing';
      room.currentRound = 1;

      io.to(code).emit('game_start', { positions: room.players, question });
    } catch (e) {
      console.error("❌ Chyba startu:", e);
      io.to(code).emit('game_start', { 
        positions: room.players, 
        question: { question: "Chyba načítání.", options: ["A","B","C"], correct: 0, _error: true }
      });
    }
  });

  // === SUBMIT ANSWER ===
  socket.on('submit_answer', ({ code, answerIndex }) => {
    const room = activeRooms.get(code);
    if (!room || !room.currentQuestion) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.hasAnswered) return;

    player.hasAnswered = true;
    player.lastAnswer = answerIndex;
    io.to(code).emit('spectator_player_answered', { role: player.role, answerIndex });

    const connected = room.players.filter(p => p.connected);
    if (connected.every(p => p.hasAnswered)) {
      const correct = room.currentQuestion.correct;
      const hunter = room.players.find(p => p.role === 'hunter');
      const prey = room.players.find(p => p.role === 'prey');
      
      const hunterCorrect = hunter && hunter.lastAnswer === correct;
      const preyCorrect = prey && prey.lastAnswer === correct;
      
      if (hunterCorrect) hunter.position++;
      if (preyCorrect) prey.position++;
      
      room.players.forEach(p => { p.hasAnswered = false; p.lastAnswer = null; p.ready = false; });
      io.to(code).emit('start_resolution');
      
      setTimeout(() => {
        io.to(code).emit('round_results', { results: room.players, correctAnswer: correct, hunterCorrect, preyCorrect });
      }, RESOLUTION_DELAY_MS);

      let winner = null;
      if (hunter && prey) {
        if (hunter.position >= prey.position) winner = 'hunter';
        else if (prey.position >= 8) winner = 'prey';
      }

      if (winner) {
        room.phase = 'finishing';
        room.gameOverPending = true;
        setTimeout(() => {
          if (activeRooms.has(code)) {
            room.phase = 'finished';
            io.to(code).emit('game_over', { winner });
            endGameSession(code);
          }
        }, GAME_OVER_DELAY_MS);
      } else {
        room.waitingForReady = true;
      }
    }
  });

  // === 🆕 PŘIDÁNO: PLAYER READY (Oprava zasekávání mezi koly) ===
  const handlePlayerReady = async ({ code }) => {
    const room = activeRooms.get(code);
    if (!room || room.gameOverPending) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    player.ready = true;
    console.log(`✅ Hráč ${player.role} je připraven`);

    io.to(code).emit('player_ready_update', { 
      players: room.players.map(p => ({ id: p.id, role: p.role, ready: p.ready }))
    });

    const connected = room.players.filter(p => p.connected);
    // Spustit nové kolo, až jsou připraveni všichni připojení hráči
    if (connected.length > 0 && connected.every(p => p.ready) && room.waitingForReady) {
      room.waitingForReady = false;
      room.players.forEach(p => p.ready = false);
      
      console.log(`🎯 Oba hráči připraveni, generuji další otázku...`);
      try {
        const nextQ = await generateQuestion(code, room.ageGroup);
        room.currentQuestion = nextQ;
        room.currentRound++;
        io.to(code).emit('next_question', { question: nextQ, positions: room.players });
      } catch (e) {
        console.error("Chyba další otázky:", e);
      }
    }
  };

  // Registrace obou variant názvů eventu (pro jistotu)
  socket.on('player_ready', handlePlayerReady);
  socket.on('playerReady', handlePlayerReady);

  // === PLAY AGAIN ===
  socket.on('play_again', async ({ code }) => {
    const room = activeRooms.get(code);
    if (!room) return;
    resetGameSession(code);
    room.players.forEach(p => { p.position = 0; p.ready = false; p.hasAnswered = false; p.lastAnswer = null; p.role = null; });
    room.phase = 'role_selection';
    room.currentRound = 0;
    room.currentQuestion = null;
    room.waitingForReady = false;
    room.gameOverPending = false;
    room.isRematch = true;
    room.scores = { hunter: 0, prey: 0 };
    preWarmCache(code, room.ageGroup).catch(e => {});
    io.to(code).emit('rematch_started', { isRematch: true });
    io.to(code).emit('phase_change', { phase: 'role_selection' });
    io.to(code).emit('roles_updated', { players: room.players });
  });

  // === REJOIN & DISCONNECT & VISIBILITY ===
  socket.on('rejoin_game', ({ roomCode, oldSocketId }) => {
    const room = activeRooms.get(roomCode);
    if (room) {
      const player = room.players.find(p => p.id === oldSocketId || !p.connected);
      if (player) {
        if (visibilityTimeouts.has(oldSocketId)) { clearTimeout(visibilityTimeouts.get(oldSocketId)); visibilityTimeouts.delete(oldSocketId); }
        player.id = socket.id;
        player.connected = true;
        socket.join(roomCode);
        socket.emit('game_state_sync', {
          roomCode, phase: room.phase, players: room.players, currentQuestion: room.currentQuestion, 
          ageGroup: room.ageGroup, myRole: player.role, settings: room.settings, waitingForReady: room.waitingForReady
        });
      }
    }
  });

  socket.on('disconnect', () => {
    if (visibilityTimeouts.has(socket.id)) { clearTimeout(visibilityTimeouts.get(socket.id)); visibilityTimeouts.delete(socket.id); }
    for (const [code, specSet] of spectators) { if (specSet.has(socket.id)) specSet.delete(socket.id); }
    for (const [code, room] of activeRooms) {
      const player = room.players.find(p => p.id === socket.id);
      if (player) {
        player.connected = false;
        io.to(code).emit('player_connection_unstable', { gracePeriod: 30 });
      }
    }
  });

  socket.on('player_visibility_hidden', ({ code }) => {
    const room = activeRooms.get(code);
    if (!room) return;
    if (visibilityTimeouts.has(socket.id)) return;
    const timeout = setTimeout(() => {
      visibilityTimeouts.delete(socket.id);
      io.to(code).emit('player_left_game', { reason: 'Timeout', leftPlayer: 'unknown' });
      activeRooms.delete(code);
      endGameSession(code);
    }, VISIBILITY_TIMEOUT_MS);
    visibilityTimeouts.set(socket.id, timeout);
  });

  socket.on('player_visibility_visible', ({ code }) => {
    if (visibilityTimeouts.has(socket.id)) { clearTimeout(visibilityTimeouts.get(socket.id)); visibilityTimeouts.delete(socket.id); }
  });
  
  socket.on('player_leaving', ({ code }) => {
    const room = activeRooms.get(code);
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (player) {
       player.connected = false;
       io.to(code).emit('player_left_game', { reason: 'Odchod hráče', leftPlayer: player.role });
    }
  });

  // === SPECTATOR ===
  socket.on('join_as_spectator', async ({ gameCode, premiumCode }) => {
    const code = gameCode?.toUpperCase();
    const premium = premiumCode?.toUpperCase();
    let isValidPremium = premium === ADMIN_PREMIUM_CODE;
    
    if (!isValidPremium) {
      for (const [sessionId, ticket] of ticketCodes) {
        if (ticket.code === premium && new Date(ticket.expiresAt) > new Date()) { isValidPremium = true; break; }
      }
    }
    
    if (!isValidPremium && questionDatabase && questionDatabase.verifyTicketCode) {
       try { const res = await questionDatabase.verifyTicketCode(premium); if (res.valid) isValidPremium = true; } catch(e){}
    }
    
    if (!isValidPremium) { socket.emit('spectator_error', { message: 'Neplatný kód' }); return; }
    
    const room = activeRooms.get(code);
    if (!room) { socket.emit('spectator_error', { message: 'Hra nenalezena' }); return; }
    
    socket.join(code);
    if (!spectators.has(code)) spectators.set(code, new Set());
    spectators.get(code).add(socket.id);
    
    socket.emit('spectator_joined', {
      phase: room.phase,
      players: room.players.map(p => ({ id: p.id, role: p.role, position: p.position, answer: p.lastAnswer, ready: p.ready })),
      currentQuestion: room.currentQuestion,
      settings: { ageGroup: room.ageGroup },
      headstart: room.settings?.headstart || 3,
      roomCode: code
    });
  });
});

const PORT = process.env.PORT || 3000;

// === 🚀 NON-BLOCKING START ===
async function startServer() {
  console.log('⏳ Start serveru...');
  
  // Start serveru HTTP okamžitě - NEČEKÁME na DB
  httpServer.listen(PORT, () => {
    console.log(`🚀 Server běží na portu ${PORT}`);
  });

  // DB se připojuje na pozadí
  connectDatabase(questionDatabase)
    .then(success => console.log(success ? '✅ DB Připojena' : '⚠️ DB init selhal (LLM mode)'))
    .catch(e => console.error('⚠️ DB chyba:', e.message));
}

startServer();