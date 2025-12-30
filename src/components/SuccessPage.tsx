import { useState, useEffect } from 'react';
import { CheckCircle, Copy, Loader, AlertCircle, Ticket, Eye, Check } from 'lucide-react';

export default function SuccessPage() {
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    const fetchCode = async () => {
      // Získej session_id z URL
      const urlParams = new URLSearchParams(window.location.search);
      const sessionId = urlParams.get('session_id');

      if (!sessionId) {
        setError('Chybí ID platby. Zkuste to znovu nebo kontaktujte podporu.');
        setLoading(false);
        return;
      }

      console.log('🔍 Načítám kód pro session:', sessionId);

      try {
        const response = await fetch(`/api/get-session-code?session_id=${sessionId}`);
        const data = await response.json();

        console.log('📦 Data z API:', data);

        if (data.error) {
          setError(data.error);
        } else if (data.code) {
          setCode(data.code);
          setExpiresAt(data.expiresAt);
        } else {
          setError('Kód nebyl nalezen. Kontaktujte podporu.');
        }
      } catch (err) {
        console.error('❌ Chyba při načítání kódu:', err);
        setError('Nepodařilo se načíst kód. Zkuste obnovit stránku.');
      } finally {
        setLoading(false);
      }
    };

    fetchCode();
  }, []);

  const handleCopy = () => {
    if (code) {
      navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleConfirm = () => {
    setConfirmed(true);
    setTimeout(() => {
      window.location.href = '/';
    }, 1500);
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <Loader className="w-16 h-16 text-amber-500 animate-spin mx-auto" />
          <p className="text-white text-xl">Načítám vaši vstupenku...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="bg-slate-800 rounded-3xl p-8 border-2 border-red-500/50">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white text-center mb-4">Něco se pokazilo</h2>
            <p className="text-slate-300 text-center mb-6">{error}</p>
          </div>
          
          <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
            <p className="text-slate-400 text-sm text-center">
              Pokud byla platba stržena, kontaktujte nás na{' '}
              <a href="mailto:tomas.richtr@csgai.cz" className="text-cyan-400 hover:underline">
                tomas.richtr@csgai.cz
              </a>
              {' '}a pošlete nám ID platby z emailu od Stripe.
            </p>
          </div>

          <a
            href="/"
            className="block w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-4 rounded-xl transition-all text-center"
          >
            Zpět na hlavní stránku
          </a>
        </div>
      </div>
    );
  }

  // Success state
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6 animate-fade-in">
        
        {/* Success header */}
        <div className="text-center space-y-4">
          <div className="bg-gradient-to-br from-amber-600 to-orange-600 p-6 rounded-full w-24 h-24 mx-auto flex items-center justify-center shadow-2xl shadow-amber-500/30">
            <Ticket className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-400">
            Platba úspěšná!
          </h1>
          <p className="text-slate-400 text-lg">
            Tvoje vstupenka do divácké místnosti je připravena
          </p>
        </div>

        {/* Code display */}
        <div className="bg-slate-800 rounded-3xl p-8 border-2 border-amber-500/50 shadow-2xl space-y-6">
          
          {/* Code */}
          <div className="bg-slate-900/50 rounded-2xl p-6 border border-amber-500/30">
            <p className="text-slate-400 text-xs uppercase tracking-wider text-center mb-3 flex items-center justify-center gap-2">
              <Eye size={14} />
              Tvůj kód do divácké místnosti
            </p>
            <div className="flex items-center justify-center gap-3">
              <p className="text-5xl font-mono font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-400 tracking-wider">
                {code}
              </p>
              <button
                onClick={handleCopy}
                className="p-3 bg-amber-600 hover:bg-amber-500 rounded-xl transition-colors shadow-lg"
                title="Zkopírovat kód"
              >
                <Copy className="w-6 h-6 text-white" />
              </button>
            </div>
            {copied && (
              <p className="text-green-400 text-sm text-center mt-2 animate-fade-in">
                ✓ Zkopírováno!
              </p>
            )}
          </div>

          {/* Expiration */}
          {expiresAt && (
            <div className="text-center text-slate-400 text-sm">
              Platnost do: <strong className="text-amber-400">{new Date(expiresAt).toLocaleDateString('cs-CZ')}</strong>
            </div>
          )}

          {/* Warning */}
          <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-4">
            <p className="text-red-300 text-sm text-center font-bold">
              ⚠️ DŮLEŽITÉ: Tento kód se už NIKDY znovu nezobrazí!
            </p>
            <p className="text-red-200 text-xs text-center mt-2">
              Ulož si ho teď nebo vyfoť obrazovku
            </p>
          </div>
        </div>

        {/* Confirmation */}
        {!confirmed ? (
          <div className="bg-slate-800/80 rounded-2xl p-6 border border-amber-500/30">
            <p className="text-amber-300 text-center font-bold mb-4">
              MÁŠ KÓD POZNAMENANÝ?
            </p>
            <button
              onClick={handleConfirm}
              className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold py-4 rounded-xl transition-all shadow-lg transform hover:scale-105 active:scale-95"
            >
              ANO, MÁM HO
            </button>
          </div>
        ) : (
          <div className="bg-green-900/30 border border-green-500 rounded-2xl p-6 text-center animate-fade-in">
            <Check className="text-green-400 mx-auto mb-2" size={32} />
            <p className="text-green-300 font-bold">Přesměrovávám na hlavní stránku...</p>
          </div>
        )}

        {/* Info */}
        <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl p-4">
          <p className="text-amber-300 text-xs text-center">
            👁️ <strong>Jak použít vstupenku:</strong><br/>
            1. Přejdi na stvanice.online/divaci<br/>
            2. Zadej kód místnosti (6 znaků od hráčů)<br/>
            3. Zadej tento kód vstupenky<br/>
            4. Sleduj hru na velkém plátně!
          </p>
        </div>

      </div>
    </div>
  );
}
