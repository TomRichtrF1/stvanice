import { useState, useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { Trophy, Timer, AlertTriangle, Users, Volume2, VolumeX, ArrowRight, Skull, Frown } from 'lucide-react';

// === TYPY ===
interface Player {
  id: string;
  role: 'hunter' | 'prey' | null;
  position: number;
  ready: boolean;
  connected: boolean;
  hasAnswered?: boolean;
  lastAnswer?: number | null;
}

interface Question {
  question: string;
  options: string[];
  correct: number;
  _error?: boolean;
}

interface GameBoardProps {
  socket: Socket;
  roomCode: string;
  players: Player[];
  currentQuestion: Question | null;
  myRole: 'hunter' | 'prey' | null;
  gamePhase: string;
  settings: { headstart: number };
  onPlayAgain: () => void;
  waitingForReady: boolean;
  gameOverPending: boolean;
}

// === KOMPONENTA HERNÍ PLÁN ===
export default function GameBoard({
  socket,
  roomCode,
  players,
  currentQuestion,
  myRole,
  gamePhase,
  settings,
  onPlayAgain,
  waitingForReady,
  gameOverPending
}: GameBoardProps) {
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [roundResult, setRoundResult] = useState<{
    correctAnswer: number;
    hunterCorrect: boolean;
    preyCorrect: boolean;
  } | null>(null);
  
  const [soundEnabled, setSoundEnabled] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Zvukové efekty
  const playSound = (type: 'correct' | 'wrong' | 'tick' | 'win' | 'lose') => {
    if (!soundEnabled) return;
    const sounds = {
      correct: '/sounds/correct.mp3',
      wrong: '/sounds/wrong.mp3',
      tick: '/sounds/tick.mp3',
      win: '/sounds/win.mp3',
      lose: '/sounds/lose.mp3'
    };
    
    try {
      const audio = new Audio(sounds[type]);
      audio.volume = 0.5;
      audio.play().catch(() => {});
    } catch (e) {
      console.warn("Audio play failed");
    }
  };

  // Socket listenery
  useEffect(() => {
    socket.on('round_results', (data) => {
      setRoundResult(data);
      setShowResult(true);
      
      // Přehrát zvuk podle mého výsledku
      const me = players.find(p => p.id === socket.id);
      if (me) {
        const amICorrect = me.role === 'hunter' ? data.hunterCorrect : data.preyCorrect;
        playSound(amICorrect ? 'correct' : 'wrong');
      }
    });

    socket.on('next_question', () => {
      setShowResult(false);
      setSelectedAnswer(null);
      setHasSubmitted(false);
      setRoundResult(null);
    });

    return () => {
      socket.off('round_results');
      socket.off('next_question');
    };
  }, [socket, players, soundEnabled]);

  // Handler odpovědi
  const handleAnswer = (index: number) => {
    if (hasSubmitted || showResult || !myRole) return;
    setSelectedAnswer(index);
    setHasSubmitted(true);
    socket.emit('submit_answer', { code: roomCode, answerIndex: index });
  };

  // Handler "Jsem připraven" (další kolo)
  const handleReadyClick = () => {
    socket.emit('playerReady', { code: roomCode });
  };

  // Pozice hráčů
  const hunter = players.find(p => p.role === 'hunter');
  const prey = players.find(p => p.role === 'prey');
  const hunterPos = hunter?.position || 0;
  const preyPos = prey?.position || settings.headstart;

  // === VIZUÁL HERNÍHO PLÁNU ===
  // Generování políček (0 až 8)
  const renderTrack = () => {
    const totalSteps = 9; // 0..8 (Cíl)
    const track = [];

    for (let i = 0; i < totalSteps; i++) {
      const isStart = i === 0;
      const isFinish = i === 8;
      const isHunterHere = hunterPos === i;
      const isPreyHere = preyPos === i;
      const isCollision = isHunterHere && isPreyHere;

      // Styl políčka
      let tileColor = "bg-slate-800 border-slate-700";
      if (isStart) tileColor = "bg-red-900/30 border-red-700/50";
      if (isFinish) tileColor = "bg-green-900/30 border-green-700/50";
      
      // Zvýraznění aktivní zóny (mezi lovcem a štvancem)
      const isActiveZone = i > hunterPos && i < preyPos;
      if (isActiveZone) tileColor = "bg-slate-800/80 border-slate-600 shadow-[0_0_15px_rgba(0,0,0,0.5)_inset]";

      track.push(
        <div 
          key={i} 
          className={`
            relative w-full aspect-square rounded-xl border-2 flex items-center justify-center
            transition-all duration-500 transform
            ${tileColor}
            ${(isHunterHere || isPreyHere) ? 'scale-105 z-10 shadow-2xl' : 'scale-100 opacity-70'}
          `}
        >
          {/* Číslo pole */}
          <span className="absolute top-1 left-2 text-xs font-mono text-slate-500 font-bold opacity-50">
            {i}
          </span>

          {/* CÍL IKONA */}
          {isFinish && !isPreyHere && (
            <div className="absolute opacity-20 text-4xl">🏁</div>
          )}

          {/* HRÁČI NA POLI */}
          <div className="flex gap-2 items-center justify-center w-full px-1">
            
            {/* LOVEC */}
            {isHunterHere && (
              <div className={`
                relative transition-all duration-500
                ${isCollision ? 'animate-bounce' : 'animate-pulse'}
              `}>
                <div className="text-4xl filter drop-shadow-[0_0_10px_rgba(239,68,68,0.8)]">👹</div>
                <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-red-600 text-white text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider whitespace-nowrap shadow-lg">
                  Lovec
                </div>
              </div>
            )}

            {/* VS (Při kolizi) */}
            {isCollision && (
              <div className="text-yellow-500 font-black text-xl animate-ping absolute z-20">VS</div>
            )}

            {/* ŠTVANEC */}
            {isPreyHere && (
              <div className={`
                relative transition-all duration-500
                ${isCollision ? 'animate-shake' : 'animate-bounce-slow'}
              `}>
                <div className="text-4xl filter drop-shadow-[0_0_10px_rgba(34,197,94,0.8)]">🏃</div>
                <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-green-600 text-white text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider whitespace-nowrap shadow-lg">
                  Štvanec
                </div>
              </div>
            )}
          </div>

          {/* Efekt cesty (spojnice) */}
          {i < totalSteps - 1 && (
            <div className={`
              absolute -right-[4px] top-1/2 -translate-y-1/2 w-[calc(100%+8px)] h-1 rounded-full -z-10
              ${i >= hunterPos && i < preyPos ? 'bg-gradient-to-r from-red-500/50 to-green-500/50 animate-pulse' : 'bg-slate-800'}
            `}></div>
          )}
        </div>
      );
    }
    return track;
  };

  // === RENDER ===
  return (
    // ZMĚNA 1: overflow-y-auto pro tablet/mobil, lg:overflow-hidden pro desktop
    <div className="min-h-screen bg-slate-900 overflow-y-auto lg:overflow-hidden relative selection:bg-cyan-500/30">
      
      {/* Ovládání zvuku */}
      <button 
        onClick={() => setSoundEnabled(!soundEnabled)}
        className="fixed top-4 right-4 z-50 bg-slate-800/80 p-3 rounded-full hover:bg-slate-700 transition-colors border border-slate-600 text-slate-400 hover:text-white"
      >
        {soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
      </button>

      {/* ZMĚNA 2: Flex kontejner, na mobilu min-h-screen (aby se natáhl), na desktopu fixní */}
      <div className="flex flex-col lg:flex-row min-h-screen lg:h-screen lg:max-h-screen overflow-visible lg:overflow-hidden">
        
        {/* LEVÝ PANEL - HERNÍ PLÁN (TRACK) */}
        {/* ZMĚNA 3: min-h-[45vh] h-auto místo fixní výšky */}
        <div className="w-full lg:w-[55%] min-h-[45vh] h-auto lg:h-full relative flex items-center justify-center p-4 lg:p-8 order-1 lg:order-1 flex-shrink-0">
          
          {/* Pozadí mapy */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
             <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-slate-800/30 via-slate-900 to-slate-900"></div>
             <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-500/5 rounded-full blur-3xl animate-pulse-slow"></div>
             <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-green-500/5 rounded-full blur-3xl animate-pulse-slow delay-1000"></div>
          </div>

          {/* Mřížka herního plánu */}
          <div className="relative z-10 w-full max-w-2xl">
            <div className="grid grid-cols-3 gap-3 md:gap-4 lg:gap-6 p-4 bg-slate-800/30 rounded-3xl backdrop-blur-sm border border-slate-700/50 shadow-2xl">
              {renderTrack()}
            </div>
            
            {/* Info pod mapou */}
            <div className="mt-6 flex justify-between items-center text-sm font-bold text-slate-500 px-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse"></div>
                LOVEC START
              </div>
              <div className="flex items-center gap-2">
                CÍL (ÚTĚK)
                <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></div>
              </div>
            </div>
          </div>
        </div>

        {/* PRAVÝ PANEL - OTÁZKY A STATUS */}
        {/* ZMĚNA 4: min-h-[55vh] h-auto místo fixní výšky */}
        <div className="w-full lg:w-[45%] min-h-[55vh] h-auto lg:h-full relative bg-slate-800/50 backdrop-blur-sm border-t lg:border-t-0 lg:border-l border-slate-700/50 flex flex-col order-2 lg:order-2">
          
          {/* Header kola */}
          <div className="p-6 border-b border-slate-700/50 flex justify-between items-center bg-slate-900/50">
            <div className="flex items-center gap-3">
              <div className="bg-cyan-500/10 p-2 rounded-lg">
                <Timer className="text-cyan-400 w-5 h-5" />
              </div>
              <span className="text-slate-400 font-mono text-sm tracking-wider uppercase">
                Kolo {gamePhase === 'playing' ? (players[0]?.position || 0) + (players[1]?.position || 0) + 1 : '-'}
              </span>
            </div>
            <div className="px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs font-bold text-slate-400">
              Kód: {roomCode}
            </div>
          </div>

          {/* OBSAH - OTÁZKA */}
          <div className="flex-1 flex flex-col p-6 lg:p-10 overflow-y-auto">
            {gamePhase === 'finished' ? (
              // KONEC HRY
              <div className="flex-1 flex flex-col items-center justify-center text-center space-y-8 animate-fade-in">
                <Trophy size={80} className="text-yellow-400 animate-bounce" />
                <h2 className="text-5xl font-black text-white">
                   {hunterPos >= preyPos ? 'LOVEC VYHRÁL!' : 'ŠTVANEC UTEKL!'}
                </h2>
                <p className="text-slate-400 text-lg max-w-md">
                  {hunterPos >= preyPos 
                    ? 'Lovec úspěšně dopadl svou kořist. Hra končí.' 
                    : 'Štvanec prokázal neuvěřitelné znalosti a unikl do bezpečí.'}
                </p>
                <button
                  onClick={onPlayAgain}
                  className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold py-4 px-10 rounded-2xl shadow-lg transform hover:scale-105 transition-all text-xl"
                >
                  HRÁT ZNOVU
                </button>
              </div>
            ) : !currentQuestion ? (
              // NAČÍTÁNÍ
              <div className="flex-1 flex items-center justify-center">
                <div className="animate-spin text-cyan-500">
                  <Timer size={40} />
                </div>
              </div>
            ) : showResult && roundResult ? (
              // VÝSLEDEK KOLA
              <div className="flex-1 flex flex-col items-center justify-center text-center space-y-8 animate-slide-up">
                <div className={`
                  p-6 rounded-full border-4 shadow-2xl mb-4
                  ${(myRole === 'hunter' ? roundResult.hunterCorrect : roundResult.preyCorrect) 
                    ? 'bg-green-500/20 border-green-500 text-green-400' 
                    : 'bg-red-500/20 border-red-500 text-red-400'}
                `}>
                  {(myRole === 'hunter' ? roundResult.hunterCorrect : roundResult.preyCorrect) 
                    ? <Trophy size={48} /> 
                    : (myRole === 'hunter' ? <Frown size={48} /> : <Skull size={48} />)}
                </div>
                
                <h3 className="text-3xl font-bold text-white">
                  {(myRole === 'hunter' ? roundResult.hunterCorrect : roundResult.preyCorrect) 
                    ? 'SPRÁVNĚ!' 
                    : 'ŠPATNĚ!'}
                </h3>
                
                <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 w-full">
                  <p className="text-slate-500 text-sm uppercase mb-2">Správná odpověď</p>
                  <p className="text-xl font-bold text-white">
                    {currentQuestion.options[roundResult.correctAnswer]}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4 w-full">
                  <div className={`p-4 rounded-xl border ${roundResult.hunterCorrect ? 'bg-green-900/20 border-green-500/50' : 'bg-red-900/20 border-red-500/50'}`}>
                    <div className="text-xs text-slate-400 mb-1">LOVEC</div>
                    <div className="font-bold">{roundResult.hunterCorrect ? '+1 KROK' : 'STOJÍ'}</div>
                  </div>
                  <div className={`p-4 rounded-xl border ${roundResult.preyCorrect ? 'bg-green-900/20 border-green-500/50' : 'bg-red-900/20 border-red-500/50'}`}>
                    <div className="text-xs text-slate-400 mb-1">ŠTVANEC</div>
                    <div className="font-bold">{roundResult.preyCorrect ? '+1 KROK' : 'STOJÍ'}</div>
                  </div>
                </div>

                {/* Tlačítko DALŠÍ KOLO pro synchronizaci */}
                {waitingForReady && !gameOverPending && (
                   <button
                     onClick={handleReadyClick}
                     disabled={players.find(p => p.id === socket.id)?.ready}
                     className={`
                       w-full py-4 rounded-xl font-bold text-lg transition-all transform hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2
                       ${players.find(p => p.id === socket.id)?.ready 
                         ? 'bg-slate-700 text-slate-400 cursor-not-allowed' 
                         : 'bg-gradient-to-r from-yellow-500 to-orange-500 text-white shadow-lg shadow-orange-500/20'}
                     `}
                   >
                     {players.find(p => p.id === socket.id)?.ready ? (
                       <>
                         <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/30 border-t-white"></div>
                         <span>ČEKÁM NA SOUPEŘE...</span>
                       </>
                     ) : (
                       <>
                         <span>DALŠÍ KOLO</span>
                         <ArrowRight size={20} />
                       </>
                     )}
                   </button>
                )}
                
                {gameOverPending && (
                  <div className="text-yellow-400 font-bold animate-pulse">
                     VYHODNOCUJI VÍTĚZE...
                  </div>
                )}
              </div>
            ) : (
              // ZOBRAZENÍ OTÁZKY
              <div className="flex flex-col h-full animate-fade-in">
                <div className="flex-1 flex flex-col justify-center space-y-6">
                   <h3 className="text-2xl lg:text-3xl font-bold text-white leading-tight text-center">
                     {currentQuestion.question}
                   </h3>
                   
                   <div className="grid gap-3 mt-4">
                     {currentQuestion.options.map((option, idx) => (
                       <button
                         key={idx}
                         onClick={() => handleAnswer(idx)}
                         disabled={hasSubmitted || !myRole}
                         className={`
                           group relative w-full p-5 lg:p-6 rounded-2xl text-left transition-all duration-200 border-2
                           ${hasSubmitted && selectedAnswer === idx 
                             ? 'bg-cyan-600 border-cyan-400 text-white scale-[1.02] shadow-lg shadow-cyan-500/20' 
                             : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-cyan-500/50 hover:bg-slate-750'}
                           ${!myRole ? 'opacity-50 cursor-not-allowed' : ''}
                         `}
                       >
                         <div className="flex items-center gap-4">
                           <div className={`
                             w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm
                             ${hasSubmitted && selectedAnswer === idx ? 'bg-white text-cyan-600' : 'bg-slate-700 text-slate-400 group-hover:bg-slate-600'}
                           `}>
                             {String.fromCharCode(65 + idx)}
                           </div>
                           <span className="text-lg font-medium">{option}</span>
                         </div>
                       </button>
                     ))}
                   </div>
                </div>

                {/* Status bar dole */}
                <div className="mt-6 pt-6 border-t border-slate-700/50 flex justify-between items-center text-sm text-slate-500">
                   <div className="flex items-center gap-2">
                     <Users size={16} />
                     <span>Hrajete jako: <strong className={myRole === 'hunter' ? 'text-red-400' : 'text-green-400'}>{myRole === 'hunter' ? 'LOVEC' : 'ŠTVANEC'}</strong></span>
                   </div>
                   {hasSubmitted && (
                     <div className="flex items-center gap-2 text-cyan-400 animate-pulse">
                       <span>Čekám na soupeře...</span>
                     </div>
                   )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}