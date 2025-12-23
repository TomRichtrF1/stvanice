import { useState, useEffect } from 'react';
import { useSocket } from './contexts/SocketContext';
import { useGameAudio } from './hooks/useGameAudio';
import Lobby from './components/Lobby';
import WaitingRoom from './components/WaitingRoom';
import TopicSelection from './components/TopicSelection'; // ✅ NOVÝ IMPORT
import SuccessPage from './components/SuccessPage'; // ✅ STRIPE SUCCESS PAGE
import RoleSelection from './components/RoleSelection';
import HeadstartSelection from './components/HeadstartSelection';
import GameBoard from './components/GameBoard';
import { AlertCircle } from 'lucide-react';

type GamePhase = 'lobby' | 'waiting' | 'topic_selection' | 'role_selection' | 'headstart_selection' | 'playing' | 'finished';

interface Player {
  id: string;
  role: 'hunter' | 'prey' | null;
  position: number;
}

interface Question {
  question: string;
  options: string[];
  correct: number;
}

function App() {
  const { socket, connected } = useSocket();
  const { playAmbient, stopAmbient, playSfx } = useGameAudio();
  
  const [phase, setPhase] = useState<GamePhase>('lobby');
  // Zde ukládáme informaci o módu (defaultně adult)
  const [gameMode, setGameMode] = useState<'adult' | 'kid'>('adult');
  
  const [roomCode, setRoomCode] = useState<string>('');
  const [myRole, setMyRole] = useState<'hunter' | 'prey' | null>(null);
  const [rolesLocked, setRolesLocked] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState<'hunter' | 'prey' | null>(null);
  const [roundResult, setRoundResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [disconnected, setDisconnected] = useState(false);

  // === AUDIO LOGIKA PRO APP ===
  useEffect(() => {
    // 1. Rozhodneme, zda má hrát ambient
    const shouldPlayAmbient = 
      phase === 'lobby' || 
      phase === 'waiting' || 
      phase === 'topic_selection' || // ✅ PŘIDÁNO
      phase === 'role_selection' || 
      phase === 'headstart_selection';

    if (shouldPlayAmbient) {
      playAmbient();
    } else {
      stopAmbient();
    }

    // 2. Startovní znělka
    if (phase === 'playing' && !gameOver) {
       playSfx('gamestart.mp3');
    }

    // 3. OCHRANA PROTI "AUTOPLAY POLICY"
    const handleUserInteraction = () => {
      if (shouldPlayAmbient) {
        playAmbient();
      }
    };

    window.addEventListener('click', handleUserInteraction);
    return () => {
      window.removeEventListener('click', handleUserInteraction);
    };
  }, [phase, gameOver, playAmbient, stopAmbient, playSfx]);
  // ============================

  useEffect(() => {
    if (!socket) return;
    
    socket.on('game_created', ({ code }) => { setRoomCode(code); setPhase('waiting'); });
    socket.on('game_joined', ({ code }) => { setRoomCode(code); });

    // === NOVÉ: Tady pustíme zvuk hned, jakmile server řekne ===
    socket.on('start_resolution', () => {
      playSfx('resolution.mp3');
  });
    
    // === NOVÉ: Posloucháme změnu nastavení (Kid/Adult) ===
    socket.on('settings_changed', (settings: any) => {
        setGameMode(settings.mode);
    });

    socket.on('phase_change', ({ phase: newPhase }) => {
      setPhase(newPhase);
      if (newPhase === 'role_selection' || newPhase === 'headstart_selection') {
        setGameOver(false); setWinner(null); setRoundResult(null); setCurrentQuestion(null);
      }
    });
    socket.on('roles_updated', ({ players: updatedPlayers }) => {
      const me = updatedPlayers.find((p: any) => p.id === socket.id);
      if (me) setMyRole(me.role);
      const allRolesAssigned = updatedPlayers.every((p: any) => p.role !== null);
      setRolesLocked(allRolesAssigned);
    });
    socket.on('game_start', ({ headstart, positions, question }) => {
      setPlayers(positions); setCurrentQuestion(question); setPhase('playing'); setRoundResult(null); setGameOver(false);
    });
    socket.on('round_results', ({ results, correctAnswer }) => {
      setRoundResult({ results, correctAnswer }); setPlayers(results.map((r: any) => ({ id: r.id, role: r.role, position: r.position })));
    });
    socket.on('next_question', ({ question, positions }) => {
      setCurrentQuestion(question); setPlayers(positions); setRoundResult(null);
    });
    socket.on('game_over', ({ winner: gameWinner }) => {
      setWinner(gameWinner); setGameOver(true);
    });
    socket.on('error', ({ message }) => {
      setError(message); setTimeout(() => setError(null), 3000);
    });
    socket.on('player_disconnected', () => { setDisconnected(true); });

    return () => {
      socket.off('game_created'); socket.off('game_joined'); 
      socket.off('settings_changed'); // Nezapomenout vyčistit
      socket.off('phase_change'); socket.off('roles_updated');
      socket.off('game_start'); socket.off('round_results'); socket.off('next_question'); socket.off('game_over');
      socket.off('error'); socket.off('player_disconnected');
    };
  }, [socket]);

  const handleCreateGame = () => {
    playAmbient(); 
    socket?.emit('create_game');
  };

  const handleJoinGame = (code: string) => {
    playAmbient();
    socket?.emit('join_game', code);
  };

  const handleSelectRole = (role: 'hunter' | 'prey') => socket?.emit('select_role', { code: roomCode, role });
  const handleSelectHeadstart = (headstart: number) => socket?.emit('select_headstart', { code: roomCode, headstart });
  const handleSubmitAnswer = (answerIndex: number) => socket?.emit('submit_answer', { code: roomCode, answerIndex });
  const handlePlayAgain = () => socket?.emit('play_again', { code: roomCode });

  if (!connected) return <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4"><div className="text-center space-y-4"><div className="w-16 h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto"></div><p className="text-white text-xl">Připojování k serveru...</p></div></div>;
  if (disconnected) return <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4"><div className="w-full max-w-md space-y-6 text-center animate-fade-in"><AlertCircle className="w-20 h-20 text-red-500 mx-auto" /><h2 className="text-3xl font-bold text-white">Soupeř se odpojil</h2><p className="text-slate-400">Hra byla ukončena</p><button onClick={() => window.location.reload()} className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold py-4 px-8 rounded-xl text-xl shadow-lg shadow-cyan-500/50 transition-all transform hover:scale-105">ZPĚT DO LOBBY</button></div></div>;

  // ✅ STRIPE SUCCESS PAGE
  const isSuccessPage = window.location.pathname === '/success';
  if (isSuccessPage) {
    return <SuccessPage />;
  }

  return (
    <>
      {error && <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 animate-slide-down"><div className="bg-red-600 text-white px-6 py-3 rounded-xl shadow-lg flex items-center gap-2"><AlertCircle size={20} /><span className="font-semibold">{error}</span></div></div>}
      
      {phase === 'lobby' && <Lobby onCreateGame={handleCreateGame} onJoinGame={handleJoinGame} />}
      
      {phase === 'waiting' && <WaitingRoom roomCode={roomCode} socket={socket} />}
      
      {/* ✅ NOVÁ FÁZE - VÝBĚR TÉMATU */}
      {phase === 'topic_selection' && (
        <TopicSelection 
          roomCode={roomCode} 
          socket={socket}
          onTopicSelected={(topic) => {
            console.log('✅ Téma vybráno:', topic);
            // Socket událost už je odeslána v TopicSelection,
            // server automaticky změní fázi na 'role_selection'
          }}
        />
      )}
      
      {phase === 'role_selection' && <RoleSelection onSelectRole={handleSelectRole} selectedRole={myRole} rolesLocked={rolesLocked} />}
      {phase === 'headstart_selection' && <HeadstartSelection isPreyPlayer={myRole === 'prey'} onSelectHeadstart={handleSelectHeadstart} />}
      
      {/* ZDE PŘEDÁVÁME NOVĚ I 'gameMode' */}
      {(phase === 'playing' || phase === 'finished') && myRole && (
        <GameBoard 
            myRole={myRole} 
            players={players} 
            currentQuestion={currentQuestion} 
            onSubmitAnswer={handleSubmitAnswer} 
            gameOver={gameOver} 
            winner={winner} 
            roundResult={roundResult} 
            roomCode={roomCode} 
            onRestart={handlePlayAgain} 
            gameMode={gameMode} 
        />
      )}
    </>
  );
}

export default App;