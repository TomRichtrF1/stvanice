import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import cors from 'cors';

// Import backend logiky z question_generator.js
import { 
  generateQuestion, 
  connectDatabase,
  getValidationStats,
  resetGameSession,
  endGameSession
} from './question_generator.js';

// Import databáze (zde se importuje modul, který se předává do connectDatabase)
import * as questionDatabase from './question_database.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);

// Nastavení CORS pro Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: "*", // V produkci by zde měla být URL tvé aplikace, pro testování * nevadí
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

// === API ENDPOINTS ===

// 1. Health check pro Heroku (aby vědělo, že aplikace běží)
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// 2. Statistiky
app.get('/api/stats', (req, res) => {
  res.json(getValidationStats());
});

// 3. Fallback pro React Router
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// === HERNÍ LOGIKA (SOCKET.IO) ===
// Ukládáme stav místností:
// { players: [], gameState: 'waiting'|'roles'|'playing'|'finished', ageGroup: 'adult', ... }
const activeRooms = new Map();

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // 1. Založení místnosti
  socket.on('create_room', async ({ roomCode, ageGroup }) => {
    socket.join(roomCode);
    
    // Inicializace stavu místnosti
    activeRooms.set(roomCode, {
      players: [{ 
        id: socket.id, 
        role: null, 
        score: 0,
        connected: true // Sledujeme připojení
      }],
      ageGroup: ageGroup || 'adult',
      gameStarted: false,
      currentRound: 0,
      totalRounds: 10,
      scores: { chaser: 0, fugitive: 0 },
      settings: {
        headstart: 0 // Výchozí náskok
      },
      questionHistory: [] // Historie otázek pro tuto hru
    });

    console.log(`Room ${roomCode} created. Category: ${ageGroup}`);
    // Poznámka: Pre-warming cache se řeší interně v generatoru
  });

  // 2. Připojení do existující
  socket.on('join_room', ({ roomCode }) => {
    const room = activeRooms.get(roomCode);
    
    if (room && room.players.length < 2) {
      socket.join(roomCode);
      room.players.push({ 
        id: socket.id, 
        role: null, 
        score: 0,
        connected: true
      });
      
      // Oznámíme klientům nový počet hráčů
      io.to(roomCode).emit('player_joined', { playerCount: room.players.length });
      console.log(`User ${socket.id} joined room ${roomCode}`);
    } else {
      socket.emit('error', { message: 'Místnost nenalezena nebo je plná.' });
    }
  });

  // 2b. Rejoin (pokud hráč obnoví stránku)
  socket.on('rejoin_room', ({ roomCode }) => {
    const room = activeRooms.get(roomCode);
    if (room) {
      // Najdeme hráče, který se snaží vrátit (podle ID to nepůjde, socket.id je nové)
      // V reálné appce bychom potřebovali trvalejší ID (např. v localStorage).
      // Zde zjednodušeně: pokud je místo, pustíme ho zpět.
      // Pro MVP: Rejoin zatím řešíme jako nový join, klient si musí hlídat stav.
      
      // Pokud je hra už rozehraná, pošleme mu aktuální stav
      socket.join(roomCode);
      socket.emit('game_state_sync', {
        gameState: room.gameStarted ? 'playing' : 'waiting',
        scores: room.scores,
        currentRound: room.currentRound
      });
    }
  });

  // 3. Aktualizace nastavení (kategorie)
  socket.on('update_room_settings', ({ roomCode, settings }) => {
    const room = activeRooms.get(roomCode);
    if (room) {
      if (settings.ageGroup) room.ageGroup = settings.ageGroup;
      // Propagujeme změnu druhému hráči
      socket.to(roomCode).emit('room_settings_updated', settings);
    }
  });

  // 4. Výběr role
  socket.on('select_role', ({ roomCode, role }) => {
    const room = activeRooms.get(roomCode);
    if (room) {
      const player = room.players.find(p => p.id === socket.id);
      if (player) {
        player.role = role;
        
        // Pokud mají oba hráči roli, můžeme jít dál
        const rolesFilled = room.players.filter(p => p.role).length === 2;
        if (rolesFilled) {
           io.to(roomCode).emit('roles_assigned', { players: room.players });
        }
      }
    }
  });

  // 5. Start hry (po výběru rolí a případně náskoku)
  socket.on('start_game', ({ roomCode }) => {
    const room = activeRooms.get(roomCode);
    if (room) {
      room.gameStarted = true;
      io.to(roomCode).emit('game_started');
    }
  });

  // 5b. Výběr náskoku (Headstart)
  socket.on('select_headstart', ({ roomCode, steps }) => {
    const room = activeRooms.get(roomCode);
    if (room) {
      room.settings.headstart = steps;
      // Aplikujeme náskok do skóre
      room.scores.fugitive = steps;
      
      io.to(roomCode).emit('headstart_selected', { 
        steps, 
        scores: room.scores 
      });
    }
  });

  // 6. Žádost o otázku
  socket.on('request_question', async ({ roomCode }) => {
    const room = activeRooms.get(roomCode);
    if (room) {
        // Generování otázky (ASYNC - čeká na DB nebo LLM)
        const qData = await generateQuestion(roomCode, room.ageGroup);
        
        // Uložíme do historie (pro debug/kontrolu)
        room.questionHistory.push(qData);

        io.to(roomCode).emit('new_question', qData);
    }
  });

  // 7. Odpověď na otázku
  socket.on('submit_answer', ({ roomCode, correct, timeBonus }) => {
    const room = activeRooms.get(roomCode);
    if (room) {
        const player = room.players.find(p => p.id === socket.id);
        
        if (player && correct) {
            // Logika bodování
            if (player.role === 'chaser') {
              room.scores.chaser += 1; // Lovec se přibližuje
            } else if (player.role === 'fugitive') {
              room.scores.fugitive += 1; // Štvanec utíká
            }
        }
        
        // Pošleme aktualizované skóre všem
        io.to(roomCode).emit('score_update', room.scores);
    }
  });

  // 8. Skip otázky (pokud se zasekne nebo je moc těžká - volitelné)
  socket.on('skip_question', async ({ roomCode }) => {
     const room = activeRooms.get(roomCode);
     if (room) {
       const qData = await generateQuestion(roomCode, room.ageGroup);
       io.to(roomCode).emit('new_question', qData);
     }
  });

  // 9. Synchronizace času (volitelné pro přesnější odpočty)
  socket.on('time_sync', ({ roomCode, timeLeft }) => {
    socket.to(roomCode).emit('time_sync_update', { timeLeft });
  });

  // Odpojení
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // Zde bychom mohli řešit pauzu hry, nebo smazání roomky po čase
    // activeRooms.forEach((room, code) => { ... })
  });
});

// === SPOUŠTĚNÍ SERVERU (ASYNC START) ===
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    console.log('⏳ Server: Připojuji k databázi...');
    
    // 1. Připojení k DB (čekáme, až se Postgres spojí)
    const dbSuccess = await connectDatabase(questionDatabase);
    
    if (dbSuccess) {
      console.log('✅ Server: Databáze úspěšně připojena.');
    } else {
      console.warn('⚠️ Server: Běžíme bez databáze (pouze LLM cache) - Zkontrolujte DATABASE_URL!');
    }

    // 2. Start naslouchání až po připojení DB
    httpServer.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });

  } catch (error) {
    console.error('❌ FATAL ERROR: Failed to start server:', error);
    process.exit(1);
  }
}

startServer();