'use strict';
// QA-Gate fuer Frage-JSONs. Prueft die Fehlerklassen, die beim Balance-Fix
// aufgefallen sind – unabhaengig davon, was die bearbeitenden Agenten berichten.
//
// Aufruf:
//   node check_questions.js klasse7            alle klasse7_*.json
//   node check_questions.js klasse7_block03    einzelne Datei / Praefix
//   node check_questions.js --all              alle klasse*_*.json
//   node check_questions.js klasse7 --verbose  mit Fundstellen-Details

const fs   = require('fs');
const path = require('path');

// --dir <ordner> prueft einen Unterordner (z.B. questionbank/ = Firebase-Spiegel),
// sonst die Block-Dateien im Projektroot.
const dirArg = process.argv.indexOf('--dir');
const ROOT = dirArg > -1
  ? path.resolve(__dirname, '..', process.argv[dirArg + 1])
  : path.join(__dirname, '..');

const arg     = process.argv[2];
const VERBOSE = process.argv.includes('--verbose');
const SUMMARY = process.argv.includes('--summary');

if (!arg) { console.error('Aufruf: node check_questions.js <praefix|--all> [--dir <ordner>] [--verbose|--summary]'); process.exit(1); }

const files = fs.readdirSync(ROOT)
  .filter(f => f.endsWith('.json') && f !== '_index.json')
  .filter(f => arg === '--all' ? true : f.startsWith(arg))
  .sort();

if (!files.length) { console.error('Keine passenden Dateien.'); process.exit(1); }

// Normalisierung fuer Vergleiche: Kleinschreibung, Satzzeichen/Whitespace raus.
// WICHTIG: Minuszeichen bleibt erhalten – sonst werden "x = 3" und "x = -3"
// faelschlich als identisch gemeldet.
// Normalisiert NUR Leerraum. Nichts anderes.
//
// Why: Frueher hat diese Funktion kleingeschrieben und Satzzeichen sowie
// Klammern entfernt - fuer Fliesstext sinnvoll, fuer diese Fragenbank fatal.
// In Rechtschreibfragen ist die Gross-/Kleinschreibung das Pruefmerkmal
// ("heute" / "Heute" / "HEUTE"), bei Kommasetzung und direkter Rede sind es
// die Satzzeichen ("usw." / "u.s.w." / "usw"), in Formeln die Klammern
// ("(2A/h) - b" / "2A/(h - b)"). Jede dieser Vereinfachungen hat echte
// Optionen als Dubletten gemeldet, die keine waren.
const norm = s => String(s).replace(/\s+/g, ' ').trim();

// Zahlwert extrahieren. ACHTUNG deutsche Schreibweise: der Punkt ist
// Tausendertrennzeichen, das Komma das Dezimalzeichen. "40.000" ist
// vierzigtausend, nicht 40,0 – genau daran ist diese Regel zuvor gescheitert.
function numsOf(s) {
  const m = String(s).match(/-?\d{1,3}(?:\.\d{3})+(?:,\d+)?|-?\d+(?:,\d+)?|-?\d+(?:\.\d+)?/g);
  if (!m) return [];
  return m.map(x => {
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(x)) x = x.replace(/\./g, '');  // Tausenderpunkte weg
    return parseFloat(x.replace(',', '.'));
  }).filter(n => !Number.isNaN(n));
}

// Nur knappe Ergebnisoptionen ("x = 3", "84€", "0,2") auf Wertgleichheit pruefen.
// Zwei Ausschluesse, beide aus Fehlalarmen gelernt:
//  - Vergleichsoperatoren: "a > 0" und "a ≠ 0" enthalten beide die 0, meinen
//    aber Verschiedenes.
//  - Formeln: "P(Ē) = 1 − P(E)" und "P(Ē) = P(E) + 1" enthalten beide die 1,
//    sind aber verschiedene Formeln. Erkennbar an den vielen Buchstaben –
//    eine echte Ergebnisoption hat hoechstens eine Variable ("x = 3").
// Wertgleichheit nur noch bei REINEN Zahlenoptionen pruefen, optional mit
// Einheit (€, %, cm, m, kg, s, °C).
//
// Why so streng: Die frueheren, grosszuegigeren Fassungen dieser Regel haben in
// sechs Runden ausschliesslich Fehlalarme produziert – Minuszeichen verschluckt
// ("x = 3" = "x = -3"), Operatoren ignoriert ("a > 0" = "a ≠ 0"), Formeln als
// Zahlen gelesen ("P(Ē) = 1 − P(E)" = "P(Ē) = P(E) + 1"), Wurzeln uebersehen
// ("±2" = "±√2"), Klammern entfernt ("(2A/h) - b" = "2A/(h - b)") und
// Unicode-Hochzahlen nicht erkannt ("4a⁸" = "4a⁷"). Einen echten Fund gab es
// nie – semantische Wertgleichheit finden die pruefenden Agenten, nicht dieses
// Regex. Lieber eine enge Regel, die schweigt, als eine breite, der man nicht
// glaubt.
const isBareNumeric = o => /^-?\d+([.,]\d+)?\s*(€|%|cm|mm|m|km|kg|g|s|min|h|°C|l|ml)?$/.test(o.trim());

let totalFindings = 0;
const summary = [];

for (const file of files) {
  let data;
  try { data = JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8')); }
  catch (e) { console.log(`\n### ${file}\n  UNGUELTIGES JSON: ${e.message}`); totalFindings++; continue; }

  const qs = Array.isArray(data) ? data : data.questions;
  if (!Array.isArray(qs)) { console.log(`\n### ${file}\n  Kein Fragen-Array`); totalFindings++; continue; }

  const f = { struct: [], dupOpt: [], numDup: [], prefix: [], letterRef: [], longest: [], ratbar: [], mojibake: [], dupQ: [] };

  const seenQ = new Map();
  qs.forEach((q, i) => {
    // Struktur
    if (!Array.isArray(q.options) || q.options.length !== 4) f.struct.push(`Q${i}: ${q.options ? q.options.length : 0} Optionen`);
    if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct > 3) f.struct.push(`Q${i}: correct=${q.correct}`);
    if (!q.question || !String(q.question).trim()) f.struct.push(`Q${i}: question leer`);
    if (!Array.isArray(q.options)) return;
    if (q.options.some(o => typeof o !== 'string' || !o.trim())) f.struct.push(`Q${i}: leere Option`);

    // Identische Optionstexte innerhalb einer Frage
    const n = q.options.map(norm);
    for (let a = 0; a < n.length; a++)
      for (let b = a + 1; b < n.length; b++)
        if (n[a] && n[a] === n[b]) f.dupOpt.push(`Q${i}: Option ${a} == Option ${b}`);

    // Wertgleiche Zahlenoptionen (typisch bei Rechenaufgaben)
    const nums = q.options.map(numsOf);
    if (q.options.every(isBareNumeric) && nums.every(x => x.length === 1)) {
      for (let a = 0; a < 4; a++)
        for (let b = a + 1; b < 4; b++)
          if (nums[a][0] === nums[b][0]) f.numDup.push(`Q${i}: Option ${a} und ${b} beide = ${nums[a][0]}`);
    }

    // Antwortpraefixe A) B) C) D)
    q.options.forEach((o, j) => { if (/^\s*[A-D]\)\s/.test(o)) f.prefix.push(`Q${i} Option ${j}`); });

    // Verweise auf Antwortposition. shuffleOptions() in school-duel.html mischt die
    // Optionen bei jedem Spielstart – "Antwort D ist korrekt" stimmt danach nicht mehr.
    // Bewusst eng gefasst: ein blosses "[A-D])" traefe sonst Notation wie "P(A) = ".
    const LETTER_REF = /(Antwort|Option|Antwortm[oö]glichkeit|Auswahl)\s+(ist\s+)?[A-D1-4]\b|\b(erste|zweite|dritte|vierte|letzte)\s+(Antwort|Option)\b/i;
    [['explanation', q.explanation], ['question', q.question]].forEach(([field, text]) => {
      if (text) { const m = String(text).match(LETTER_REF); if (m) f.letterRef.push(`Q${i} (${field}): "${m[0]}"`); }
    });

    // Ist die richtige Antwort weiterhin die mit Abstand laengste?
    const lens = q.options.map(o => o.length);
    const cl = lens[q.correct];
    const others = lens.filter((_, j) => j !== q.correct);
    const maxOther = Math.max(...others);
    if (cl > maxOther * 1.5 && cl - maxOther > 25) f.longest.push(`Q${i}: correct ${cl} Z. vs. max ${maxOther} Z.`);

    // Doppelte Fragen (gleicher Text UND gleiche Optionen)
    const key = norm(q.question) + '||' + n.join('|');
    if (seenQ.has(key)) f.dupQ.push(`Q${i} == Q${seenQ.get(key)}`); else seenQ.set(key, i);
  });

  // Mojibake
  const raw = JSON.stringify(qs);
  if (/Ã[¤¶¼ŸŒ]|â€[žœ“”]|Â[§°]/.test(raw)) f.mojibake.push('Verdacht auf kaputte Umlaute');

  // Ratequote je DATEI: Wie oft gewinnt "einfach die laengste Option nehmen"?
  //
  // Why: Die Einzelfall-Regel oben (deutlich laengste) schlaegt erst bei krassen
  // Ausreissern an. Sie uebersieht damit den viel schlimmeren Fall - eine ganze
  // Datei, in der die richtige Antwort systematisch die ausfuehrlichste ist.
  // Gefunden in k12 Geometrie: 27 von 28 Fragen so gebaut, also ohne jedes
  // Fachwissen loesbar. Das ueberlebt auch shuffleOptions(), denn gemischt wird
  // die Position, nicht die Laenge.
  // Traegt die Laenge Information darueber, welche Antwort richtig ist?
  //
  // Gemessen wird der LAENGENRANG der richtigen Option (1 = laengste ... 4 =
  // kuerzeste). Bei sauberem Bau liegt jeder Rang um 25%.
  //
  // Why die Rangverteilung und nicht nur "ist die laengste": Zwei Vorfassungen
  // dieser Regel sind zu kurz gesprungen.
  //  1. Nur "laengste" zu pruefen uebersah, dass ein Agent das Muster
  //     spiegeln kann - 78% "kuerzeste" ist genauso erratbar.
  //  2. "Nie die laengste" als Ziel zu setzen war selbst ein Muster: nach der
  //     ersten Korrekturrunde lag Rang 1 bei 2% statt 25%. Wer die laengste
  //     Option streicht, eliminiert dann garantiert eine falsche Antwort und
  //     raet aus dreien statt aus vieren - Trefferquote 33% statt 25%.
  // Ein Rang, der fast nie vorkommt, ist also genauso verwertbar wie einer,
  // der fast immer vorkommt.
  const rang = [0, 0, 0, 0];
  let zaehlbar = 0, gleichlang = 0;
  qs.forEach(q => {
    if (!Array.isArray(q.options) || q.options.length !== 4) return;
    if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct > 3) return;
    const l = q.options.map(o => String(o).length);
    const cl = l[q.correct];
    // Gleichstand: Die richtige Antwort ist genauso lang wie mindestens eine
    // falsche. Dann traegt die Laenge hier gar keine Information - solche Fragen
    // gehoeren nicht in die Rangstatistik.
    //
    // Why: Frueher stand hier sortiert.indexOf(cl). indexOf liefert bei
    // Gleichstand den ERSTEN Treffer, vier gleich lange Optionen zaehlten also
    // immer als Rang 1. Bei Kopfrechen-Dateien mit reinen Zahlenoptionen ist
    // das der Normalfall - k10 Kopfrechnen wurde dadurch mit 91% "richtige ist
    // die laengste" gemeldet, obwohl 23 von 32 Fragen vier gleich lange
    // Optionen hatten. Der Befund war zum groessten Teil ein Messartefakt.
    if (l.some((x, j) => j !== q.correct && x === cl)) { gleichlang++; return; }
    zaehlbar++;
    rang[l.filter(x => x > cl).length]++;         // 0 = laengste
  });
  if (zaehlbar >= 12) {
    const p = rang.map(x => x / zaehlbar);
    const NAME = ['laengste', 'zweitlaengste', 'drittlaengste', 'kuerzeste'];
    p.forEach((anteil, i) => {
      if (anteil >= 0.55) f.ratbar.push(`${Math.round(anteil * 100)}% der Fragen: richtige Antwort ist die ${NAME[i]} (erwartet 25%)`);
      else if (anteil <= 0.08) f.ratbar.push(`nur ${Math.round(anteil * 100)}%: richtige Antwort ist fast nie die ${NAME[i]} - diese Option laesst sich ausschliessen (erwartet 25%)`);
    });
  }

  const counts = Object.entries(f).filter(([, v]) => v.length);
  const n = counts.reduce((a, [, v]) => a + v.length, 0);
  totalFindings += n;
  summary.push([file, qs.length, n]);

  if (n && !SUMMARY) {
    console.log(`\n### ${file}  (${qs.length} Fragen)`);
    const LABEL = {
      struct:'STRUKTUR', dupOpt:'IDENTISCHE OPTIONEN', numDup:'WERTGLEICHE ZAHLEN',
      prefix:'ANTWORTPRAEFIX', longest:'RICHTIGE ANTWORT DEUTLICH LAENGSTE',
      mojibake:'ENCODING', dupQ:'DOPPELTE FRAGE', ratbar:'DATEI IST ERRATBAR', letterRef:'VERWEIS AUF ANTWORTPOSITION'
    };
    for (const [k, v] of counts) {
      console.log(`  ${LABEL[k]}: ${v.length}`);
      (VERBOSE ? v : v.slice(0, 3)).forEach(x => console.log(`     ${x}`));
      if (!VERBOSE && v.length > 3) console.log(`     … +${v.length - 3} weitere (--verbose zeigt alle)`);
    }
  }
}

console.log('\n' + '='.repeat(64));
const clean = summary.filter(s => !s[2]).length;
console.log(`${summary.length} Dateien geprueft: ${clean} ohne Befund, ${summary.length - clean} mit Befund`);
console.log(`Fragen gesamt: ${summary.reduce((a, s) => a + s[1], 0)} | Befunde: ${totalFindings}`);
process.exit(totalFindings ? 1 : 0);
