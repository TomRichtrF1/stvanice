import { useState, useEffect } from 'react';
import { Target, User, Eye, Ticket, Check, X } from 'lucide-react';
import { useSocket } from '../contexts/SocketContext';

// Stripe Payment Link - cena 139 Kč/měsíc
const STRIPE_CHECKOUT_URL = 'https://buy.stripe.com/bJebJ15E3bXs7DG8l25wI01';

interface RoleSelectionProps {
  onSelectRole: (role: 'hunter' | 'prey') => void;
  selectedRole: string | null;
  rolesLocked: boolean;
  ageGroup: string;
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
  const { socket } = useSocket();
  const [roleTakenError, setRoleTakenError] = useState<string | null>(null);
  
  // 🆕 Sledování obsazených rolí druhým hráčem
  const [opponentRole, setOpponentRole] = useState<'hunter' | 'prey' | null>(null);

  // 🆕 Poslouchat na role_taken event
  useEffect(() => {
    if (!socket) return;

    const handleRoleTaken = ({ role, message }: { role: string; message: string }) => {
      setRoleTakenError(message);
      setTimeout(() => setRoleTakenError(null), 3000);
    };

    const handleRolesUpdated = ({ players }: { players: any[] }) => {
      // Najít roli protihráče
      const opponent = players.find((p: any) => p.id !== socket.id);
      if (opponent && opponent.role) {
        setOpponentRole(opponent.role);
      }
    };

    socket.on('role_taken', handleRoleTaken);
    socket.on('roles_updated', handleRolesUpdated);

    return () => {
      socket.off('role_taken', handleRoleTaken);
      socket.off('roles_updated', handleRolesUpdated);
    };
  }, [socket]);

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

  // 🆕 Logika pro stav tlačítek
  const isHunterTakenByOpponent = opponentRole === 'hunter' && selectedRole !== 'hunter';
  const isPreyTakenByOpponent = opponentRole === 'prey' && selectedRole !== 'prey';
  
  const hunterDisabled = rolesLocked && selectedRole !== 'hunter';
  const preyDisabled = rolesLocked && selectedRole !== 'prey';

  // 🆕 Funkce pro získání stylů tlačítka
  const getButtonStyle = (role: 'hunter' | 'prey') => {
    const isSelected = selectedRole === role;
    const isTakenByOpponent = role === 'hunter' ? isHunterTakenByOpponent : isPreyTakenByOpponent;
    const isDisabled = role === 'hunter' ? hunterDisabled : preyDisabled;
    
    const baseColors = role === 'hunter' 
      ? { gradient: 'from-red-600 to-rose-600', hover: 'hover:from-red-500 hover:to-rose-500', shadow: 'shadow-red-500/50' }
      : { gradient: 'from-green-600 to-emerald-600', hover: 'hover:from-green-500 hover:to-emerald-500', shadow: 'shadow-green-500/50' };

    if (isSelected) {
      return `bg-gradient-to-r ${baseColors.gradient} text-white ${baseColors.shadow} scale-105 ring-4 ring-white/30`;
    }
    
    if (isTakenByOpponent) {
      return 'bg-slate-700/50 text-slate-500 cursor-not-allowed border-2 border-slate-600';
    }
    
    if (isDisabled) {
      return 'bg-slate-700 text-slate-500 cursor-not-allowed';
    }
    
    return `bg-gradient-to-r ${baseColors.gradient} ${baseColors.hover} text-white ${baseColors.shadow} hover:scale-105`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-start p-4 overflow-y-auto">
      <div className="w-full max-w-md space-y-5 animate-fade-in py-8">
        
        {/* 🆕 Error toast pro obsazenou roli */}
        {roleTakenError && (
          <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 animate-slide-down">
            <div className="bg-red-600 text-white px-6 py-3 rounded-xl shadow-lg flex items-center gap-2">
              <X size={20} />
              <span className="font-semibold">{roleTakenError}</span>
            </div>
          </div>
        )}

        {/* Hlavička */}
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold text-white">
            Vyber si roli
          </h2>
          <p className="text-slate-400">
            {rolesLocked ? 'Role byly přiřazeny!' : 'Kdo klikne první, získá roli'}
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
          {/* LOVEC */}
          <button
            onClick={() => !isHunterTakenByOpponent && onSelectRole('hunter')}
            disabled={hunterDisabled || isHunterTakenByOpponent}
            className={`w-full font-bold py-8 px-8 rounded-2xl text-2xl shadow-lg transition-all transform active:scale-95 flex items-center justify-center gap-4 relative ${getButtonStyle('hunter')}`}
          >
            {/* 🆕 Badge pro obsazenou roli */}
            {isHunterTakenByOpponent && (
              <div className="absolute top-2 right-2 bg-slate-600 text-slate-300 text-xs px-2 py-1 rounded-full flex items-center gap-1">
                <User size={12} />
                <span>Obsazeno</span>
              </div>
            )}
            
            {/* 🆕 Badge pro vybranou roli */}
            {selectedRole === 'hunter' && (
              <div className="absolute top-2 right-2 bg-white/20 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                <Check size={12} />
                <span>Tvoje role</span>
              </div>
            )}

            <Target size={40} className={isHunterTakenByOpponent ? 'opacity-50' : ''} />
            <div className="text-left">
              <div className="flex items-center gap-2">
                <span className="text-3xl">{isHunterTakenByOpponent ? '🔒' : '👹'}</span>
                <span>JÁ JSEM LOVEC</span>
              </div>
              <p className="text-sm opacity-80 font-normal">
                {isHunterTakenByOpponent ? 'Soupeř vybral tuto roli' : 'Chytám Štvance'}
              </p>
            </div>
          </button>

          {/* ŠTVANEC */}
          <button
            onClick={() => !isPreyTakenByOpponent && onSelectRole('prey')}
            disabled={preyDisabled || isPreyTakenByOpponent}
            className={`w-full font-bold py-8 px-8 rounded-2xl text-2xl shadow-lg transition-all transform active:scale-95 flex items-center justify-center gap-4 relative ${getButtonStyle('prey')}`}
          >
            {/* 🆕 Badge pro obsazenou roli */}
            {isPreyTakenByOpponent && (
              <div className="absolute top-2 right-2 bg-slate-600 text-slate-300 text-xs px-2 py-1 rounded-full flex items-center gap-1">
                <User size={12} />
                <span>Obsazeno</span>
              </div>
            )}
            
            {/* 🆕 Badge pro vybranou roli */}
            {selectedRole === 'prey' && (
              <div className="absolute top-2 right-2 bg-white/20 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                <Check size={12} />
                <span>Tvoje role</span>
              </div>
            )}

            <User size={40} className={isPreyTakenByOpponent ? 'opacity-50' : ''} />
            <div className="text-left">
              <div className="flex items-center gap-2">
                <span className="text-3xl">{isPreyTakenByOpponent ? '🔒' : '🏃'}</span>
                <span>JÁ JSEM ŠTVANEC</span>
              </div>
              <p className="text-sm opacity-80 font-normal">
                {isPreyTakenByOpponent ? 'Soupeř vybral tuto roli' : 'Utíkám před Lovcem'}
              </p>
            </div>
          </button>
        </div>

        {/* Status */}
        {selectedRole && (
          <div className={`p-4 rounded-xl border-2 text-center animate-slide-up ${
            rolesLocked 
              ? 'bg-green-900/30 border-green-500/50' 
              : 'bg-slate-800 border-cyan-500/50'
          }`}>
            <p className={rolesLocked ? 'text-green-400 font-semibold' : 'text-cyan-400 font-semibold'}>
              {rolesLocked ? (
                <span className="flex items-center justify-center gap-2">
                  <Check size={20} />
                  Připravte se na hru!
                </span>
              ) : (
                'Čekám na druhého hráče...'
              )}
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
            
            <a
              href={STRIPE_CHECKOUT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold py-3 px-6 rounded-xl transition-all transform hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
            >
              <Ticket className="w-5 h-5" />
              <span>KOUPIT VSTUPENKU</span>
              <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs">139 Kč/měsíc</span>
            </a>
            
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
