import { ArrowLeft, Gamepad2, Target, Tv, Info, Heart, HelpCircle, Zap, Users, Baby, Brain, Ticket } from 'lucide-react';

export default function FAQ() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 overflow-auto">
      
      {/* Pozadí efekty */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-20 left-10 w-64 h-64 bg-red-500/10 rounded-full blur-[100px] animate-pulse"></div>
        <div className="absolute bottom-20 right-10 w-64 h-64 bg-blue-500/10 rounded-full blur-[100px] animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-purple-500/5 rounded-full blur-[120px] animate-pulse delay-500"></div>
      </div>

      <div className="relative z-10 max-w-2xl mx-auto px-4 py-8 space-y-8">
        
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex justify-center mb-4">
            <div className="bg-gradient-to-br from-orange-600 to-red-700 p-4 rounded-2xl shadow-xl shadow-orange-500/20">
              <HelpCircle className="w-10 h-10 text-white" />
            </div>
          </div>
          <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500">
            JAK HRÁT ŠTVANICI
          </h1>
          <p className="text-slate-400">
            Vše, co potřebuješ vědět o hře
          </p>
        </div>

        {/* === SEKCE: CO JE ŠTVANICE === */}
        <section className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 space-y-4">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-cyan-600 to-blue-600 p-2 rounded-xl">
              <Gamepad2 className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-white">Co je Štvanice?</h2>
          </div>
          
          <div className="space-y-3 text-slate-300">
            <p>
              <span className="text-cyan-400 font-semibold">Online verze televizní hry "Na lovu"</span>, přesněji její části duelu "Štvanice" – vytvořeno pro pobavení.
            </p>
            <p>
              <span className="text-cyan-400 font-semibold">Vědomostní souboj pro 2 hráče</span> – vhodné pro romantické chvíle ve dvou i do společnosti.
            </p>
            <p>
              <span className="text-cyan-400 font-semibold">Hra je zcela ZDARMA</span> s výjimkou divácké místnosti. Vznikla pro zábavu, ne pro zisk. Výnosy z divácké místnosti jsou určeny na pokrytí nákladů na výpočetní výkon a hosting.
            </p>
            <p>
              <span className="text-cyan-400 font-semibold">Ideální také do společnosti</span> – s projektorem a diváckou místností. Dvojice se mohou relativně rychle střídat.
            </p>
          </div>
        </section>

        {/* === SEKCE: PRINCIP HRY === */}
        <section className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 space-y-4">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-green-600 to-emerald-600 p-2 rounded-xl">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-white">Princip hry</h2>
          </div>
          
          <div className="space-y-4 text-slate-300">
            <div className="flex items-start gap-3">
              <span className="text-2xl">🏃</span>
              <p><span className="text-green-400 font-semibold">Štvanec utíká</span> – snaží se doběhnout do bezpečného úkrytu</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-2xl">👹</span>
              <p><span className="text-red-400 font-semibold">Lovec honí</span> – snaží se Štvance dohonit</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-2xl">❓</span>
              <p>Oba odpovídají na <span className="text-yellow-400 font-semibold">stejné otázky</span> ve stejný čas</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-2xl">✅</span>
              <p><span className="text-emerald-400 font-semibold">Správná odpověď = postup o 1 pole</span></p>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-2xl">🎯</span>
              <p>Štvanec má <span className="text-orange-400 font-semibold">náskok</span>, který si sám volí ze 3 úrovní (2, 3 nebo 4 otázky)</p>
            </div>
          </div>

          {/* Tip box */}
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 mt-4">
            <p className="text-yellow-300 text-sm">
              💡 <span className="font-bold">Tip na zpestření:</span> Pro každý náskok si domluňte odměnu! Menší náskok = větší riziko = lepší odměna.
            </p>
          </div>
        </section>

        {/* === SEKCE: JAK VYHRÁT === */}
        <section className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 space-y-4">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-yellow-600 to-amber-600 p-2 rounded-xl">
              <Target className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-white">Jak vyhrát?</h2>
          </div>
          
          <div className="grid gap-4">
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">👹</span>
                <span className="text-red-400 font-bold text-lg">LOVEC vyhrává</span>
              </div>
              <p className="text-slate-300">Když <span className="text-red-300 font-semibold">dohoní Štvance</span> – dostane se na stejné pole nebo ho předběhne.</p>
            </div>
            
            <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">🏃</span>
                <span className="text-green-400 font-bold text-lg">ŠTVANEC vyhrává</span>
              </div>
              <p className="text-slate-300">Když <span className="text-green-300 font-semibold">doběhne do úkrytu</span> – překročí cílovou čáru dříve než ho Lovec dožene.</p>
            </div>
          </div>
        </section>

        {/* === SEKCE: PRŮBĚH HRY === */}
        <section className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 space-y-4">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-purple-600 to-pink-600 p-2 rounded-xl">
              <Users className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-white">Průběh hry</h2>
          </div>
          
          <div className="space-y-3">
            {[
              { num: "1", title: "Založení hry", desc: "První hráč založí hru a dostane 6místný kód místnosti" },
              { num: "2", title: "Připojení soupeře", desc: "Nasdílej kód druhému hráči, ten se připojí" },
              { num: "3", title: "Výběr rolí a volba témat", desc: "Lovec nebo Štvanec. Změna režimu DOSPĚLÝ / JUNIOR, nebo volba tématického okruhu. Možnost zakoupení vstupenky do divácké místnosti pro společnost – vstupenka platí měsíc, NENÍ aktivováno automatické prodloužení." },
              { num: "4", title: "Volba náskoku", desc: "Štvanec volí náskok 2, 3 nebo 4 otázky" },
              { num: "5", title: "Hra!", desc: "Odpovídejte na otázky a sledujte, kdo vyhraje!" },
              { num: "🔄", title: "Odveta", desc: "Po skončení možnost okamžité odvety bez zadávání nového kódu" },
            ].map((step, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-xl">
                <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 bg-slate-700 text-slate-300">
                  {step.num}
                </div>
                <div>
                  <p className="text-white font-semibold">{step.title}</p>
                  <p className="text-slate-400 text-sm">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* === SEKCE: REŽIMY OBTÍŽNOSTI === */}
        <section className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 space-y-4">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-blue-600 to-cyan-600 p-2 rounded-xl">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-white">Režimy obtížnosti</h2>
          </div>
          
          <div className="grid gap-4">
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Brain className="w-5 h-5 text-blue-400" />
                <span className="text-blue-400 font-bold text-lg">DOSPĚLÝ</span>
              </div>
              <p className="text-slate-300">Otázky z vědy, historie, sportu, kultury, zeměpisu, literatury či gastronomie.</p>
            </div>
            
            <div className="bg-pink-500/10 border border-pink-500/30 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Baby className="w-5 h-5 text-pink-400" />
                <span className="text-pink-400 font-bold text-lg">JUNIOŘI</span>
              </div>
              <p className="text-slate-300">Otázky pro děti 8–14 let – pohádky, zvířata, vesmír, sport pro děti a další.</p>
            </div>
          </div>

          <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-4 mt-4">
            <p className="text-cyan-300 text-sm">
              💡 <span className="font-bold">Tip:</span> Režim můžeš změnit ještě na obrazovce výběru rolí, pak už ne!
            </p>
          </div>
        </section>

        {/* === SEKCE: DIVÁCKÁ MÍSTNOST === */}
        <section className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-amber-500/30 space-y-4">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-amber-600 to-orange-600 p-2 rounded-xl">
              <Tv className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-white">Divácká místnost</h2>
            <span className="bg-amber-500/20 text-amber-400 text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
              <Ticket className="w-3 h-3" />
              139 Kč/měsíc
            </span>
          </div>
          
          <div className="space-y-3 text-slate-300">
            <p>
              Speciální stránka pro <span className="text-amber-400 font-semibold">diváky</span> – ideální na projektor nebo televizi.
            </p>
            <p>
              Zobrazuje průběh hry v reálném čase <span className="text-amber-400 font-semibold">bez nutnosti sledovat displej hráčů</span>.
            </p>
          </div>

          <div className="bg-slate-900/50 rounded-xl p-4 space-y-2">
            <p className="text-white font-semibold">Jak použít:</p>
            <ol className="text-slate-400 text-sm space-y-1 list-decimal list-inside">
              <li>Kup vstupenku (139 Kč na měsíc)</li>
              <li>Otevři <span className="text-amber-400 font-mono">stvanice.online/divaci</span></li>
              <li>Zadej kód místnosti (od hráčů)</li>
              <li>Zadej kód vstupenky</li>
              <li>Sledujte souboj na velkém plátně!</li>
            </ol>
          </div>

          <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
            <p className="text-blue-300 text-sm">
              ℹ️ <span className="font-bold">Proč je divácká místnost placená?</span><br/>
              Samotná hra je ZDARMA. Vstupenka pomáhá pokrýt náklady na provoz (AI, hosting). Jednorázová platba, bez automatického obnovování.
            </p>
          </div>
        </section>

        {/* === SEKCE: O PROJEKTU === */}
        <section className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 space-y-4">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-slate-600 to-slate-700 p-2 rounded-xl">
              <Info className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-white">O projektu</h2>
          </div>
          
          <div className="space-y-3 text-slate-400 text-sm">
            <p><span className="text-slate-300 font-semibold">Naprogramováno s pomocí:</span> Bolt.new, Gemini, Claude, Cursor, Perplexity</p>
            <p><span className="text-slate-300 font-semibold">Platební služba:</span> Stripe (ověřená a bezpečná)</p>
            <p><span className="text-slate-300 font-semibold">AI model:</span> Groq (Llama)</p>
          </div>
        </section>

        {/* === SEKCE: PODPORA === */}
        <section className="bg-gradient-to-br from-red-500/10 to-orange-500/10 backdrop-blur-sm rounded-2xl p-6 border border-red-500/30 space-y-4">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-red-600 to-pink-600 p-2 rounded-xl">
              <Heart className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-white">Podpora</h2>
          </div>
          
          <div className="space-y-3 text-slate-300">
            <p>
              <span className="text-red-400 font-semibold">Líbí se ti hra?</span> Sdílej ji s přáteli! ❤️
            </p>
            <p>
              <span className="text-slate-400">Feedback & kontakt:</span>{' '}
              <a href="mailto:tomas.richtr@csgai.cz" className="text-cyan-400 hover:text-cyan-300 underline">
                tomas.richtr@csgai.cz
              </a>
            </p>
          </div>
        </section>

        {/* === TLAČÍTKO ZPĚT === */}
        <div className="pt-4 pb-8">
          <a
            href="/"
            className="group w-full flex items-center justify-center gap-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold py-4 px-8 rounded-2xl text-xl shadow-xl shadow-cyan-900/30 transition-all transform hover:scale-[1.02] active:scale-95"
          >
            <ArrowLeft className="w-6 h-6 group-hover:-translate-x-1 transition-transform" />
            <span>ZPĚT DO HRY</span>
          </a>
        </div>

        {/* Footer */}
        <div className="text-center text-slate-600 text-xs pb-4">
          ŠTVANICE ONLINE • Kvízová hra pro dva
        </div>

      </div>
    </div>
  );
}
