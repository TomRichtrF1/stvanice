import { useState } from 'react';
import { ChevronLeft, Sparkles, Users, GraduationCap, Briefcase, Baby, Eye, Ticket } from 'lucide-react';

// Stripe Payment Link - cena 139 Kč/měsíc
const STRIPE_CHECKOUT_URL = 'https://buy.stripe.com/bJebJ15E3bXs7DG8l25wI01';

interface CategorySelectionProps {
  onSelectAndCreate: (ageGroup: string) => void;
  onBack: () => void;
}

// 🆕 NOVÉ 3 KATEGORIE
const AGE_GROUPS = [
  {
    key: 'adult',
    name: 'Dospělí',
    emoji: '👔',
    description: 'Těžké otázky pro znalce',
    gradient: 'from-blue-600 to-indigo-700',
    hoverGradient: 'hover:from-blue-500 hover:to-indigo-600',
    shadow: 'shadow-blue-500/30',
    border: 'border-blue-500/50',
    icon: Briefcase
  },
  {
    key: 'student',
    name: 'Školáci',
    emoji: '🎒',
    description: 'Pro středoškoláky (15-18 let)',
    gradient: 'from-purple-600 to-violet-700',
    hoverGradient: 'hover:from-purple-500 hover:to-violet-600',
    shadow: 'shadow-purple-500/30',
    border: 'border-purple-500/50',
    icon: GraduationCap
  },
  {
    key: 'kids',
    name: 'Děti',
    emoji: '🐣',
    description: 'Pro děti (6-12 let)',
    gradient: 'from-pink-500 to-rose-600',
    hoverGradient: 'hover:from-pink-400 hover:to-rose-500',
    shadow: 'shadow-pink-500/30',
    border: 'border-pink-500/50',
    icon: Baby
  }
];

export default function CategorySelection({ onSelectAndCreate, onBack }: CategorySelectionProps) {
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = () => {
    if (!selectedGroup) return;
    setIsCreating(true);
    onSelectAndCreate(selectedGroup);
  };

  const selectedGroupData = AGE_GROUPS.find(g => g.key === selectedGroup);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6 animate-fade-in">
        
        {/* Tlačítko zpět */}
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
        >
          <ChevronLeft size={20} />
          <span>Zpět do lobby</span>
        </button>

        {/* Hlavička */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Sparkles className="w-8 h-8 text-yellow-400" />
            <h1 className="text-3xl font-bold text-white">Nová hra</h1>
          </div>
          <p className="text-slate-400">
            Vyber obtížnost otázek pro vaši hru
          </p>
        </div>

        {/* Výběr věkové skupiny */}
        <div className="space-y-3">
          {AGE_GROUPS.map((group) => {
            const isSelected = selectedGroup === group.key;
            const Icon = group.icon;
            
            return (
              <button
                key={group.key}
                onClick={() => setSelectedGroup(group.key)}
                disabled={isCreating}
                className={`
                  w-full flex items-center gap-4 px-5 py-4 rounded-2xl 
                  transition-all duration-200 transform active:scale-[0.98]
                  ${isSelected 
                    ? `bg-gradient-to-r ${group.gradient} text-white shadow-xl ${group.shadow} scale-[1.02] border-2 ${group.border}` 
                    : 'bg-slate-800/70 text-slate-300 hover:bg-slate-700/70 border-2 border-transparent'
                  }
                  ${isCreating ? 'opacity-50 cursor-not-allowed' : ''}
                `}
              >
                {/* Emoji */}
                <span className="text-3xl">{group.emoji}</span>
                
                {/* Texty */}
                <div className="flex-1 text-left">
                  <div className="font-bold text-lg">{group.name}</div>
                  <div className={`text-sm ${isSelected ? 'text-white/80' : 'text-slate-400'}`}>
                    {group.description}
                  </div>
                </div>
                
                {/* Check mark */}
                {isSelected && (
                  <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                    <span className="text-white text-lg">✓</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Tlačítko založit hru */}
        <button
          onClick={handleCreate}
          disabled={!selectedGroup || isCreating}
          className={`
            w-full py-5 px-8 rounded-2xl font-bold text-xl
            transition-all transform 
            flex items-center justify-center gap-3
            ${selectedGroup && !isCreating
              ? `bg-gradient-to-r ${selectedGroupData?.gradient} ${selectedGroupData?.hoverGradient} text-white shadow-lg ${selectedGroupData?.shadow} hover:scale-[1.02] active:scale-[0.98]`
              : 'bg-slate-700 text-slate-500 cursor-not-allowed'
            }
          `}
        >
          {isCreating ? (
            <>
              <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
              <span>Zakládám hru...</span>
            </>
          ) : (
            <>
              <Users size={24} />
              <span>ZALOŽIT HRU</span>
            </>
          )}
        </button>

        {/* Info text */}
        <p className="text-center text-slate-500 text-sm">
          Po založení hry obdržíš kód pro spoluhráče
        </p>

        {/* 🆕 Divácká místnost nabídka */}
        <div className="bg-gradient-to-r from-amber-900/30 to-orange-900/30 rounded-2xl p-4 border border-amber-500/30 space-y-3">
          <div className="flex items-center gap-2 justify-center text-amber-400">
            <Eye size={20} />
            <span className="font-bold uppercase tracking-wide text-sm">Divácká místnost</span>
          </div>
          <p className="text-center text-slate-400 text-sm">
            Chcete, aby diváci mohli sledovat vaši hru na projektoru nebo TV?
          </p>
          <a
            href={STRIPE_CHECKOUT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-lg shadow-amber-500/20 mx-auto"
          >
            <Ticket size={18} />
            <span>KOUPIT VSTUPENKU</span>
            <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs">139 Kč/měsíc</span>
          </a>
          <p className="text-center text-slate-500 text-xs">
            Jednorázová platba, bez automatického obnovování
          </p>
        </div>

        {/* Pozadí efekty */}
        <div className="fixed inset-0 pointer-events-none -z-10">
          <div className="absolute top-20 left-10 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-20 right-10 w-40 h-40 bg-purple-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl"></div>
        </div>
      </div>
    </div>
  );
}
