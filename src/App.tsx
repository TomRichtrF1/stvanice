import { useState, useEffect } from 'react';
import { useSocket } from './contexts/SocketContext';
import { useGameAudio } from './hooks/useGameAudio';
import Lobby from './components/Lobby';
import CategorySelection from './components/CategorySelection';
import WaitingRoom from './components/WaitingRoom';
import RoleSelection from './components/RoleSelection';
import CountdownWaiting from './components/CountdownWaiting';
import HeadstartSelection from './components/HeadstartSelection';
import GameBoard from './components/GameBoard';
import SpectatorView from './components/SpectatorView';
import FAQ from './components/FAQ';
import Success from './components/SuccessPage';
import { AlertCircle } from 'lucide-react';

/**
 * 🎮 FLOW v3.1:
 * 
 * HOSTITEL:
 * lobby → category_selection → waiting_for_player (LLM začíná) → role_selection → countdown (35s) → headstart → playing
 * 
 * HRÁČ 2:
 * lobby → [zadá kód] → role_selection → countdown (35s) → headstart → playing
 * 
 * ODVETA:
 * game_over → play_again → role_selection → headstart → playing (BEZ countdownu)
 */

type GamePhase = 
  | 'lobby' 
  | 'category_selection'
  | 'waiting_for_player'
  | 'role_selection' 
  | 'countdown'
  | 'headstart_selection' 
  | 'playing' 
  | 'finished';

interface Player {
  id: string;
  role: 'hunter' | 'prey' | null;
  position: number;
}

interface Question {
  question: string;
  options: string[];
  correct: number;
  _fromLLM?: boolean;
  _fromDb?: boolean;
}

interface AIProgress {
  generated: number;
  target: number;
  ready?: boolean;
}

function App() {
  // ✅ SUCCESS PAGE ROUTING
  const isSuccessPage = window.location.pathname.startsWith('/success');
  if (isSuccessPage) {
    return <Success />;
  }

  // ❓ FAQ ROUTING
  const isFAQMode = window.location.pathname.startsWith('/faq') || window.location.pathname.startsWith('/jak-hrat');
  if (isFAQMode) {
    return <FAQ />;
  }

  // 🎬 SPECTATOR MODE ROUTING
  const isSpectatorMode = window.location.pathname.startsWith('/divaci');
  if (isSpectatorMode) {
    return <SpectatorView />;
  }

  const { socket, connected } = useSocket();
  const { playAmbient, stopAmbient, playSfx } = useGameAudio();
  
  const [phase, setPhase] = useState<GamePhase>('lobby');
  
  // Nastavení hry
  const [ageGroup, setAgeGroup] = useState<string>('adult');
  const [gameMode, setGameMode] = useState<'adult' | 'kid'>('adult');
  
  // Countdown
  const [countdown, setCountdown] = useState<number>(35);
  const [aiProgress, setAiProgress] = useState<AIProgress>({ generated: 0, target: 8 });
  const [isRematch, setIsRematch] = useState<boolean>(false);
  
  // Hra
  const [roomCode, setRoomCode] = useState<string>('');
  const [myRole, setMyRole] = useState<'hunter' | 'prey' | null>(null);
  const [rolesLocked, setRolesLocked] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [playersCount, setPlayersCount] = useState<number>(1);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState<'hunter' | 'prey' | null>(null);
  const [roundResult, setRoundResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [disconnected, setDisconnected] = useState(false);
  const [isResyncing, setIsResyncing] = useState(false);

  // === AUDIO LOGIKA ===
  useEffect(() => {
    const shouldPlayAmbient = 
      phase === 'lobby' || 
      phase === 'category_selection' ||
      phase === 'waiting_for_player' ||
      phase === 'role_selection' || 
      phase === 'headstart_selection';

    // Countdown má vlastní audio
    if (phase === 'countdown') {
      stopAmbient();
      return;
    }

    if (shouldPlayAmbient) {
      playAmbient();
    } else {
      stopAmbient();
    }

    if (phase === 'playing' && !gameOver) {
      playSfx('gamestart.mp3');
    }

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

  // === SOCKET EVENTS ===
  useEffect(() => {
    if (!socket) return;
    
    // Hra vytvořena - jde do waiting_for_player
    socket.on('game_created', ({ code, ageGroup: group, phase: initialPhase }) => {
      console.log('🎮 Game created:', code, group);
      setRoomCode(code);
      setAgeGroup(group);
      setGameMode(group === 'adult' ? 'adult' : 'kid');
      setPlayersCount(1);
      setIsRematch(false);
      setPhase(initialPhase || 'waiting_for_player');
    });

    // Hráč 2 se připojil
    socket.on('game_joined', ({ code, ageGroup: group, phase: currentPhase }) => {
      console.log('🎮 Joined game:', code, group, currentPhase);
      setRoomCode(code);
      if (group) {
        setAgeGroup(group);
        setGameMode(group === 'adult' ? 'adult' : 'kid');
      }
      if (currentPhase) {
        setPhase(currentPhase);
      }
    });

    // Hráč přibyl
    socket.on('player_joined', ({ playersCount: count }) => {
      setPlayersCount(count);
    });

    // Countdown začal (po výběru role)
    socket.on('countdown_started', ({ countdown: initialCountdown, ageGroup: group }) => {
      console.log('⏱️ Countdown started:', initialCountdown);
      setCountdown(initialCountdown);
      setPhase('countdown');
    });
    
    // Countdown tick
    socket.on('countdown_tick', ({ remaining, aiProgress: progress, playersCount: count }) => {
      setCountdown(remaining);
      if (progress) {
        setAiProgress(progress);
      }
      if (count !== undefined) {
        setPlayersCount(count);
      }
    });

    // Countdown skončil
    socket.on('countdown_complete', ({ aiReady, questionCount }) => {
      console.log('⏰ Countdown complete, AI ready:', aiReady, 'questions:', questionCount);
    });

    // Odveta začala
    socket.on('rematch_started', ({ isRematch: rematch }) => {
      console.log('🔄 Rematch started');
      setIsRematch(rematch);
      setMyRole(null);
      setRolesLocked(false);
    });

    socket.on('start_resolution', () => {
      playSfx('resolution.mp3');
    });
    
    socket.on('settings_changed', (settings: any) => {
      if (settings.ageGroup) {
        setAgeGroup(settings.ageGroup);
        setGameMode(settings.ageGroup === 'adult' ? 'adult' : 'kid');
      }
    });

    socket.on('phase_change', ({ phase: newPhase }) => {
      console.log('📍 Phase change:', newPhase);
      setPhase(newPhase);
      if (newPhase === 'role_selection' || newPhase === 'headstart_selection') {
        setGameOver(false); 
        setWinner(null); 
        setRoundResult(null); 
        setCurrentQuestion(null);
      }
    });

    socket.on('roles_updated', ({ players: updatedPlayers }) => {
      const me = updatedPlayers.find((p: any) => p.id === socket.id);
      if (me) setMyRole(me.role);
      const allRolesAssigned = updatedPlayers.every((p: any) => p.role !== null);
      setRolesLocked(allRolesAssigned);
    });

    socket.on('game_start', ({ headstart, positions, question }) => {
      setPlayers(positions); 
      setCurrentQuestion(question); 
      setPhase('playing'); 
      setRoundResult(null); 
      setGameOver(false);
    });

    socket.on('round_results', ({ results, correctAnswer }) => {
      setRoundResult({ results, correctAnswer }); 
      setPlayers(results.map((r: any) => ({ id: r.id, role: r.role, position: r.position })));
    });

    socket.on('next_question', ({ question, positions }) => {
      setCurrentQuestion(question); 
      setPlayers(positions); 
      setRoundResult(null);
    });

    socket.on('game_over', ({ winner: gameWinner }) => {
      setWinner(gameWinner); 
      setGameOver(true);
    });

    socket.on('error', ({ message }) => {
      setError(message); 
      setTimeout(() => setError(null), 3000);
    });

    socket.on('player_disconnected', () => { 
      setDisconnected(true); 
    });

    socket.on('player_connection_unstable', ({ gracePeriod }) => {
      console.log(`⚠️ Soupeř má nestabilní připojení (grace period: ${gracePeriod/1000}s)`);
    });

    socket.on('game_state_sync', (state) => {
      console.log('🔄 Game state sync:', state);
      setIsResyncing(false);
      
      if (state.phase) setPhase(state.phase);
      if (state.players) {
        setPlayers(state.players);
        setPlayersCount(state.players.length);
        const me = state.players.find((p: any) => p.id === socket.id);
        if (me && me.role) setMyRole(me.role);
      }
      if (state.currentQuestion) setCurrentQuestion(state.currentQuestion);
      if (state.countdown !== undefined) setCountdown(state.countdown);
      if (state.settings) {
        if (state.settings.ageGroup) {
          setAgeGroup(state.settings.ageGroup);
          setGameMode(state.settings.ageGroup === 'adult' ? 'adult' : 'kid');
        }
      }
      if (state.aiProgress) setAiProgress(state.aiProgress);
    });

    return () => {
      socket.off('game_created');
      socket.off('game_joined');
      socket.off('player_joined');
      socket.off('countdown_started');
      socket.off('countdown_tick');
      socket.off('countdown_complete');
      socket.off('rematch_started');
      socket.off('settings_changed');
      socket.off('phase_change'); 
      socket.off('roles_updated');
      socket.off('game_start'); 
      socket.off('round_results'); 
      socket.off('next_question'); 
      socket.off('game_over');
      socket.off('error'); 
      socket.off('player_disconnected');
      socket.off('start_resolution');
      socket.off('player_connection_unstable');
      socket.off('game_state_sync');
    };
  }, [socket]);

  // Visibility change handler
  useEffect(() => {
    if (!socket || !roomCode) return;
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        socket.emit('player_paused', { code: roomCode });
      } else {
        console.log('👁️ Uživatel se vrátil, žádám resync...');
        setIsResyncing(true);
        socket.emit('player_resumed', { code: roomCode });
        setTimeout(() => setIsResyncing(false), 2000);
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [socket, roomCode]);

  // === HANDLERS ===
  
  const handleCreateGame = () => {
    playAmbient();
    setPhase('category_selection');
  };

  const handleSelectCategoryAndCreate = (selectedAgeGroup: string) => {
    socket?.emit('create_game_with_category', { ageGroup: selectedAgeGroup });
  };

  const handleBackToLobby = () => {
    setPhase('lobby');
  };

  const handleJoinGame = (code: string) => {
    playAmbient();
    socket?.emit('join_game', code);
  };

  const handleCountdownEnd = () => {
    console.log('⏰ Countdown end (client-side)');
  };

  const handleSelectRole = (role: 'hunter' | 'prey') => {
    socket?.emit('select_role', { code: roomCode, role });
  };
  
  const handleSelectHeadstart = (headstart: number) => {
    socket?.emit('select_headstart', { code: roomCode, headstart });
  };
  
  const handleSubmitAnswer = (answerIndex: number) => {
    socket?.emit('submit_answer', { code: roomCode, answerIndex });
  };
  
  const handlePlayAgain = () => {
    socket?.emit('play_again', { code: roomCode });
  };

  // === LOADING STATE ===
  if (!connected) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-white text-xl">Připojování k serveru...</p>
        </div>
      </div>
    );
  }

  // === RESYNCING STATE ===
  if (isResyncing) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-white text-xl">Synchronizace...</p>
        </div>
      </div>
    );
  }

  // === DISCONNECTED STATE ===
  if (disconnected) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6 text-center animate-fade-in">
          <AlertCircle className="w-20 h-20 text-red-500 mx-auto" />
          <h2 className="text-3xl font-bold text-white">Soupeř se odpojil</h2>
          <p className="text-slate-400">Hra byla ukončena</p>
          <button 
            onClick={() => window.location.reload()} 
            className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold py-4 px-8 rounded-xl text-xl shadow-lg shadow-cyan-500/50 transition-all transform hover:scale-105"
          >
            ZPĚT DO LOBBY
          </button>
        </div>
      </div>
    );
  }

  // === RENDER ===
  return (
    <>
      {/* Error toast */}
      {error && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 animate-slide-down">
          <div className="bg-red-600 text-white px-6 py-3 rounded-xl shadow-lg flex items-center gap-2">
            <AlertCircle size={20} />
            <span className="font-semibold">{error}</span>
          </div>
        </div>
      )}
      
      {/* LOBBY */}
      {phase === 'lobby' && (
        <Lobby onCreateGame={handleCreateGame} onJoinGame={handleJoinGame} />
      )}
      
      {/* VÝBĚR KATEGORIE */}
      {phase === 'category_selection' && (
        <CategorySelection 
          onSelectAndCreate={handleSelectCategoryAndCreate}
          onBack={handleBackToLobby}
        />
      )}
      
      {/* ČEKÁNÍ NA HRÁČE 2 */}
      {phase === 'waiting_for_player' && (
        <WaitingRoom roomCode={roomCode} socket={socket} />
      )}
      
      {/* VÝBĚR ROLE */}
      {phase === 'role_selection' && (
        <RoleSelection 
          onSelectRole={handleSelectRole} 
          selectedRole={myRole} 
          rolesLocked={rolesLocked}
          ageGroup={ageGroup}
          roomCode={roomCode}
        />
      )}

      {/* COUNTDOWN (po výběru role) */}
      {phase === 'countdown' && (
        <CountdownWaiting
          roomCode={roomCode}
          countdown={countdown}
          playersCount={playersCount}
          ageGroup={ageGroup}
          aiProgress={aiProgress}
          onCountdownEnd={handleCountdownEnd}
        />
      )}
      
      {/* HEADSTART SELECTION */}
      {phase === 'headstart_selection' && (
        <HeadstartSelection 
          isPreyPlayer={myRole === 'prey'} 
          onSelectHeadstart={handleSelectHeadstart} 
        />
      )}
      
      {/* GAME BOARD */}
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
