import { useState } from 'react';
import { Copy, Loader, HelpCircle, Eye, Ticket } from 'lucide-react';

interface WaitingRoomProps {
  roomCode: string;
  socket: any;
}

export default function WaitingRoom({ roomCode, socket }: WaitingRoomProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(roomCode);
  };

  // 🎫 Handler pro nákup vstupenky
  const handleBuyTicket = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      const data = await response.json();
      
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Chyba při vytváření platby:', error);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6 animate-fade-in relative z-10">
        
        <div className="text-center space-y-6">
          <Loader className="w-16 h-16 text-cyan-500 animate-spin mx-auto" />

          <h2 className="text-3xl font-bold text-white">
            Čekám na protihráče...
          </h2>

          {/* BOX S KÓDEM */}
          <div className="bg-slate-800 p-6 rounded-2xl border-2 border-cyan-500/50 shadow-lg shadow-cyan-500/20">
            <p className="text-slate-400 text-sm mb-2 font-semibold uppercase tracking-wider">Kód místnosti</p>
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
            <p className="text-slate-500 text-sm mt-3">
              Sdílej tento kód s protihráčem
            </p>
          </div>

          {/* 🎫 VSTUPENKA DO DIVÁCKÉ MÍSTNOSTI */}
          <div className="bg-gradient-to-br from-amber-900/30 to-orange-900/30 rounded-2xl p-4 border border-amber-500/30">
            <div className="flex items-center justify-center gap-2 mb-3">
              <Eye className="w-5 h-5 text-amber-400" />
              <p className="text-amber-300 font-bold text-sm uppercase tracking-wider">
                Divácká místnost
              </p>
            </div>
            
            <p className="text-slate-400 text-sm mb-3">
              Chcete, aby diváci mohli sledovat vaši hru na projektoru nebo TV?
            </p>
            
            <button
              onClick={handleBuyTicket}
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:from-slate-700 disabled:to-slate-700 text-white font-bold py-3 px-6 rounded-xl transition-all transform hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
            >
              {isLoading ? (
                <Loader className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Ticket className="w-5 h-5" />
                  <span>KOUPIT VSTUPENKU</span>
                  <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs">139 Kč/měsíc</span>
                </>
              )}
            </button>
            
            <p className="text-slate-500 text-xs mt-2">
              Jednorázová platba, bez automatického obnovování
            </p>
          </div>

          {/* ❓ FAQ ODKAZ */}
          <div className="pt-2">
            <a
              href="/faq"
              className="inline-flex items-center gap-2 text-slate-500 hover:text-cyan-400 text-sm transition-colors"
            >
              <HelpCircle size={14} />
              <span>Nevíš jak hrát? Přečti si pravidla</span>
            </a>
          </div>

        </div>

        {/* POZADÍ EFEKT */}
        <div className="absolute inset-0 pointer-events-none -z-10">
          <div className="absolute top-1/4 left-10 w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-1/4 right-10 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
        </div>
      </div>
    </div>
  );
}
