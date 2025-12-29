import { useState, useEffect, useRef } from 'react';
import { Copy, Check, Users, Zap } from 'lucide-react';

interface CountdownWaitingProps {
  roomCode: string;
  countdown: number;
  playersCount: number;
  ageGroup: string;
  aiProgress: { generated: number; target: number; ready?: boolean };
  onCountdownEnd: () => void;
}

// Mapování věkových skupin - NOVÉ 3 KATEGORIE
const AGE_GROUP_LABELS: Record<string, { emoji: string; name: string }> = {
  adult: { emoji: '👔', name: 'Dospělí' },
  student: { emoji: '🎒', name: 'Školáci' },
  kids: { emoji: '🐣', name: 'Děti' },
  // Legacy mappings
  teen: { emoji: '🎒', name: 'Školáci' },
  child: { emoji: '🐣', name: 'Děti' },
  preschool: { emoji: '🐣', name: 'Děti' }
};

export default function CountdownWaiting({
  roomCode,
  countdown,
  playersCount,
  ageGroup,
  aiProgress,
  onCountdownEnd
}: CountdownWaitingProps) {
  const [copied, setCopied] = useState(false);
  const [isUrgent, setIsUrgent] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioStartedRef = useRef(false);

  const ageGroupData = AGE_GROUP_LABELS[ageGroup] || AGE_GROUP_LABELS.adult;

  // 🔊 Spustit countdown audio když zbývá 30 sekund
  // Při 35s countdownu to znamená 5 sekund po startu
  useEffect(() => {
    if (countdown <= 30 && countdown > 0 && !audioStartedRef.current) {
      audioStartedRef.current = true;
      console.log('🔊 Starting countdown audio at', countdown, 'seconds remaining');
      
      try {
        audioRef.current = new Audio('/sounds/countdown.mp3');
        audioRef.current.volume = 0.7;
        audioRef.current.play().catch(e => {
          console.log('Audio autoplay blocked:', e);
          // Zkusit znovu při dalším user interaction
        });
      } catch (e) {
        console.log('Audio error:', e);
      }
    }

    // Cleanup při unmount
    return () => {
      if (audioRef.current && countdown <= 0) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [countdown]);

  // Reset audio flag při novém countdownu
  useEffect(() => {
    if (countdown > 30) {
      audioStartedRef.current = false;
    }
  }, [countdown]);

  // Cleanup při unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Urgentní efekt posledních 10 sekund
  useEffect(() => {
    setIsUrgent(countdown <= 10 && countdown > 0);
  }, [countdown]);

  // Countdown end
  useEffect(() => {
    if (countdown <= 0) {
      onCountdownEnd();
    }
  }, [countdown, onCountdownEnd]);

  // Kopírování kódu
  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Formátování času
  const formatTime = (seconds: number) => {
    if (seconds < 0) return '0';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    return secs.toString();
  };

  // Progress procenta
  const progressPercent = aiProgress.target > 0 
    ? Math.min(100, Math.round((aiProgress.generated / aiProgress.target) * 100))
    : 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center p-4 overflow-hidden">
      <div className="w-full max-w-lg space-y-8 animate-fade-in relative">
        
        {/* Hlavní countdown box */}
        <div className={`
          relative bg-slate-800/80 rounded-3xl p-8 border-2 
          transition-all duration-300
          ${isUrgent 
            ? 'border-red-500/70 shadow-2xl shadow-red-500/30' 
            : 'border-cyan-500/30 shadow-xl shadow-cyan-500/20'
          }
        `}>
          
          {/* Záhlaví */}
          <div className="text-center mb-6">
            <p className={`
              text-sm font-bold uppercase tracking-widest mb-2
              ${isUrgent ? 'text-red-400' : 'text-cyan-400'}
            `}>
              🎮 Do startu hry zbývá
            </p>
          </div>

          {/* Velký countdown */}
          <div className="text-center mb-6">
            <div className={`
              text-8xl font-black tabular-nums
              transition-all duration-300
              ${isUrgent 
                ? 'text-red-500 animate-pulse' 
                : 'text-white'
              }
              ${countdown <= 5 ? 'scale-110' : ''}
            `}>
              {formatTime(countdown)}
            </div>
            <p className="text-slate-400 mt-2">sekund</p>
          </div>

          {/* Kód místnosti */}
          <div className="bg-slate-900/50 rounded-2xl p-4 mb-6">
            <p className="text-slate-400 text-xs uppercase tracking-wider mb-2 text-center">
              Kód místnosti
            </p>
            <div className="flex items-center justify-center gap-3">
              <span className="text-3xl font-mono font-bold text-white tracking-widest">
                {roomCode}
              </span>
              <button
                onClick={handleCopyCode}
                className={`
                  p-2 rounded-lg transition-all
                  ${copied 
                    ? 'bg-green-500 text-white' 
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }
                `}
              >
                {copied ? <Check size={20} /> : <Copy size={20} />}
              </button>
            </div>
          </div>

          {/* Status hráčů */}
          <div className="flex items-center justify-center gap-4 mb-4">
            <div className={`
              flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold
              ${playersCount >= 2 
                ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
              }
            `}>
              <Users size={18} />
              <span>Hráči: {playersCount}/2</span>
              {playersCount >= 2 && <span>✓</span>}
            </div>
          </div>

          {/* Vybraná kategorie */}
          <div className="text-center">
            <span className="text-slate-500 text-sm">Obtížnost: </span>
            <span className="text-white font-semibold">
              {ageGroupData.emoji} {ageGroupData.name}
            </span>
          </div>
        </div>

        {/* LLM Progress - nenápadný */}
        <div className="bg-slate-800/40 rounded-xl p-3 border border-slate-700/50">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <div className="flex items-center gap-1">
              <Zap size={12} className={aiProgress.generated > 0 ? 'text-yellow-500' : ''} />
              <span>Příprava otázek</span>
            </div>
            <span>{aiProgress.generated}/{aiProgress.target}</span>
          </div>
          <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-yellow-500 to-green-500 rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          {aiProgress.ready && (
            <p className="text-green-500 text-xs mt-1 text-center">✓ Otázky připraveny</p>
          )}
        </div>

        {/* Pozadí efekty */}
        <div className="fixed inset-0 pointer-events-none -z-10">
          {/* Pulzující kruh */}
          <div className={`
            absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 
            w-96 h-96 rounded-full blur-3xl transition-all duration-1000
            ${isUrgent ? 'bg-red-500/20 scale-110' : 'bg-cyan-500/10'}
          `}></div>
          
          {/* Dekorativní kruhy */}
          <div className="absolute top-20 left-10 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-20 right-10 w-40 h-40 bg-purple-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
          
          {/* Radar efekt při urgentním stavu */}
          {isUrgent && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="w-64 h-64 border-2 border-red-500/30 rounded-full animate-ping"></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
