import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
// ZDE JE IMPORT NAŠEHO NOVÉHO MOZKU:
import { generateQuestion } from './question_generator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
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
  
  // Zachováme nastavení (mode, topic), aby se nemuselo znovu klikat

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
      phase: 'lobby',
      
      // === NOVÉ NASTAVENÍ ===
      settings: {
        mode: 'adult', // Výchozí: dospělí
        topic: 'general' // Výchozí: náhodná témata
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

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);

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
╚════════════════════════════════════════╝
  `);
  console.log(`Visit: http://localhost:${PORT}`);
});