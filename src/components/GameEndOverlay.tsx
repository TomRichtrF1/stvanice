import { Trophy, Frown, RefreshCw, Home, HelpCircle } from 'lucide-react';

interface GameEndOverlayProps {
  winner: 'hunter' | 'prey';
  myRole: 'hunter' | 'prey';
  onRestart: () => void;
}

export default function GameEndOverlay({ winner, myRole, onRestart }: GameEndOverlayProps) {
  const iAmWinner = winner === myRole;
  const isHunter = myRole === 'hunter';

  let title, subtitle, icon, bgColor;

  // Logika pro barvy a texty
  if (iAmWinner) {
    title = isHunter ? 'KOŘIST ULOVENA!' : 'UNIKL JSI!';
    subtitle = isHunter ? 'Štvanec neměl šanci.' : 'Lovec ostrouhal.';
    icon = <Trophy className="w-32 h-32 text-yellow-400 animate-bounce drop-shadow-[0_0_25px_rgba(250,204,21,0.5)]" />;
    bgColor = isHunter ? 'from-red-900/80 via-red-600/50' : 'from-green-900/80 via-green-600/50';
  } else {
    title = isHunter ? 'KOŘIST UNIKLA!' : 'BYL JSI DOPADEN!';
    subtitle = isHunter ? 'Štvanec se schoval do úkrytu.' : 'Lovec tě dostal.';
    icon = <Frown className="w-32 h-32 text-slate-400 animate-pulse drop-shadow-[0_0_25px_rgba(148,163,184,0.3)]" />;
    bgColor = 'from-slate-900/90 via-slate-800/80';
  }

  return (
    <div className={`fixed inset-0 z-50 flex flex-col items-center justify-center p-4 animate-fade-in backdrop-blur-xl bg-gradient-to-b ${bgColor} to-slate-900`}>
      
      {/* Dekorativní prvky na pozadí */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className={`absolute top-1/4 left-1/4 w-96 h-96 rounded-full mix-blend-overlay filter blur-[120px] opacity-40 animate-pulse ${iAmWinner ? (isHunter ? 'bg-red-600' : 'bg-green-600') : 'bg-slate-600'}`}></div>
          <div className={`absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full mix-blend-overlay filter blur-[120px] opacity-40 animate-pulse delay-1000 ${iAmWinner ? (isHunter ? 'bg-orange-600' : 'bg-emerald-600') : 'bg-slate-700'}`}></div>
      </div>

      <div className="relative z-10 text-center space-y-8 max-w-md w-full pointer-events-auto">
        {/* Ikona a texty */}
        <div className="flex justify-center mb-8 transform hover:scale-110 transition-transform duration-500">
            {icon}
        </div>
        
        <div className="space-y-2">
          <h1 className="text-5xl md:text-6xl font-black text-white uppercase tracking-tighter drop-shadow-2xl">
            {title}
          </h1>
          <p className="text-xl md:text-2xl text-slate-300 font-bold tracking-widest uppercase">
            {subtitle}
          </p>
        </div>

        {/* MODERNÍ TLAČÍTKA */}
        <div className="flex flex-col gap-4 pt-8 w-full">
          {/* Tlačítko HRÁT ZNOVU - Výrazné */}
          <button
            onClick={onRestart}
            className="group relative w-full flex items-center justify-center gap-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 p-5 rounded-2xl font-black text-xl text-white shadow-xl shadow-cyan-500/30 transition-all transform hover:scale-[1.02] active:scale-95 overflow-hidden tracking-wide uppercase border-t border-cyan-400/20"
          >
            <div className="absolute inset-0 bg-white/10 group-hover:bg-transparent transition-colors"></div>
            <RefreshCw className="w-7 h-7 group-hover:rotate-180 transition-transform duration-700 ease-in-out" />
            <span className="relative z-10 drop-shadow-sm">Hrát znovu</span>
          </button>

          {/* Tlačítko ZALOŽIT NOVOU HRU - Decentnější */}
          <button
            onClick={() => window.location.reload()}
            className="group w-full flex items-center justify-center gap-3 bg-gradient-to-b from-slate-700 to-slate-800 hover:from-slate-600 hover:to-slate-700 p-5 rounded-2xl font-bold text-lg text-slate-200 border-2 border-slate-700 hover:border-slate-600 shadow-lg transition-all transform hover:scale-[1.02] active:scale-95 uppercase tracking-wide"
          >
             <Home className="w-6 h-6 group-hover:-translate-y-1 transition-transform duration-300" />
            <span>Založit novou hru</span>
          </button>
        </div>

        {/* ❓ FAQ odkaz - NOVÉ */}
        <div className="pt-4">
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
