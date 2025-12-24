import { useState, useEffect } from 'react';
import { Check, Copy, AlertCircle, Loader } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function SuccessPage() {
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const sessionId = searchParams.get('session_id');

    if (!sessionId) {
      setError('Chybí session ID');
      setLoading(false);
      return;
    }

    console.log('🔍 Načítám kód pro session:', sessionId);

    // Získej kód ze serveru
    fetch(`/api/get-session-code?session_id=${sessionId}`)
      .then(res => {
        console.log('📡 API odpověď:', res.status);
        return res.json();
      })
      .then(data => {
        console.log('📦 Data z API:', data);
        if (data.error) {
          setError(data.error);
        } else {
          setCode(data.code);
          setExpiresAt(data.expiresAt);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('❌ Error fetching code:', err);
        setError('Nepodařilo se načíst kód');
        setLoading(false);
      });
  }, [searchParams]);

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
      navigate('/');
    }, 1500);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <Loader className="w-16 h-16 text-cyan-500 animate-spin mx-auto" />
          <p className="text-white text-xl">Načítám herní kód...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-800 rounded-3xl p-8 border-2 border-red-500/50">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white text-center mb-4">Chyba</h2>
          <p className="text-slate-300 text-center mb-6">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 rounded-xl transition-all"
          >
            Zpět na hlavní stránku
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6 animate-fade-in">
        
        {/* Success header */}
        <div className="text-center space-y-4">
          <div className="bg-gradient-to-br from-green-600 to-emerald-600 p-6 rounded-full w-24 h-24 mx-auto flex items-center justify-center shadow-2xl shadow-green-500/30">
            <Check className="w-16 h-16 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-400">
            Platba úspěšná!
          </h1>
          <p className="text-slate-400 text-lg">
            Tvůj herní kód je připravený
          </p>
        </div>

        {/* Code display */}
        <div className="bg-slate-800 rounded-3xl p-8 border-2 border-yellow-500/50 shadow-2xl space-y-6">
          
          {/* Code */}
          <div className="bg-slate-900/50 rounded-2xl p-6 border border-yellow-500/30">
            <p className="text-slate-400 text-xs uppercase tracking-wider text-center mb-3">
              Tvůj Premium Herní Kód
            </p>
            <div className="flex items-center justify-center gap-3">
              <p className="text-5xl font-mono font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-amber-400 tracking-wider">
                {code}
              </p>
              <button
                onClick={handleCopy}
                className="p-3 bg-yellow-600 hover:bg-yellow-500 rounded-xl transition-colors shadow-lg"
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
              Platnost do: <strong className="text-yellow-400">{new Date(expiresAt).toLocaleDateString('cs-CZ')}</strong>
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
          <div className="bg-slate-800/80 rounded-2xl p-6 border border-yellow-500/30">
            <p className="text-yellow-300 text-center font-bold mb-4">
              MÁŠ HERNÍ KÓD POZNAMENÁN?
            </p>
            <button
              onClick={handleConfirm}
              className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-bold py-4 rounded-xl transition-all shadow-lg transform hover:scale-105 active:scale-95"
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
        <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-4">
          <p className="text-blue-300 text-xs text-center">
            💡 <strong>Tento kód ti umožňuje zadávat vlastní témata!</strong><br/>
            Použij ho kdykoliv během měsíce. Při každém použití můžeš zadat jiné téma.<br/>
            Příklad: Dnes "Fotbal Itálie", zítra "Česká fyzika"
          </p>
        </div>

      </div>
    </div>
  );
}
