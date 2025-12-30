import { useState } from 'react';
import { UserPlus, Users, HelpCircle, Eye, Ticket } from 'lucide-react';

// Stripe Payment Link - cena 139 Kč/měsíc
const STRIPE_CHECKOUT_URL = 'https://buy.stripe.com/bJebJ15E3bXs7DG8l25wI01';

interface LobbyProps {
  onCreateGame: () => void;
  onJoinGame: (code: string) => void;
}

export default function Lobby({ onCreateGame, onJoinGame }: LobbyProps) {
  const [showJoinInput, setShowJoinInput] = useState(false);
  const [joinCode, setJoinCode] = useState('');

  const handleJoin = () => {
    if (joinCode.length === 6) {
      onJoinGame(joinCode.toUpperCase());
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center p-4 overflow-hidden relative">
      
      {/* Pozadí s efekty */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-20 left-10 w-64 h-64 bg-red-500/10 rounded-full blur-[100px] animate-pulse"></div>
        <div className="absolute bottom-20 right-10 w-64 h-64 bg-blue-500/10 rounded-full blur-[100px] animate-pulse delay-1000"></div>
      </div>

      <div className="w-full max-w-md space-y-12 animate-fade-in relative z-10">
        
        {/* Logo a hlavička */}
        <div className="text-center space-y-4">
          <div className="flex justify-center mb-2">
            {/* Ikona honička */}
            <div className="relative bg-gradient-to-br from-orange-600 to-red-700 p-6 rounded-3xl shadow-2xl shadow-orange-500/30 transform rotate-3 border-t border-orange-400/50 overflow-hidden group hover:rotate-6 transition-all duration-500 hover:scale-105">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-yellow-400/20 to-transparent opacity-50 group-hover:opacity-70 transition-opacity"></div>
                
                {/* Scénka honičky */}
                <div className="flex items-center gap-1 relative z-10 transform -rotate-3 group-hover:-rotate-6 transition-all duration-500">
                    <span className="text-5xl animate-pulse filter drop-shadow-lg transform scale-x-[-1] group-hover:-translate-x-2 transition-transform">🏃</span> 
                    <div className="flex space-x-1 opacity-70">
                        <div className="w-2 h-1 bg-yellow-300 rounded-full animate-ping delay-75"></div>
                        <div className="w-2 h-1 bg-orange-300 rounded-full animate-ping delay-150"></div>
                    </div>
                    <span className="text-5xl animate-bounce filter drop-shadow-lg delay-100 group-hover:translate-x-2 transition-transform">👹</span> 
                </div>
            </div>
          </div>
          <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500 drop-shadow-sm tracking-tight pb-2">
            ŠTVANICE
          </h1>
          <div className="space-y-1">
            <p className="text-slate-300 text-base font-bold tracking-wide uppercase">
              Napínavá vědomostní hra pro dva
            </p>
            <p className="text-slate-500 text-xs font-medium tracking-wider">
              REŽIM: DOSPĚLÍ / JUNIOR • DIVÁCKÁ MÍSTNOST PRO FANDĚNÍ
            </p>
          </div>
        </div>

        {/* Hlavní menu */}
        {!showJoinInput ? (
          <div className="space-y-4">
            {/* ❓ TLAČÍTKO JAK HRÁT */}
            <a
              href="/faq"
              className="group w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold py-4 px-8 rounded-2xl text-lg shadow-xl shadow-purple-900/30 transition-all transform hover:scale-[1.02] active:scale-95 flex items-center justify-between border border-purple-500/20"
            >
              <div className="flex items-center gap-4">
                <div className="bg-white/20 p-2 rounded-xl group-hover:bg-white/30 transition-colors shadow-inner">
                  <HelpCircle size={24} className="text-white" />
                </div>
                <span className="tracking-wide drop-shadow-sm">JAK HRÁT?</span>
              </div>
              <div className="text-purple-100 text-sm font-semibold bg-purple-700/30 px-3 py-1 rounded-full">Pravidla</div>
            </a>

            <button
              onClick={onCreateGame}
              className="group w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-bold py-6 px-8 rounded-2xl text-xl shadow-xl shadow-green-900/30 transition-all transform hover:scale-[1.02] active:scale-95 flex items-center justify-between border border-green-500/20"
            >
              <div className="flex items-center gap-4">
                <div className="bg-white/20 p-3 rounded-xl group-hover:bg-white/30 transition-colors shadow-inner">
                  <Users size={28} className="text-white" />
                </div>
                <span className="tracking-wide drop-shadow-sm">ZALOŽIT HRU</span>
              </div>
              <div className="text-green-100 text-sm font-semibold bg-green-700/30 px-3 py-1 rounded-full">Hostovat</div>
            </button>

            <button
              onClick={() => setShowJoinInput(true)}
              className="group w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold py-6 px-8 rounded-2xl text-xl shadow-xl shadow-blue-900/30 transition-all transform hover:scale-[1.02] active:scale-95 flex items-center justify-between border border-blue-500/20"
            >
              <div className="flex items-center gap-4">
                <div className="bg-white/20 p-3 rounded-xl group-hover:bg-white/30 transition-colors shadow-inner">
                  <UserPlus size={28} className="text-white" />
                </div>
                <span className="tracking-wide drop-shadow-sm">PŘIPOJIT SE</span>
              </div>
              <div className="text-blue-100 text-sm font-semibold bg-blue-700/30 px-3 py-1 rounded-full">Mám kód</div>
            </button>
          </div>
        ) : (
          /* Vstup pro kód */
          <div className="space-y-6 animate-slide-up">
            <div className="bg-slate-800/80 backdrop-blur-sm p-8 rounded-3xl border-2 border-slate-700/50 shadow-2xl relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-blue-500/5 pointer-events-none"></div>
              <label className="block text-cyan-400 text-sm uppercase tracking-widest font-bold mb-6 text-center relative z-10">
                Zadej 6-místný kód hry
              </label>
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
                placeholder="XF43DA"
                maxLength={6}
                className="w-full bg-slate-900/80 text-white text-5xl font-mono font-bold text-center py-6 rounded-2xl border-2 border-slate-600 focus:border-cyan-400 focus:shadow-[0_0_25px_rgba(34,211,238,0.2)] focus:outline-none transition-all placeholder:text-slate-700 uppercase tracking-[0.25em] relative z-10"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => {
                  setShowJoinInput(false);
                  setJoinCode('');
                }}
                className="w-full bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold py-4 rounded-xl transition-all border-2 border-slate-600 hover:border-slate-500 uppercase tracking-wide"
              >
                Zpět
              </button>
              
              <button
                onClick={handleJoin}
                disabled={joinCode.length !== 6}
                className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-600 text-white font-bold py-4 rounded-xl shadow-lg disabled:shadow-none transition-all transform hover:scale-105 active:scale-95 uppercase tracking-wide disabled:border-2 disabled:border-slate-700"
              >
                Vstoupit
              </button>
            </div>
          </div>
        )}

        {/* 🆕 Divácká místnost nabídka */}
        {!showJoinInput && (
          <div className="bg-gradient-to-r from-amber-900/30 to-orange-900/30 rounded-2xl p-4 border border-amber-500/30 space-y-3">
            <div className="flex items-center gap-2 justify-center text-amber-400">
              <Eye size={18} />
              <span className="font-bold uppercase tracking-wide text-sm">Divácká místnost</span>
            </div>
            <p className="text-center text-slate-400 text-xs">
              Chcete, aby diváci mohli sledovat vaši hru na projektoru nebo TV?
            </p>
            <a
              href={STRIPE_CHECKOUT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-lg shadow-amber-500/20 mx-auto text-sm"
            >
              <Ticket size={16} />
              <span>KOUPIT VSTUPENKU</span>
              <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs">139 Kč/měsíc</span>
            </a>
            <p className="text-center text-slate-500 text-[10px]">
              Jednorázová platba, bez automatického obnovování
            </p>
          </div>
        )}
      </div>
      
      {/* Footer s odkazy */}
      <div className="absolute bottom-6 left-0 right-0 text-center space-y-2">
        <div className="flex items-center justify-center gap-4 text-sm">
          <a 
            href="/faq" 
            className="text-slate-500 hover:text-cyan-400 transition-colors"
          >
            ❓ Pravidla hry
          </a>
          <span className="text-slate-700">•</span>
          <a
            href="/divaci"
            className="text-slate-500 hover:text-purple-400 transition-colors inline-flex items-center gap-1"
          >
            <span>👁️</span>
            <span>Divácká místnost</span>
          </a>
        </div>
        <div className="text-slate-600 text-xs font-mono opacity-50 hover:opacity-100 transition-opacity">
          ŠTVANICE ONLINE (beta) • Kvízová hra pro dva
        </div>
      </div>
    </div>
  );
}
