import { useState, useEffect, useRef } from 'react';
import { Target, User, CheckCircle, XCircle, Clock, Play, Baby, Brain, Skull, Flag } from 'lucide-react';
import { useSocket } from '../contexts/SocketContext';
import { useGameAudio } from '../hooks/useGameAudio';
import GameEndOverlay from './GameEndOverlay';

interface Player {
  id: string;
  role: 'hunter' | 'prey';
  position: number;
  ready?: boolean;
}

interface Question {
  question: string;
  options: string[];
  correct: number;
  _fromLLM?: boolean;  // 🆕 Badge: true = AI generováno, false/undefined = z DB
}

interface GameBoardProps {
  myRole: 'hunter' | 'prey';
  players: Player[];
  currentQuestion: Question | null;
  onSubmitAnswer: (answerIndex: number) => void;
  gameOver: boolean;
  winner: 'hunter' | 'prey' | null;
  roundResult: any;
  roomCode: string;
  onRestart: () => void;
  gameMode: 'adult' | 'kid';
}

export default function GameBoard({
  myRole,
  players,
  currentQuestion,
  onSubmitAnswer,
  gameOver,
  winner,
  roundResult,
  roomCode,
  onRestart,
  gameMode
}: GameBoardProps) {
  
  const { socket } = useSocket();
  const { playSfx, playTickTack, stopTickTack } = useGameAudio();
  
  // Získání aktuálních pozic ze serveru (okamžité)
  const serverHunterPos = players.find(p => p.role === 'hunter')?.position || 0;
  const serverPreyPos = players.find(p => p.role === 'prey')?.position || 0;

  // == LOKÁLNÍ STAV PRO VIZUÁLNÍ POZICE (ZPOŽDĚNÉ) ==
  // Figurky na mapě se budou řídit tímto, ne přímo props
  const [visualHunterPos, setVisualHunterPos] = useState(serverHunterPos);
  const [visualPreyPos, setVisualPreyPos] = useState(serverPreyPos);

  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [showReadyButton, setShowReadyButton] = useState(false);
  const [timeLeft, setTimeLeft] = useState(20);
  
  const lastHunterPos = useRef<number>(-1);
  const lastPreyPos = useRef<number>(-1);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // === 1. SYNCHRONIZACE POZIC S EFEKTEM ZPOŽDĚNÍ ===
  useEffect(() => {
    // Pokud máme výsledek kola (právě proběhlo vyhodnocení), zpozdíme pohyb o 2 sekundy
    if (roundResult) {
      const timer = setTimeout(() => {
        setVisualHunterPos(serverHunterPos);
        setVisualPreyPos(serverPreyPos);
      }, 2000); // 2000ms = 2 sekundy zpoždění pohybu po vyhodnocení
      return () => clearTimeout(timer);
    } else {
      // V jiných případech (start hry, reconnect) synchronizujeme hned
      setVisualHunterPos(serverHunterPos);
      setVisualPreyPos(serverPreyPos);
    }
  }, [serverHunterPos, serverPreyPos, roundResult]);

  // === 2. AUDIO EFEKTY POHYBU ===
  // Přehráváme zvuky až ve chvíli, kdy se "vizuálně" pohne figurka
  useEffect(() => {
    // 🆕 STEP ZVUK - při jakémkoliv pohybu
    const hunterMoved = visualHunterPos !== lastHunterPos.current && lastHunterPos.current !== -1;
    const preyMoved = visualPreyPos !== lastPreyPos.current && lastPreyPos.current !== -1;
    
    if (hunterMoved || preyMoved) {
      playSfx('step.mp3');
    }
    
    // Detekce pohybu lovce (nebezpečí) - přehraje se PO step.mp3
    if (visualHunterPos === visualPreyPos - 1 && visualHunterPos !== lastHunterPos.current && visualHunterPos > 0) {
        // Malé zpoždění aby se step.mp3 stihl přehrát první
        setTimeout(() => playSfx('danger.mp3'), 300);
    }
    // Detekce blížícího se cíle pro štvance
    if (visualPreyPos === 7 && visualPreyPos !== lastPreyPos.current) {
          setTimeout(() => playSfx('hope.mp3'), 300);
    }
    
    // Aktualizace referencí pro příští porovnání
    lastHunterPos.current = visualHunterPos;
    lastPreyPos.current = visualPreyPos;
  }, [visualHunterPos, visualPreyPos, playSfx]);

  // === OSTATNÍ LOGIKA (Audio tick-tack, GameOver atd.) ===
  useEffect(() => {
    if (currentQuestion && !hasAnswered && !roundResult && !gameOver && timeLeft > 0 && timeLeft <= 10) {
      const timeoutId = setTimeout(() => {
          playTickTack();
      }, 500); 
      return () => clearTimeout(timeoutId);
    } else {
      stopTickTack();
    }
  }, [currentQuestion, hasAnswered, roundResult, gameOver, timeLeft, playTickTack, stopTickTack]);

  useEffect(() => {
    if (gameOver && winner) {
      stopTickTack();
      if (winner === 'prey') playSfx('triumph.mp3');
      else playSfx('failure.mp3');
    }
  }, [gameOver, winner, playSfx, stopTickTack]);

  useEffect(() => {
    if (currentQuestion && !hasAnswered && !gameOver && !roundResult) {
      setTimeLeft(20);
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            handleAnswerClick(999);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentQuestion, hasAnswered, gameOver, roundResult]);

  useEffect(() => {
    if (roundResult) {
      if (timerRef.current) clearInterval(timerRef.current);
      setShowReadyButton(false);
      const timeout = setTimeout(() => setShowReadyButton(true), 3000);
      return () => clearTimeout(timeout);
    } else {
      setShowReadyButton(false);
      setIsReady(false);
      setSelectedAnswer(null);
      setHasAnswered(false);
    }
  }, [roundResult, currentQuestion]);

  const handleAnswerClick = (index: number) => {
    if (hasAnswered || gameOver) return;
    if (timerRef.current) clearInterval(timerRef.current);
    stopTickTack();
    setSelectedAnswer(index);
    setHasAnswered(true);
    onSubmitAnswer(index);
  };

  const handleReadyClick = () => {
    setIsReady(true);
    if (socket) {
      socket.emit('playerReady', { code: roomCode });
    }
  };

  const hunter = players.find(p => p.role === 'hunter');
  const prey = players.find(p => p.role === 'prey');
  const fields = Array.from({ length: 9 }, (_, i) => i);
  
  const getTimerColor = () => {
    if (timeLeft > 10) return 'text-cyan-400 border-cyan-400';
    if (timeLeft > 5) return 'text-yellow-400 border-yellow-400';
    return 'text-red-500 border-red-500 animate-pulse';
  };

  if (gameOver && winner) {
    return (
      <div className="fixed inset-0 bg-slate-900 flex flex-col items-center justify-center p-4">
        <GameEndOverlay winner={winner} myRole={myRole} onRestart={onRestart} />
      </div>
    );
  }

  // === DESIGN (BEZE ZMĚN) ===
  return (
    <div className="fixed inset-0 w-full h-[100dvh] bg-slate-900 flex flex-col text-slate-200 font-sans overflow-hidden">
      
      {/* HEADER */}
      <div className={`shrink-0 h-10 md:h-16 flex items-center justify-between px-3 md:px-6 border-b border-white/10 shadow-sm z-20 ${
          myRole === 'hunter' ? 'bg-red-950' : 'bg-green-950'
      }`}>
         <div className="flex items-center gap-2 md:gap-4">
            <span className="text-lg md:text-3xl filter drop-shadow">{myRole === 'hunter' ? '👹' : '🏃'}</span>
            <span className={`font-black text-xs md:text-xl uppercase tracking-widest ${
                 myRole === 'hunter' ? 'text-red-400' : 'text-green-400'
            }`}>
              {myRole === 'hunter' ? 'LOVEC' : 'ŠTVANEC'}
            </span>
         </div>
         <div className="flex items-center gap-2 md:gap-4">
            {/* KÓD LOBBY */}
            <div className="bg-black/30 px-2 py-0.5 md:px-3 md:py-1 rounded-full">
               <span className="text-[9px] md:text-xs font-mono text-slate-400">
                  HRA <span className="text-cyan-400 font-bold">{roomCode}</span>
               </span>
            </div>
            {/* REŽIM */}
            <div className="flex items-center gap-1.5 opacity-60 bg-black/20 px-2 py-0.5 md:px-4 md:py-1.5 rounded-full">
               {gameMode === 'kid' ? <Baby size={12} className="md:w-5 md:h-5"/> : <Brain size={12} className="md:w-5 md:h-5"/>}
               <span className="text-[9px] md:text-xs font-bold uppercase tracking-wider">
                   {gameMode === 'kid' ? 'JUNIOR' : 'DOSPĚLÝ'}
               </span>
            </div>
         </div>
      </div>

      {/* HLAVNÍ KONTEJNER */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">

        {/* === MAPA === */}
        <div className="flex-1 overflow-y-auto bg-slate-900 min-h-0 p-2 md:p-8 relative [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
            
            <div className="max-w-xl mx-auto space-y-1.5 md:space-y-4 pb-2">
                {fields.map((fieldNum) => {
                // ZDE JSME POUŽILI VIZUÁLNÍ (ZPOŽDĚNÉ) POZICE
                const isHunterHere = visualHunterPos === fieldNum;
                const isPreyHere = visualPreyPos === fieldNum;
                const isStart = fieldNum === 0;
                const isFinish = fieldNum === 8;
                
                // Určení, zda je pole na trase (pro barvení historie)
                // Používáme také vizuální pozice, aby se "had" táhl správně
                const isHunterTrail = visualHunterPos > 0 && fieldNum < visualHunterPos && fieldNum > 0;
                const isPreyPath = visualPreyPos > 0 && fieldNum > visualPreyPos && fieldNum < 8;

                let bgStyle = 'bg-slate-800/60 border-slate-700/50'; 
                if (isStart) bgStyle = 'bg-red-500/10 border-red-500/20';
                else if (isFinish) bgStyle = 'bg-green-500/10 border-green-500/20';
                
                if (isHunterTrail) bgStyle = 'bg-red-900/20 border-red-800/30'; // Stopa lovce
                if (isHunterHere) bgStyle = 'bg-gradient-to-r from-red-900/50 to-slate-800 border-red-500/40';
                
                if (isPreyPath) bgStyle = 'bg-green-900/20 border-green-800/30'; // Cesta štvance
                if (isPreyHere) bgStyle = 'bg-gradient-to-r from-green-900/50 to-slate-800 border-green-500/40';

                return (
                    <div key={fieldNum} className={`relative px-4 rounded-xl border transition-all duration-300 flex items-center justify-between ${bgStyle} 
                        min-h-[3rem] md:min-h-[5rem] py-2
                    `}>
                        <span className={`font-mono font-bold text-sm md:text-2xl ${
                            isStart ? 'text-red-500 tracking-widest' : isFinish ? 'text-green-500 tracking-widest' : 'text-slate-500'
                        }`}>
                            {isStart ? 'START' : isFinish ? 'CÍL' : fieldNum}
                        </span>
                        
                        <div className="flex gap-2">
                            {isHunterHere && (
                                <div className="flex items-center gap-1.5 bg-red-600 text-white px-2 py-1 md:px-4 md:py-2 rounded-lg shadow-lg animate-bounce z-10 transition-all duration-500">
                                    <Skull size={14} className="md:w-6 md:h-6" />
                                    <span className="text-[10px] md:text-sm font-bold uppercase">Lovec</span>
                                </div>
                            )}
                            {isPreyHere && (
                                <div className="flex items-center gap-1.5 bg-green-600 text-white px-2 py-1 md:px-4 md:py-2 rounded-lg shadow-lg animate-pulse z-10 transition-all duration-500">
                                    <User size={14} className="md:w-6 md:h-6"/>
                                    <span className="text-[10px] md:text-sm font-bold uppercase">Štvanec</span>
                                </div>
                            )}
                             {isFinish && !isPreyHere && <Flag className="text-slate-700 w-4 h-4 md:w-6 md:h-6"/>}
                        </div>
                    </div>
                );
                })}
            </div>
        </div>

        {/* === OVLÁDACÍ PANEL === */}
        <div className="shrink-0 bg-slate-800 border-t border-slate-600 md:border-t-0 md:border-l md:w-[500px] shadow-[0_-5px_30px_rgba(0,0,0,0.9)] z-30">
            
            <div className="p-3 md:p-8 flex flex-col justify-center h-full">
                
                {/* 1. ČEKÁNÍ NA START */}
                {!currentQuestion && !gameOver && (
                    <div className="flex flex-col md:gap-8 gap-4 items-center text-center pb-2">
                        <div className="space-y-2">
                            <h3 className="text-white text-lg md:text-2xl font-bold uppercase tracking-widest">
                                {isReady ? 'Čekání na soupeře' : 'PŘIPRAVENI KE HŘE?'}
                            </h3>
                            <p className="text-slate-400 text-xs md:text-sm">Potvrďte start kola</p>
                        </div>
                        
                        <button 
                            onClick={handleReadyClick}
                            disabled={isReady}
                            className={`w-full py-4 md:py-6 rounded-xl font-black text-xl md:text-3xl uppercase tracking-widest transition-all flex items-center justify-center gap-3 shadow-xl active:scale-95 ${
                                isReady 
                                ? 'bg-slate-700 text-slate-500 cursor-not-allowed border border-white/5' 
                                : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:brightness-110 text-white shadow-green-900/20'
                            }`}
                        >
                            {isReady ? <Clock className="animate-spin md:w-8 md:h-8"/> : <Play fill="currentColor" className="md:w-8 md:h-8"/>}
                            {isReady ? 'ČEKÁM' : 'START HRY'}
                        </button>
                    </div>
                )}

                {/* 2. OTÁZKA */}
                {currentQuestion && (
                    <div className="flex flex-col gap-3 md:gap-6 w-full max-w-lg mx-auto md:h-full md:justify-center">
                        
                        {/* Timer Line */}
                        <div className="w-full h-1.5 md:h-3 bg-slate-700 rounded-full overflow-hidden">
                             <div className={`h-full transition-all duration-1000 linear ${
                                timeLeft > 10 ? 'bg-cyan-400' : timeLeft > 5 ? 'bg-yellow-400' : 'bg-red-500'
                            }`} style={{ width: `${(timeLeft / 20) * 100}%` }} />
                        </div>

                        {/* Text otázky */}
                        <div className="flex justify-between items-start gap-3 mb-1">
                            <div className="flex-1">
                                <h3 className="text-white font-bold text-sm md:text-2xl leading-snug max-h-[60px] md:max-h-none overflow-y-auto md:overflow-visible [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
                                    {currentQuestion.question}
                                </h3>
                                {/* 🆕 Badge zdroje - minimální vizuální prvek */}
                                <span className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded ${
                                    currentQuestion._fromLLM 
                                        ? 'bg-green-900/50 text-green-400' 
                                        : 'bg-blue-900/50 text-blue-400'
                                }`}>
                                    {currentQuestion._fromLLM ? '⚡ LLM' : '🗄️ DB'}
                                </span>
                            </div>
                            {!roundResult && (
                                <div className={`shrink-0 w-8 h-8 md:w-16 md:h-16 rounded-lg border-2 flex items-center justify-center font-mono font-bold text-sm md:text-3xl ${getTimerColor()}`}>
                                    {timeLeft}
                                </div>
                            )}
                        </div>

                        {/* Odpovědi */}
                        <div className="grid grid-cols-1 gap-1.5 md:gap-4 max-h-[35vh] md:max-h-none overflow-y-auto md:overflow-visible [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
                            {currentQuestion.options.map((option, index) => {
                                const isSelected = selectedAnswer === index;
                                const showResult = roundResult !== null;
                                const isCorrect = showResult && index === currentQuestion.correct;
                                const isWrong = showResult && isSelected && index !== currentQuestion.correct;
                                
                                let btnStyle = "bg-slate-700 border-slate-600 text-slate-300";
                                if (isCorrect) btnStyle = "bg-green-600 border-green-500 text-white";
                                else if (isWrong) btnStyle = "bg-red-600 border-red-500 text-white";
                                else if (isSelected) btnStyle = "bg-cyan-700 border-cyan-500 text-white";

                                return (
                                    <button
                                        key={index}
                                        onClick={() => handleAnswerClick(index)}
                                        disabled={hasAnswered}
                                        className={`w-full p-2.5 md:p-5 rounded-lg font-medium text-left text-xs md:text-xl border transition-all flex items-center gap-2 md:gap-4 active:scale-98 ${btnStyle}`}
                                    >
                                        <div className="w-5 h-5 md:w-8 md:h-8 rounded bg-black/20 flex items-center justify-center text-[10px] md:text-sm font-bold shrink-0">
                                            {String.fromCharCode(65 + index)}
                                        </div>
                                        <span className="flex-1">{option}</span>
                                        {isCorrect && <CheckCircle size={14} className="shrink-0 md:w-6 md:h-6"/>}
                                        {isWrong && <XCircle size={14} className="shrink-0 md:w-6 md:h-6"/>}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Tlačítko Další kolo */}
                        {roundResult && showReadyButton && (
                            <button onClick={handleReadyClick} disabled={isReady} className="mt-2 w-full py-3 md:py-5 bg-orange-500 text-white font-bold uppercase rounded-lg shadow-lg animate-bounce border-t border-white/20 tracking-widest text-xs md:text-xl">
                                {isReady ? 'Čekám...' : 'PŘIPRAVENI NA DALŠÍ OTÁZKU?'}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>

      </div>
    </div>
  );
}