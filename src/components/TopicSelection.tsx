import { useState } from 'react';
import { Sparkles, Crown, Info, Check, X } from 'lucide-react';

interface TopicSelectionProps {
  roomCode: string;
  socket: any;
  onTopicSelected: (topic: string) => void;
}

export default function TopicSelection({ roomCode, socket, onTopicSelected }: TopicSelectionProps) {
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [customTopic, setCustomTopic] = useState('');
  const [validationMessage, setValidationMessage] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [codeConfirmed, setCodeConfirmed] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);

  // Handler pro free hru
  const handleFreeTopic = () => {
    socket.emit('select_topic', { code: roomCode, topic: 'general', isPremium: false });
    onTopicSelected('general');
  };

  // Handler pro zadání kódu
  const handleCodeSubmit = async () => {
    if (codeInput.length === 0) {
      setValidationMessage('⚠️ Zadej herní kód');
      return;
    }

    setIsValidating(true);
    setValidationMessage('🔄 Ověřuji kód...');

    try {
      const response = await fetch('/api/validate-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: codeInput.toUpperCase() })
      });

      const result = await response.json();

      if (result.valid) {
        setValidationMessage(result.message);
        setCodeConfirmed(true);
        // Admin kód má speciální chování
        if (result.topic === 'admin') {
          setCustomTopic(''); // Admin může zadat cokoliv
        }
      } else {
        setValidationMessage(`❌ ${result.message}`);
        setCodeConfirmed(false);
      }
    } catch (error) {
      setValidationMessage('❌ CHYBA SPOJENÍ SE SERVEREM');
      setCodeConfirmed(false);
    } finally {
      setIsValidating(false);
    }
  };

  // Handler pro potvrzení poznamenání kódu
  const handleCodeNoted = () => {
    setShowCodeInput(false);
    // Zobrazíme input pro téma
  };

  // Handler pro finální odeslání tématu
  const handleTopicSubmit = () => {
    if (!customTopic.trim()) {
      setValidationMessage('⚠️ Zadej okruh otázek');
      return;
    }

    socket.emit('select_topic', { 
      code: roomCode, 
      topic: customTopic.trim(), 
      isPremium: true,
      gameCode: codeInput.toUpperCase()
    });
    
    onTopicSelected(customTopic.trim());
  };

  // Handler pro nákup přes Stripe
  const handleBuyCode = async () => {
    try {
      setValidationMessage('🔄 Připravuji platbu...');
      
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();

      if (data.error) {
        setValidationMessage(`❌ ${data.error}`);
        return;
      }

      // Přesměruj na Stripe Checkout
      window.location.href = data.url;
    } catch (error) {
      console.error('Error creating checkout:', error);
      setValidationMessage('❌ CHYBA PŘI VYTVÁŘENÍ PLATBY');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8 animate-fade-in relative z-10">
        
        {/* Hlavička */}
        <div className="text-center space-y-4">
          <h2 className="text-4xl font-bold text-white">
            Vyber režim hry
          </h2>
          <p className="text-slate-400 text-lg">
            Hraj zdarma nebo si zvol vlastní okruh otázek
          </p>
        </div>

        {/* Volby */}
        <div className="space-y-4">
          
          {/* ZDARMA - Náhodná témata */}
          <button
            onClick={handleFreeTopic}
            className="group w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-bold py-6 px-8 rounded-2xl text-xl shadow-xl shadow-green-900/30 transition-all transform hover:scale-[1.02] active:scale-95 flex items-center justify-between border border-green-500/20"
          >
            <div className="flex items-center gap-4">
              <div className="bg-white/20 p-3 rounded-xl group-hover:bg-white/30 transition-colors">
                <Sparkles size={28} className="text-white" />
              </div>
              <div className="text-left">
                <div>HRÁT ZDARMA</div>
                <div className="text-sm font-normal opacity-80">Náhodná témata</div>
              </div>
            </div>
            <div className="text-green-100 text-sm font-semibold bg-green-700/30 px-3 py-1 rounded-full">Free</div>
          </button>

          {/* PREMIUM - Vlastní okruh */}
          <button
            onClick={() => setShowPremiumModal(true)}
            className="group w-full bg-gradient-to-r from-yellow-600 to-amber-600 hover:from-yellow-500 hover:to-amber-500 text-white font-bold py-6 px-8 rounded-2xl text-xl shadow-xl shadow-yellow-900/30 transition-all transform hover:scale-[1.02] active:scale-95 flex items-center justify-between border border-yellow-500/20"
          >
            <div className="flex items-center gap-4">
              <div className="bg-white/20 p-3 rounded-xl group-hover:bg-white/30 transition-colors">
                <Crown size={28} className="text-white" />
              </div>
              <div className="text-left">
                <div>ZVOLIT OKRUH OTÁZEK</div>
                <div className="text-sm font-normal opacity-80">16 Kč na měsíc</div>
              </div>
            </div>
            <div className="text-yellow-100 text-sm font-semibold bg-yellow-700/30 px-3 py-1 rounded-full">Premium</div>
          </button>
        </div>

        {/* Info box */}
        <div className="bg-slate-800/80 p-4 rounded-xl border-2 border-slate-700/50 flex items-start gap-3">
          <Info size={20} className="text-blue-400 mt-0.5 flex-shrink-0" />
          <p className="text-slate-300 text-sm">
            <strong>Zdarma:</strong> Otázky ze všech možných oblastí dle naší volby<br/>
            <strong>Premium:</strong> Zadej oblíbené témata (například "fotbal česká historie" či "kouzla italské kuchyně") - za 16,- Kč na měsíc
          </p>
        </div>

        {/* PREMIUM MODAL */}
        {showPremiumModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
            <div className="bg-slate-800 rounded-3xl p-8 max-w-md w-full border-2 border-yellow-500/50 shadow-2xl shadow-yellow-500/20 relative">
              
              {/* Zavírací křížek */}
              <button
                onClick={() => {
                  setShowPremiumModal(false);
                  setShowCodeInput(false);
                  setCodeConfirmed(false);
                  setCodeInput('');
                  setCustomTopic('');
                  setValidationMessage('');
                }}
                className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>

              <div className="space-y-6">
                <div className="flex items-center gap-3 mb-4">
                  <Crown className="text-yellow-400" size={32} />
                  <h3 className="text-2xl font-bold text-white">Premium Režim</h3>
                </div>

                {!showCodeInput ? (
                  // KROK 1: Volba akce (UŽ MÁM KÓD / KOUPIT)
                  <>
                    <button
                      onClick={() => setShowCodeInput(true)}
                      className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl transition-all text-lg shadow-lg"
                    >
                      UŽ MÁM KÓD
                    </button>

                    <button
                      onClick={handleBuyCode}
                      className="w-full bg-gradient-to-r from-yellow-600 to-amber-600 hover:from-yellow-500 hover:to-amber-500 text-white font-bold py-4 rounded-xl transition-all text-lg shadow-lg flex items-center justify-center gap-2"
                    >
                      <Crown size={20} />
                      KOUPIT KÓD (16 Kč)
                    </button>

                    {validationMessage && validationMessage.includes('🔄') && (
                      <p className="text-blue-400 text-sm text-center">{validationMessage}</p>
                    )}
                    {validationMessage && validationMessage.includes('❌') && (
                      <p className="text-red-400 text-sm text-center">{validationMessage}</p>
                    )}

                    {/* Info tlačítko */}
                    <button
                      onClick={() => setShowInfoModal(true)}
                      className="w-full text-slate-400 hover:text-white text-sm transition-colors flex items-center justify-center gap-1"
                    >
                      <Info size={16} />
                      Co dostanu za 16 Kč?
                    </button>
                  </>
                ) : !codeConfirmed ? (
                  // Zadání kódu
                  <>
                    <div className="space-y-4">
                      <label className="block text-cyan-400 text-sm uppercase tracking-widest font-bold text-center">
                        Zadej herní kód
                      </label>
                      <input
                        type="text"
                        value={codeInput}
                        onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                        placeholder="K7P2-M9Q4-X1"
                        maxLength={14}
                        className="w-full bg-slate-900/80 text-white text-2xl font-mono font-bold text-center py-4 rounded-xl border-2 border-slate-600 focus:border-cyan-400 focus:outline-none transition-all placeholder:text-slate-700 uppercase"
                        disabled={isValidating}
                      />
                      
                      {validationMessage && (
                        <p className={`text-center text-sm ${
                          validationMessage.includes('✅') ? 'text-green-400' : 
                          validationMessage.includes('🔄') ? 'text-blue-400' : 
                          'text-red-400'
                        }`}>
                          {validationMessage}
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => {
                          setShowCodeInput(false);
                          setCodeInput('');
                          setValidationMessage('');
                        }}
                        className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-xl transition-all"
                      >
                        Zpět
                      </button>
                      <button
                        onClick={handleCodeSubmit}
                        disabled={isValidating || codeInput.length === 0}
                        className="bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-3 rounded-xl transition-all"
                      >
                        Ověřit
                      </button>
                    </div>
                  </>
                ) : (
                  // KROK 3: Po validaci kódu → ZADEJ TÉMA
                  <>
                    <div className="bg-green-900/30 border border-green-500 rounded-xl p-4 text-center">
                      <Check className="text-green-400 mx-auto mb-2" size={32} />
                      <p className="text-green-300 font-bold">KÓD JE PLATNÝ!</p>
                    </div>

                    {/* Potvrzení poznamenání */}
                    <div className="bg-slate-900/50 border border-yellow-500/50 rounded-xl p-4">
                      <p className="text-yellow-300 text-center font-bold mb-3">
                        MÁŠ HERNÍ KÓD POZNAMENÁN?
                      </p>
                      <p className="text-slate-400 text-sm text-center mb-4">
                        Můžeš ho použít znovu příště pro jiné téma!
                      </p>
                      <button
                        onClick={handleCodeNoted}
                        className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded-xl transition-all"
                      >
                        ANO, MÁM HO
                      </button>
                    </div>

                    {/* NYNÍ zadání tématu */}
                    <div className="space-y-3">
                      <label className="block text-white font-bold text-center">
                        Teď zadej okruh otázek
                      </label>
                      <input
                        type="text"
                        value={customTopic}
                        onChange={(e) => setCustomTopic(e.target.value)}
                        placeholder="např. Česká historie fyziky, Fotbal Itálie..."
                        className="w-full bg-slate-900/80 text-white text-lg px-4 py-3 rounded-xl border-2 border-slate-600 focus:border-yellow-400 focus:outline-none transition-all placeholder:text-slate-600"
                      />
                      
                      {/* Vysvětlující hint */}
                      <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3">
                        <p className="text-blue-300 text-xs text-center">
                          💡 <strong>Upřesni téma pro lepší výsledky</strong><br/>
                          Více slov = užší zaměření: "Fotbal Itálie", "Česká fyzika"
                        </p>
                      </div>
                      
                      {validationMessage && customTopic.trim() === '' && (
                        <p className="text-red-400 text-sm text-center">{validationMessage}</p>
                      )}

                      <button
                        onClick={handleTopicSubmit}
                        disabled={!customTopic.trim()}
                        className="w-full bg-gradient-to-r from-yellow-600 to-amber-600 hover:from-yellow-500 hover:to-amber-500 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 text-white font-bold py-4 rounded-xl transition-all shadow-lg"
                      >
                        POKRAČOVAT DO HRY
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* INFO MODAL */}
        {showInfoModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
            <div className="bg-slate-800 rounded-3xl p-8 max-w-md w-full border-2 border-blue-500/50 shadow-2xl relative">
              <button
                onClick={() => setShowInfoModal(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>

              <div className="space-y-4">
                <div className="flex items-center gap-3 mb-4">
                  <Info className="text-blue-400" size={32} />
                  <h3 className="text-2xl font-bold text-white">Premium režim</h3>
                </div>

                <div className="text-slate-300 space-y-3 text-sm">
                  <p>
                    <strong className="text-white">Co dostaneš:</strong><br/>
                    • Herní kód s platností 1 měsíc<br/>
                    • Možnost zadat libovolný okruh otázek<br/>
                    • Otázky generované AI podle tvého tématu
                  </p>
                  
                  <p>
                    <strong className="text-white">Příklady témat:</strong><br/>
                    "Fotbal Evropa", "Fyzika", "Česká historie", "Italská kuchyně", "Světový zeměpis", "Matematické pojmy"
                  </p>

                  <p className="text-yellow-400">
                    💡 <strong>Důležité:</strong> Kód si dobře uschovej, už se znovu nezobrazí!
                  </p>

                  <p className="text-slate-400 text-xs border-t border-slate-700 pt-3 mt-3">
                    Poplatek slouží k uhrazení provozních nákladů a výpočetního výkonu AI.
                  </p>
                </div>

                <button
                  onClick={() => setShowInfoModal(false)}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all"
                >
                  Rozumím
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Pozadí efekty */}
      <div className="absolute inset-0 pointer-events-none -z-10">
        <div className="absolute top-1/4 left-10 w-32 h-32 bg-green-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-10 w-40 h-40 bg-yellow-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>
    </div>
  );
}
