import { useState, useEffect, useRef } from 'react';
import { Target, User, CheckCircle, XCircle, Clock, Play, Baby, Brain } from 'lucide-react';
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
  
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [showReadyButton, setShowReadyButton] = useState(false);
  const [timeLeft, setTimeLeft] = useState(20);
  
  const lastHunterPos = useRef<number>(-1);
  const lastPreyPos = useRef<number>(-1);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // === AUDIO LOGIKA (Zůstává stejná) ===
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
    const hunter = players.find(p => p.role === 'hunter');
    const prey = players.find(p => p.role === 'prey');

    if (hunter && prey) {
        if (hunter.position === prey.position - 1 && hunter.position !== lastHunterPos.current && hunter.position > 0) {
            playSfx('danger.mp3');
        }
        if (prey.position === 7 && prey.position !== lastPreyPos.current) {
             playSfx('hope.mp3');
        }
        lastHunterPos.current = hunter.position;
        lastPreyPos.current = prey.position;
    }
  }, [players, playSfx]);

  useEffect(() => {
    if (gameOver && winner) {
      stopTickTack();
      if (winner === 'prey') playSfx('triumph.mp3');
      else playSfx('failure.mp3');
    }
  }, [gameOver, winner, playSfx, stopTickTack]);

  // === LOGIKA TIMERU (Zůstává stejná) ===
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
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center p-4 overflow-hidden">
        <GameEndOverlay winner={winner} myRole={myRole} onRestart={onRestart} />
      </div>
    );
  }

  return (
    // HLAVNÍ KONTEJNER
    // Na mobilu je to sloupec (flex-col), zarovnaný na střed.
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 p-4 py-8 flex flex-col items-center relative">
      
      {/* OBSAHOVÝ KONTEJNER - TADY SE DĚJE MAGIE */}
      {/* Na mobilu: max-w-md (úzký), flex-col (pod sebou), gap-6 */}
      {/* Na desktopu (md:): max-w-6xl (široký), flex-row (vedle sebe), gap-8, items-start (zarovnat nahoru) */}
      <div className="w-full max-w-md md:max-w-6xl mx-auto flex flex-col md:flex-row gap-6 md:gap-8 md:items-start flex-1 justify-center z-10">

        {/* === LEVÝ SLOUPEC (Header + Mapa) === */}
        {/* Na desktopu má fixní šířku 400px a nesmrskne se (flex-shrink-0) */}
        <div className="w-full md:w-[400px] space-y-6 flex-shrink-0">
            {/* HEADER */}
            <div className={`w-full p-6 rounded-2xl shadow-xl flex items-center justify-center gap-5 border-2 transition-all duration-500 transform hover:scale-[1.02] ${
                myRole === 'hunter' 
                ? 'bg-gradient-to-r from-red-900/90 to-red-600/90 border-red-500 text-white shadow-red-900/50' 
                : 'bg-gradient-to-r from-green-900/90 to-green-600/90 border-green-500 text-white shadow-green-900/50'
            }`}>
                <span className="text-5xl filter drop-shadow-lg">{myRole === 'hunter' ? '👹' : '🏃'}</span>
                <div className="flex flex-col items-start">
                    <h2 className="text-3xl font-black tracking-widest uppercase drop-shadow-md leading-none">
                        {myRole === 'hunter' ? 'JSI LOVEC' : 'JSI ŠTVANEC'}
                    </h2>
                    <span className={`text-sm font-bold tracking-[0.3em] uppercase opacity-90 mt-1 ${
                        myRole === 'hunter' ? 'text-red-200' : 'text-green-200'
                    }`}>
                        {myRole === 'hunter' ? 'Nemá šanci utéct' : 'Běž o život'}
                    </span>
                </div>
            </div>

            {/* MAPA */}
            <div className="bg-slate-800 rounded-2xl p-6 border-2 border-slate-700 space-y-3 shadow-2xl">
                {fields.map((fieldNum) => {
                const isHunterHere = hunter?.position === fieldNum;
                const isPreyHere = prey?.position === fieldNum;
                const isStart = fieldNum === 0;
                const isFinish = fieldNum === 8;
                const isHunterTrail = hunter?.position && fieldNum < hunter.position && fieldNum > 0;
                const isPreyPath = prey?.position && fieldNum > prey.position && fieldNum < 8;

                let bgStyle = 'bg-slate-700 border-slate-600'; 
                if (isStart) bgStyle = 'bg-red-900/30 border-red-600';
                else if (isFinish) bgStyle = 'bg-green-900/30 border-green-600';
                else if (isHunterTrail) bgStyle = 'bg-red-600/40 border-red-500 shadow-[inset_0_0_15px_rgba(220,38,38,0.4)]';
                else if (isPreyPath) bgStyle = 'bg-green-600/40 border-green-500 shadow-[inset_0_0_15px_rgba(34,197,94,0.4)]';

                return (
                    <div key={fieldNum} className={`relative p-4 rounded-xl border-2 transition-all duration-500 ${bgStyle}`}>
                    <div className="flex items-center justify-between">
                        <span className={`font-mono font-bold transition-colors duration-500 ${isHunterTrail || isPreyPath ? 'text-white' : 'text-slate-400'}`}>
                            {isStart ? 'START' : isFinish ? 'CÍL' : `${fieldNum}`}
                        </span>
                        <div className="flex gap-2 z-10 relative">
                        {isHunterHere && <div className="bg-red-600 px-3 py-1 rounded-lg text-white font-bold text-sm flex items-center gap-1 animate-bounce shadow-lg shadow-red-500/50"><Target size={16} /> 👹</div>}
                        {isPreyHere && <div className="bg-green-600 px-3 py-1 rounded-lg text-white font-bold text-sm flex items-center gap-1 animate-bounce shadow-lg shadow-green-500/50"><User size={16} /> 🏃</div>}
                        </div>
                    </div>
                    </div>
                );
                })}
            </div>
        </div>

        {/* === PRAVÝ SLOUPEC (Otázka / Start) === */}
        {/* Na desktopu zabere zbývající místo (flex-1) */}
        <div className="w-full flex-1">
            {/* START BUTTON */}
            {!currentQuestion && !gameOver && (
            <div className="bg-slate-800 rounded-2xl p-8 border-2 border-cyan-500/50 space-y-4 animate-fade-in shadow-2xl text-center md:mt-0">
                <h3 className="text-white text-2xl font-bold mb-6">PŘIPRAVENI KE HŘE?</h3>
                <div className="flex justify-center">
                    <button 
                    onClick={handleReadyClick}
                    disabled={isReady}
                    className={`w-full py-8 rounded-xl font-black text-3xl uppercase tracking-widest transition-all transform flex items-center justify-center gap-4 ${
                        isReady 
                        ? 'bg-slate-600 text-slate-400 cursor-wait' 
                        : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white hover:scale-105 shadow-lg shadow-green-500/30'
                    }`}
                    >
                    {isReady ? 'ČEKÁM NA SOUPEŘE...' : <><Play size={36} fill="currentColor" /> START HRY</>}
                    </button>
                </div>
                <p className="text-slate-400 text-sm mt-4">Hra začne, až oba hráči potvrdí start.</p>
            </div>
            )}

            {/* OTÁZKA */}
            {currentQuestion && (
            <div className="bg-slate-800 rounded-2xl p-6 border-2 border-slate-700 space-y-6 animate-slide-up shadow-2xl relative overflow-hidden md:p-8">
                {!roundResult && (
                <div className="absolute top-0 left-0 h-3 bg-slate-700 w-full">
                    <div className={`h-full transition-all duration-1000 ease-linear ${timeLeft > 10 ? 'bg-cyan-500' : timeLeft > 5 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${(timeLeft / 20) * 100}%` }} />
                </div>
                )}
                <div className="flex justify-between items-start pt-4">
                    {/* Zvětšený text otázky pro desktop (md:text-3xl) */}
                    <h3 className="text-white text-xl md:text-3xl font-bold text-left leading-relaxed flex-1">{currentQuestion.question}</h3>
                    {!roundResult && (
                        <div className={`ml-6 w-16 h-16 rounded-full border-4 flex items-center justify-center font-bold text-2xl ${getTimerColor()}`}>
                            {timeLeft}
                        </div>
                    )}
                </div>
                <div className="space-y-4">
                {currentQuestion.options.map((option, index) => {
                    const isSelected = selectedAnswer === index;
                    const showResult = roundResult !== null;
                    const isCorrect = showResult && index === currentQuestion.correct;
                    const isWrong = showResult && isSelected && index !== currentQuestion.correct;
                    let btnStyle = "bg-slate-700 border-slate-600 text-white hover:bg-slate-600 hover:border-slate-500";
                    if (isCorrect) btnStyle = "bg-green-600 border-green-400 text-white shadow-lg shadow-green-500/20 transform scale-105";
                    else if (isWrong) btnStyle = "bg-red-600 border-red-400 text-white shadow-lg shadow-red-500/20";
                    else if (isSelected && !showResult) btnStyle = "bg-cyan-600 border-cyan-400 text-white shadow-lg shadow-cyan-500/20";
                    else if (hasAnswered) btnStyle = "bg-slate-700/50 border-slate-700 text-slate-500";

                    return (
                    <button
                        key={index}
                        onClick={() => handleAnswerClick(index)}
                        disabled={hasAnswered}
                        // Zvětšená tlačítka a text pro desktop (md:text-xl, md:p-6)
                        className={`w-full p-4 md:p-6 rounded-xl font-semibold text-left md:text-xl transition-all active:scale-95 flex items-center gap-4 border-2 ${btnStyle}`}
                    >
                        <span className={`w-8 h-8 md:w-10 md:h-10 rounded-lg flex items-center justify-center font-bold ${isSelected || isCorrect || isWrong ? 'bg-black/20' : 'bg-slate-900'}`}>{String.fromCharCode(65 + index)}</span>
                        <span className="flex-1">{option}</span>
                        {isCorrect && <CheckCircle size={28} className="animate-pulse" />}
                        {isWrong && <XCircle size={28} className="animate-bounce" />}
                    </button>
                    );
                })}
                </div>
                {hasAnswered && !roundResult && (
                <div className="flex items-center justify-center gap-2 text-cyan-400 animate-pulse bg-slate-900/50 p-4 rounded-xl md:text-lg">
                    <Clock size={24} /> <span className="font-semibold tracking-wide">Odpověď odeslána. Čekám na soupeře...</span>
                </div>
                )}
                {roundResult && showReadyButton && (
                    <div className="pt-6 animate-fade-in">
                        <button onClick={handleReadyClick} disabled={isReady} className={`w-full py-6 rounded-xl font-bold text-2xl uppercase tracking-widest transition-all transform ${isReady ? 'bg-slate-600 text-slate-400 cursor-wait' : 'bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-white hover:scale-105 shadow-lg shadow-orange-500/30'}`}>
                            {isReady ? 'ČEKÁM NA SOUPEŘE...' : 'PŘIPRAVENI NA DALŠÍ OTÁZKU?'}
                        </button>
                    </div>
                )}
                {roundResult && !showReadyButton && (
                    <div className="text-center text-slate-400 text-lg animate-pulse pt-2">Vyhodnocení...</div>
                )}
            </div>
            )}
        </div>
      </div>
      
      {/* FOOTER S INFORMACÍ O MÓDU */}
      {/* Na desktopu ho posuneme trochu dolů (md:mt-12) */}
      <div className="mt-8 md:mt-12 text-center opacity-50 hover:opacity-100 transition-opacity z-10">
        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border ${gameMode === 'kid' ? 'border-pink-500 text-pink-300' : 'border-blue-500 text-blue-300'}`}>
             {gameMode === 'kid' ? <Baby size={14}/> : <Brain size={14}/>}
             <span className="text-xs font-bold tracking-widest uppercase">
                 {gameMode === 'kid' ? 'REŽIM JUNIOR' : 'REŽIM DOSPĚLÝ'}
             </span>
        </div>
      </div>

       {/* Pozadí efekt */}
       <div className="absolute inset-0 pointer-events-none">
          <div className={`absolute top-1/4 left-10 w-96 h-96 rounded-full blur-[150px] animate-pulse transition-colors duration-1000 opacity-30 ${gameMode === 'kid' ? 'bg-pink-600/30' : 'bg-cyan-600/30'}`}></div>
          <div className={`absolute bottom-1/4 right-10 w-96 h-96 rounded-full blur-[150px] animate-pulse delay-1000 transition-colors duration-1000 opacity-30 ${gameMode === 'kid' ? 'bg-purple-600/30' : 'bg-blue-600/30'}`}></div>
        </div>
    </div>
  );
}