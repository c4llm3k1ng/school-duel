'use strict';
// Zweite Bereinigungsrunde für fussball-katalog.html.
// Behebt: "oder [Name]"-Leaks, "Trickfrage"-Text, falsche Prämissen,
//         Klammerreste, und Fragen wo der Fragetext die Antwort enthält.
// Aufruf: node fix_fussball2.js

const fs   = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'fussball-katalog.html');

// ── Serializer ──────────────────────────────────────────────────────
function serializeQuestion(q) {
  return `{question:${JSON.stringify(q.question)},options:${JSON.stringify(q.options)},correct:${q.correct},explanation:${JSON.stringify(q.explanation || '')},topic:${JSON.stringify(q.topic || '')}}`;
}

// ── Manuelle Overrides ──────────────────────────────────────────────
// Schlüssel = original question text, Wert = komplettes neues q-Objekt oder nur {question, explanation}
const OVERRIDES = {
  // LEICHT: "oder [Name]" Leaks
  "Welcher Spieler wird 'Der Häuptling' oder Lothar genannt und war 1990 Kapitän?": {
    question: "Welcher deutsche Spieler war Kapitän der Weltmeister-Mannschaft von 1990 und hält den deutschen Länderspielrekord?",
    explanation: "Lothar Matthäus war 1990 Kapitän der deutschen Nationalmannschaft und bestritt insgesamt 150 Länderspiele – Rekord für Deutschland."
  },
  "Welcher Spieler wird 'Der Türmer' oder Sané genannt und spielt für Deutschland?": {
    question: "Welcher deutsche Nationalspieler wechselte 2020 von Manchester City zum FC Bayern München?",
    explanation: "Leroy Sané wechselte 2020 für rund 45 Millionen Euro von Manchester City zum FC Bayern München."
  },
  "Welcher Spieler wird 'Der Panther' oder Eusébio genannt?": {
    question: "Welcher portugiesische Stürmer gilt als größter Fußballer seines Landes und wurde bei der WM 1966 Torschützenkönig?",
    explanation: "Eusébio trägt den Spitznamen 'Der Panther' und erzielte bei der WM 1966 neun Tore – er führte Portugal zum dritten Platz."
  },
  "Welcher Verein wird 'Die Werkself' aus Wolfsburg oder Leverkusen genannt?": {
    question: "Welcher Bundesligaverein trägt den Spitznamen 'Die Werkself' und hat seinen Ursprung in einem Chemiekonzern?",
    explanation: "Bayer Leverkusen trägt den Spitznamen 'Die Werkself', da der Verein aus der Betriebssportgemeinschaft des Pharmakonzerns Bayer hervorging.",
    options: ["Bayer Leverkusen", "VfL Wolfsburg", "RB Leipzig", "FC Augsburg"],
    correct: 0
  },
  "Welcher Verein wird 'Pauli' oder Kiezklub genannt?": {
    question: "Welcher Hamburger Fußballverein trägt den Spitznamen 'Kiezklub' und ist bekannt für seine linke Fankultur?",
    explanation: "Der FC St. Pauli aus dem Hamburger Stadtteil St. Pauli wird 'Kiezklub' genannt und ist für seine besondere Fankultur bekannt."
  },
  "Welcher Verein wird 'Die Bullen' aus Salzburg oder Leipzig genannt?": {
    question: "Welcher österreichische Fußballklub trägt den Spitznamen 'Die Bullen' und ist das Vorzeigeprodukt des Red-Bull-Konzerns in Europa?",
    explanation: "Red Bull Salzburg trägt den Spitznamen 'Die Bullen' und ist der österreichische Stammverein des Red-Bull-Fußballimperiums.",
    options: ["Red Bull Salzburg", "RB Leipzig", "New York Red Bulls", "Red Bull Bragantino"],
    correct: 0
  },
  "Welcher Spieler wird 'Der Diego' genannt und ist Argentiniens Legende?": {
    question: "Welcher argentinische Spieler gilt als einer der besten Fußballer aller Zeiten und führte Argentinien 1986 zum WM-Titel?",
    explanation: "Diego Maradona wird von vielen als bester Fußballer aller Zeiten bezeichnet. Sein Tor gegen England 1986 ist legendär."
  },
  "Welcher Spieler wird 'Musiala' oder 'Bambi' genannt?": {
    question: "Welcher junge Bayern-München-Spieler trägt den Spitznamen 'Bambi' und gilt als eines der größten deutschen Talente?",
    explanation: "Jamal Musiala erhielt den Spitznamen 'Bambi' wegen seiner Beweglichkeit. Er ist einer der vielversprechendsten deutschen Spieler seiner Generation."
  },
  "Welcher Spieler wird 'Toni' Kroos' Bruder genannt?": {
    question: "Wie heißt der jüngere Bruder von Weltmeister Toni Kroos, der ebenfalls Profi-Fußballer wurde?",
    explanation: "Felix Kroos ist der jüngere Bruder von Toni Kroos und spielte ebenfalls in der Bundesliga, allerdings ohne die gleiche Bekanntheit zu erreichen."
  },
  "Welcher Spieler wird 'Der Adler' Neuer genannt?": {
    question: "Welcher deutsche Torwart gilt als einer der besten der Welt und ist seit Jahren Stammkeeper der Nationalmannschaft?",
    explanation: "Manuel Neuer prägte den modernen Sweeper-Keeper-Stil und wurde mehrfach zum weltbesten Torwart gewählt."
  },
  "Welcher Spieler wird 'Bobby' Charlton genannt und ist England-Legende?": {
    question: "Welcher englische Spieler war Starspieler im WM-Gewinner-Team 1966 und gilt als einer der größten englischen Fußballer aller Zeiten?",
    explanation: "Bobby Charlton gewann 1966 die Weltmeisterschaft mit England und wurde mit Manchester United dreimal englischer Meister sowie Europapokalsieger 1968."
  },
  // LEICHT: Fragen wo Antwort explizit im Text steht
  "Welcher Verein kommt aus Barcelona?": {
    question: "Welcher katalanische Topklub ist der Erzrivale von Real Madrid und spielt in Blaugrana?",
    explanation: "Der FC Barcelona ist der Erzrivale von Real Madrid. Der Verein ist für seinen Angriffsfußball und Spieler wie Messi, Xavi und Iniesta bekannt."
  },
  "Welche Stadt ist die Heimat des FC Liverpool?": {
    question: "In welcher englischen Stadt befindet sich das berühmte Anfield-Stadion?",
    explanation: "Das Anfield-Stadion ist das Heimstadion des FC Liverpool und liegt im Stadtteil Anfield der gleichnamigen Stadt."
  },
  "Wie heißt der spanische Clásico-Gegner von Real Madrid?": {
    question: "Wie heißt das Duell zwischen Real Madrid und seinem größten Rivalen in der spanischen Liga?",
    explanation: "El Clásico bezeichnet das Aufeinandertreffen zwischen Real Madrid und dem FC Barcelona – eines der meistgesehenen Spiele der Welt.",
    options: ["El Clásico", "Derby della Madonnina", "Superclásico", "Revierderby"],
    correct: 0
  },
  "Wie heißt der Verein aus der Stadt Dortmund?": {
    question: "Welcher Verein aus dem Ruhrgebiet ist bekannt für seine lauteste Tribüne Europas und die Vereinsfarben Schwarz-Gelb?",
    explanation: "Borussia Dortmund besitzt mit der Südtribüne (Gelbe Wand) die größte Stehplatztribüne Europas."
  },
  "Welcher Verein wird 'Die Eintracht' aus Frankfurt genannt?": {
    question: "Welcher Bundesligaverein aus Hessen gewann 2022 die UEFA Europa League?",
    explanation: "Eintracht Frankfurt gewann 2022 sensationell die Europa League durch einen Sieg im Elfmeterschießen gegen die Glasgow Rangers.",
    options: ["Eintracht Frankfurt", "Borussia Dortmund", "RB Leipzig", "FC Schalke 04"],
    correct: 0
  },
  "Welcher Verein kommt aus der Stadt Mailand und spielt in Schwarz-Blau?": {
    question: "Welcher Mailänder Verein trägt das schwarz-blaue Trikot und gewann die Champions League zuletzt 2010?",
    explanation: "Inter Mailand trägt Schwarz-Blau und gewann 2010 unter José Mourinho das Triple aus Serie A, Coppa Italia und Champions League."
  },
  "Welcher Verein kommt aus der Stadt München neben Bayern?": {
    question: "Welcher Münchener Traditionsverein spielt heute in der 3. Liga und teilt sich die Stadt mit dem FC Bayern?",
    explanation: "Der TSV 1860 München, auch 'Die Löwen' genannt, ist nach dem FC Bayern der bekannteste Münchner Verein und spielt aktuell in der 3. Liga."
  },
  "Welcher Verein hat den Spitznamen 'Die Bayern'?": {
    question: "Welcher deutsche Rekordmeister trägt den inoffiziellen Spitznamen 'FC Hollywood' wegen seines öffentlichkeitswirksamen Vereinslebens?",
    explanation: "Der FC Bayern München erhielt in den 1990er Jahren den Spitznamen 'FC Hollywood' wegen der öffentlichen Querelen zwischen Spielern, Trainern und Bossen."
  },
  "Welcher Verein gewann zuletzt 2009 mit Barcelona das Triple unter Guardiola?": {
    question: "Welcher Verein gewann als erster spanischer Club das Triple aus Liga, Pokal und Champions League?",
    explanation: "Der FC Barcelona gewann 2009 unter Pep Guardiola als erster spanischer Verein das Triple. Messi, Xavi und Iniesta prägten dieses Team."
  },
  "Welcher Spieler wird 'Der Häuptling' oder Lothar genannt und war 1990 Kapitän?": {
    question: "Welcher deutsche Spieler war Kapitän der Weltmeister-Mannschaft von 1990 und hält den deutschen Länderspielrekord?",
    explanation: "Lothar Matthäus war 1990 Kapitän der deutschen Nationalmannschaft und bestritt insgesamt 150 Länderspiele – Rekord für Deutschland."
  },
  "Welcher Verein wird 'Die Hertha' genannt?": {
    question: "Welcher Berliner Fußballverein spielt im Olympiastadion und strebt seit Jahren in die obere Tabellenhälfte der Bundesliga?",
    explanation: "Hertha BSC Berlin spielt im Berliner Olympiastadion und ist der bekannteste Fußballverein der Hauptstadt.",
    options: ["Hertha BSC", "Union Berlin", "BFC Dynamo", "Tennis Borussia"],
    correct: 0
  },
  "Welcher Spieler erfand den 'Panenka'-Elfmeter 1976?": {
    question: "Welche Technik beschreibt einen Elfmeter, bei dem der Ball als eleganter Lupfer in die Mitte des Tores geschossen wird?",
    explanation: "Der Panenka wurde 1976 von Antonín Panenka im EM-Finale gegen Deutschland erfunden – ein eleganter Chip in die Mitte des Tores."
  },
  "Welcher Verein gewann 1997 als bisher einziger Bundesligist nach Dortmund die Ch…": {
    question: "Welcher Bundesligaverein gewann 1997 sensationell die Champions League mit einem 3:1-Sieg gegen Juventus Turin?",
    explanation: "Borussia Dortmund gewann 1997 die Champions League – bis heute der letzte deutsche Sieg in diesem Wettbewerb.",
    options: ["Borussia Dortmund", "FC Bayern München", "Werder Bremen", "Bayer Leverkusen"],
    correct: 0
  },
  "Welcher spanische Mittelfeldspieler trägt den Spitznamen 'Der Zauberer' oder 'El…": {
    question: "Welcher spanische Mittelfeldspieler des FC Barcelona gilt als einer der kreativsten Spieler seiner Generation und prägte das Tiki-Taka-System?",
    explanation: "Andrés Iniesta trägt den Spitznamen 'El Ilusionista' (Der Zauberer) und schoss das Siegtor im WM-Finale 2010."
  },
  // MITTEL: Fragen mit Antwort im Text
  "Welcher Verein wurde 2004 deutscher Meister mit Werder unter Schaaf?": {
    question: "Welcher norddeutsche Verein wurde 2004 überraschend deutscher Meister und verwies den FC Bayern auf Platz 2?",
    explanation: "Werder Bremen wurde 2004 unter Thomas Schaaf Meister – mit einem attraktiven Offensivspiel rund um Johan Micoud und Miroslav Klose."
  },
  "Welcher Verein wurde 1998 deutscher Meister mit Kaiserslautern als Aufsteiger?": {
    question: "Welcher Verein schaffte 1998 als direkter Aufsteiger das Kunststück, in seiner ersten Bundesligasaison sofort Meister zu werden?",
    explanation: "1. FC Kaiserslautern stieg 1997 auf und wurde 1998 als frischer Aufsteiger unter Trainer Otto Rehhagel sensationell Meister."
  },
  "Welcher Verein wurde 2009 deutscher Meister mit Wolfsburg unter Magath?": {
    question: "Welcher Verein aus Niedersachsen gewann 2009 seine erste und bisher einzige Bundesliga-Meisterschaft?",
    explanation: "VfL Wolfsburg gewann 2009 unter Felix Magath die erste Meisterschaft der Vereinsgeschichte, angeführt von Torjäger Grafite (28 Tore)."
  },
  "Welcher Verein wurde 2007 deutscher Meister mit Stuttgart?": {
    question: "Welcher Verein aus Baden-Württemberg gewann zuletzt 2007 die Bundesliga-Meisterschaft?",
    explanation: "Der VfB Stuttgart gewann 2007 seine zweite Meisterschaft unter Trainer Armin Veh.",
    options: ["VfB Stuttgart", "SC Freiburg", "TSG Hoffenheim", "Karlsruher SC"],
    correct: 0
  },
  "Welcher Verein wurde 2002 deutscher Meister mit Dortmund?": {
    question: "Welcher Verein gewann in der Saison 2001/02 die Bundesliga und qualifizierte sich damit für die Champions League?",
    explanation: "Borussia Dortmund wurde 2002 Meister und trat danach in der Champions League an. Die Saison war geprägt von Spielern wie Jan Koller und Marcio Amoroso."
  },
  "Welcher Verein wurde 2011 und 2012 deutscher Meister mit Dortmund unter Klopp?": {
    question: "Welcher Verein gewann 2011 und 2012 hintereinander die Bundesliga und prägte unter seinem Trainer den Begriff 'Gegenpressing'?",
    explanation: "Borussia Dortmund gewann 2011 und 2012 unter Jürgen Klopp die Meisterschaft. Das Team um Lewandowski, Götze und Reus spielte leidenschaftlichen Fußball."
  },
  "Welcher Verein wurde 2010 deutscher Meister mit Bayern unter van Gaal?": {
    question: "Welcher Verein wurde 2010 unter seinem niederländischen Trainer Meister und zog im gleichen Jahr ins Champions-League-Finale ein?",
    explanation: "Der FC Bayern München wurde 2010 unter Louis van Gaal Meister und verlor das CL-Finale gegen Inter Mailand mit 0:2."
  },
  "Welcher Verein wurde 2016 deutscher Meister mit Bayern unter Guardiola?": {
    question: "Welcher Verein holte 2016 seine letzte von vier aufeinanderfolgenden Bundesliga-Meisterschaften unter Pep Guardiola?",
    explanation: "Der FC Bayern München gewann 2016 die Meisterschaft – Guardiolas letztes Jahr beim Verein. Danach übernahm Carlo Ancelotti."
  },
  "Welcher Verein wurde 1995 deutscher Meister mit Dortmund?": {
    question: "Welcher Verein gewann 1995 und 1996 hintereinander die Bundesliga und sicherte sich damit zwei Meisterschaften in Folge?",
    explanation: "Borussia Dortmund gewann 1995 und 1996 die Bundesliga-Meisterschaft und 1997 die Champions League – eine der erfolgreichsten Phasen des Vereins."
  },
  "Welcher Verein wurde 2017 deutscher Meister mit Bayern?": {
    question: "Welcher Verein holte in der Saison 2016/17 seinen fünften Bundesliga-Titel in Folge?",
    explanation: "Der FC Bayern München holte 2017 seinen fünften deutschen Meistertitel hintereinander – eine Dominanz, die in der Bundesliga-Geschichte einzigartig ist."
  },
  "Welcher Verein wurde 2008 deutscher Meister mit Bayern unter Hitzfeld?": {
    question: "Welcher Verein gewann 2008 die Bundesliga unter Ottmar Hitzfeld und beendete damit eine Bayern-Durststrecke von zwei Jahren?",
    explanation: "Der FC Bayern München gewann 2008 unter Ottmar Hitzfeld wieder die Meisterschaft. In den Vorjahren hatte Werder Bremen und VfB Stuttgart gewonnen."
  },
  "Welcher Verein wurde 2014 deutscher Meister mit Bayern unter Guardiola?": {
    question: "Welcher Verein stellte 2014 mit 90 Punkten einen damaligen Bundesliga-Rekord auf?",
    explanation: "Der FC Bayern München erreichte 2013/14 unter Pep Guardiola 90 Punkte in der Bundesliga – ein bis dahin unerreichter Rekord."
  },
  "Welcher Verein wurde 1999 deutscher Meister durch Bayern-Patzer?": {
    question: "Welcher Verein wurde 1999 auf dramatische Weise deutscher Meister, nachdem Bayern München am letzten Spieltag Punkte ließ?",
    explanation: "Borussia Dortmund wurde 1999 Meister, weil Bayern München am letzten Spieltag verlor. Es war ein dramatischer Titelgewinn für den BVB."
  },
  "Welcher Verein wurde 2018 deutscher Meister mit Bayern?": {
    question: "Welcher Verein sicherte sich 2018 seinen sechsten Bundesliga-Titel in Folge und übertraf damit alle Erwartungen?",
    explanation: "Der FC Bayern München wurde 2018 zum sechsten Mal hintereinander Meister – eine außergewöhnliche Dominanz in der Bundesliga-Geschichte."
  },
  "Welcher Verein wurde 2012 deutscher Meister mit Dortmund?": {
    question: "Welcher Verein holte 2012 die Meisterschaft mit dem damals jüngsten Kader der Bundesliga-Geschichte?",
    explanation: "Borussia Dortmund gewann 2012 mit dem jüngsten Kaderschnitt aller Meister die Bundesliga. Spieler wie Mario Götze und Robert Lewandowski prägten dieses Team."
  },
  "Welcher Verein gewann 1996 die EM-Heimat England aber Deutschland holte Titel?": {
    question: "Welche Nation gewann die Europameisterschaft 1996, die in England ausgetragen wurde?",
    explanation: "Deutschland gewann die EM 1996 in England mit 2:1 im Finale gegen Tschechien. Oliver Bierhoff erzielte das erste Golden Goal der EM-Geschichte."
  },
  "Welcher Spieler erzielte beim 8:2 von Barça gegen Bayern 2020 nicht – Bayern gew…": {
    question: "Welches Ergebnis erzielte der FC Bayern im Champions-League-Viertelfinale 2020 gegen den FC Barcelona?",
    explanation: "Der FC Bayern München schlug den FC Barcelona im August 2020 mit 8:2 – eines der höchsten CL-Ergebnisse zwischen Topklubs.",
    options: ["8:2 für Bayern", "2:8 für Barça", "6:1 für Bayern", "7:1 für Bayern"],
    correct: 0
  },
  "Welcher Verein wurde 2012 im Elfmeterschießen Bundesliga-Pokalsieger des FC Baye…": {
    question: "Welcher englische Verein besiegte den FC Bayern München 2012 im CL-Finale per Elfmeterschießen – im eigenen Stadion der Bayern?",
    explanation: "Chelsea FC gewann 2012 das Champions-League-Finale gegen Bayern München im Elfmeterschießen – auf dem Allianz-Arena-Rasen.",
    options: ["Chelsea FC", "Arsenal FC", "Manchester United", "Tottenham Hotspur"],
    correct: 0
  },
  "Welcher Verein wurde 2004 sensationell italienischer Meister vor den Topklubs?": {
    question: "Welcher Verein holte 2003/04 die Serie A und überraschte dabei Favoriten wie Juventus und Milan?",
    explanation: "AC Mailand gewann die Serie A 2003/04 mit 82 Punkten vor dem AS Roma. Es war kein Aufsteiger, aber ein überzeugender Titelgewinn.",
    options: ["AC Mailand", "AS Roma", "Lazio Rom", "Inter Mailand"],
    correct: 0
  },
  "Welche Nation gewann die WM 1954 und schlug die favorisierten Ungarn?": {
    question: "Bei welchem Ereignis, das als 'Wunder von Bern' bekannt wurde, schlug Deutschland den haushohen Favoriten im WM-Finale 1954?",
    explanation: "Deutschland schlug 1954 im Finale in Bern Ungarn mit 3:2, obwohl Ungarn als unbesiegbare Mannschaft galt – das 'Wunder von Bern'.",
    options: ["Ungarn","Brasilien","Österreich","Uruguay"],
    correct: 0
  },
  "Welcher Verein gewann unter Ancelotti die meisten Champions-League-Titel als Tra…": {
    question: "Welcher Trainer gewann die Champions League viermal – als einziger Coach mit vier Titeln?",
    explanation: "Carlo Ancelotti gewann die Champions League 2003 und 2007 mit AC Mailand sowie 2014 und 2022 mit Real Madrid – insgesamt viermal.",
    options: ["Carlo Ancelotti", "Pep Guardiola", "Sir Alex Ferguson", "José Mourinho"],
    correct: 0
  },
  // SCHWER: Falsche Prämissen und fehlerhafte Fragen
  "Welcher Verein gewann 2000 und 2001 die Champions League in Folge?": {
    question: "Welcher Verein gewann 2001 die Champions League mit einem 5:4-Sieg im Elfmeterschießen im Finale gegen Valencia?",
    explanation: "Bayern München gewann 2001 die Champions League nach einem 5:4 im Elfmeterschießen im Finale gegen Valencia auf dem San Siro in Mailand.",
    options: ["FC Bayern München", "Real Madrid", "Manchester United", "Borussia Dortmund"],
    correct: 0
  },
  "Welcher Spieler ist der einzige, der in drei verschiedenen WM-Turnieren je einma…": {
    question: "Welcher Spieler hält den Rekord für die meisten Tore bei einer einzelnen Weltmeisterschaft?",
    explanation: "Just Fontaine erzielte bei der WM 1958 in Schweden insgesamt 13 Tore – ein bis heute ungebrochener Rekord für eine WM-Endrunde.",
    options: ["Just Fontaine", "Gerd Müller", "Ronaldo Nazário", "Sándor Kocsis"],
    correct: 0
  },
  "Welcher Spieler erzielte das Tor zum 1000. Pflichtspielsieg eines Klubs – Trickf…": {
    question: "Welcher Spieler erzielte für den FC Barcelona das Tor beim 1000. Ligasieg des Vereins?",
    explanation: "Xavi Hernández erzielte das entscheidende Tor, als der FC Barcelona seinen 1000. Ligasieg feierte – ein historischer Moment für den Verein."
  },
  "Welcher Verein gewann 1968 als erster englischer Klub Europas Krone und 50 Jahre…": {
    question: "Welcher englische Verein gewann 1968 als erster englischer Klub den Europapokal der Landesmeister?",
    explanation: "Manchester United gewann 1968 unter Matt Busby den Europapokal der Landesmeister durch einen 4:1-Sieg gegen Benfica nach Verlängerung.",
    options: ["Manchester United", "Liverpool FC", "Arsenal FC", "Tottenham Hotspur"],
    correct: 0
  },
  "Welcher Verein gewann 1970 als zweiter englischer Klub keinen, aber 1970 Feyenoo…": {
    question: "Welcher niederländische Verein gewann 1970 als erstes Team aus den Niederlanden den Europapokal der Landesmeister?",
    explanation: "Feyenoord Rotterdam gewann 1970 den Europapokal der Landesmeister durch einen 2:1-Sieg nach Verlängerung gegen Celtic Glasgow.",
    options: ["Feyenoord Rotterdam", "Ajax Amsterdam", "PSV Eindhoven", "FC Twente"],
    correct: 0
  },
  "Welcher Spieler ist Rekordtorschütze der Copa Libertadores?": {
    question: "Welcher Spieler ist Rekordtorschütze der Copa Libertadores, dem wichtigsten südamerikanischen Clubwettbewerb?",
    explanation: "Alberto Spencer aus Ecuador erzielte 54 Tore in der Copa Libertadores und hält damit den Rekord als bester Torschütze des Wettbewerbs.",
    options: ["Alberto Spencer", "Gabriel Batistuta", "Pelé", "Ronaldo Nazário"],
    correct: 0
  },
  "Welcher Spieler wurde bei der WM 1990 jüngster Torschütze für Kamerun?": {
    question: "Welcher Spieler war bei der WM 1990 mit 38 Jahren der älteste Torschütze und wurde zum Idol Kameruns?",
    explanation: "Roger Milla erzielte bei der WM 1990 vier Tore für Kamerun und wurde mit 38 Jahren zum ältesten WM-Torschützen der Geschichte.",
    options: ["Roger Milla", "François Omam-Biyik", "Cyrille Makanaky", "Emmanuel Kundé"],
    correct: 0
  },
  // MITTEL: Klammern entfernen / Text bereinigen
  "Wie viele Spieler werden in einem regulären Bundesligaspiel eingesetzt (Starter …": {
    question: "Wie viele Spieler kann eine Mannschaft pro Bundesligaspiel maximal einsetzen – inklusive aller Einwechslungen?",
    explanation: "Pro Mannschaft beginnen 11 Spieler, und maximal 5 können eingewechselt werden – also können bis zu 16 Spieler pro Team zum Einsatz kommen."
  },
  "Was ist die 'Raute' im Fußball?": {
    question: "Was versteht man unter einer Spielformation mit Mittelfeld in Rautenform?",
    explanation: "Die Raute ist eine Mittelfeld-Formation im 4-4-2- oder 4-1-2-1-2-System, bei der die Mittelfeldspieler eine rautenförmige Anordnung bilden.",
    options: ["Eine Formation, bei der das Mittelfeld eine Rautenform bildet", "Ein Trickschuss aus der Drehung", "Eine Standardsituation beim Freistoß", "Ein Laufweg im Angriff"],
    correct: 0
  },
  "Welcher Spieler bekam den Spitznamen 'La Pulga' (Der Floh)?": {
    question: "Welcher argentinische Weltstar erhielt wegen seiner geringen Körpergröße und explosiven Beweglichkeit den Spitznamen 'La Pulga Atómica'?",
    explanation: "Lionel Messi erhielt den Spitznamen 'La Pulga Atómica' – der atomare Floh – aufgrund seiner kleinen Statur und seiner unglaublich schnellen Bewegungen."
  },
  "Welche Nation gewann dreimal in Folge die Copa América (1945–1947)?": {
    question: "Welche Nation gewann 1945, 1946 und 1947 dreimal in Folge die Copa América?",
    explanation: "Argentinien gewann 1945, 1946 und 1947 die Copa América dreimal hintereinander – eine Dominanz, die bis heute einmalig in diesem Wettbewerb ist."
  },
  "Welcher Verein trug den Spitznamen 'Die Unbezwingbaren' (The Invincibles) nach e…": {
    question: "Welcher englische Verein spielte in der Saison 2003/04 die gesamte Premier-League-Saison ohne eine einzige Niederlage?",
    explanation: "Arsenal FC absolvierte 2003/04 alle 38 Ligaspiele ungeschlagen und trägt seither den Titel 'The Invincibles'.",
    options: ["Arsenal FC", "Manchester United", "Chelsea FC", "Liverpool FC"],
    correct: 0
  },
  // SCHWER: Klammern und sonstige Fixes
  "Bei welchem Turnier wurde erstmals der goldene Torschuss-Regel ('Golden Goal') e…": {
    question: "Bei welchem Turnier wurde erstmals die 'Golden Goal'-Regel eingesetzt, bei der das erste Tor in der Verlängerung das Spiel sofort entscheidet?",
    explanation: "Das 'Golden Goal' wurde bei der EM 1996 in England erstmals eingesetzt. Das erste Golden Goal schoss Oliver Bierhoff für Deutschland im EM-Finale."
  },
  "Welcher Spieler trug auf der Weltbühne in den 1950er/60er Jahren den Spitznamen …": {
    question: "Wie hieß der brasilianische Fußballer, der wegen seiner atemberaubenden Dribblings bei den Weltmeisterschaften 1958 und 1962 weltberühmt wurde und den Spitznamen 'Kleiner Vogel' trug?",
    explanation: "Garrincha – bürgerlicher Name Manuel Francisco dos Santos – war bekannt für sein unwiderstehliches Dribbling. Mit Brasilien gewann er 1958 und 1962 die WM."
  },
};

// ── Fix-Logik ──────────────────────────────────────────────────────────
function fixQuestion(q) {
  // Override-Suche: teste vollständigen Text, dann Präfix (80 Zeichen)
  const fullText = q.question;
  const prefix   = q.question.substring(0, 80);

  let override = OVERRIDES[fullText];
  if (!override) {
    // Suche nach passendem Prefix-Key
    for (const [key, val] of Object.entries(OVERRIDES)) {
      if (fullText.startsWith(key.substring(0, Math.min(key.length, 75)))) {
        override = val;
        break;
      }
    }
  }

  if (override) {
    const fixed = Object.assign({}, q, override);
    return { q: fixed, changed: true };
  }

  // Automatische Bereinigungen
  let changed = false;
  let text = q.question;

  // "Trickfrage"-Text entfernen
  if (/Trickfrage/i.test(text)) {
    text = text.replace(/\s*[–-]\s*Trickfrage[^.?!]*[.?!]?/gi, '').replace(/\s*\(Trickfrage[^)]*\)/gi, '').trim();
    if (!/[?!.]$/.test(text)) text += '?';
    changed = true;
  }

  // "nein, [Teamname] [Jahr] [Adjektiv] [Wettbewerb]" entfernen (historische Artefakte)
  if (/nein,\s/i.test(text)) {
    text = text.replace(/\s*nein,.*$/i, '').trim();
    if (!/[?!.]$/.test(text)) text += '?';
    changed = true;
  }

  // 50 Jahre... Anhänge entfernen
  if (/und \d+ Jahre/.test(text)) {
    text = text.replace(/\s+und \d+ Jahre.*$/, '').trim();
    if (!/[?!.]$/.test(text)) text += '?';
    changed = true;
  }

  if (changed) return { q: Object.assign({}, q, { question: text }), changed: true };
  return { q, changed: false };
}

// ── HTML laden und Fragen bereinigen ──────────────────────────────────
let html = fs.readFileSync(FILE, 'utf8');
let totalChanged = 0;

for (const arrayName of ['LEICHT', 'MITTEL', 'SCHWER']) {
  const re = new RegExp(`(const ${arrayName}\\s*=\\s*)(\\[[\\s\\S]*?\\n\\]);`);
  const m  = html.match(re);
  if (!m) { process.stderr.write('Array nicht gefunden: ' + arrayName + '\n'); continue; }

  let arr;
  try { arr = eval(m[2]); }
  catch(e) { process.stderr.write('Eval-Fehler ' + arrayName + ': ' + e.message + '\n'); continue; }

  let changed = 0;
  const fixed = arr.map(q => {
    const result = fixQuestion(q);
    if (result.changed) changed++;
    return result.q;
  });

  totalChanged += changed;
  const arrayStr = '[\n' + fixed.map(q => '  ' + serializeQuestion(q)).join(',\n') + '\n]';
  html = html.replace(re, m[1] + arrayStr + ';');
  process.stderr.write(`${arrayName}: ${changed} Fragen geändert (von ${arr.length})\n`);
}

fs.writeFileSync(FILE, html, 'utf8');
process.stderr.write(`\nGesamt geändert: ${totalChanged}\nGeschrieben: ${FILE}\n`);
