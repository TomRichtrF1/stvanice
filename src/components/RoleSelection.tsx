import { useState } from 'react';
import { Target, User, Baby, Brain, Info, Sparkles, BookOpen, ChevronDown, ChevronUp, Check, Eye, Ticket, Loader } from 'lucide-react';

interface RoleSelectionProps {
  onSelectRole: (role: 'hunter' | 'prey') => void;
  selectedRole: string | null;
  rolesLocked: boolean;
  gameMode: 'adult' | 'kid';
  selectedCategory: string | null;
  onUpdateSettings: (mode: 'adult' | 'kid') => void;
  onUpdateCategory: (category: string | null) => void;
  roomCode: string;
}

// 📚 Kategorie s ikonami a emoji
const ADULT_CATEGORIES = [
  { key: 'motorsport', name: 'Motorsport', emoji: '🏎️' },
  { key: 'team_sports', name: 'Týmové sporty', emoji: '⚽' },
  { key: 'film', name: 'Film a seriály', emoji: '🎬' },
  { key: 'music', name: 'Hudba', emoji: '🎵' },
  { key: 'history', name: 'Historie', emoji: '🏛️' },
  { key: 'geography', name: 'Zeměpis', emoji: '🌍' },
  { key: 'science', name: 'Věda a technologie', emoji: '🔬' },
  { key: 'food', name: 'Gastronomie', emoji: '🍳' },
  { key: 'literature', name: 'Literatura', emoji: '📚' },
  { key: 'art', name: 'Umění a architektura', emoji: '🎨' },
  { key: 'nature', name: 'Zvířata a příroda', emoji: '🦁' },
  { key: 'business', name: 'Byznys a ekonomika', emoji: '💼' },
];

const JUNIOR_CATEGORIES = [
  { key: 'animals', name: 'Zvířata', emoji: '🐾' },
  { key: 'fairytales', name: 'Pohádky a filmy', emoji: '🏰' },
  { key: 'body', name: 'Lidské tělo', emoji: '🫀' },
  { key: 'world', name: 'Svět kolem nás', emoji: '🌎' },
  { key: 'space', name: 'Vesmír', emoji: '🚀' },
  { key: 'sports_kids', name: 'Sport pro děti', emoji: '⚽' },
  { key: 'science_kids', name: 'Věda pro děti', emoji: '🧪' },
  { key: 'history_kids', name: 'Historie pro děti', emoji: '🏰' },
];

export default function RoleSelection({ 
  onSelectRole, 
  selectedRole, 
  rolesLocked,
  gameMode,
  selectedCategory,
  onUpdateSettings,
  onUpdateCategory,
  roomCode
}: RoleSelectionProps) {
  const [showCategories, setShowCategories] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const toggleMode = () => {
    const newMode = gameMode === 'adult' ? 'kid' : 'adult';
    onUpdateSettings(newMode);
    setShowCategories(false);
  };

  const handleCategorySelect = (categoryKey: string | null) => {
    onUpdateCategory(categoryKey);
    if (categoryKey !== null) {
      setShowCategories(false);
    }
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

  // Získej kategorie podle módu
  const categories = gameMode === 'kid' ? JUNIOR_CATEGORIES : ADULT_CATEGORIES;
  const selectedCategoryData = categories.find(c => c.key === selectedCategory);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-start p-4 overflow-y-auto">
      <div className="w-full max-w-md space-y-5 animate-fade-in py-8">
        
        {/* Hlavička */}
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold text-white">
            Vyber si roli a okruh témat
          </h2>
          <p className="text-slate-400">
            {rolesLocked ? 'Tvoje role byla určena' : 'Kdo klikne první, získá roli'}
          </p>
        </div>

        {/* === NASTAVENÍ (pouze když nejsou role zamčené) === */}
        {!rolesLocked && (
          <>
            {/* PŘEPÍNAČ JUNIOR/DOSPĚLÝ */}
            <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700">
              <div className="flex flex-col items-center gap-2 mb-3">
                <p className="text-slate-400 text-xs uppercase font-bold tracking-widest">
                  Obtížnost
                </p>
                <div className={`
                  px-4 py-2 rounded-full font-bold text-sm flex items-center gap-2 border shadow-lg transition-all duration-300
                  ${gameMode === 'kid' 
                    ? 'bg-pink-500/20 border-pink-500 text-pink-300'
                    : 'bg-blue-500/20 border-blue-500 text-blue-300'}
                `}>
                  {gameMode === 'kid' ? <Baby size={16}/> : <Brain size={16}/>}
                  {gameMode === 'kid' ? 'REŽIM PRO JUNIORY' : 'REŽIM PRO DOSPĚLÉ'}
                </div>
              </div>

              <button
                onClick={toggleMode}
                className={`
                  w-full flex items-center justify-center gap-3 px-6 py-3 rounded-xl font-bold text-base transition-all shadow-lg transform active:scale-95 border-2
                  ${gameMode === 'kid' 
                    ? 'bg-blue-700 hover:bg-blue-600 border-blue-500 text-white shadow-blue-500/20'
                    : 'bg-pink-600 hover:bg-pink-500 border-pink-400 text-white shadow-pink-500/20'}
                `}
              >
                {gameMode === 'kid' ? (
                  <>
                    <Brain className="w-5 h-5" />
                    <span>PŘEPNOUT NA DOSPĚLÉ</span>
                  </>
                ) : (
                  <>
                    <Baby className="w-5 h-5" />
                    <span>PŘEPNOUT NA JUNIORY</span>
                  </>
                )}
              </button>
            </div>

            {/* 📚 VÝBĚR KATEGORIE */}
            <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700">
              <div className="flex items-center justify-center gap-2 mb-3">
                <BookOpen className="w-5 h-5 text-cyan-400" />
                <p className="text-slate-400 text-xs uppercase font-bold tracking-widest">
                  Témata otázek
                </p>
              </div>

              <div className="space-y-2">
                {/* Možnost 1: Nechat na nás */}
                <button
                  onClick={() => handleCategorySelect(null)}
                  className={`
                    w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all border-2
                    ${selectedCategory === null 
                      ? 'bg-cyan-600/20 border-cyan-500 text-cyan-300' 
                      : 'bg-slate-700/50 border-slate-600 text-slate-400 hover:border-slate-500'}
                  `}
                >
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedCategory === null ? 'border-cyan-400 bg-cyan-500' : 'border-slate-500'}`}>
                    {selectedCategory === null && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <Sparkles className="w-5 h-5" />
                  <span className="font-semibold">Nechat na nás</span>
                  <span className="text-xs opacity-70">(jsme kreativní)</span>
                </button>

                {/* Možnost 2: Vybrat kategorii */}
                <button
                  onClick={() => setShowCategories(!showCategories)}
                  className={`
                    w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all border-2
                    ${selectedCategory !== null 
                      ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300' 
                      : 'bg-slate-700/50 border-slate-600 text-slate-400 hover:border-slate-500'}
                  `}
                >
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedCategory !== null ? 'border-emerald-400 bg-emerald-500' : 'border-slate-500'}`}>
                    {selectedCategory !== null && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <BookOpen className="w-5 h-5" />
                  <span className="font-semibold flex-1 text-left">
                    {selectedCategory !== null && selectedCategoryData 
                      ? `${selectedCategoryData.emoji} ${selectedCategoryData.name}` 
                      : 'Vybrat kategorii'}
                  </span>
                  {showCategories ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </button>

                {/* Grid kategorií */}
                {showCategories && (
                  <div className="grid grid-cols-2 gap-2 mt-3 p-3 bg-slate-900/50 rounded-xl border border-slate-700">
                    {categories.map((cat) => (
                      <button
                        key={cat.key}
                        onClick={() => handleCategorySelect(cat.key)}
                        className={`
                          flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all
                          ${selectedCategory === cat.key 
                            ? 'bg-emerald-600 text-white shadow-lg' 
                            : 'bg-slate-700/50 text-slate-300 hover:bg-slate-600/50'}
                        `}
                      >
                        <span className="text-lg">{cat.emoji}</span>
                        <span className="truncate">{cat.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <p className="text-slate-500 text-xs mt-3 flex items-center justify-center gap-1">
                <Info size={12} />
                {selectedCategory === null 
                  ? 'Otázky budou z různých oblastí' 
                  : `Všechny otázky: ${selectedCategoryData?.name}`}
              </p>
            </div>
          </>
        )}

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
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-20 left-10 w-32 h-32 bg-red-500/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-20 right-10 w-40 h-40 bg-green-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
        </div>
      </div>
    </div>
  );
}
