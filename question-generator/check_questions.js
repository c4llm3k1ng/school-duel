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
const norm = s => String(s).toLowerCase()
  .replace(/[.,;:!?()„“"'`´]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// Zahlwert extrahieren, um wertgleiche Optionen zu finden ("84€" vs "84 Euro")
function numsOf(s) {
  const m = String(s).match(/-?\d+(?:[.,]\d+)?/g);
  return m ? m.map(x => parseFloat(x.replace(',', '.'))).filter(n => !Number.isNaN(n)) : [];
}

// Nur knappe Ergebnisoptionen ("x = 3", "84€", "0,2") auf Wertgleichheit pruefen.
// Zwei Ausschluesse, beide aus Fehlalarmen gelernt:
//  - Vergleichsoperatoren: "a > 0" und "a ≠ 0" enthalten beide die 0, meinen
//    aber Verschiedenes.
//  - Formeln: "P(Ē) = 1 − P(E)" und "P(Ē) = P(E) + 1" enthalten beide die 1,
//    sind aber verschiedene Formeln. Erkennbar an den vielen Buchstaben –
//    eine echte Ergebnisoption hat hoechstens eine Variable ("x = 3").
function isBareNumeric(o) {
  if (o.length > 20) return false;
  // Vergleichsoperatoren: "a > 0" und "a ≠ 0" enthalten beide die 0.
  if (/[≥≤≠<>]/.test(o)) return false;
  // Symbole, die den Wert veraendern: "±2" und "±√2" enthalten beide die 2,
  // sind aber verschiedene Zahlen. Ebenso Potenzen, π, Prozent, Brueche.
  if (/[√π^²³‰%\/]/.test(o)) return false;
  // Formeln: "P(Ē) = 1 − P(E)" und "P(Ē) = P(E) + 1" enthalten beide die 1.
  // Eine echte Ergebnisoption hat hoechstens eine Variable ("x = 3").
  const letters = (o.replace(/\d/g, '').match(/\p{L}/gu) || []).length;
  return letters <= 2;
}

let totalFindings = 0;
const summary = [];

for (const file of files) {
  let data;
  try { data = JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8')); }
  catch (e) { console.log(`\n### ${file}\n  UNGUELTIGES JSON: ${e.message}`); totalFindings++; continue; }

  const qs = Array.isArray(data) ? data : data.questions;
  if (!Array.isArray(qs)) { console.log(`\n### ${file}\n  Kein Fragen-Array`); totalFindings++; continue; }

  const f = { struct: [], dupOpt: [], numDup: [], prefix: [], letterRef: [], longest: [], mojibake: [], dupQ: [] };

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

  const counts = Object.entries(f).filter(([, v]) => v.length);
  const n = counts.reduce((a, [, v]) => a + v.length, 0);
  totalFindings += n;
  summary.push([file, qs.length, n]);

  if (n && !SUMMARY) {
    console.log(`\n### ${file}  (${qs.length} Fragen)`);
    const LABEL = {
      struct:'STRUKTUR', dupOpt:'IDENTISCHE OPTIONEN', numDup:'WERTGLEICHE ZAHLEN',
      prefix:'ANTWORTPRAEFIX', longest:'RICHTIGE ANTWORT DEUTLICH LAENGSTE',
      mojibake:'ENCODING', dupQ:'DOPPELTE FRAGE'
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
