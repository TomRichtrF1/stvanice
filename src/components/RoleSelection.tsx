import { Target, User } from 'lucide-react';

interface RoleSelectionProps {
  onSelectRole: (role: 'hunter' | 'prey') => void;
  selectedRole: string | null;
  rolesLocked: boolean;
}

export default function RoleSelection({ onSelectRole, selectedRole, rolesLocked }: RoleSelectionProps) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8 animate-fade-in">
        <div className="text-center space-y-4">
          <h2 className="text-4xl font-bold text-white">
            Vyber si roli
          </h2>
          <p className="text-slate-400">
            {rolesLocked ? 'Tvoje role byla určena' : 'Kdo klikne první, získá roli'}
          </p>
        </div>

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

        {selectedRole && (
          <div className="bg-slate-800 p-4 rounded-xl border-2 border-cyan-500/50 text-center animate-slide-up">
            <p className="text-cyan-400 font-semibold">
              {rolesLocked ? 'Připravte se na hru!' : 'Čekám na druhého hráče...'}
            </p>
          </div>
        )}

        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-20 left-10 w-32 h-32 bg-red-500/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-20 right-10 w-40 h-40 bg-green-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
        </div>
      </div>
    </div>
  );
}
