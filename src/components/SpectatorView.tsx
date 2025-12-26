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
}

interface GameState {
  phase: string;
  players: Player[];
  currentQuestion: Question | null;
  settings: {
    mode: 'adult' | 'kid';
    topic: string;
  };
  headstart: number | null;
}

export default function SpectatorView() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [socketConnected, setSocketConnected] = useState(false); // Socket připojení
  const [gameCode, setGameCode] = useState('');
  const [premiumCode, setPremiumCode] = useState('');
  const [isConnected, setIsConnected] = useState(false); // Připojeno ke hře
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
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
  
  // Audio refs
  const stepAudioRef = useRef<HTMLAudioElement | null>(null);
  const correctAudioRef = useRef<HTMLAudioElement | null>(null);
  const wrongAudioRef = useRef<HTMLAudioElement | null>(null);
  const resolutionAudioRef = useRef<HTMLAudioElement | null>(null);

  // Inicializace audia
  useEffect(() => {
    stepAudioRef.current = new Audio('/sounds/step.mp3');
    correctAudioRef.current = new Audio('/sounds/correct.mp3');
    wrongAudioRef.current = new Audio('/sounds/wrong.mp3');
    resolutionAudioRef.current = new Audio('/sounds/resolution.mp3');
  }, []);

  // Funkce pro přehrání zvuku
  const playSound = (sound: 'step' | 'correct' | 'wrong' | 'resolution') => {
    try {
      const audioMap = {
        step: stepAudioRef.current,
        correct: correctAudioRef.current,
        wrong: wrongAudioRef.current,
        resolution: resolutionAudioRef.current
      };
      const audio = audioMap[sound];
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
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

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    socket.on('spectator_joined', (state: GameState) => {
      console.log('🎬 Spectator joined:', state);
      setGameState(state);
      setIsConnected(true);
      setLoading(false);
      setError(null);
      
      // Nastav počáteční pozice
      const hunter = state.players.find(p => p.role === 'hunter');
      const prey = state.players.find(p => p.role === 'prey');
      if (hunter) setDisplayHunterPos(hunter.position);
      if (prey) setDisplayPreyPos(prey.position);
    });

    socket.on('spectator_error', ({ message }) => {
      console.log('🎬 Spectator error:', message);
      setError(message);
      setLoading(false);
    });

    socket.on('spectator_state', (state: GameState) => {
      setGameState(state);
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
      
      // Aktualizuj pozice v gameState
      setGameState(prev => {
        if (!prev) return null;
        const updatedPlayers = prev.players.map(p => {
          const result = results.find((r: any) => r.id === p.id);
          return result ? { ...p, position: result.position, answer: result.answer } : p;
        });
        return { ...prev, players: updatedPlayers };
      });
      
      // Animace pohybu figurek
      setTimeout(() => {
        if (hunterResult) {
          const newPos = hunterResult.position;
          if (newPos !== displayHunterPos) {
            playSound('step');
            setDisplayHunterPos(newPos);
          }
        }
        if (preyResult) {
          const newPos = preyResult.position;
          if (newPos !== displayPreyPos) {
            playSound('step');
            setDisplayPreyPos(newPos);
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
    });

    socket.on('game_start', ({ positions }) => {
      setGameState(prev => {
        if (!prev) return null;
        const updatedPlayers = prev.players.map(p => {
          const pos = positions.find((pos: any) => pos.id === p.id);
          return pos ? { ...p, position: pos.position, role: pos.role } : p;
        });
        return { ...prev, players: updatedPlayers };
      });
      
      const hunter = positions.find((p: any) => p.role === 'hunter');
      const prey = positions.find((p: any) => p.role === 'prey');
      if (hunter) setDisplayHunterPos(hunter.position);
      if (prey) setDisplayPreyPos(prey.position);
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
      setError('Hráč se odpojil. Hra byla ukončena.');
      setIsConnected(false);
      setGameState(null);
      setWinner(null);
    });

    return () => {
      socket.off('spectator_joined');
      socket.off('spectator_error');
      socket.off('spectator_state');
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
    };
  }, [socket, displayHunterPos, displayPreyPos]);

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
    
    console.log('🎬 Připojuji se ke hře:', {
      gameCode: gameCode.toUpperCase(),
      premiumCode: premiumCode.toUpperCase(),
      socketId: socket.id,
      connected: socket.connected
    });
    
    setLoading(true);
    setError(null);
    
    socket.emit('join_as_spectator', { 
      gameCode: gameCode.toUpperCase(), 
      premiumCode: premiumCode.toUpperCase() 
    });
    
    // Timeout pro případ že server neodpoví
    setTimeout(() => {
      if (loading && !isConnected) {
        setLoading(false);
        setError('Server neodpovídá. Zkus to znovu nebo ověř, že hra stále běží.');
      }
    }, 10000);
  };

  // Handler pro nákup vstupenky
  const handleBuyTicket = async () => {
    try {
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();

      if (data.error) {
        setError(data.error);
        return;
      }

      window.location.href = data.url;
    } catch (err) {
      console.error('Error creating checkout:', err);
      setError('Chyba při vytváření platby');
    }
  };

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
              <p className="text-slate-500 text-xs mt-2 text-center">
                6-místný kód, který hráči vidí v lobby
              </p>
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
            <p className="text-slate-300 text-sm">
              Nemáš vstupenku?
            </p>
            <button 
              onClick={handleBuyTicket}
              className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold py-3 px-6 rounded-xl transition-all flex items-center justify-center gap-2 mx-auto shadow-lg shadow-amber-500/20"
            >
              <Ticket className="w-5 h-5" />
              <span>KOUPIT VSTUPENKU</span>
              <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs">139 Kč/měsíc</span>
            </button>
            <p className="text-slate-500 text-xs">
              Jednorázová platba, bez automatického obnovování
            </p>
          </div>

          {/* FAQ odkaz */}
          <div className="text-center pt-2">
            <a
              href="/faq"
              className="inline-flex items-center gap-2 text-slate-500 hover:text-cyan-400 text-sm transition-colors"
            >
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
        <div className="text-center space-y-8 animate-fade-in">
          {hunterWon ? (
            <>
              <Trophy className="w-32 h-32 text-red-500 mx-auto animate-bounce" />
              <h1 className="text-5xl font-black text-white">LOVEC VYHRÁL!</h1>
              <p className="text-2xl text-red-300">👹 Kořist byla ulovena!</p>
            </>
          ) : (
            <>
              <Trophy className="w-32 h-32 text-green-500 mx-auto animate-bounce" />
              <h1 className="text-5xl font-black text-white">ŠTVANEC VYHRÁL!</h1>
              <p className="text-2xl text-green-300">🏃 Úspěšně unikl do cíle!</p>
            </>
          )}
          
          <p className="text-slate-400 mt-8">Čekám na odvetu...</p>
          
          <div className="pt-4">
            <button
              onClick={() => window.location.reload()}
              className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-4 px-8 rounded-xl transition-all flex items-center gap-2 mx-auto"
            >
              <Home className="w-5 h-5" />
              Sledovat jinou hru
            </button>
          </div>
        </div>
      </div>
    );
  }

  // === WAITING STATES (bez topic_selection) ===
  if (!gameState || gameState.phase === 'lobby' || gameState.phase === 'role_selection' || gameState.phase === 'headstart_selection') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center p-4">
        <div className="text-center space-y-6 animate-fade-in">
          <Eye className="w-20 h-20 text-purple-500 mx-auto animate-pulse" />
          <h2 className="text-3xl font-bold text-white">Čekám na začátek hry...</h2>
          <p className="text-slate-400">Hráči se připravují</p>
          <div className="bg-slate-800 px-6 py-3 rounded-full">
            <span className="text-purple-400 font-mono">Hra: {gameCode}</span>
          </div>
        </div>
      </div>
    );
  }

  // === MAIN SPECTATOR VIEW ===
  const hunter = gameState.players.find(p => p.role === 'hunter');
  const prey = gameState.players.find(p => p.role === 'prey');
  const modeText = gameState.settings.mode === 'kid' ? 'JUNIOR' : 'DOSPĚLÝ';

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="max-w-6xl mx-auto space-y-4">
        
        {/* Header */}
        <div className="flex items-center justify-between bg-slate-800/50 rounded-xl px-4 py-2">
          <div className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-purple-500" />
            <span className="text-purple-400 font-bold text-sm">DIVÁCKÁ MÍSTNOST</span>
          </div>
          <span className="text-slate-300 font-mono text-sm">
            HRA <span className="text-cyan-400 font-bold">{gameCode}</span> - REŽIM <span className="text-yellow-400 font-bold">{modeText}</span>
          </span>
        </div>

        {/* Logo */}
        <div className="text-center py-2 lg:py-1">
          <div className="flex justify-center mb-2">
            <div className="relative bg-gradient-to-br from-orange-600 to-red-700 p-3 lg:p-2 rounded-2xl shadow-xl shadow-orange-500/30 transform rotate-2 border-t border-orange-400/50 overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-yellow-400/20 to-transparent opacity-50"></div>
              <div className="flex items-center gap-1 relative z-10 transform -rotate-2">
                <span className="text-2xl lg:text-xl filter drop-shadow-lg transform scale-x-[-1]">🏃</span> 
                <div className="flex space-x-1 opacity-70">
                  <div className="w-1.5 h-1 bg-yellow-300 rounded-full animate-ping delay-75"></div>
                  <div className="w-1.5 h-1 bg-orange-300 rounded-full animate-ping delay-150"></div>
                </div>
                <span className="text-2xl lg:text-xl filter drop-shadow-lg delay-100">👹</span> 
              </div>
            </div>
          </div>
          <h1 className="text-2xl lg:text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500 tracking-tight">
            ŠTVANICE
          </h1>
        </div>

        {/* Responzivní layout */}
        <div className="lg:flex lg:gap-6">
          
          {/* Game Board */}
          <div className="lg:w-1/2">
            <div className="bg-slate-800/80 rounded-2xl p-4 border border-slate-700">
              
              {/* Positions */}
              <div className="space-y-2">
                {/* START */}
                <div className={`rounded-xl p-3 text-center border transition-all duration-500 ${displayHunterPos === 0 ? 'bg-red-900/50 border-red-500' : 'bg-red-900/30 border-red-500/30'}`}>
                  <div className="flex items-center justify-between px-2">
                    <span className="text-red-400 font-bold text-sm">START</span>
                    {displayHunterPos === 0 && (
                      <span className="bg-red-600 px-3 py-1 rounded-full text-sm font-bold flex items-center gap-1 animate-pulse">
                        👹 LOVEC
                      </span>
                    )}
                  </div>
                </div>
                
                {/* Positions 1-7 */}
                {[1, 2, 3, 4, 5, 6, 7].map((pos) => {
                  const hunterHere = displayHunterPos === pos;
                  const preyHere = displayPreyPos === pos;
                  
                  return (
                    <div 
                      key={pos}
                      className={`rounded-xl p-3 flex items-center justify-between transition-all duration-500 ${
                        hunterHere || preyHere 
                          ? 'bg-slate-700 border-2 border-cyan-500/50' 
                          : 'bg-slate-900/50 border border-slate-700/50'
                      }`}
                    >
                      <span className="text-slate-500 font-bold">{pos}</span>
                      <div className="flex gap-2">
                        {hunterHere && (
                          <span className="bg-red-600 px-3 py-1 rounded-full text-sm font-bold flex items-center gap-1 transition-all duration-500">
                            👹 LOVEC
                          </span>
                        )}
                        {preyHere && (
                          <span className="bg-green-600 px-3 py-1 rounded-full text-sm font-bold flex items-center gap-1 transition-all duration-500">
                            🏃 ŠTVANEC
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
                
                {/* CÍL */}
                <div className={`rounded-xl p-3 text-center border transition-all duration-500 ${displayPreyPos >= 8 ? 'bg-green-900/50 border-green-500' : 'bg-green-900/30 border-green-500/30'}`}>
                  <div className="flex items-center justify-between px-2">
                    <span className="text-green-400 font-bold text-sm">CÍL</span>
                    {displayPreyPos >= 8 && (
                      <span className="bg-green-600 px-3 py-1 rounded-full text-sm font-bold flex items-center gap-1">
                        🏃 ŠTVANEC
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Question panel */}
          <div className="lg:w-1/2 mt-4 lg:mt-0">
            
            {/* Otázka a výsledky */}
            {(gameState.phase === 'playing' || (gameState.phase === 'waiting_for_ready' && showResults)) && gameState.currentQuestion && (
              <div className="bg-slate-800/80 rounded-2xl p-6 border border-slate-700 space-y-4">
                
                {/* Question text */}
                <div className="text-center">
                  <p className="text-white text-xl font-bold">{gameState.currentQuestion.question}</p>
                </div>
                
                {/* Options */}
                <div className="space-y-3">
                  {gameState.currentQuestion.options.map((option, index) => {
                    const hunterChose = hunterAnswer === index;
                    const preyChose = preyAnswer === index;
                    const isCorrect = showResults && correctAnswer === index;
                    const isWrong = showResults && (hunterChose || preyChose) && correctAnswer !== index;
                    
                    return (
                      <div 
                        key={index}
                        className={`rounded-xl p-4 flex items-center justify-between transition-all duration-300 ${
                          isCorrect ? 'bg-green-600 border-2 border-green-400' :
                          isWrong ? 'bg-red-900/50 border-2 border-red-500/50' :
                          (hunterChose || preyChose) ? 'bg-slate-700 border-2 border-cyan-500/50' :
                          'bg-slate-900/50 border border-slate-700'
                        }`}
                      >
                        <span className={`font-bold ${isCorrect ? 'text-white' : 'text-slate-300'}`}>
                          {option}
                        </span>
                        
                        <div className="flex gap-2">
                          {hunterChose && (
                            <span className={`px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${
                              showResults ? (isCorrect ? 'bg-green-800 text-green-200' : 'bg-red-800 text-red-200') : 'bg-red-600 text-white'
                            }`}>
                              👹 {showResults && (isCorrect ? <Check size={12}/> : <X size={12}/>)}
                            </span>
                          )}
                          {preyChose && (
                            <span className={`px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${
                              showResults ? (isCorrect ? 'bg-green-800 text-green-200' : 'bg-red-800 text-red-200') : 'bg-green-600 text-white'
                            }`}>
                              🏃 {showResults && (isCorrect ? <Check size={12}/> : <X size={12}/>)}
                            </span>
                          )}
                          {isCorrect && !hunterChose && !preyChose && (
                            <span className="text-green-200 text-xs font-bold">✓ SPRÁVNĚ</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                {/* Status */}
                <div className="text-center pt-2">
                  {!showResults && hunterAnswer === null && preyAnswer === null && (
                    <p className="text-slate-400 flex items-center justify-center gap-2">
                      <Clock className="w-4 h-4 animate-pulse" />
                      Čekám na odpovědi hráčů...
                    </p>
                  )}
                  {!showResults && hunterAnswer !== null && preyAnswer === null && (
                    <p className="text-slate-400">👹 Lovec odpověděl, čekám na Štvance...</p>
                  )}
                  {!showResults && hunterAnswer === null && preyAnswer !== null && (
                    <p className="text-slate-400">🏃 Štvanec odpověděl, čekám na Lovce...</p>
                  )}
                  {showResults && (
                    <>
                      <p className="text-cyan-400 font-bold animate-pulse">
                        ✓ Vyhodnoceno • Čekám na hráče...
                      </p>
                      
                      {/* 🔍 Perplexity fact-check odkaz */}
                      {gameState.currentQuestion && correctAnswer !== null && (
                        <a
                          href={`https://www.perplexity.ai/search?q=${encodeURIComponent(
                            gameState.currentQuestion.question + ' správná odpověď ' + gameState.currentQuestion.options[correctAnswer]
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-slate-500 hover:text-purple-400 text-xs mt-2 transition-colors"
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
              <div className="bg-slate-800/80 rounded-2xl p-6 border border-slate-700 text-center">
                <Loader className="w-12 h-12 text-cyan-500 animate-spin mx-auto mb-4" />
                <p className="text-white text-xl font-bold">Připravuji další otázku...</p>
                <p className="text-slate-400 mt-2">Hráči potvrzují připravenost</p>
              </div>
            )}

          </div>
        </div>

      </div>
    </div>
  );
}
