import { useState } from 'react';
import { Target, User, Eye, Ticket, Loader } from 'lucide-react';

interface RoleSelectionProps {
  onSelectRole: (role: 'hunter' | 'prey') => void;
  selectedRole: string | null;
  rolesLocked: boolean;
  ageGroup: string;  // 🆕 Místo gameMode
  roomCode: string;
}

// 🆕 NOVÉ 3 KATEGORIE - pro zobrazení
const AGE_GROUP_LABELS: Record<string, { emoji: string; name: string; color: string }> = {
  adult: { emoji: '👔', name: 'Dospělí', color: 'blue' },
  student: { emoji: '🎒', name: 'Školáci', color: 'purple' },
  kids: { emoji: '🐣', name: 'Děti', color: 'pink' },
  // Legacy mappings
  teen: { emoji: '🎒', name: 'Školáci', color: 'purple' },
  child: { emoji: '🐣', name: 'Děti', color: 'pink' },
  preschool: { emoji: '🐣', name: 'Děti', color: 'pink' }
};

export default function RoleSelection({ 
  onSelectRole, 
  selectedRole, 
  rolesLocked,
  ageGroup,
  roomCode
}: RoleSelectionProps) {
  const [isLoading, setIsLoading] = useState(false);

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

  // Získej info o kategorii
  const categoryInfo = AGE_GROUP_LABELS[ageGroup] || AGE_GROUP_LABELS.adult;
  
  // Barvy podle kategorie
  const colorClasses = {
    blue: {
      bg: 'bg-blue-500/20',
      border: 'border-blue-500',
      text: 'text-blue-300'
    },
    purple: {
      bg: 'bg-purple-500/20',
      border: 'border-purple-500',
      text: 'text-purple-300'
    },
    pink: {
      bg: 'bg-pink-500/20',
      border: 'border-pink-500',
      text: 'text-pink-300'
    }
  };
  
  const colors = colorClasses[categoryInfo.color as keyof typeof colorClasses] || colorClasses.blue;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-start p-4 overflow-y-auto">
      <div className="w-full max-w-md space-y-5 animate-fade-in py-8">
        
        {/* Hlavička */}
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold text-white">
            Vyber si roli
          </h2>
          <p className="text-slate-400">
            {rolesLocked ? 'Tvoje role byla určena' : 'Kdo klikne první, získá roli'}
          </p>
        </div>

        {/* 🆕 ZOBRAZENÍ KATEGORIE (pouze informativně, nelze změnit) */}
        <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700">
          <div className="flex flex-col items-center gap-2">
            <p className="text-slate-500 text-xs uppercase font-bold tracking-widest">
              Obtížnost otázek
            </p>
            <div className={`
              px-6 py-3 rounded-full font-bold text-lg flex items-center gap-3 border-2 shadow-lg
              ${colors.bg} ${colors.border} ${colors.text}
            `}>
              <span className="text-2xl">{categoryInfo.emoji}</span>
              <span>{categoryInfo.name}</span>
            </div>
          </div>
        </div>

        {/* Výběr role */}
        <div className="space-y-4">
          <button
            onClick={() => onSelectRole('hunter')}
            disabled={rolesLocked && selectedRole !== 'hunter'}
            className={`w-full font-bold py-8 px-8 rounded-2xl text-2xl shadow-lg transition-all transform active:scale-95 flex items-center justify-center gap-4 ${
              selectedRole === 'hunter'
                ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-red-500/50 scale-105'
                : rolesLocked
                ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white shadow-red-500/50 hover:scale-105'
            }`}
          >
            <Target size={40} />
            <div className="text-left">
              <div className="flex items-center gap-2">
                <span className="text-3xl">👹</span>
                <span>JÁ JSEM LOVEC</span>
              </div>
              <p className="text-sm opacity-80 font-normal">Chytám Štvance</p>
            </div>
          </button>

          <button
            onClick={() => onSelectRole('prey')}
            disabled={rolesLocked && selectedRole !== 'prey'}
            className={`w-full font-bold py-8 px-8 rounded-2xl text-2xl shadow-lg transition-all transform active:scale-95 flex items-center justify-center gap-4 ${
              selectedRole === 'prey'
                ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white shadow-green-500/50 scale-105'
                : rolesLocked
                ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white shadow-green-500/50 hover:scale-105'
            }`}
          >
            <User size={40} />
            <div className="text-left">
              <div className="flex items-center gap-2">
                <span className="text-3xl">🏃</span>
                <span>JÁ JSEM ŠTVANEC</span>
              </div>
              <p className="text-sm opacity-80 font-normal">Utíkám před Lovcem</p>
            </div>
          </button>
        </div>

        {/* Status */}
        {selectedRole && (
          <div className="bg-slate-800 p-4 rounded-xl border-2 border-cyan-500/50 text-center animate-slide-up">
            <p className="text-cyan-400 font-semibold">
              {rolesLocked ? 'Připravte se na hru!' : 'Čekám na druhého hráče...'}
            </p>
          </div>
        )}

        {/* 🎫 VSTUPENKA DO DIVÁCKÉ MÍSTNOSTI */}
        {!rolesLocked && (
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
            
            <p className="text-slate-500 text-xs mt-2 text-center">
              Jednorázová platba, bez automatického obnovování
            </p>
          </div>
        )}

        {/* Pozadí efekty */}
        <div className="fixed inset-0 pointer-events-none -z-10">
          <div className="absolute top-20 left-10 w-32 h-32 bg-red-500/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-20 right-10 w-40 h-40 bg-green-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
        </div>
      </div>
    </div>
  );
}
