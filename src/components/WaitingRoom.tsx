import { useState, useEffect } from 'react';
import { Copy, Loader, Baby, Brain, Info } from 'lucide-react';

interface WaitingRoomProps {
  roomCode: string;
  socket: any;
}

export default function WaitingRoom({ roomCode, socket }: WaitingRoomProps) {
  const [gameMode, setGameMode] = useState<'adult' | 'kid'>('adult');

  useEffect(() => {
    socket.on('settings_changed', (settings: any) => {
      setGameMode(settings.mode);
    });

    return () => {
      socket.off('settings_changed');
    };
  }, [socket]);

  const handleCopy = () => {
    navigator.clipboard.writeText(roomCode);
  };

  const toggleMode = () => {
    const newMode = gameMode === 'adult' ? 'kid' : 'adult';
    setGameMode(newMode);
    socket.emit('update_settings', { code: roomCode, mode: newMode });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8 animate-fade-in relative z-10">
        
        <div className="text-center space-y-6">
          <Loader className="w-16 h-16 text-cyan-500 animate-spin mx-auto" />

          <h2 className="text-3xl font-bold text-white">
            Čekám na protihráče...
          </h2>

          {/* BOX S KÓDEM */}
          <div className="bg-slate-800 p-8 rounded-2xl border-2 border-cyan-500/50 shadow-lg shadow-cyan-500/20">
            <p className="text-slate-400 text-sm mb-3 font-semibold uppercase tracking-wider">Kód místnosti</p>
            <div className="flex items-center justify-center gap-4">
              <p className="text-5xl font-mono font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400 tracking-widest">
                {roomCode}
              </p>
              <button
                onClick={handleCopy}
                className="p-3 bg-cyan-600 hover:bg-cyan-500 rounded-xl transition-colors shadow-lg"
                title="Zkopírovat kód"
              >
                <Copy className="w-6 h-6 text-white" />
              </button>
            </div>
          </div>

          <p className="text-slate-500 text-sm">
            Sdílej tento kód s protihráčem
          </p>

          {/* --- OBLAST NASTAVENÍ --- */}
          <div className={`pt-6 border-t border-slate-700/50 transition-colors duration-500`}>
            
            {/* 1. AKTUÁLNÍ STAV (Badge) */}
            <div className="mb-4 flex flex-col items-center gap-2">
               <p className="text-slate-400 text-xs uppercase font-bold tracking-widest">
                 Aktuální nastavení
               </p>
               <div className={`
                 px-4 py-2 rounded-full font-bold text-sm flex items-center gap-2 border shadow-lg transition-all duration-300
                 ${gameMode === 'kid' 
                   ? 'bg-pink-500/20 border-pink-500 text-pink-300' // Kid stav = Růžová
                   : 'bg-blue-500/20 border-blue-500 text-blue-300'} // Adult stav = Modrá
               `}>
                 {gameMode === 'kid' ? <Baby size={16}/> : <Brain size={16}/>}
                 {gameMode === 'kid' ? 'HRAJEME REŽIM PRO JUNIORY' : 'HRAJEME REŽIM PRO DOSPĚLÉ'}
               </div>
            </div>

            {/* 2. PŘEPÍNACÍ TLAČÍTKO (Barva akce = Opak stavu) */}
            <button
              onClick={toggleMode}
              className={`
                w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl font-bold text-lg transition-all shadow-lg transform active:scale-95 border-2
                ${gameMode === 'kid' 
                  ? 'bg-blue-700 hover:bg-blue-600 border-blue-500 text-white shadow-blue-500/20' // Jsem Kid -> Chci Adult (Modrá)
                  : 'bg-pink-600 hover:bg-pink-500 border-pink-400 text-white shadow-pink-500/20'} // Jsem Adult -> Chci Kid (Růžová)
              `}
            >
              {gameMode === 'kid' ? (
                <>
                  <Brain className="w-6 h-6" />
                  <span>PŘEPNOUT NA DOSPĚLÉ</span>
                </>
              ) : (
                <>
                  <Baby className="w-6 h-6" />
                  <span>PŘEPNOUT NA JUNIORY</span>
                </>
              )}
            </button>
            
            <p className="text-slate-500 text-xs mt-3 flex items-center justify-center gap-1">
              <Info size={12} />
              {gameMode === 'kid' 
                ? 'Otázky pro děti 8-14 let (Pohádky, Zvířata, Sport...)' 
                : 'Otázky pro dospělé (Věda, Historie, Kultura...)'}
            </p>
          </div>

        </div>

        {/* POZADÍ EFEKT */}
        <div className="absolute inset-0 pointer-events-none -z-10">
          <div className={`absolute top-1/4 left-10 w-32 h-32 rounded-full blur-3xl animate-pulse transition-colors duration-1000 ${gameMode === 'kid' ? 'bg-pink-500/20' : 'bg-cyan-500/10'}`}></div>
          <div className={`absolute bottom-1/4 right-10 w-40 h-40 rounded-full blur-3xl animate-pulse delay-1000 transition-colors duration-1000 ${gameMode === 'kid' ? 'bg-purple-500/20' : 'bg-blue-500/10'}`}></div>
        </div>
      </div>
    </div>
  );
}