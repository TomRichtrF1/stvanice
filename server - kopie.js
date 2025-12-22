import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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

// ZATÍM STARÉ OTÁZKY (později napojíme OpenAI)
const questions = [
  {
    question: 'Jaké je hlavní město České republiky?',
    options: ['Praha', 'Brno', 'Ostrava'],
    correct: 0
  },
  {
    question: 'Kolik planet má naše sluneční soustava?',
    options: ['7', '8', '9'],
    correct: 1
  },
  {
    question: 'Který prvek má chemickou značku O?',
    options: ['Zlato', 'Kyslík', 'Olovo'],
    correct: 1
  },
  {
    question: 'Kdo napsal hru Romeo a Julie?',
    options: ['Shakespeare', 'Goethe', 'Tolstoj'],
    correct: 0
  },
  {
    question: 'Kolik kontinentů je na Zemi?',
    options: ['5', '6', '7'],
    correct: 2
  }
];

function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function getRandomQuestion() {
  return questions[Math.floor(Math.random() * questions.length)];
}

function resetGame(roomCode) {
  const game = games.get(roomCode);
  if (!game) return;

  // Reset game state to role selection
  game.phase = 'role_selection';
  game.headstart = null;
  game.currentQuestion = null;
  game.questionIndex = 0;
  game.rematchRequested = {};

  // Reset player states but keep connections
  game.players.forEach(player => {
    player.role = null;
    player.position = 0;
    player.answer = null;
    player.ready = false;
  });

  // Notify all players about phase change
  io.to(roomCode).emit('phase_change', { phase: 'role_selection' });
  
  // Poslat aktualizovaný seznam hráčů (s nulovými rolemi), aby frontend věděl, že se resetovali
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
      headstart: null,
      currentQuestion: null,
      questionIndex: 0,
      rematchRequested: {}
    };

    games.set(roomCode, gameState);
    socket.join(roomCode);
    socket.emit('game_created', { code: roomCode });
    console.log(`Game created: ${roomCode}`);
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

    // Nezačínáme rovnou 'playing', ale čekáme na ready check
    game.phase = 'waiting_for_ready';
    game.currentQuestion = null; 
    game.questionIndex = 0;
    
    // Reset ready stavu
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

    // Okamžitá informace, že hráč odpověděl (aby se čekalo na druhého)
    io.to(code).emit('player_answered', { playerId: socket.id });

    if (game.players.every(p => p.answer !== null)) {
      // 1. Spočítáme výsledky hned
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

      // 2. DRAMATICKÁ PAUZA - Pošleme výsledky až za 3 sekundy
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
          // Ještě chvilka napětí před zobrazením Game Over overlaye
          setTimeout(() => {
            io.to(code).emit('game_over', { winner });
          }, 2000); 
        } else {
          // Příprava na další kolo
          game.players.forEach(p => {
            p.answer = null;
            p.ready = false;
          });
          game.phase = 'waiting_for_ready';
          
          io.to(code).emit('waiting_for_ready');
        }
      }, 3000); // Tady je ta 3s pauza
    }
  });

  socket.on('playerReady', ({ code }) => {
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
      game.currentQuestion = getRandomQuestion();
      game.questionIndex += 1;
      game.players.forEach(p => p.ready = false);

      io.to(code).emit('next_question', {
        question: game.currentQuestion,
        positions: game.players.map(p => ({ id: p.id, role: p.role, position: p.position }))
      });
    }
  });

  // --- NOVÝ HANDLER PRO 'HRÁT ZNOVU' ---
  socket.on('play_again', ({ code }) => {
    // Zavoláme resetGame, což vrátí hráče do výběru rolí
    // Stačí, když to zmáčkne jeden, restartuje se to pro oba (což je pro plynulost lepší)
    resetGame(code);
  });

  // Starý rematch handler necháváme pro jistotu, kdyby se někde volal, ale nový UI používá play_again
  socket.on('requestRematch', ({ code }) => {
    const game = games.get(code);
    if (!game || game.phase !== 'finished') return;

    if (!game.rematchRequested) {
      game.rematchRequested = {};
    }

    game.rematchRequested[socket.id] = true;

    io.to(code).emit('rematch_status', {
      rematchRequested: Object.keys(game.rematchRequested).length,
      totalPlayers: game.players.length
    });

    if (game.players.length === 2 && game.players.every(player => game.rematchRequested[player.id])) {
      resetGame(code);
    }
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
║   Port: ${PORT}                            ║
║   Mode: Production                     ║
║   Socket.io: Active                    ║
╚════════════════════════════════════════╝
  `);
  console.log(`Visit: http://localhost:${PORT}`);
});