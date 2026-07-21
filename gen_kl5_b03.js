'use strict';
const fs = require('fs');
const blocks = {};

blocks['klasse05_block03_deutsch_grammatik.json'] = [
  {question:"Was ist ein Nomen?",options:["Ein Tunwort","Ein Namenwort (benennt Personen, Tiere, Dinge, Begriffe)","Ein Wiewort","Ein Begleitwort"],correct:1,explanation:"Nomen (Substantive) benennen Personen, Tiere, Dinge oder Begriffe und werden großgeschrieben.",topic:"Wortarten"},
  {question:"Welches Wort ist ein Verb?",options:["schön","Tisch","laufen","blau"],correct:2,explanation:"Verben (Tunwörter) drücken Tätigkeiten, Vorgänge oder Zustände aus: laufen, schlafen, sein.",topic:"Wortarten"},
  {question:"In welchem Fall steht 'des Lehrers'?",options:["Nominativ","Genitiv","Dativ","Akkusativ"],correct:1,explanation:"'des Lehrers' steht im Genitiv (Wessen-Fall).",topic:"Fälle"},
  {question:"Was fragt man im Nominativ?",options:["Wessen?","Wem?","Wen?","Wer oder Was?"],correct:3,explanation:"Nominativ = 1. Fall. Frage: Wer oder was?",topic:"Fälle"},
  {question:"Was ist ein Adjektiv?",options:["Ein Tunwort","Ein Eigenschaftswort","Ein Namenwort","Ein Fürwort"],correct:1,explanation:"Adjektive (Wiewörter) beschreiben Eigenschaften: groß, schnell, blau.",topic:"Wortarten"},
  {question:"Wie nennt man die Grundform eines Verbs?",options:["Konjugation","Imperativ","Infinitiv","Partizip"],correct:2,explanation:"Der Infinitiv ist die Grundform (z.B. laufen, essen). Er endet meist auf -en.",topic:"Verben"},
  {question:"Was ist der Plural von 'das Kind'?",options:["die Kinds","die Kinde","die Kinder","die Kindern"],correct:2,explanation:"Plural: die Kinder. Pluralformen sind oft unregelmäßig.",topic:"Nomen"},
  {question:"Was ist ein Pronomen?",options:["Ein Ersatzwort für ein Nomen","Ein Adjektiv","Ein Verb","Ein Artikel"],correct:0,explanation:"Pronomen (Fürwörter): er, sie, es, ich, du.",topic:"Wortarten"},
  {question:"3. Person Singular Präsens von 'laufen':",options:["laufe","läufst","läuft","laufen"],correct:2,explanation:"Er/sie/es läuft. Stammvokalwechsel: a → äu.",topic:"Verben"},
  {question:"Was ist ein Artikel?",options:["Eigenschaftswort","Begleitwort des Nomens (der, die, das)","Tunwort","Fragewort"],correct:1,explanation:"Artikel: der (m), die (f), das (n).",topic:"Artikel"},
  {question:"Welchen Artikel hat 'Schule'?",options:["der","das","die","ein"],correct:2,explanation:"die Schule (feminin).",topic:"Artikel"},
  {question:"Was fragt man im Akkusativ?",options:["Wer?","Wessen?","Wem?","Wen oder Was?"],correct:3,explanation:"Akkusativ (4. Fall): Wen oder was?",topic:"Fälle"},
  {question:"Was ist das Subjekt in 'Der Hund bellt laut'?",options:["bellt","laut","Der Hund","laut bellen"],correct:2,explanation:"Subjekt = 'Der Hund' (Nominativ, Frage: Wer bellt?).",topic:"Satzlehre"},
  {question:"Welche Zeitform nutzt man in Erzählungen?",options:["Präsens","Futur I","Präteritum","Perfekt"],correct:2,explanation:"Präteritum in Erzählungen: Er lief, sie aß.",topic:"Zeitformen"},
  {question:"Was ist ein Adverb?",options:["Eigenschaftswort","Umstandswort (beschreibt Verb oder Adjektiv)","Nomen","Artikel"],correct:1,explanation:"Adverbien: schnell, gestern, dort.",topic:"Wortarten"},
  {question:"Was ist eine Vorsilbe?",options:["Silbe am Ende","Silbe am Anfang des Wortes","Ein Buchstabe","Das Nomen"],correct:1,explanation:"Vorsilben (Präfixe): un- (unglücklich), ver- (vergessen).",topic:"Wortbildung"},
  {question:"Plural von 'die Maus':",options:["Mausen","Mause","Mäuse","Mäusen"],correct:2,explanation:"Plural: die Mäuse. Umlautung: au → äu.",topic:"Nomen"},
  {question:"Was ist ein Kompositum?",options:["Wort mit Vorsilbe","Aus zwei Wörtern zusammengesetztes Wort","Wort mit Nachsilbe","Wort mit Umlaut"],correct:1,explanation:"Komposita: Haustür (Haus + Tür), Schulbus.",topic:"Wortbildung"},
  {question:"Was steht am Ende eines Aussagesatzes?",options:["?","!",".","–"],correct:2,explanation:"Aussagesatz → Punkt. Fragesatz → ?",topic:"Zeichensetzung"},
  {question:"Was ist ein Synonym?",options:["Gegenteiliges Wort","Wort mit ähnlicher Bedeutung","Zusammengesetztes Wort","Fremdwort"],correct:1,explanation:"Synonyme: groß – riesig, schnell – flink.",topic:"Wortschatz"},
  {question:"Was ist ein Antonym?",options:["Ähnliches Wort","Wort mit gegenteiliger Bedeutung","Fremdwort","Verb"],correct:1,explanation:"Antonyme: groß – klein, hell – dunkel.",topic:"Wortschatz"},
  {question:"Was ist direkte Rede?",options:["Erzählung in Vergangenheit","Wörtlich wiedergegebene Sprache in Anführungszeichen","Fragesatz","Nebensatz"],correct:1,explanation:"Direkte Rede: Er sagte: 'Ich komme morgen.'",topic:"Zeichensetzung"},
  {question:"Was ist der Imperativ?",options:["Vergangenheitsform","Befehlsform","Zukunftsform","Frageform"],correct:1,explanation:"Imperativ = Befehlsform: Komm! Setzt euch!",topic:"Verben"},
  {question:"Was bedeutet Singular?",options:["Mehrzahl","Einzahl","Befehlsform","Vergangenheitsform"],correct:1,explanation:"Singular = Einzahl. Plural = Mehrzahl.",topic:"Nomen"},
  {question:"Was ist das Genus?",options:["Zeitform","Zahl (Sg./Pl.)","Grammatisches Geschlecht (m/f/n)","Steigerungsform"],correct:2,explanation:"Genus: maskulin (der), feminin (die), neutrum (das).",topic:"Nomen"},
  {question:"Steigerung von 'groß':",options:["größer, am größten","groß, größer, am größen","großer, am großsten","grösser, am grössten"],correct:0,explanation:"groß – größer – am größten.",topic:"Adjektive"},
  {question:"Welches Wort ist eine Konjunktion?",options:["schnell","Hund","und","laufen"],correct:2,explanation:"Konjunktionen verbinden Satzteile: und, aber, denn, weil.",topic:"Wortarten"},
  {question:"Was ist ein Hauptsatz?",options:["Abhängiger Satz","Eigenständiger Satz mit Subjekt und Prädikat","Satz ohne Verb","Satz mit Komma"],correct:1,explanation:"Ein Hauptsatz kann allein stehen.",topic:"Satzlehre"},
  {question:"Was ist ein Nebensatz?",options:["Kurzer Satz","Satz der vom Hauptsatz abhängt","Ausrufesatz","Satz mit zwei Verben"],correct:1,explanation:"Nebensatz: kann nicht allein stehen, z.B. ..., weil es regnet.",topic:"Satzlehre"},
  {question:"Dativ von 'der Mann':",options:["des Mannes","dem Mann","den Mann","der Mann"],correct:1,explanation:"Dativ (Wem?): dem Mann.",topic:"Fälle"},
  {question:"Was ist ein Diphthong?",options:["Einzelner Vokal","Zwei Vokale die einen Laut bilden (ei, au, eu)","Konsonant","Doppelkonsonant"],correct:1,explanation:"Diphthonge: ei (Eis), au (Baum), eu (Eule).",topic:"Lautlehre"},
  {question:"Welches Wort schreibt man mit -ss?",options:["Straße","fließen","Fluss","Maß"],correct:2,explanation:"Nach kurzem Vokal: -ss (Fluss). Nach langem: ß (Straße).",topic:"Rechtschreibung"},
  {question:"Welches ist ein Fragewort?",options:["und","weil","wer","aber"],correct:2,explanation:"Fragewörter: wer, was, wo, wann, wie, warum.",topic:"Wortarten"},
  {question:"Was ist eine Nachsilbe (Suffix)?",options:["Silbe am Anfang","Silbe am Ende die Wortart verändert","Eigenname","Artikel"],correct:1,explanation:"Suffixe: -heit (Freiheit), -ung (Hoffnung), -lich (freundlich).",topic:"Wortbildung"},
  {question:"Was bedeutet Kasus?",options:["Zeitform","Grammatischer Fall","Singular oder Plural","Genus"],correct:1,explanation:"Kasus = grammatischer Fall: Nom., Gen., Dat., Akk.",topic:"Fälle"},
  {question:"Präteritum von 'sein' (1. Pers. Sg.):",options:["war","bin","werde","sei"],correct:0,explanation:"Präteritum: ich war.",topic:"Zeitformen"},
  {question:"Komma bei Aufzählungen:",options:["Vor 'und'","Zwischen gleichrangigen Satzteilen ohne 'und'","Nach jedem Wort","Nie"],correct:1,explanation:"Äpfel, Birnen und Orangen – kein Komma vor 'und'.",topic:"Zeichensetzung"},
  {question:"Wortstamm von 'Schreiben':",options:["schreib","-en","Schreib-en","S-"],correct:0,explanation:"Wortstamm: schreib-",topic:"Wortbildung"},
  {question:"Was ist die Grundform des Adjektivs?",options:["Superlativ","Komparativ","Positiv","Infinitiv"],correct:2,explanation:"Positiv (Grundform): groß. Komparativ: größer. Superlativ: am größten.",topic:"Adjektive"},
  {question:"Was ist ein Eigenname?",options:["Name für allgemeine Dinge","Name für eine bestimmte Person oder Stadt","Verb im Infinitiv","Adjektiv"],correct:1,explanation:"Eigennamen: Berlin, Marie – immer großgeschrieben.",topic:"Nomen"}
];

for (const [name, data] of Object.entries(blocks)) {
  fs.writeFileSync(name, JSON.stringify(data, null, 2), 'utf8');
  console.log('OK:', name, data.length, 'Fragen');
}
