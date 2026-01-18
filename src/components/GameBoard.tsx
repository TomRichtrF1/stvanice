import { useState, useEffect, useRef } from 'react';
import { Target, User, CheckCircle, XCircle, Clock, Play, Baby, Brain, Skull, Flag, Loader } from 'lucide-react';
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
  _fromLLM?: boolean;
  _fromDb?: boolean;
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
  
  const hunter = players.find(p => p.role === 'hunter');
  const prey = players.find(p => p.role === 'prey');
  
  // POJISTKA PROTI BÍLÉ OBRAZOVCE
  if (!hunter && !prey) {
    return (
      <div className="fixed inset-0 bg-slate-900 flex flex-col items-center justify-center text-white gap-4">
        <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xl font-bold">Načítám herní plán...</p>
        <p className="text-slate-400 text-sm">Obnovuji spojení</p>
      </div>
    );
  }
  
  const serverHunterPos = hunter?.position || 0;
  const serverPreyPos = prey?.position || 0;

  // == LOKÁLNÍ STAV PRO VIZUÁLNÍ POZICE (ZPOŽDĚNÉ) ==
  const [visualHunterPos, setVisualHunterPos] = useState(serverHunterPos);
  const [visualPreyPos, setVisualPreyPos] = useState(serverPreyPos);

  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [opponentReady, setOpponentReady] = useState(false);
  const [showReadyButton, setShowReadyButton] = useState(false);
  const [timeLeft, setTimeLeft] = useState(20);
  
  const lastHunterPos = useRef<number>(-1);
  const lastPreyPos = useRef<number>(-1);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Poslouchat na player_ready_update
  useEffect(() => {
    if (!socket) return;

    const handleReadyUpdate = ({ players: updatedPlayers }: { players: any[] }) => {
      const opponent = updatedPlayers.find(p => p.role !== myRole);
      if (opponent) {
        setOpponentReady(opponent.ready);
      }
    };

    socket.on('player_ready_update', handleReadyUpdate);

    return () => {
      socket.off('player_ready_update', handleReadyUpdate);
    };
  }, [socket, myRole]);

  // === 1. SYNCHRONIZACE POZIC S EFEKTEM ZPOŽDĚNÍ ===
  useEffect(() => {
    if (roundResult) {
      // Posun figurek 2s PO zobrazení vyhodnocení
      const timer = setTimeout(() => {
        setVisualHunterPos(serverHunterPos);
        setVisualPreyPos(serverPreyPos);
      }, 2000);  // 2s po vyhodnocení
      return () => clearTimeout(timer);
    } else {
      // V jiných případech (start hry, reconnect) synchronizujeme hned
      setVisualHunterPos(serverHunterPos);
      setVisualPreyPos(serverPreyPos);
    }
  }, [serverHunterPos, serverPreyPos, roundResult]);

  // === 2. AUDIO EFEKTY POHYBU ===
  useEffect(() => {
    const hunterMoved = visualHunterPos !== lastHunterPos.current && lastHunterPos.current !== -1;
    const preyMoved = visualPreyPos !== lastPreyPos.current && lastPreyPos.current !== -1;
    
    if (hunterMoved || preyMoved) {
      playSfx('step.mp3');
    }
    
    if (visualHunterPos === visualPreyPos - 1 && visualHunterPos !== lastHunterPos.current && visualHunterPos > 0) {
      setTimeout(() => playSfx('danger.mp3'), 300);
    }
    if (visualPreyPos === 7 && visualPreyPos !== lastPreyPos.current) {
      setTimeout(() => playSfx('hope.mp3'), 300);
    }
    
    lastHunterPos.current = visualHunterPos;
    lastPreyPos.current = visualPreyPos;
  }, [visualHunterPos, visualPreyPos, playSfx]);

  // === AUDIO TICK-TACK ===
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
      // 🆕 Prodloužit čekání na zobrazení tlačítka (po posunu figurek)
      const timeout = setTimeout(() => setShowReadyButton(true), 3000);  // 3s po vyhodnocení (1s po posunu)
      return () => clearTimeout(timeout);
    } else {
      setShowReadyButton(false);
      setIsReady(false);
      setOpponentReady(false);
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
    if (isReady) return;
    setIsReady(true);
    if (socket) {
      socket.emit('player_ready', { code: roomCode });
      console.log('📤 Odesláno player_ready');
    }
  };

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

  return (
    <div className="fixed inset-0 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex flex-col md:flex-row overflow-hidden">
      
      {/* Hlavička s rolí - mobilní verze - RESPONSIVNÍ */}
      <div className="shrink-0 bg-slate-800/90 p-1.5 shadow-lg z-20 flex justify-between items-center md:hidden border-b border-slate-700 gap-2 overflow-hidden">
        <div className={`flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded border ${myRole === 'hunter' ? 'bg-red-500/20 border-red-500/50 text-red-400' : 'bg-green-500/20 border-green-500/50 text-green-400'}`}>
          {myRole === 'hunter' ? <Target size={14} /> : <User size={14} />}
          <span className="text-[10px] font-bold uppercase whitespace-nowrap">
            <span className="hidden min-[360px]:inline">Jsi </span>
            {myRole === 'hunter' ? 'Lovec' : 'Štvanec'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[9px] text-cyan-400 font-mono truncate">{roomCode}</span>
          <div className="flex-shrink-0 flex items-center gap-0.5 px-1 py-0.5 bg-slate-700/50 rounded text-[9px]">
            {gameMode === 'kid' ? <Baby size={10} className="text-pink-400"/> : <Brain size={10} className="text-cyan-400"/>}
            <span className="text-slate-400 hidden min-[400px]:inline">{gameMode === 'kid' ? 'Jr' : 'Dosp'}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        
        {/* === HERNÍ PLÁN === */}
        <div className="flex-1 flex flex-col min-h-0 bg-slate-800/30 md:p-8 p-3 overflow-y-auto md:overflow-visible relative">
            
            {/* Desktop: Hlavička s rolí - RESPONSIVNÍ */}
            <div className="hidden md:flex justify-between items-center mb-4 gap-3 overflow-hidden">
                <div className={`flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-lg border ${myRole === 'hunter' ? 'bg-red-500/20 border-red-500/70 text-red-400' : 'bg-green-500/20 border-green-500/70 text-green-400'}`}>
                  {myRole === 'hunter' ? <Target size={18} /> : <User size={18} />}
                  <span className="text-sm font-bold uppercase whitespace-nowrap">{myRole === 'hunter' ? 'Jsi Lovec' : 'Jsi Štvanec'}</span>
                </div>
                <div className="flex items-center gap-3 min-w-0">
                  {/* Kód místnosti */}
                  <span className="text-slate-400 text-xs font-mono truncate">
                    Kód: <span className="text-cyan-400 font-bold">{roomCode}</span>
                  </span>
                  {/* Režim */}
                  <div className="flex-shrink-0 flex items-center gap-1.5 px-2 py-1 bg-slate-700/50 rounded border border-slate-600">
                    {gameMode === 'kid' ? <Baby size={14} className="text-pink-400"/> : <Brain size={14} className="text-cyan-400"/>}
                    <span className="text-slate-300 text-xs font-semibold whitespace-nowrap">{gameMode === 'kid' ? 'Junior' : 'Dospělí'}</span>
                  </div>
                </div>
            </div>
            
            {/* Mapa polí */}
            <div className="flex flex-col gap-1 md:gap-4 flex-1 justify-center">
                {[...fields].reverse().map((fieldNum) => {
                const isHunterHere = visualHunterPos === fieldNum;
                const isPreyHere = visualPreyPos === fieldNum;
                const isStart = fieldNum === 0;
                const isFinish = fieldNum === 8;
                
                const isHunterTrail = visualHunterPos > 0 && fieldNum < visualHunterPos && fieldNum > 0;
                const isPreyPath = visualPreyPos > 0 && fieldNum > visualPreyPos && fieldNum < 8;

                let bgStyle = 'bg-slate-800/60 border-slate-700/50'; 
                if (isStart) bgStyle = 'bg-red-500/10 border-red-500/20';
                else if (isFinish) bgStyle = 'bg-green-500/10 border-green-500/20';
                
                if (isHunterTrail) bgStyle = 'bg-red-900/20 border-red-800/30';
                if (isHunterHere) bgStyle = 'bg-gradient-to-r from-red-900/50 to-slate-800 border-red-500/40';
                
                if (isPreyPath) bgStyle = 'bg-green-900/20 border-green-800/30';
                if (isPreyHere) bgStyle = 'bg-gradient-to-r from-green-900/50 to-slate-800 border-green-500/40';

                return (
                    <div key={fieldNum} className={`relative px-2 md:px-4 rounded-xl border transition-all duration-300 flex items-center justify-between ${bgStyle}
                        min-h-[2rem] md:min-h-[5rem] py-1 md:py-2
                    `}>
                        <span className={`font-mono font-bold text-xs md:text-2xl ${
                            isStart ? 'text-red-500 tracking-widest' : isFinish ? 'text-green-500 tracking-widest' : 'text-slate-500'
                        }`}>
                            {isStart ? 'START' : isFinish ? 'CÍL' : fieldNum}
                        </span>
                        
                        <div className="flex gap-2">
                            {isHunterHere && (
                                <div className="flex items-center gap-1 md:gap-1.5 bg-red-600 text-white px-1.5 py-0.5 md:px-4 md:py-2 rounded-lg shadow-lg animate-bounce z-10 transition-all duration-500">
                                    <Skull size={12} className="md:w-6 md:h-6" />
                                    <span className="text-[8px] md:text-sm font-bold uppercase">Lovec</span>
                                </div>
                            )}
                            {isPreyHere && (
                                <div className="flex items-center gap-1 md:gap-1.5 bg-green-600 text-white px-1.5 py-0.5 md:px-4 md:py-2 rounded-lg shadow-lg animate-pulse z-10 transition-all duration-500">
                                    <User size={12} className="md:w-6 md:h-6"/>
                                    <span className="text-[8px] md:text-sm font-bold uppercase">Štvanec</span>
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
                                {/* Badge zdroje */}
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

                        {/* Perplexity fact-check odkaz */}
                        {roundResult && currentQuestion && (
                          <a
                            href={`https://www.perplexity.ai/search?q=${encodeURIComponent(
                              `${currentQuestion.question} Je správná odpověď A) ${currentQuestion.options[0]}, B) ${currentQuestion.options[1]}, nebo C) ${currentQuestion.options[2]}?`
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center gap-1 text-slate-500 hover:text-purple-400 text-xs mt-2 transition-colors"
                          >
                            <span>🔍</span>
                            <span>Ověřit na Perplexity</span>
                            <span className="text-[10px]">↗</span>
                          </a>
                        )}

                        {/* 🆕 BUG11 FIX: Tlačítko Další kolo - SKRÝT při gameOver */}
                        {roundResult && showReadyButton && !gameOver && (
                          <div className="space-y-2 mt-2">
                            <button 
                              onClick={handleReadyClick} 
                              disabled={isReady} 
                              className={`w-full py-3 md:py-5 font-bold uppercase rounded-lg shadow-lg border-t border-white/20 tracking-widest text-xs md:text-xl transition-all ${
                                isReady 
                                  ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                                  : 'bg-orange-500 text-white animate-bounce'
                              }`}
                            >
                              {isReady ? (
                                <span className="flex items-center justify-center gap-2">
                                  <Loader className="w-5 h-5 animate-spin" />
                                  ČEKÁM NA SOUPEŘE...
                                </span>
                              ) : (
                                'PŘIPRAVENI NA DALŠÍ OTÁZKU?'
                              )}
                            </button>
                            
                            {/* Indikátor stavu připravenosti */}
                            <div className="flex justify-center gap-4 text-xs">
                              <span className={`px-3 py-1 rounded-full ${isReady ? 'bg-green-600 text-white' : 'bg-slate-700 text-slate-400'}`}>
                                Ty: {isReady ? '✓ Připraven' : 'Čekám'}
                              </span>
                              <span className={`px-3 py-1 rounded-full ${opponentReady ? 'bg-green-600 text-white' : 'bg-slate-700 text-slate-400'}`}>
                                Soupeř: {opponentReady ? '✓ Připraven' : 'Čekám'}
                              </span>
                            </div>
                          </div>
                        )}
                    </div>
                )}
            </div>
        </div>

      </div>
    </div>
  );
}
