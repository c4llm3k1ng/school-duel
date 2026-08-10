'use strict';
// Sucht Fragen, bei denen die richtige Antwort an ihrer BAUFORM erkennbar ist -
// unabhaengig von der Laenge, die check_laenge.js misst.
//
//   node check_struktur.js fussball_leicht --dir questionbank_katalog
//   node check_struktur.js --alle --dir questionbank_katalog
//
// Hintergrund (OFFENE_PUNKTE §121, §127): Die App mischt die Optionen zur
// Laufzeit. Ein Spieler sieht also vier Texte ohne Reihenfolge - und waehlt den,
// der anders gebaut ist als die drei anderen. Beispiele aus fussball_leicht:
//
//   "Ottmar Hitzfeld | Udo Lattek | Jupp Heynckes | alle drei sehr erfolgreich"
//   "1 | 3 | Unbegrenzt | 5"
//   "20 Spiele | 34 Spiele | 45 Spiele | Ueber 50 Pflichtspiele"
//
// Gemeldet wird nur, wenn die AUSREISSER-Option die richtige ist. Ist ein
// Distraktor der Ausreisser, ist das unschoen, aber kein Verrat.

const fs   = require('fs');
const path = require('path');

const _di  = process.argv.indexOf('--dir');
const BASE = (_di >= 0 && process.argv[_di + 1]) ? process.argv[_di + 1] : 'questionbank';
const DIR  = path.join(__dirname, '..', BASE);

const _args = process.argv.slice(2).filter((a, i, arr) => a !== '--dir' && arr[i - 1] !== '--dir');
const ALLE  = _args.includes('--alle');
const KURZ  = _args.includes('--kurz');
const ziel  = _args.filter(a => !a.startsWith('--'))[0] || '';

// Meta-Optionen beziehen sich auf die REIHENFOLGE oder auf die anderen Optionen.
// Nach dem Mischen ist "alle drei" sinnlos - und meist die richtige Antwort.
// WICHTIG: nur kurze Optionen pruefen. "Alle Staatsgewalt geht vom Volke aus und
// wird durch Wahlen ausgeuebt" ist ein Grundgesetz-Zitat, keine Meta-Option -
// beim ersten Lauf ueber politik_schwer genau so falsch gemeldet worden.
const META_ANFANG = /^(alle|beide|keine[rs]?|keiner|niemand|nichts|sowohl|weder)\b/i;
const META_PHRASE = /\b(alle drei|alle vier|beide (aussagen|tore|spieler|richtig)|keine der genannten|keines davon|nur .* (moeglich|möglich)|trifft (alles|nichts) zu)\b/i;
const istMeta = s => {
  const t = String(s).trim();
  if (META_PHRASE.test(t)) return true;
  return META_ANFANG.test(t) && t.split(/\s+/).length <= 5;
};

const zahlOption   = s => /^[\d.,:+–-]+$/.test(String(s).trim());
const wortzahl     = s => String(s).trim().split(/\s+/).length;
const hatKlammer   = s => /[()]/.test(String(s));
const hatJahr      = s => /\b(18|19|20)\d\d\b/.test(String(s));
const hatSchraeg   = s => /\//.test(String(s));

// Ein Merkmal ist verraeterisch, wenn GENAU EINE Option es traegt.
const merkmale = [
  ['Meta-Option',        istMeta],
  ['einzige mit Klammer', hatKlammer],
  ['einzige mit Jahreszahl', hatJahr],
  ['einzige mit Schraegstrich', hatSchraeg],
];

let dateien;
if (ALLE) {
  dateien = fs.readdirSync(DIR).filter(f => f.endsWith('.json') && f !== '_index.json' && f.startsWith(ziel));
} else {
  if (!ziel) { console.error('Aufruf: node check_struktur.js <datei|--alle> [--dir <ordner>] [--kurz]'); process.exit(1); }
  dateien = [ziel.endsWith('.json') ? ziel : ziel + '.json'];
}

let gesamt = 0;
for (const f of dateien) {
  const p = path.join(DIR, f);
  if (!fs.existsSync(p)) { console.log(`  fehlt: ${f}`); continue; }
  const qs = JSON.parse(fs.readFileSync(p, 'utf8'));
  const treffer = [];

  qs.forEach((q, i) => {
    const opts = (q.options || []).map(o => String(o));
    if (opts.length !== 4) return;
    const c = q.correct;
    const gruende = [];

    for (const [name, test] of merkmale) {
      const traeger = opts.map((o, k) => test(o) ? k : -1).filter(k => k >= 0);
      if (traeger.length === 1 && traeger[0] === c) gruende.push(name);
    }

    // Wortzahl-Ausreisser: die richtige Option hat mindestens doppelt so viele
    // Woerter wie jede andere - oder ist als einzige mehrwortig.
    const wz = opts.map(wortzahl);
    const andere = wz.filter((_, k) => k !== c);
    if (wz[c] >= 2 && Math.max(...andere) === 1 && wz[c] > 1) gruende.push('als einzige mehrwortig');
    else if (wz[c] >= 2 * Math.max(...andere) && wz[c] - Math.max(...andere) >= 3) gruende.push('deutlich mehr Woerter');

    // Zahl gegen Text: drei Optionen sind reine Zahlen, die richtige nicht.
    const zahlen = opts.map((o, k) => zahlOption(o) ? k : -1).filter(k => k >= 0);
    if (zahlen.length === 3 && !zahlen.includes(c)) gruende.push('einzige Nicht-Zahl unter Zahlen');

    if (gruende.length) treffer.push({ i, gruende, opts, c });
  });

  if (treffer.length) {
    console.log(`\n${f}  –  ${treffer.length} von ${qs.length} Fragen verraten sich ueber die Bauform`);
    (KURZ ? treffer.slice(0, 15) : treffer).forEach(t => {
      console.log(`  [${t.i}] ${t.gruende.join(', ')}`);
      console.log(`        ${t.opts.map((o, k) => (k === t.c ? '*' : '') + o).join(' | ')}`);
    });
    if (KURZ && treffer.length > 15) console.log(`  … und ${treffer.length - 15} weitere`);
    gesamt += treffer.length;
  }
}

console.log(`\n${gesamt} Frage(n) mit Struktur-Verrat in ${dateien.length} Datei(en).`);
if (gesamt) process.exit(1);
