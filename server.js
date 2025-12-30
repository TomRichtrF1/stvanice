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
if (!process.env.PERPLEXITY_API_KEY) console.warn('⚠️ PERPLEXITY_API_KEY chybí (fact-check bude přeskočen)');
else console.log('✅ PERPLEXITY_API_KEY nalezen.');
if (!process.env.STRIPE_SECRET_KEY) console.warn('⚠️ STRIPE_SECRET_KEY chybí');
else console.log('✅ STRIPE_SECRET_KEY nalezen.');
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

// Mapa pro ukládání kódů vstupenek (session_id -> code)
const ticketCodes = new Map();

// Generování unikátního kódu vstupenky
function generateTicketCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Endpoint pro získání kódu po úspěšné platbě
app.get('/api/get-session-code', async (req, res) => {
  const { session_id } = req.query;
  
  if (!session_id) {
    return res.json({ error: 'Chybí session_id' });
  }
  
  console.log(`🎫 Požadavek na kód pro session: ${session_id}`);
  
  // Kontrola, zda už máme kód pro tuto session
  if (ticketCodes.has(session_id)) {
    const existing = ticketCodes.get(session_id);
    console.log(`🎫 Vrácen existující kód: ${existing.code}`);
    return res.json(existing);
  }
  
  // Ověření platby přes Stripe
  if (!stripe) {
    // Fallback bez Stripe - vygenerujeme kód
    console.warn('⚠️ Stripe není dostupný, generuji kód bez ověření');
    const code = generateTicketCode();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 dní
    const ticketData = { code, expiresAt, sessionId: session_id };
    ticketCodes.set(session_id, ticketData);
    return res.json(ticketData);
  }
  
  try {
    // Ověřit session u Stripe
    const session = await stripe.checkout.sessions.retrieve(session_id);
    
    if (session.payment_status !== 'paid') {
      console.log(`❌ Platba nebyla dokončena: ${session.payment_status}`);
      return res.json({ error: 'Platba nebyla dokončena' });
    }
    
    // Vygenerovat kód
    const code = generateTicketCode();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 dní
    
    const ticketData = { 
      code, 
      expiresAt, 
      sessionId: session_id,
      email: session.customer_details?.email 
    };
    
    ticketCodes.set(session_id, ticketData);
    
    // Uložit do databáze (pokud existuje)
    if (questionDatabase && questionDatabase.saveTicketCode) {
      await questionDatabase.saveTicketCode(code, session_id, expiresAt);
    }
    
    console.log(`✅ Vygenerován nový kód: ${code} pro ${session.customer_details?.email}`);
    return res.json(ticketData);
    
  } catch (error) {
    console.error('❌ Stripe error:', error.message);
    return res.json({ error: 'Chyba při ověřování platby: ' + error.message });
  }
});

// Endpoint pro ověření kódu vstupenky (používá se v join_as_spectator)
app.get('/api/verify-ticket', async (req, res) => {
  const { code } = req.query;
  
  if (!code) {
    return res.json({ valid: false, error: 'Chybí kód' });
  }
  
  // Admin kód je vždy platný
  if (code.toUpperCase() === 'STVANICEADMIN') {
    return res.json({ valid: true, isAdmin: true });
  }
  
  // Kontrola v paměti
  for (const [sessionId, ticket] of ticketCodes) {
    if (ticket.code === code.toUpperCase()) {
      const expires = new Date(ticket.expiresAt);
      if (expires > new Date()) {
        return res.json({ valid: true, expiresAt: ticket.expiresAt });
      } else {
        return res.json({ valid: false, error: 'Kód vypršel' });
      }
    }
  }
  
  // Kontrola v databázi
  if (questionDatabase && questionDatabase.verifyTicketCode) {
    const result = await questionDatabase.verifyTicketCode(code);
    return res.json(result);
  }
  
  return res.json({ valid: false, error: 'Neplatný kód' });
});

// Catch-all route - MUSÍ BÝT POSLEDNÍ
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
const visibilityTimeouts = new Map();  // Samostatná mapa pro timeouty (socket.id -> timeout)
const spectators = new Map();  // 🆕 gameCode -> Set<socket.id>

// === KONFIGURACE ===
const RESOLUTION_DELAY_MS = 3000;
const GAME_OVER_DELAY_MS = 7000;
const VISIBILITY_TIMEOUT_MS = 60000;
const ADMIN_PREMIUM_CODE = 'STVANICEADMIN';  // 🆕 Admin heslo pro diváky

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

      // Pre-warm cache
      preWarmCache(roomCode, selectedAgeGroup).catch(e => console.error("Pre-warm err:", e.message));

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
        id: socket.id, 
        role: null, 
        position: 0, 
        ready: false, 
        connected: true, 
        hasAnswered: false, 
        lastAnswer: null
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
      socket.emit('role_taken', { role, message: `Role ${role === 'hunter' ? 'Lovec' : 'Štvanec'} je již obsazená!` });
      return;
    }
    
    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      player.role = role;
      
      // Automaticky přiřadit opačnou roli druhému hráči
      const otherPlayer = room.players.find(p => p.id !== socket.id && !p.role);
      if (otherPlayer) {
        otherPlayer.role = role === 'hunter' ? 'prey' : 'hunter';
        console.log(`🎭 Automaticky přiřazena role ${otherPlayer.role}`);
      }
      
      io.to(code).emit('roles_updated', { players: room.players });

      // Start když jsou obě role přiřazeny
      if (room.players.every(p => p.role) && room.players.length === 2 && room.phase === 'role_selection') {
        
        // 🆕 BUG14: Při rematchi přeskočit countdown
        if (room.isRematch) {
          console.log(`⏭️ Rematch - přeskakuji countdown`);
          room.phase = 'headstart_selection';
          io.to(code).emit('phase_change', { phase: 'headstart_selection' });
        } else {
          // Normální hra - spustit countdown
          room.phase = 'countdown';
          io.to(code).emit('phase_change', { phase: 'countdown' });
          
          let countdown = 35;
          const initialAiProgress = getCacheStatus(code);
          io.to(code).emit('countdown_started', { 
            countdown, 
            ageGroup: room.ageGroup,
            aiProgress: initialAiProgress
          });
          
          const timer = setInterval(() => {
            countdown--;
            if (activeRooms.has(code)) {
              const aiProgress = getCacheStatus(code);
              io.to(code).emit('countdown_tick', { 
                remaining: countdown,
                aiProgress,
                playersCount: room.players.length
              });
            } else {
              clearInterval(timer);
            }

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

  // === SUBMIT ANSWER (BUG12 - 3s zpoždění vyhodnocení) ===
  socket.on('submit_answer', ({ code, answerIndex }) => {
    const room = activeRooms.get(code);
    if (!room || !room.currentQuestion) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.hasAnswered) return;

    player.hasAnswered = true;
    player.lastAnswer = answerIndex;
    
    // 🆕 Informovat spectatora o odpovědi
    io.to(code).emit('spectator_player_answered', { 
      role: player.role, 
      answerIndex 
    });

    const connected = room.players.filter(p => p.connected);
    
    // Čekáme až oba hráči odpoví
    if (connected.every(p => p.hasAnswered)) {
      const correct = room.currentQuestion.correct;
      const hunter = room.players.find(p => p.role === 'hunter');
      const prey = room.players.find(p => p.role === 'prey');

      // Aktualizace pozic (interně)
      const hunterCorrect = hunter && hunter.lastAnswer === correct;
      const preyCorrect = prey && prey.lastAnswer === correct;
      
      if (hunterCorrect) hunter.position++;
      if (preyCorrect) prey.position++;
      
      // Reset pro další kolo
      room.players.forEach(p => { 
        p.hasAnswered = false; 
        p.lastAnswer = null;
        p.ready = false;
      });
      
      // Emitovat start_resolution pro audio (okamžitě)
      io.to(code).emit('start_resolution');
      
      // 🆕 BUG12: Zpoždění 3s před zobrazením vyhodnocení
      setTimeout(() => {
        io.to(code).emit('round_results', { 
          results: room.players, 
          correctAnswer: correct,
          hunterCorrect,
          preyCorrect
        });
      }, RESOLUTION_DELAY_MS);

      // Detekce vítěze
      let winner = null;
      if (hunter && prey) {
        if (hunter.position >= prey.position) winner = 'hunter';
        else if (prey.position >= 8) winner = 'prey';
      }

      if (winner) {
        // 🆕 BUG11: 7s zpoždění pro vyhlášení vítěze
        room.phase = 'finishing';
        room.gameOverPending = true;
        
        console.log(`🏆 Vítěz: ${winner} - čekám ${GAME_OVER_DELAY_MS/1000}s na zobrazení výsledků`);
        
        setTimeout(() => {
          if (activeRooms.has(code)) {
            room.phase = 'finished';
            io.to(code).emit('game_over', { winner });
            endGameSession(code);
            console.log(`🎮 Game over odeslán pro ${code}`);
          }
        }, GAME_OVER_DELAY_MS);
        
      } else {
        // Čekáme na ready od obou hráčů
        room.waitingForReady = true;
        console.log(`⏳ Čekám na potvrzení obou hráčů pro další kolo...`);
      }
    }
  });

  // === PLAYER READY (pro další kolo) ===
  socket.on('player_ready', async ({ code }) => {
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
    if (connected.every(p => p.ready) && room.waitingForReady) {
      room.waitingForReady = false;
      room.players.forEach(p => p.ready = false);
      
      console.log(`🎯 Oba hráči připraveni, generuji další otázku...`);
      
      const nextQ = await generateQuestion(code, room.ageGroup);
      room.currentQuestion = nextQ;
      room.currentRound++;
      
      io.to(code).emit('next_question', { question: nextQ, positions: room.players });
    }
  });

  // Alternativní název eventu (zpětná kompatibilita)
  socket.on('playerReady', async ({ code }) => {
    const room = activeRooms.get(code);
    if (!room || room.gameOverPending) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    player.ready = true;
    console.log(`✅ Hráč ${player.role} je připraven (via playerReady)`);

    io.to(code).emit('player_ready_update', { 
      players: room.players.map(p => ({ id: p.id, role: p.role, ready: p.ready }))
    });

    const connected = room.players.filter(p => p.connected);
    if (connected.every(p => p.ready) && room.waitingForReady) {
      room.waitingForReady = false;
      room.players.forEach(p => p.ready = false);
      
      console.log(`🎯 Oba hráči připraveni, generuji další otázku...`);
      
      const nextQ = await generateQuestion(code, room.ageGroup);
      room.currentQuestion = nextQ;
      room.currentRound++;
      
      io.to(code).emit('next_question', { question: nextQ, positions: room.players });
    }
  });

  // === PLAY AGAIN (rematch) - BUG14: bez countdown ===
  socket.on('play_again', async ({ code }) => {
    const room = activeRooms.get(code);
    if (!room) {
      socket.emit('error', { message: 'Místnost již neexistuje.' });
      return;
    }

    console.log(`🔄 Rematch požadavek pro místnost ${code}`);

    // Reset stavu hry
    resetGameSession(code);
    
    // Reset hráčů
    room.players.forEach(p => {
      p.position = 0;
      p.ready = false;
      p.hasAnswered = false;
      p.lastAnswer = null;
      p.role = null;
    });
    
    // Reset místnosti
    room.phase = 'role_selection';
    room.currentRound = 0;
    room.currentQuestion = null;
    room.waitingForReady = false;
    room.gameOverPending = false;
    room.isRematch = true;  // 🆕 BUG14: Označit jako rematch
    room.scores = { hunter: 0, prey: 0 };

    // Pre-warm cache pro novou hru
    preWarmCache(code, room.ageGroup).catch(e => console.error("Pre-warm err:", e.message));

    // Informovat oba hráče
    io.to(code).emit('rematch_started', { isRematch: true });
    io.to(code).emit('phase_change', { phase: 'role_selection' });
    io.to(code).emit('roles_updated', { players: room.players });

    console.log(`✅ Rematch zahájen pro místnost ${code} (bez countdown)`);
  });

  // === REJOIN GAME ===
  socket.on('rejoin_game', ({ roomCode, oldSocketId }) => {
    const room = activeRooms.get(roomCode);
    if (room) {
      const player = room.players.find(p => p.id === oldSocketId || !p.connected);
      if (player) {
        // Zrušit případný visibility timeout
        const existingTimeout = visibilityTimeouts.get(oldSocketId);
        if (existingTimeout) {
          clearTimeout(existingTimeout);
          visibilityTimeouts.delete(oldSocketId);
        }
        
        player.id = socket.id;
        player.connected = true;
        socket.join(roomCode);
        socket.emit('game_state_sync', {
          roomCode, 
          phase: room.phase, 
          players: room.players, 
          currentQuestion: room.currentQuestion, 
          ageGroup: room.ageGroup, 
          myRole: player.role, 
          settings: room.settings,
          waitingForReady: room.waitingForReady
        });
        console.log(`🔄 Hráč ${socket.id} se znovu připojil do ${roomCode}`);
      }
    } else {
      socket.emit('rejoin_failed', { message: 'Místnost již neexistuje' });
    }
  });

  // === DISCONNECT ===
  socket.on('disconnect', () => {
    // Zrušit případný visibility timeout
    const existingTimeout = visibilityTimeouts.get(socket.id);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      visibilityTimeouts.delete(socket.id);
    }
    
    // Cleanup spectator
    for (const [code, specSet] of spectators) {
      if (specSet.has(socket.id)) {
        specSet.delete(socket.id);
        console.log(`🎬 Spectator ${socket.id} odpojen z ${code}`);
      }
    }
    
    // Cleanup player
    for (const [code, room] of activeRooms) {
      const player = room.players.find(p => p.id === socket.id);
      if (player) {
        player.connected = false;
        io.to(code).emit('player_connection_unstable', { gracePeriod: 30 });
        console.log(`⚠️ Hráč ${socket.id} se odpojil z ${code}`);
      }
    }
  });

  // === BUG15: PLAYER VISIBILITY CHANGE (přepnutí okna) ===
  socket.on('player_visibility_hidden', ({ code }) => {
    const room = activeRooms.get(code);
    if (!room) return;
    
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;
    
    // Pokud už běží timeout, nestarovat nový
    if (visibilityTimeouts.has(socket.id)) return;
    
    console.log(`👁️ Hráč ${player.role || 'unknown'} přepnul do jiného okna - spouštím 60s timeout`);
    
    // Spustit timeout 60s
    const timeout = setTimeout(() => {
      console.log(`⏱️ Timeout 60s - hráč ${player.role || 'unknown'} se nevrátil, ukončuji hru`);
      
      visibilityTimeouts.delete(socket.id);
      
      // Oznámit OBĚMA hráčům
      io.to(code).emit('player_left_game', { 
        reason: 'Soupeř opustil hru (timeout)',
        leftPlayer: player.role
      });
      
      // Uklidit místnost
      activeRooms.delete(code);
      endGameSession(code);
      
    }, VISIBILITY_TIMEOUT_MS);
    
    visibilityTimeouts.set(socket.id, timeout);
  });

  socket.on('player_visibility_visible', ({ code }) => {
    const room = activeRooms.get(code);
    if (!room) return;
    
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;
    
    // Zrušit timeout
    const existingTimeout = visibilityTimeouts.get(socket.id);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      visibilityTimeouts.delete(socket.id);
      console.log(`👁️ Hráč ${player.role || 'unknown'} se vrátil - timeout zrušen`);
    }
  });

  // === 🆕 BUG15: PLAYER LEAVING (zavření/reload) ===
  socket.on('player_leaving', ({ code }) => {
    const room = activeRooms.get(code);
    if (!room) return;
    
    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      player.connected = false;
      
      console.log(`👋 Hráč ${player.role || socket.id} opustil hru ${code}`);
      
      // Oznámit druhému hráči OKAMŽITĚ
      io.to(code).emit('player_left_game', { 
        reason: 'Soupeř opustil hru',
        leftPlayer: player.role
      });
      
      // Nechat místnost existovat chvíli pro případný rejoin
      setTimeout(() => {
        if (activeRooms.has(code)) {
          const currentRoom = activeRooms.get(code);
          const stillDisconnected = currentRoom.players.find(p => !p.connected);
          if (stillDisconnected) {
            console.log(`🗑️ Mažu opuštěnou místnost ${code}`);
            activeRooms.delete(code);
            endGameSession(code);
          }
        }
      }, 30000);  // 30s grace period pro rejoin
    }
  });

  // === PLAYER PAUSED/RESUMED (legacy) ===
  socket.on('player_paused', ({ code }) => {
    // Handled by player_visibility_hidden
  });

  socket.on('player_resumed', ({ code }) => {
    const room = activeRooms.get(code);
    if (room) {
      const player = room.players.find(p => p.id === socket.id);
      if (player) {
        socket.emit('game_state_sync', {
          roomCode: code,
          phase: room.phase,
          players: room.players,
          currentQuestion: room.currentQuestion,
          ageGroup: room.ageGroup,
          myRole: player.role,
          settings: room.settings,
          waitingForReady: room.waitingForReady
        });
      }
    }
  });

  // === SPECTATOR HANDLERS ===
  socket.on('join_as_spectator', async ({ gameCode, premiumCode }) => {
    const code = gameCode?.toUpperCase();
    const premium = premiumCode?.toUpperCase();
    
    console.log(`🎬 Spectator pokus o připojení: ${code} s kódem ${premium}`);
    
    // Validace premium kódu
    const isAdmin = premium === ADMIN_PREMIUM_CODE;
    let isValidPremium = isAdmin;
    
    // Pokud není admin, zkontrolovat v paměti nebo DB
    if (!isAdmin) {
      // Kontrola v paměti (čerstvě zakoupené)
      for (const [sessionId, ticket] of ticketCodes) {
        if (ticket.code === premium) {
          const expires = new Date(ticket.expiresAt);
          if (expires > new Date()) {
            isValidPremium = true;
            console.log(`🎫 Vstupenka ${premium} ověřena z paměti`);
            break;
          }
        }
      }
      
      // Kontrola v databázi
      if (!isValidPremium && questionDatabase && questionDatabase.verifyTicketCode) {
        try {
          const result = await questionDatabase.verifyTicketCode(premium);
          if (result.valid) {
            isValidPremium = true;
            console.log(`🎫 Vstupenka ${premium} ověřena z DB`);
          }
        } catch (e) {
          console.error('Chyba ověření vstupenky:', e.message);
        }
      }
    }
    
    if (!isValidPremium) {
      socket.emit('spectator_error', { message: 'Neplatný kód vstupenky' });
      return;
    }
    
    const room = activeRooms.get(code);
    if (!room) {
      socket.emit('spectator_error', { message: 'Hra nenalezena' });
      return;
    }
    
    // Přidat spectatora do místnosti
    socket.join(code);
    
    if (!spectators.has(code)) {
      spectators.set(code, new Set());
    }
    spectators.get(code).add(socket.id);
    
    console.log(`🎬 Spectator ${socket.id} připojen k ${code}`);
    
    // Odeslat aktuální stav hry
    const gameState = {
      phase: room.phase,
      players: room.players.map(p => ({
        id: p.id,
        role: p.role,
        position: p.position,
        answer: p.lastAnswer,
        ready: p.ready
      })),
      currentQuestion: room.currentQuestion,
      settings: {
        ageGroup: room.ageGroup,
        mode: room.ageGroup === 'adult' ? 'adult' : 'kid'
      },
      headstart: room.settings?.headstart || 3,
      roomCode: code
    };
    
    socket.emit('spectator_joined', gameState);
  });
});

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    console.log('⏳ Start serveru...');
    await connectDatabase(questionDatabase);
    httpServer.listen(PORT, () => {
      console.log(`🚀 Server běží na portu ${PORT}`);
    });
  } catch (error) {
    console.error('❌ FATAL ERROR:', error);
  }
}

startServer();
