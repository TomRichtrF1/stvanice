import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// TVÁ OBŘÍ DATABÁZE TÉMAT
const massiveTopics = [
  "Sport a pohyb: Fotbal", "Sport a pohyb: Basketbal", "Sport a pohyb: Hokej", "Sport a pohyb: Tenis", "Sport a pohyb: Atletika", 
  "Sport a pohyb: Plavání", "Sport a pohyb: Cyklistika", "Sport a pohyb: Box a bojové sporty", "Sport a pohyb: Zimní sporty (lyžování, snowboarding)", 
  "Sport a pohyb: Motorsport (F1, MotoGP)", "Sport a pohyb: Gymnastika a akrobacie", "Sport a pohyb: Extrémní sporty",
  "Přírodní vědy: Fyzika (mechanika, optika, elektřina)", "Přírodní vědy: Chemie (organická, anorganická)", "Přírodní vědy: Biologie (buněčná, molekulární)", 
  "Přírodní vědy: Astronomie a kosmologie", "Přírodní vědy: Geologie a mineralogie", "Přírodní vědy: Meteorologie a klimatologie", 
  "Přírodní vědy: Oceanografie", "Přírodní vědy: Ekologie a životní prostředí",
  "Živá příroda: Zoologie savců", "Živá příroda: Ornitologie (ptáci)", "Živá příroda: Herpetologie (plazi a obojživelníci)", 
  "Živá příroda: Entomologie (hmyz)", "Živá příroda: Mořská biologie", "Živá příroda: Botanika květin", "Živá příroda: Dendrologie (stromy)", 
  "Živá příroda: Mykologie (houby)", "Živá příroda: Mikrobiologie",
  "Zeměpis: Evropská geografie", "Zeměpis: Asijská geografie", "Zeměpis: Americká geografie (Severní i Jižní)", "Zeměpis: Africká geografie", 
  "Zeměpis: Austrálie a Oceánie", "Zeměpis: Hlavní města světa", "Zeměpis: Řeky a jezera", "Zeměpis: Hory a pohoří", "Zeměpis: Ostrovy a poloostrovy", 
  "Zeměpis: Pouště a biomy",
  "Historie: Starověk (Egypt, Řecko, Řím)", "Historie: Středověk", "Historie: Renesance a osvícenství", "Historie: Průmyslová revoluce", 
  "Historie: První světová válka", "Historie: Druhá světová válka", "Historie: Studená válka", "Historie: Starověké civilizace (Inkové, Mayové, Aztékové)", 
  "Historie: České dějiny", "Historie: Antická mytologie",
  "Technologie a věda: Informatika a programování", "Technologie a věda: Umělá inteligence", "Technologie a věda: Robotika", "Technologie a věda: Kosmonautika", 
  "Technologie a věda: Medicína a anatomie", "Technologie a věda: Farmakologie", "Technologie a věda: Fyzikální objevy a vynálezy", 
  "Technologie a věda: Chemické prvky a periodická tabulka", "Technologie a věda: Matematika (algebra, geometrie)", "Technologie a věda: Inženýrství a stavitelství",
  "Doprava: Automobilový průmysl", "Doprava: Letectví", "Doprava: Lodní doprava", "Doprava: Železnice a vlaky", "Doprava: Historie dopravy", "Doprava: Vesmírné lety",
  "Kultura a umění: Malířství (staří mistři, moderní umění)", "Kultura a umění: Sochařství", "Kultura a umění: Architektura (styly, slavné budovy)", 
  "Kultura a umění: Literatura (světová, česká)", "Kultura a umění: Poezie", "Kultura a umění: Divadlo", "Kultura a umění: Film a kinematografie", 
  "Kultura a umění: Hudba klasická", "Kultura a umění: Populární hudba (rock, pop, jazz)", "Kultura a umění: Hip hop a rap", "Kultura a umění: Elektronická hudba", 
  "Kultura a umění: Fotografie",
  "Gastronomie: Italská kuchyně", "Gastronomie: Francouzská kuchyně", "Gastronomie: Asijská kuchyně", "Gastronomie: Mexická kuchyně", "Gastronomie: Indická kuchyně", 
  "Gastronomie: Středomořská kuchyně", "Gastronomie: Pečení a cukrářství", "Gastronomie: Víno a vinařství", "Gastronomie: Pivo a pivovarnictví", 
  "Gastronomie: Koktejly a mixologie", "Gastronomie: Čaje a káva",
  "Móda a životní styl: Historie módy", "Móda a životní styl: Módní návrháři", "Móda a životní styl: Textilní materiály", "Móda a životní styl: Šperky a hodinky",
  "Zábava a popkultura: Videohry", "Zábava a popkultura: Komiksy a manga", "Zábava a popkultura: Televizní seriály", "Zábava a popkultura: Anime", 
  "Zábava a popkultura: Streamovací platformy", "Zábava a popkultura: Internet a memes", "Zábava a popkultura: Sociální média",
  "Filozofie a společnost: Psychologie", "Filozofie a společnost: Ekonomie", "Filozofie a společnost: Politické systémy", "Filozofie a společnost: Náboženství světa", 
  "Filozofie a společnost: Mytologie (řecká, severská, egyptská)",
  "Ostatní: Olympijské hry", "Ostatní: Nobel prize laureáti", "Ostatní: Světové rekordy", "Ostatní: UNESCO památky", "Ostatní: Slavné osobnosti",
  "Věda a výzkum: Kvantová fyzika", "Věda a výzkum: Nanotechnologie", "Věda a výzkum: Genetika a DNA", "Věda a výzkum: Evoluce a Darwin", 
  "Věda a výzkum: Archeologie", "Věda a výzkum: Paleontologie (dinosauři)", "Věda a výzkum: Kryptografie", "Věda a výzkum: Teorie chaosu", 
  "Věda a výzkum: Jaderná fyzika",
  "Příroda detailněji: Tropické deštné lesy", "Příroda detailněji: Savany a stepi", "Příroda detailněji: Sopky a vulkanismus", "Příroda detailněji: Zemětřesení", 
  "Příroda detailněji: Ledovce a polární oblasti", "Příroda detailněji: Národní parky světa", "Příroda detailněji: Zvířata Austrálie",
  "Historie detailněji: Vikingové", "Historie detailněji: Japonští samurajové", "Historie detailněji: Rytíři a křížové výpravy", "Historie detailněji: Piráti a korzáři", 
  "Historie detailněji: Divný Západ USA", "Historie detailněji: Byzantská říše", "Historie detailněji: Osmanská říše", "Historie detailněji: Čínské dynastie", 
  "Historie detailněji: Faraoni a mumie", "Historie detailněji: Titanic a slavné lodě",
  "Technologie a vynálezy: Historie internetu", "Technologie a vynálezy: Vývoj telefonů", "Technologie a vynálezy: Počítačové hry (historie)", 
  "Technologie a vynálezy: 3D tisk", "Technologie a vynálezy: Drony", "Technologie a vynálezy: Elektromobily", "Technologie a vynálezy: Obnovitelné zdroje energie",
  "Kultura a tradice: Světové festivaly", "Kultura a tradice: Africká kultura", "Kultura a tradice: Domorodé kmeny", "Kultura a tradice: Tetování a body art", 
  "Kultura a tradice: Graffiti a street art", "Kultura a tradice: Origami",
  "Hudební žánry: Metal", "Hudební žánry: Punk rock", "Hudební žánry: Folk a world music", "Hudební žánry: Opera a muzikály", "Hudební žánry: Slavné koncerty",
  "Literatura: Sci-fi", "Literatura: Fantasy", "Literatura: Detektivky", "Literatura: Horory", "Literatura: Komiksová literatura",
  "Tajemno: Kryptozoologie (Yeti, Loch Ness)", "Tajemno: UFO a mimozemšťané", "Tajemno: Konspirace", "Tajemno: Paranormální jevy", "Tajemno: Magie a iluze",
  "Zvířata specificky: Šelmy a predátoři", "Zvířata specificky: Primáti", "Zvířata specificky: Domácí mazlíčci", "Zvířata specificky: Vymřelá zvířata", 
  "Zvířata specificky: Jedovatá zvířata",
  "Prostor kolem nás: Černé díry", "Prostor kolem nás: Planety sluneční soustavy", "Prostor kolem nás: Měsíce planet", "Prostor kolem nás: Hvězdy a souhvězdí", 
  "Prostor kolem nás: Meteority a komety", "Prostor kolem nás: Exoplanety", "Prostor kolem nás: Vesmírné mise"
];

const fallbackQuestions = [
  { question: 'Jaké je hlavní město ČR?', options: ['Brno', 'Praha', 'Ostrava'], correct: 1 }
];

export async function generateQuestion(topic = 'general', mode = 'adult') {
  
  let selectedTopic = topic;
  
  if (topic === 'general') {
    selectedTopic = massiveTopics[Math.floor(Math.random() * massiveTopics.length)];
    console.log(`🎲 Losuji téma ze seznamu: "${selectedTopic}"`);
  } else {
    console.log(`🎯 Uživatelské téma: "${selectedTopic}"`);
  }

  // === UPRAVENÁ LOGIKA OBTÍŽNOSTI ===
  let systemPersona = "";
  if (mode === 'kid') {
    console.log("👶 Režim: JUNIOR (Zjednodušený 6-12 let)");
    systemPersona = `
      Jsi milý průvodce světem pro děti (věk 6-12 let).
      Téma otázky: "${selectedTopic}".
      
      Pravidla pro děti:
      1. Otázky musí být HRAVÉ a JEDNODUCHÉ. 
      2. VYHNI SE LETOPOČTŮM a složitým historickým datům.
      3. Pokud je téma složité (např. 'Fyzika'), zeptej se na úplný základ (např. 'Proč padá míč dolů?').
      4. Používej příklady z pohádek, filmů pro děti (Disney, Pixar) nebo věcí, co znají ze školy (prvouka).
      5. Jazyk musí být velmi srozumitelný. Žádná cizí slova.
    `;
  } else {
    console.log("👨‍🦳 Režim: DOSPĚLÝ (Standard)");
    systemPersona = `
      Jsi moderátor zábavného pub kvízu pro dospělé.
      Téma: "${selectedTopic}".
      
      Pravidla pro dospělé:
      1. Obtížnost: Zlatý střed. Nechceme akademické znalosti, ale všeobecný přehled.
      2. Otázka by měla být zajímavá ("fun fact"), ne jen suchá data.
      3. Vyhni se extrémně specifickým otázkám (např. přesné datum narození méně známé osoby).
      4. Buď vtipný a kreativní.
    `;
  }

  try {
    const prompt = `
      ${systemPersona}
      
      Vytvoř jednu kvízovou otázku.
      Musí mít 3 možnosti odpovědi, jen jedna je správná.
      
      Odpověz POUZE validním JSON objektem:
      {
        "question": "Text otázky",
        "options": ["Možnost A", "Možnost B", "Možnost C"],
        "correct": 0 (index 0-2)
      }
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Jsi JSON generátor. Vracíš pouze čistý JSON." },
        { role: "user", content: prompt }
      ],
      temperature: 0.9, 
    });

    let rawContent = response.choices[0].message.content;
    rawContent = rawContent.replace(/```json/g, "").replace(/```/g, "").trim();

    return JSON.parse(rawContent);

  } catch (error) {
    console.error("❌ Chyba AI:", error.message);
    return fallbackQuestions[0];
  }
}