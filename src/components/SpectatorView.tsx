import { useState, useEffect, useRef } from 'react';
import { Eye, AlertCircle, Loader, Trophy, Check, X, Clock, Home, HelpCircle, Ticket } from 'lucide-react';
import { io, Socket } from 'socket.io-client';

interface Player {
  id: string;
  role: 'hunter' | 'prey' | null;
  position: number;
  answer: number | null;
  ready: boolean;
}

interface Question {
  question: string;
  options: string[];
  correct: number;
  _fromLLM?: boolean;
  _fromDb?: boolean;
}

// 🆕 Opravený interface s ageGroup
interface GameState {
  phase: string;
  players: Player[];
  currentQuestion: Question | null;
  settings: {
    ageGroup?: string;  // 🆕 Nové pole
    mode?: 'adult' | 'kid';  // Legacy
    topic?: string;  // Legacy
  };
  headstart: number | null;
  countdown?: number;  // 🆕 Pro countdown fázi
  aiProgress?: { generated: number; target: number };  // 🆕
}

// 🆕 Mapování věkových skupin na zobrazení
const AGE_GROUP_LABELS: Record<string, { emoji: string; name: string }> = {
  adult: { emoji: '👔', name: 'DOSPĚLÍ' },
  student: { emoji: '🎒', name: 'ŠKOLÁCI' },
  kids: { emoji: '🐣', name: 'DĚTI' },
  // Legacy mappings
  teen: { emoji: '🎒', name: 'ŠKOLÁCI' },
  child: { emoji: '🐣', name: 'DĚTI' },
  preschool: { emoji: '🐣', name: 'DĚTI' }
};

export default function SpectatorView() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [gameCode, setGameCode] = useState('');
  const [premiumCode, setPremiumCode] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  // 🆕 Stav pro ukončenou hru
  const [gameEnded, setGameEnded] = useState(false);
  const [gameEndReason, setGameEndReason] = useState<string>('');
  
  // Game state
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [hunterAnswer, setHunterAnswer] = useState<number | null>(null);
  const [preyAnswer, setPreyAnswer] = useState<number | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [correctAnswer, setCorrectAnswer] = useState<number | null>(null);
  const [winner, setWinner] = useState<'hunter' | 'prey' | null>(null);
  
  // Animované pozice
  const [displayHunterPos, setDisplayHunterPos] = useState(0);
  const [displayPreyPos, setDisplayPreyPos] = useState(0);

  // 🆕 Countdown state
  const [countdown, setCountdown] = useState(0);
  
  // 🆕 KOMPLETNÍ AUDIO REFS
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({
    step: null,
    resolution: null,
    countdown: null,
    danger: null,
    failure: null,
    gamestart: null,
    hope: null,
    ticktack: null,
    triumph: null,
    waitingroom: null
  });
  
  const countdownAudioStarted = useRef(false);

  // 🆕 Inicializace VŠECH audio souborů
  useEffect(() => {
    audioRefs.current = {
      step: new Audio('/sounds/step.mp3'),
      resolution: new Audio('/sounds/resolution.mp3'),
      countdown: new Audio('/sounds/countdown.mp3'),
      danger: new Audio('/sounds/danger.mp3'),
      failure: new Audio('/sounds/failure.mp3'),
      gamestart: new Audio('/sounds/gamestart.mp3'),
      hope: new Audio('/sounds/hope.mp3'),
      ticktack: new Audio('/sounds/ticktack.mp3'),
      triumph: new Audio('/sounds/triumph.mp3'),
      waitingroom: new Audio('/sounds/waitingroom.mp3')
    };
    
    // Nastavit hlasitost
    Object.values(audioRefs.current).forEach(audio => {
      if (audio) audio.volume = 0.7;
    });
  }, []);

  // 🆕 Funkce pro přehrání zvuku
  const playSound = (sound: string) => {
    try {
      const audio = audioRefs.current[sound];
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      }
    } catch (e) {
      console.log('Audio error:', e);
    }
  };

  // 🆕 Zastavení zvuku
  const stopSound = (sound: string) => {
    try {
      const audio = audioRefs.current[sound];
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
    } catch (e) {}
  };

  // Socket connection
  useEffect(() => {
    const newSocket = io(window.location.origin, {
      transports: ['websocket', 'polling']
    });
    
    newSocket.on('connect', () => {
      console.log('🔌 Socket připojen:', newSocket.id);
      setSocketConnected(true);
    });
    
    newSocket.on('disconnect', () => {
      console.log('🔌 Socket odpojen');
      setSocketConnected(false);
    });
    
    newSocket.on('connect_error', (err) => {
      console.error('🔌 Socket connection error:', err);
      setError('Chyba připojení k serveru');
    });
    
    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  // Auto-reconnect ze sessionStorage
  useEffect(() => {
    if (!socket || !socketConnected || isConnected) return;
    
    const savedGameCode = sessionStorage.getItem('spectator_gameCode');
    const savedPremiumCode = sessionStorage.getItem('spectator_premiumCode');
    
    if (savedGameCode && savedPremiumCode) {
      console.log('🔄 Auto-reconnect z sessionStorage:', savedGameCode);
      setGameCode(savedGameCode);
      setPremiumCode(savedPremiumCode);
      
      setTimeout(() => {
        setLoading(true);
        socket.emit('join_as_spectator', { 
          gameCode: savedGameCode, 
          premiumCode: savedPremiumCode 
        });
      }, 100);
    }
  }, [socket, socketConnected, isConnected]);

  // Visibility change - reconnect při návratu na stránku
  useEffect(() => {
    if (!socket) return;
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const savedGameCode = sessionStorage.getItem('spectator_gameCode');
        const savedPremiumCode = sessionStorage.getItem('spectator_premiumCode');
        
        if (savedGameCode && savedPremiumCode && !isConnected) {
          console.log('👁️ Stránka aktivní, zkouším reconnect...');
          setLoading(true);
          setError(null);
          
          socket.emit('join_as_spectator', { 
            gameCode: savedGameCode, 
            premiumCode: savedPremiumCode 
          });
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [socket, isConnected]);

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    socket.on('spectator_joined', (state: GameState) => {
      console.log('🎬 Spectator joined:', state);
      setGameState(state);
      setIsConnected(true);
      setLoading(false);
      setError(null);
      
      sessionStorage.setItem('spectator_gameCode', gameCode.toUpperCase());
      sessionStorage.setItem('spectator_premiumCode', premiumCode.toUpperCase());
      
      const hunter = state.players.find(p => p.role === 'hunter');
      const prey = state.players.find(p => p.role === 'prey');
      if (hunter) setDisplayHunterPos(hunter.position);
      if (prey) setDisplayPreyPos(prey.position);
      
      if (state.countdown) setCountdown(state.countdown);
    });

    socket.on('spectator_error', ({ message }) => {
      console.log('🎬 Spectator error:', message);
      setError(message);
      setLoading(false);
    });

    socket.on('spectator_state', (state: GameState) => {
      setGameState(state);
      if (state.countdown) setCountdown(state.countdown);
    });

    // 🆕 Countdown events
    socket.on('countdown_started', ({ countdown: c }) => {
      setCountdown(c);
      countdownAudioStarted.current = false;
    });

    socket.on('countdown_tick', ({ remaining, aiProgress }) => {
      setCountdown(remaining);
      
      // 🔊 Spustit countdown audio při 30s
      if (remaining <= 30 && remaining > 0 && !countdownAudioStarted.current) {
        countdownAudioStarted.current = true;
        playSound('countdown');
      }
      
      if (aiProgress) {
        setGameState(prev => prev ? { ...prev, aiProgress } : null);
      }
    });

    socket.on('countdown_complete', () => {
      countdownAudioStarted.current = false;
    });

    socket.on('phase_change', ({ phase }) => {
      setGameState(prev => prev ? { ...prev, phase } : null);
      
      if (phase === 'role_selection') {
        setWinner(null);
        setHunterAnswer(null);
        setPreyAnswer(null);
        setShowResults(false);
        setCorrectAnswer(null);
        setDisplayHunterPos(0);
        setDisplayPreyPos(0);
        countdownAudioStarted.current = false;
      }
      
      if (phase === 'playing' || phase === 'waiting_for_ready') {
        setHunterAnswer(null);
        setPreyAnswer(null);
        setShowResults(false);
        setCorrectAnswer(null);
      }
    });

    socket.on('next_question', ({ question, positions }) => {
      setGameState(prev => {
        if (!prev) return null;
        const updatedPlayers = prev.players.map(p => {
          const pos = positions.find((pos: any) => pos.id === p.id);
          return pos ? { ...p, position: pos.position } : p;
        });
        return { ...prev, phase: 'playing', currentQuestion: question, players: updatedPlayers };
      });
      setHunterAnswer(null);
      setPreyAnswer(null);
      setShowResults(false);
      setCorrectAnswer(null);
      // Poznámka: gamestart zvuk hraje při game_start, ne při každé otázce
    });

    socket.on('spectator_player_answered', ({ role, answerIndex }) => {
      console.log(`🎬 ${role} answered: ${answerIndex}`);
      if (role === 'hunter') setHunterAnswer(answerIndex);
      if (role === 'prey') setPreyAnswer(answerIndex);
    });

    socket.on('start_resolution', () => {
      playSound('resolution');
    });

    socket.on('round_results', ({ results, correctAnswer: correct }) => {
      setCorrectAnswer(correct);
      setShowResults(true);
      
      const hunterResult = results.find((r: any) => r.role === 'hunter');
      const preyResult = results.find((r: any) => r.role === 'prey');
      
      setGameState(prev => {
        if (!prev) return null;
        const updatedPlayers = prev.players.map(p => {
          const result = results.find((r: any) => r.id === p.id);
          return result ? { ...p, position: result.position, answer: result.answer } : p;
        });
        return { ...prev, players: updatedPlayers };
      });
      
      // 🔊 Animace pohybu figurek se zvukem
      setTimeout(() => {
        let moved = false;
        
        if (hunterResult) {
          const newPos = hunterResult.position;
          if (newPos !== displayHunterPos) {
            playSound('step');
            setDisplayHunterPos(newPos);
            moved = true;
            
            // 🔊 Danger - lovec blízko štvance
            if (preyResult && newPos >= preyResult.position - 1) {
              setTimeout(() => playSound('danger'), 500);
            }
          }
        }
        
        if (preyResult) {
          const newPos = preyResult.position;
          if (newPos !== displayPreyPos) {
            if (!moved) playSound('step');
            setDisplayPreyPos(newPos);
            
            // 🔊 Hope - štvanec u cíle
            if (newPos === 7) {
              setTimeout(() => playSound('hope'), 500);
            }
          }
        }
      }, 2000);
    });

    socket.on('waiting_for_ready', () => {
      setGameState(prev => prev ? { ...prev, phase: 'waiting_for_ready' } : null);
    });

    socket.on('game_over', ({ winner: w }) => {
      setWinner(w);
      setGameState(prev => prev ? { ...prev, phase: 'finished' } : null);
      
      // 🔊 Zvuk konce hry
      if (w === 'hunter') {
        playSound('failure');
      } else {
        playSound('triumph');
      }
    });

    socket.on('game_start', ({ positions, question }) => {
      console.log('🎬 game_start event přijat:', { positions, question });
      
      setGameState(prev => {
        if (!prev) return null;
        const updatedPlayers = prev.players.map(p => {
          const pos = positions.find((pos: any) => pos.id === p.id);
          return pos ? { ...p, position: pos.position, role: pos.role } : p;
        });
        return { 
          ...prev, 
          phase: 'playing',  // 🆕 BUG21 FIX: Nastavit phase na playing
          players: updatedPlayers,
          currentQuestion: question || prev.currentQuestion
        };
      });
      
      const hunter = positions.find((p: any) => p.role === 'hunter');
      const prey = positions.find((p: any) => p.role === 'prey');
      if (hunter) setDisplayHunterPos(hunter.position);
      if (prey) setDisplayPreyPos(prey.position);
      
      // Reset odpovědí a výsledků pro novou hru
      setHunterAnswer(null);
      setPreyAnswer(null);
      setShowResults(false);
      setCorrectAnswer(null);
      setWinner(null);
      
      // 🔊 Game start sound
      playSound('gamestart');
    });

    socket.on('roles_updated', ({ players: updatedPlayers }) => {
      setGameState(prev => {
        if (!prev) return null;
        const newPlayers = prev.players.map(p => {
          const updated = updatedPlayers.find((up: any) => up.id === p.id);
          return updated ? { ...p, role: updated.role, position: 0 } : p;
        });
        return { ...prev, players: newPlayers };
      });
      setDisplayHunterPos(0);
      setDisplayPreyPos(0);
    });

    socket.on('player_disconnected', () => {
      console.log('🎬 Hráč se odpojil - hra ukončena');
      setGameEnded(true);
      setGameEndReason('Hráč se odpojil');
      setGameState(null);
      setWinner(null);
      sessionStorage.removeItem('spectator_gameCode');
      sessionStorage.removeItem('spectator_premiumCode');
    });

    // 🆕 BUG26: Handler pro opuštění hry hráčem (timeout nebo zavření okna)
    socket.on('player_left_game', ({ reason, leftPlayer }) => {
      console.log(`🎬 Hráč ${leftPlayer} opustil hru: ${reason}`);
      setGameEnded(true);
      setGameEndReason(reason || 'Hráč opustil hru');
      setGameState(null);
      setWinner(null);
      setIsConnected(false);
      sessionStorage.removeItem('spectator_gameCode');
      sessionStorage.removeItem('spectator_premiumCode');
    });

    return () => {
      socket.off('spectator_joined');
      socket.off('spectator_error');
      socket.off('spectator_state');
      socket.off('countdown_started');
      socket.off('countdown_tick');
      socket.off('countdown_complete');
      socket.off('phase_change');
      socket.off('next_question');
      socket.off('spectator_player_answered');
      socket.off('start_resolution');
      socket.off('round_results');
      socket.off('waiting_for_ready');
      socket.off('game_over');
      socket.off('game_start');
      socket.off('roles_updated');
      socket.off('player_disconnected');
      socket.off('player_left_game');
    };
  }, [socket, displayHunterPos, displayPreyPos, gameCode, premiumCode]);

  const handleJoin = () => {
    if (!socket) {
      setError('Socket není inicializován');
      return;
    }
    
    if (!socketConnected) {
      setError('Čekám na připojení k serveru...');
      return;
    }
    
    if (!gameCode || !premiumCode) {
      setError('Vyplň oba kódy');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    socket.emit('join_as_spectator', { 
      gameCode: gameCode.toUpperCase(), 
      premiumCode: premiumCode.toUpperCase() 
    });
    
    setTimeout(() => {
      if (loading && !isConnected) {
        setLoading(false);
        setError('Server neodpovídá. Zkus to znovu nebo ověř, že hra stále běží.');
      }
    }, 10000);
  };

  // 🆕 Ukončení sledování
  const handleLeave = () => {
    sessionStorage.removeItem('spectator_gameCode');
    sessionStorage.removeItem('spectator_premiumCode');
    setIsConnected(false);
    setGameState(null);
    setWinner(null);
    setGameEnded(false);
    setGameEndReason('');
    setGameCode('');
    // Premium kód necháme vyplněný pro pohodlí
  };

  // 🆕 Sledovat novou hru (po ukončení)
  const handleNewGame = () => {
    setGameEnded(false);
    setGameEndReason('');
    setGameCode('');
    setIsConnected(false);
    setGameState(null);
    setWinner(null);
    // Premium kód zůstává
  };

  // Stripe Payment Link - cena 139 Kč/měsíc
  const STRIPE_CHECKOUT_URL = 'https://buy.stripe.com/bJebJ15E3bXs7DG8l25wI01';

  const handleBuyTicket = () => {
    window.open(STRIPE_CHECKOUT_URL, '_blank');
  };

  // 🆕 Helper pro získání textu režimu
  const getModeText = () => {
    if (!gameState?.settings) return 'NEZNÁMÝ';
    
    // Nejdřív zkusit ageGroup (nový systém)
    const ageGroup = gameState.settings.ageGroup;
    if (ageGroup && AGE_GROUP_LABELS[ageGroup]) {
      return `${AGE_GROUP_LABELS[ageGroup].emoji} ${AGE_GROUP_LABELS[ageGroup].name}`;
    }
    
    // Fallback na legacy mode
    const mode = gameState.settings.mode;
    if (mode === 'kid') return '🐣 DĚTI';
    if (mode === 'adult') return '👔 DOSPĚLÍ';
    
    return 'NEZNÁMÝ';
  };

  // === HRA UKONČENA (hráč odešel) ===
  if (gameEnded) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center p-4">
        <div className="text-center space-y-8 animate-fade-in max-w-md">
          <div className="w-24 h-24 mx-auto bg-slate-800 rounded-full flex items-center justify-center">
            <AlertCircle className="w-12 h-12 text-orange-500" />
          </div>
          
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-white">Sledování ukončeno</h1>
            <p className="text-slate-400 text-lg">{gameEndReason || 'Hra byla ukončena'}</p>
          </div>
          
          <div className="space-y-3">
            <button
              onClick={handleNewGame}
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-3"
            >
              <Eye className="w-6 h-6" />
              SLEDOVAT JINOU HRU
            </button>
            
            <button
              onClick={() => window.location.href = '/'}
              className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-3"
            >
              <Home className="w-6 h-6" />
              ZPĚT NA HLAVNÍ STRÁNKU
            </button>
          </div>
        </div>
      </div>
    );
  }

  // === LOGIN SCREEN ===
  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md space-y-8 animate-fade-in">
          
          {/* Header s logem */}
          <div className="text-center space-y-4">
            <div className="flex justify-center mb-4">
              <div className="relative bg-gradient-to-br from-orange-600 to-red-700 p-5 rounded-2xl shadow-xl shadow-orange-500/30 transform rotate-2 border-t border-orange-400/50 overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-yellow-400/20 to-transparent opacity-50"></div>
                <div className="flex items-center gap-1 relative z-10 transform -rotate-2">
                  <span className="text-4xl filter drop-shadow-lg transform scale-x-[-1]">🏃</span> 
                  <div className="flex space-x-1 opacity-70">
                    <div className="w-2 h-1 bg-yellow-300 rounded-full animate-ping delay-75"></div>
                    <div className="w-2 h-1 bg-orange-300 rounded-full animate-ping delay-150"></div>
                  </div>
                  <span className="text-4xl filter drop-shadow-lg delay-100">👹</span> 
                </div>
              </div>
            </div>
            <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500">
              ŠTVANICE
            </h1>
            <div className="flex items-center justify-center gap-2 bg-purple-900/30 px-4 py-2 rounded-full border border-purple-500/30">
              <Eye className="w-5 h-5 text-purple-400" />
              <span className="text-purple-300 font-bold text-sm uppercase tracking-wider">Divácká místnost</span>
            </div>
            <p className="text-slate-400">
              Sleduj hru přátel v reálném čase na velkém plátně
            </p>
          </div>

          {/* Premium upozornění */}
          <div className="bg-purple-900/20 border border-purple-500/30 rounded-xl p-4">
            <p className="text-purple-300 text-sm text-center">
              🎫 <strong>PRÉMIOVÁ FUNKCE</strong><br/>
              <span className="text-purple-200/70 text-xs">
                Pro sledování hry potřebuješ platnou vstupenku do divácké místnosti
              </span>
            </p>
          </div>

          {/* Form */}
          <div className="bg-slate-800/80 p-8 rounded-3xl border-2 border-slate-700/50 space-y-6">
            
            {/* Game Code */}
            <div>
              <label className="block text-cyan-400 text-sm uppercase tracking-wider font-bold mb-2">
                Kód hry (od hráčů)
              </label>
              <input
                type="text"
                value={gameCode}
                onChange={(e) => setGameCode(e.target.value.toUpperCase().slice(0, 6))}
                placeholder="ABC123"
                maxLength={6}
                className="w-full bg-slate-900/80 text-white text-3xl font-mono font-bold text-center py-4 rounded-xl border-2 border-slate-600 focus:border-cyan-400 focus:outline-none transition-all uppercase tracking-widest"
              />
            </div>

            {/* Premium Code */}
            <div>
              <label className="block text-purple-400 text-sm uppercase tracking-wider font-bold mb-2">
                Kód vstupenky
              </label>
              <input
                type="text"
                value={premiumCode}
                onChange={(e) => setPremiumCode(e.target.value.toUpperCase())}
                placeholder="XXXX-XXXX-XXXX"
                className="w-full bg-slate-900/80 text-white text-xl font-mono font-bold text-center py-4 rounded-xl border-2 border-slate-600 focus:border-purple-400 focus:outline-none transition-all uppercase tracking-wider"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-900/30 border border-red-500 rounded-xl p-4 flex items-center gap-3">
                <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0" />
                <p className="text-red-300">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              onClick={handleJoin}
              disabled={loading || gameCode.length !== 6 || !premiumCode || !socketConnected}
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:from-slate-700 disabled:to-slate-700 text-white font-bold py-4 rounded-xl transition-all shadow-lg disabled:shadow-none flex items-center justify-center gap-3"
            >
              {!socketConnected ? (
                <>
                  <Loader className="w-6 h-6 animate-spin" />
                  Připojuji k serveru...
                </>
              ) : loading ? (
                <>
                  <Loader className="w-6 h-6 animate-spin" />
                  Připojuji ke hře...
                </>
              ) : (
                <>
                  <Eye className="w-6 h-6" />
                  SLEDOVAT HRU
                </>
              )}
            </button>
          </div>

          {/* Footer s nákupem */}
          <div className="bg-slate-800/50 rounded-xl p-4 text-center space-y-3">
            <p className="text-slate-300 text-sm">Nemáš vstupenku?</p>
            <button 
              onClick={handleBuyTicket}
              className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold py-3 px-6 rounded-xl transition-all flex items-center justify-center gap-2 mx-auto shadow-lg shadow-amber-500/20"
            >
              <Ticket className="w-5 h-5" />
              <span>KOUPIT VSTUPENKU</span>
              <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs">139 Kč/měsíc</span>
            </button>
          </div>

          {/* FAQ odkaz */}
          <div className="text-center pt-2">
            <a href="/faq" className="inline-flex items-center gap-2 text-slate-500 hover:text-cyan-400 text-sm transition-colors">
              <HelpCircle size={14} />
              <span>Jak hra funguje?</span>
            </a>
          </div>
        </div>
      </div>
    );
  }

  // === GAME OVER ===
  if (winner) {
    const hunterWon = winner === 'hunter';
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-4 ${hunterWon ? 'bg-gradient-to-b from-red-900 via-slate-900 to-slate-900' : 'bg-gradient-to-b from-green-900 via-slate-900 to-slate-900'}`}>
        <div className="text-center space-y-8 animate-fade-in max-w-md">
          <Trophy className={`w-32 h-32 mx-auto ${hunterWon ? 'text-red-500' : 'text-green-500'}`} />
          <h1 className={`text-5xl font-black ${hunterWon ? 'text-red-500' : 'text-green-500'}`}>
            {hunterWon ? '👹 LOVEC VYHRÁL!' : '🏃 ŠTVANEC UNIKL!'}
          </h1>
          <p className="text-slate-400 text-xl">
            {hunterWon ? 'Štvanec byl dopaden!' : 'Štvanec úspěšně doběhl do cíle!'}
          </p>
          
          <div className="bg-slate-800/50 px-8 py-4 rounded-xl">
            <p className="text-slate-300 animate-pulse">⏳ Čekám na odvetu nebo novou hru...</p>
          </div>
          
          {/* Tlačítka */}
          <div className="space-y-3 pt-4">
            <button
              onClick={handleLeave}
              className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-3"
            >
              <Home className="w-5 h-5" />
              UKONČIT SLEDOVÁNÍ
            </button>
          </div>
        </div>
      </div>
    );
  }

  // === COUNTDOWN PHASE - s herní tabulí ===
  if (gameState?.phase === 'countdown' && countdown > 0) {
    const isUrgent = countdown <= 10;
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 p-4">
        <div className="max-w-4xl mx-auto space-y-4">
          
          {/* Header */}
          <div className="flex items-center justify-between bg-slate-800/50 rounded-xl px-4 py-2">
            <div className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-purple-500" />
              <span className="text-purple-400 font-bold text-sm">DIVÁCKÁ MÍSTNOST</span>
            </div>
            <span className="text-slate-300 font-mono text-sm">
              HRA <span className="text-cyan-400 font-bold">{gameCode}</span> - REŽIM <span className="text-yellow-400 font-bold">{getModeText()}</span>
            </span>
          </div>

          {/* Logo */}
          <div className="text-center py-2">
            <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500">
              🏃 ŠTVANICE 👹
            </h1>
          </div>

          {/* Herní tabule - prázdná (hra ještě nezačala) - OBRÁCENÉ POŘADÍ */}
          <div className="bg-slate-800/80 rounded-2xl p-4 border border-slate-700">
            <div className="space-y-2">
              {/* CÍL - nahoře */}
              <div className="rounded-xl p-3 text-center border bg-green-900/30 border-green-500/30">
                <div className="flex items-center justify-between px-2">
                  <span className="text-green-400 font-bold text-sm">CÍL</span>
                  <span className="text-slate-500 text-sm">🏃 Štvanec</span>
                </div>
              </div>
              
              {/* Positions 7-1 (sestupně) */}
              {[7, 6, 5, 4, 3, 2, 1].map((pos) => (
                <div 
                  key={pos}
                  className="rounded-xl p-3 flex items-center justify-between bg-slate-900/50 border border-slate-700/50"
                >
                  <span className="text-slate-500 font-bold">{pos}</span>
                </div>
              ))}
              
              {/* START - dole */}
              <div className="rounded-xl p-3 text-center border bg-red-900/30 border-red-500/30">
                <div className="flex items-center justify-between px-2">
                  <span className="text-red-400 font-bold text-sm">START</span>
                  <span className="text-slate-500 text-sm">👹 Lovec</span>
                </div>
              </div>
            </div>
          </div>

          {/* COUNTDOWN pod herní tabulí */}
          <div className={`
            bg-slate-800/80 rounded-2xl p-6 border-2 text-center
            ${isUrgent ? 'border-red-500/50 shadow-lg shadow-red-500/20' : 'border-cyan-500/30'}
          `}>
            <p className={`text-sm font-bold uppercase tracking-widest mb-2 ${isUrgent ? 'text-red-400' : 'text-cyan-400'}`}>
              🎮 Do startu hry zbývá
            </p>
            
            <div className={`text-7xl font-black tabular-nums ${isUrgent ? 'text-red-500 animate-pulse' : 'text-white'}`}>
              {countdown}
            </div>
            
            <p className="text-slate-400 mt-2">sekund</p>
          </div>
        </div>
      </div>
    );
  }

  // === WAITING STATES ===
  if (!gameState || gameState.phase === 'lobby' || gameState.phase === 'waiting_for_player' || gameState.phase === 'role_selection' || gameState.phase === 'headstart_selection') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center p-4">
        <div className="text-center space-y-6 animate-fade-in">
          <Eye className="w-20 h-20 text-purple-500 mx-auto animate-pulse" />
          <h2 className="text-3xl font-bold text-white">Čekám na začátek hry...</h2>
          <p className="text-slate-400">Hráči se připravují</p>
          <div className="bg-slate-800 px-6 py-3 rounded-full">
            <span className="text-purple-400 font-mono">Hra: {gameCode}</span>
          </div>
          {gameState?.settings && (
            <div className="text-slate-500">
              Režim: <span className="text-yellow-400">{getModeText()}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // === MAIN SPECTATOR VIEW - VARIANTA C: Horizontální progress bar nahoře, otázka dominantní ===
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 p-4 flex flex-col">
      <div className="max-w-5xl mx-auto w-full flex-1 flex flex-col space-y-4">
        
        {/* Header - kompaktní */}
        <div className="flex items-center justify-between bg-slate-800/50 rounded-xl px-4 py-2 shrink-0">
          <div className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-purple-500" />
            <span className="text-purple-400 font-bold text-sm">DIVÁCKÁ MÍSTNOST</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-slate-300 font-mono text-sm">
              HRA <span className="text-cyan-400 font-bold">{gameCode}</span> - <span className="text-yellow-400 font-bold">{getModeText()}</span>
            </span>
            <button
              onClick={handleLeave}
              className="text-slate-400 hover:text-red-400 transition-colors p-1"
              title="Ukončit sledování"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 🆕 VARIANTA A: Závodní dráhy (3 řádky) */}
        <div className="bg-slate-800/80 rounded-2xl p-3 border border-slate-700 shrink-0">
          {/* Závodní dráhy container */}
          <div className="space-y-1">
            
            {/* Řádek 1: Header s čísly polí */}
            <div className="flex">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((pos) => (
                <div 
                  key={pos} 
                  className={`flex-1 text-center py-1 text-xs font-bold border-r border-slate-700/30 last:border-r-0
                    ${pos === 0 ? 'text-red-400' : pos === 8 ? 'text-green-400' : 'text-slate-500'}
                  `}
                >
                  {pos === 0 ? 'START' : pos === 8 ? 'CÍL' : pos}
                </div>
              ))}
            </div>
            
            {/* Řádek 2: Štvanec dráha */}
            <div className="flex h-10 bg-slate-900/60 rounded-lg overflow-hidden border border-slate-700/50">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((pos) => (
                <div 
                  key={pos} 
                  className={`flex-1 flex items-center justify-center border-r border-slate-700/20 last:border-r-0 transition-colors duration-300
                    ${pos < displayPreyPos ? 'bg-green-600/30' : ''}
                    ${pos === displayPreyPos ? 'bg-green-600/20' : ''}
                  `}
                >
                  {pos === displayPreyPos && (
                    <div className="flex items-center gap-1 bg-green-600 px-2 py-1 rounded-full shadow-lg shadow-green-500/50 border-2 border-green-400">
                      <span className="text-base">🏃</span>
                      <span className="text-white font-bold text-xs hidden sm:inline">ŠTVANEC</span>
                      <span className="text-white font-bold text-xs sm:hidden">{displayPreyPos}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
            
            {/* Řádek 3: Lovec dráha */}
            <div className="flex h-10 bg-slate-900/60 rounded-lg overflow-hidden border border-slate-700/50">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((pos) => (
                <div 
                  key={pos} 
                  className={`flex-1 flex items-center justify-center border-r border-slate-700/20 last:border-r-0 transition-colors duration-300
                    ${pos < displayHunterPos ? 'bg-red-600/30' : ''}
                    ${pos === displayHunterPos ? 'bg-red-600/20' : ''}
                  `}
                >
                  {pos === displayHunterPos && (
                    <div className="flex items-center gap-1 bg-red-600 px-2 py-1 rounded-full shadow-lg shadow-red-500/50 border-2 border-red-400">
                      <span className="text-base">👹</span>
                      <span className="text-white font-bold text-xs hidden sm:inline">LOVEC</span>
                      <span className="text-white font-bold text-xs sm:hidden">{displayHunterPos}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
            
            {/* Vzdálenost */}
            <div className="text-center pt-1">
              <span className="text-slate-500 text-xs">
                Vzdálenost: <span className={`font-bold ${displayPreyPos - displayHunterPos <= 1 ? 'text-red-400' : 'text-yellow-400'}`}>{displayPreyPos - displayHunterPos}</span> {displayPreyPos - displayHunterPos === 1 ? 'pole' : 'polí'}
                {displayPreyPos - displayHunterPos <= 1 && <span className="text-red-400 ml-1">⚠️</span>}
              </span>
            </div>
          </div>
        </div>

        {/* 🆕 OTÁZKA - dominantní, zabírá většinu prostoru */}
        <div className="flex-1 flex flex-col min-h-0">
          {(gameState.phase === 'playing' || (gameState.phase === 'waiting_for_ready' && showResults)) && gameState.currentQuestion && (
            <div className="bg-slate-800/80 rounded-2xl p-6 md:p-8 border border-slate-700 flex-1 flex flex-col">
              
              {/* Question text - VELKÝ (2x větší) */}
              <div className="text-center mb-6 md:mb-8">
                <p className="text-white text-4xl md:text-6xl lg:text-7xl font-bold leading-tight">
                  {gameState.currentQuestion.question}
                </p>
                {/* Badge zdroje */}
                <span className={`inline-block mt-3 text-sm px-3 py-1 rounded-full ${
                    gameState.currentQuestion._fromLLM 
                        ? 'bg-green-900/50 text-green-400' 
                        : 'bg-blue-900/50 text-blue-400'
                }`}>
                    {gameState.currentQuestion._fromLLM ? '⚡ LLM' : '🗄️ DB'}
                </span>
              </div>
              
              {/* Options - VELKÉ */}
              <div className="space-y-3 md:space-y-4 flex-1 flex flex-col justify-center">
                {gameState.currentQuestion.options.map((option, index) => {
                  const hunterChose = hunterAnswer === index;
                  const preyChose = preyAnswer === index;
                  const isCorrect = showResults && correctAnswer === index;
                  const isWrong = showResults && (hunterChose || preyChose) && correctAnswer !== index;
                  
                  return (
                    <div 
                      key={index}
                      className={`rounded-2xl p-4 md:p-6 flex items-center justify-between transition-all duration-300 ${
                        isCorrect ? 'bg-green-600 border-4 border-green-400 shadow-lg shadow-green-500/30' :
                        isWrong ? 'bg-red-900/50 border-4 border-red-500/50' :
                        (hunterChose || preyChose) ? 'bg-slate-700 border-4 border-cyan-500/50' :
                        'bg-slate-900/50 border-2 border-slate-700'
                      }`}
                    >
                      {/* Písmeno odpovědi */}
                      <div className="flex items-center gap-4">
                        <span className={`w-10 h-10 md:w-14 md:h-14 rounded-full flex items-center justify-center text-lg md:text-2xl font-black ${
                          isCorrect ? 'bg-green-800 text-green-200' : 
                          isWrong ? 'bg-red-800 text-red-200' : 
                          'bg-slate-700 text-slate-400'
                        }`}>
                          {String.fromCharCode(65 + index)}
                        </span>
                        <span className={`font-bold text-lg md:text-2xl lg:text-3xl ${isCorrect ? 'text-white' : 'text-slate-200'}`}>
                          {option}
                        </span>
                      </div>
                      
                      {/* Kdo odpověděl */}
                      <div className="flex gap-2 md:gap-3">
                        {hunterChose && (
                          <span className={`px-3 py-2 md:px-4 md:py-2 rounded-full text-sm md:text-base font-bold flex items-center gap-2 ${
                            showResults ? (isCorrect ? 'bg-green-800 text-green-200' : 'bg-red-800 text-red-200') : 'bg-red-600 text-white'
                          }`}>
                            👹 {showResults && (isCorrect ? <Check size={18}/> : <X size={18}/>)}
                          </span>
                        )}
                        {preyChose && (
                          <span className={`px-3 py-2 md:px-4 md:py-2 rounded-full text-sm md:text-base font-bold flex items-center gap-2 ${
                            showResults ? (isCorrect ? 'bg-green-800 text-green-200' : 'bg-red-800 text-red-200') : 'bg-green-600 text-white'
                          }`}>
                            🏃 {showResults && (isCorrect ? <Check size={18}/> : <X size={18}/>)}
                          </span>
                        )}
                        {isCorrect && !hunterChose && !preyChose && (
                          <span className="text-green-200 text-base md:text-lg font-bold flex items-center gap-1">
                            <Check size={20}/>
                            SPRÁVNĚ
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {/* Status */}
              <div className="text-center pt-4 md:pt-6 shrink-0">
                {!showResults && hunterAnswer === null && preyAnswer === null && (
                  <p className="text-slate-400 text-lg md:text-xl flex items-center justify-center gap-2">
                    <Clock className="w-5 h-5 md:w-6 md:h-6 animate-pulse" />
                    Čekám na odpovědi hráčů...
                  </p>
                )}
                {!showResults && hunterAnswer !== null && preyAnswer === null && (
                  <p className="text-slate-400 text-lg md:text-xl">👹 Lovec odpověděl, čekám na Štvance...</p>
                )}
                {!showResults && hunterAnswer === null && preyAnswer !== null && (
                  <p className="text-slate-400 text-lg md:text-xl">🏃 Štvanec odpověděl, čekám na Lovce...</p>
                )}
                {showResults && (
                  <>
                    <p className="text-cyan-400 font-bold text-lg md:text-xl animate-pulse">
                      ✓ Vyhodnoceno • Čekám na hráče...
                    </p>
                    
                    {/* Perplexity fact-check odkaz */}
                    {gameState.currentQuestion && correctAnswer !== null && (
                      <a
                        href={`https://www.perplexity.ai/search?q=${encodeURIComponent(
                          `${gameState.currentQuestion.question} Je správná odpověď A) ${gameState.currentQuestion.options[0]}, B) ${gameState.currentQuestion.options[1]}, nebo C) ${gameState.currentQuestion.options[2]}?`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-slate-500 hover:text-purple-400 text-sm mt-3 transition-colors"
                      >
                        <span>🔍</span>
                        <span>Ověřit na Perplexity</span>
                        <span className="text-[10px]">↗</span>
                      </a>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Waiting for ready */}
          {gameState.phase === 'waiting_for_ready' && !showResults && (
            <div className="bg-slate-800/80 rounded-2xl p-8 md:p-12 border border-slate-700 flex-1 flex flex-col items-center justify-center">
              <Loader className="w-16 h-16 md:w-24 md:h-24 text-cyan-500 animate-spin mb-6" />
              <p className="text-white text-2xl md:text-4xl font-bold">Připravuji další otázku...</p>
              <p className="text-slate-400 mt-3 text-lg md:text-xl">Hráči potvrzují připravenost</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
