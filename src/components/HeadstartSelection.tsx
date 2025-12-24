import { Clock } from 'lucide-react';

interface HeadstartSelectionProps {
  isPreyPlayer: boolean;
  onSelectHeadstart: (headstart: number) => void;
}

export default function HeadstartSelection({ isPreyPlayer, onSelectHeadstart }: HeadstartSelectionProps) {
  if (!isPreyPlayer) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md space-y-8 animate-fade-in text-center">
          <Clock className="w-20 h-20 text-red-500 animate-pulse mx-auto" />
          <h2 className="text-4xl font-bold text-white">
            Čekám na Štvance...
          </h2>
          <p className="text-slate-400 text-lg">
            Štvanec vybírá startovní pozici
          </p>
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-1/4 left-10 w-32 h-32 bg-red-500/10 rounded-full blur-3xl animate-pulse"></div>
            <div className="absolute bottom-1/4 right-10 w-40 h-40 bg-orange-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8 animate-fade-in">
        <div className="text-center space-y-4">
          <h2 className="text-4xl font-bold text-white">
            Vyber náskok
          </h2>
          <p className="text-slate-400 text-lg">
            Čím menší náskok, tím je k tobě Lovec blíž!
          </p>
        </div>

        <div className="space-y-4">
          {[2, 3, 4].map((headstart) => {
            // Definice stylů a textů pro každou variantu
            let gradient = "";
            let shadow = "";
            let titleText = "";
            let rewardText = "";
            let styleText = "";

            if (headstart === 2) {
                gradient = "from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500";
                shadow = "shadow-red-500/50";
                titleText = "NÁSKOK 2 OTÁZKY";
                rewardText = "💰 VĚTŠÍ ODMĚNA";
                styleText = "🔥 RISKANTNÍ HRA";
            } else if (headstart === 3) {
                gradient = "from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400";
                shadow = "shadow-orange-500/50";
                titleText = "NÁSKOK 3 OTÁZKY";
                rewardText = "💰 ODMĚNA TAK AKORÁT";
                styleText = "⚖️ VYVÁŽENÁ HRA";
            } else {
                gradient = "from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500";
                shadow = "shadow-green-500/50";
                titleText = "NÁSKOK 4 OTÁZKY";
                rewardText = "💰 SYMBOLICKÁ CENA";
                styleText = "🌟 NADĚJNÁ HRA";
            }

            return (
              <button
                key={headstart}
                onClick={() => onSelectHeadstart(headstart)}
                className={`w-full bg-gradient-to-r ${gradient} text-white font-bold py-6 px-6 rounded-2xl shadow-lg ${shadow} transition-all transform hover:scale-105 active:scale-95`}
              >
                <div className="flex items-center gap-4">
                  <span className="text-5xl">🏃</span>
                  <div className="text-left flex-1">
                    <div className="text-2xl font-black tracking-wide">{titleText}</div>
                    <div className="text-sm font-semibold opacity-90 mt-1">{rewardText}</div>
                    <div className="text-xs font-bold opacity-80 mt-0.5">{styleText}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="bg-slate-800 p-4 rounded-xl border-2 border-yellow-500/50">
          <p className="text-yellow-400 text-sm text-center">
            💡 Tip: Začni s náskokem 3 pro spravedlivou hru
          </p>
        </div>

        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-20 left-10 w-32 h-32 bg-green-500/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-20 right-10 w-40 h-40 bg-emerald-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
        </div>
      </div>
    </div>
  );
}