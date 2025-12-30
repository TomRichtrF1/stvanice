import { useState, useEffect, useRef } from 'react';
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
import { AlertCircle, Home, RefreshCw } from 'lucide-react';

/**
 * 🎮 FLOW v4.1: OPRAVY BUG10-15
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
  const isSuccessPage = window.location.pathname.startsWith('/success');
  if (isSuccessPage) return <Success />;

  const isFAQMode = window.location.pathname.startsWith('/faq') || window.location.pathname.startsWith('/jak-hrat');
  if (isFAQMode) return <FAQ />;

  const isSpectatorMode = window.location.pathname.startsWith('/divaci');
  if (isSpectatorMode) return <SpectatorView />;

  const { socket, connected } = useSocket();
  const { playAmbient, stopAmbient, playSfx } = useGameAudio();
  
  const playSfxRef = useRef(playSfx);
  useEffect(() => {
    playSfxRef.current = playSfx;
  }, [playSfx]);
  
  const [phase, setPhase] = useState<GamePhase>('lobby');
  const [ageGroup, setAgeGroup] = useState<string>('adult');
  const [gameMode, setGameMode] = useState<'adult' | 'kid'>('adult');
  const [countdown, setCountdown] = useState<number>(35);
  const [aiProgress, setAiProgress] = useState<AIProgress>({ generated: 0, target: 5 });
  const [isRematch, setIsRematch] = useState<boolean>(false);
  
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
  
  // 🆕 BUG15: Stav pro opuštění hry soupeřem
  const [playerLeft, setPlayerLeft] = useState<{ reason: string; leftPlayer: string } | null>(null);

  // === AUDIO LOGIKA ===
  useEffect(() => {
    const shouldPlayAmbient = 
      phase === 'lobby' || 
      phase === 'category_selection' ||
      phase === 'waiting_for_player' ||
      phase === 'role_selection' || 
      phase === 'headstart_selection';

    if (phase === 'countdown') {
      stopAmbient();
      return;
    }

    if (shouldPlayAmbient) {
      playAmbient();
    } else {
      stopAmbient();
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

  // UKLÁDÁNÍ SESSION
  useEffect(() => {
    if (socket && socket.id) {
      sessionStorage.setItem('last_socket_id', socket.id);
    }
    if (roomCode) {
      sessionStorage.setItem('last_room_code', roomCode);
    }
  }, [socket?.id, roomCode]);

  // === SOCKET EVENTS ===
  useEffect(() => {
    if (!socket) return;

    const handleConnect = () => {
      console.log('🔌 Socket připojen, kontroluji session...');
      const lastSocketId = sessionStorage.getItem('last_socket_id');
      const lastRoomCode = sessionStorage.getItem('last_room_code');
      
      if (lastRoomCode && lastSocketId && socket.id !== lastSocketId) {
        console.log(`🔄 Zjištěna přerušená relace, žádám o rejoin do ${lastRoomCode}`);
        setIsResyncing(true);
        socket.emit('rejoin_game', { 
          roomCode: lastRoomCode, 
          oldSocketId: lastSocketId 
        });
      }
    };

    socket.on('connect', handleConnect);
    
    if (socket.connected) {
      handleConnect();
    }

    socket.on('rejoin_failed', ({ message }) => {
      console.log('❌ Rejoin failed:', message);
      setIsResyncing(false);
      sessionStorage.removeItem('last_socket_id');
      sessionStorage.removeItem('last_room_code');
      setPhase('lobby');
      setRoomCode('');
      setError(message);
    });

    socket.on('player_connection_restored', ({ playerId }) => {
      console.log('✅ Hráč se vrátil:', playerId);
    });
    
    socket.on('game_created', ({ code, ageGroup: group, phase: initialPhase }) => {
      setRoomCode(code);
      setAgeGroup(group);
      setGameMode(group === 'adult' ? 'adult' : 'kid');
      setPlayersCount(1);
      setIsRematch(false);
      setPlayerLeft(null);
      setPhase(initialPhase || 'waiting_for_player');
    });

    socket.on('game_joined', ({ code, ageGroup: group, phase: currentPhase }) => {
      setRoomCode(code);
      setPlayerLeft(null);
      if (group) {
        setAgeGroup(group);
        setGameMode(group === 'adult' ? 'adult' : 'kid');
      }
      if (currentPhase) {
        setPhase(currentPhase);
      }
    });

    socket.on('player_joined', ({ playersCount: count }) => {
      setPlayersCount(count);
    });

    socket.on('countdown_started', ({ countdown: initialCountdown, ageGroup: group, aiProgress: progress }) => {
      setCountdown(initialCountdown);
      setPhase('countdown');
      if (progress) {
        setAiProgress(progress);
      }
    });
    
    socket.on('countdown_tick', ({ remaining, aiProgress: progress, playersCount: count }) => {
      setCountdown(remaining);
      if (progress) setAiProgress(progress);
      if (count !== undefined) setPlayersCount(count);
    });

    socket.on('countdown_complete', () => {});

    socket.on('rematch_started', ({ isRematch: rematch }) => {
      console.log('🔄 Rematch started event přijat');
      setIsRematch(rematch);
      setMyRole(null);
      setRolesLocked(false);
      setGameOver(false);
      setWinner(null);
      setRoundResult(null);
      setCurrentQuestion(null);
      setPlayers([]);
      setPlayerLeft(null);
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
      console.log(`📍 Phase change: ${newPhase}`);
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

    socket.on('game_start', ({ positions, question }) => {
      setPlayers(positions); 
      setCurrentQuestion(question); 
      setPhase('playing'); 
      setRoundResult(null); 
      setGameOver(false);
      playSfxRef.current('gamestart.mp3');
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
      sessionStorage.removeItem('last_socket_id');
      sessionStorage.removeItem('last_room_code');
    });

    socket.on('player_connection_unstable', ({ gracePeriod }) => {
      console.log(`⚠️ Soupeř má nestabilní připojení`);
    });

    // 🆕 BUG15: Handler pro opuštění hry soupeřem
    socket.on('player_left_game', ({ reason, leftPlayer }) => {
      console.log(`👋 Soupeř opustil hru: ${reason}`);
      setPlayerLeft({ reason, leftPlayer });
    });

    socket.on('player_ready_update', ({ players: updatedPlayers }) => {
      console.log('📤 player_ready_update:', updatedPlayers);
    });

    socket.on('game_state_sync', (state) => {
      console.log('🔄 Game state sync:', state);
      setIsResyncing(false);
      
      if (state.phase) setPhase(state.phase);
      if (state.roomCode) setRoomCode(state.roomCode);
      if (state.players) {
        setPlayers(state.players);
        setPlayersCount(state.playersCount || state.players.length);
      }
      
      if (state.myRole !== undefined) {
        setMyRole(state.myRole);
      } else if (state.players) {
        const me = state.players.find((p: any) => p.id === socket.id);
        if (me) setMyRole(me.role);
      }
      
      if (state.rolesLocked !== undefined) setRolesLocked(state.rolesLocked);
      if (state.currentQuestion) setCurrentQuestion(state.currentQuestion);
      if (state.countdown !== undefined) setCountdown(state.countdown);
      if (state.aiProgress) setAiProgress(state.aiProgress);
      
      if (state.ageGroup) {
        setAgeGroup(state.ageGroup);
        setGameMode(state.ageGroup === 'adult' ? 'adult' : 'kid');
      } else if (state.settings?.ageGroup) {
        setAgeGroup(state.settings.ageGroup);
        setGameMode(state.settings.ageGroup === 'adult' ? 'adult' : 'kid');
      }
      
      if (state.isRematch !== undefined) setIsRematch(state.isRematch);
      if (state.winner !== undefined) setWinner(state.winner);
      if (state.gameOver !== undefined) setGameOver(state.gameOver);
    });

    return () => {
      socket.off('connect');
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
      socket.off('rejoin_failed');
      socket.off('player_connection_restored');
      socket.off('player_ready_update');
      socket.off('player_left_game');
    };
  }, [socket]);

  // 🆕 BUG15: VISIBILITY CHANGE - 60s timeout při přepnutí okna
  useEffect(() => {
    if (!socket || !roomCode) return;
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        console.log('👁️ Okno skryto - odesílám player_visibility_hidden');
        socket.emit('player_visibility_hidden', { code: roomCode });
      } else {
        console.log('👁️ Okno viditelné - odesílám player_visibility_visible');
        socket.emit('player_visibility_visible', { code: roomCode });
        
        // Také požádat o resync stavu
        const lastSocketId = sessionStorage.getItem('last_socket_id');
        if (socket.id === lastSocketId) {
          socket.emit('player_resumed', { code: roomCode });
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [socket, roomCode]);

  // 🆕 BUG15: DETEKCE RELOADU/ZAVŘENÍ - okamžité oznámení
  useEffect(() => {
    if (!socket || !roomCode) return;
    
    const handleBeforeUnload = () => {
      console.log('👋 Reload/zavření detekováno, odesílám player_leaving...');
      socket.emit('player_leaving', { code: roomCode });
      
      sessionStorage.removeItem('last_socket_id');
      sessionStorage.removeItem('last_room_code');
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
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

  const handleCountdownEnd = () => {};

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
    console.log('🔄 Odesílám play_again request');
    socket?.emit('play_again', { code: roomCode });
  };

  // 🆕 BUG15: Handler pro návrat na začátek po opuštění hry soupeřem
  const handleReturnToLobby = () => {
    setPlayerLeft(null);
    setPhase('lobby');
    setRoomCode('');
    setMyRole(null);
    setPlayers([]);
    setCurrentQuestion(null);
    setGameOver(false);
    setWinner(null);
    setRoundResult(null);
    setIsRematch(false);
    sessionStorage.removeItem('last_socket_id');
    sessionStorage.removeItem('last_room_code');
  };

  // === LOADING STATES ===
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

  // 🆕 BUG15: Obrazovka když soupeř opustil hru
  if (playerLeft) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6 text-center animate-fade-in">
          <AlertCircle className="w-20 h-20 text-yellow-500 mx-auto" />
          <h2 className="text-3xl font-bold text-white">Soupeř opustil hru</h2>
          <p className="text-slate-400">{playerLeft.reason}</p>
          <div className="space-y-3">
            <button 
              onClick={handleReturnToLobby}
              className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold py-4 px-8 rounded-xl text-xl shadow-lg shadow-cyan-500/50 flex items-center justify-center gap-3"
            >
              <Home size={24} />
              ZALOŽIT NOVOU HRU
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (disconnected) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6 text-center animate-fade-in">
          <AlertCircle className="w-20 h-20 text-red-500 mx-auto" />
          <h2 className="text-3xl font-bold text-white">Spojení přerušeno</h2>
          <p className="text-slate-400">Hra byla ukončena</p>
          <button 
            onClick={() => window.location.reload()} 
            className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold py-4 px-8 rounded-xl text-xl shadow-lg shadow-cyan-500/50 flex items-center justify-center gap-3 mx-auto"
          >
            <RefreshCw size={24} />
            ZKUSIT ZNOVU
          </button>
        </div>
      </div>
    );
  }

  // === RENDER ===
  return (
    <>
      {error && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 animate-slide-down">
          <div className="bg-red-600 text-white px-6 py-3 rounded-xl shadow-lg flex items-center gap-2">
            <AlertCircle size={20} />
            <span className="font-semibold">{error}</span>
          </div>
        </div>
      )}
      
      {phase === 'lobby' && (
        <Lobby onCreateGame={handleCreateGame} onJoinGame={handleJoinGame} />
      )}
      
      {phase === 'category_selection' && (
        <CategorySelection 
          onSelectAndCreate={handleSelectCategoryAndCreate}
          onBack={handleBackToLobby}
        />
      )}
      
      {phase === 'waiting_for_player' && (
        <WaitingRoom roomCode={roomCode} socket={socket} />
      )}
      
      {phase === 'role_selection' && (
        <RoleSelection 
          onSelectRole={handleSelectRole} 
          selectedRole={myRole} 
          rolesLocked={rolesLocked}
          ageGroup={ageGroup}
          roomCode={roomCode}
        />
      )}

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
      
      {phase === 'headstart_selection' && (
        <HeadstartSelection 
          isPreyPlayer={myRole === 'prey'} 
          onSelectHeadstart={handleSelectHeadstart} 
        />
      )}
      
      {/* GAME BOARD */}
      {(phase === 'playing' || phase === 'finished') && (
        myRole ? (
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
        ) : (
          <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
            <div className="text-center space-y-4">
              <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="text-white text-xl">Načítám herní data...</p>
            </div>
          </div>
        )
      )}
    </>
  );
}

export default App;
