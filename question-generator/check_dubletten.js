'use strict';
// Findet Fragen, die sich zwar im Wortlaut unterscheiden, aber dasselbe abfragen.
//
//   node check_dubletten.js musik_schwer --dir questionbank_katalog
//   node check_dubletten.js --alle --dir questionbank_katalog
//
// Warum es das braucht: chunk.js merge vergleicht exakte Fragetexte. Das findet
// wortgleiche Dubletten, aber nicht diese hier (beide echt vorgekommen):
//
//   "In welchem Jahr erschien das erste Studioalbum von Jay-Z 'Reasonable Doubt'?"
//   "In welchem Jahr erschien 'Reasonable Doubt' von Jay-Z?"
//
// Ein Agent sieht immer nur seinen eigenen Teil. Zwei Agenten, die zwei
// Formulierungen derselben Frage ersetzen, kommen erfahrungsgemaess auch auf
// dieselbe Ersatzfrage - dann steht die Dublette hinterher wieder da, nur mit
// neuem Inhalt. Deshalb misst dieses Skript Aehnlichkeit statt Gleichheit.
//
// Verfahren: Jaccard-Aehnlichkeit ueber die Inhaltswoerter der Frage. Zusaetzlich
// wird die richtige Antwort verglichen - zwei Fragen mit gleicher Antwort und
// halbwegs aehnlichem Text sind fast immer dieselbe Frage.

const fs   = require('fs');
const path = require('path');

const _di  = process.argv.indexOf('--dir');
const BASE = (_di >= 0 && process.argv[_di + 1]) ? process.argv[_di + 1] : 'questionbank';
const DIR  = path.join(__dirname, '..', BASE);

const _args = process.argv.slice(2).filter((a, i, arr) => a !== '--dir' && arr[i - 1] !== '--dir');
const ALLE  = _args.includes('--alle');
const ziel  = _args.filter(a => !a.startsWith('--'))[0] || '';

// Fuellwoerter, die keine Aussage tragen. Ohne sie waeren zwei beliebige
// "In welchem Jahr erschien ..."-Fragen schon zu 60 % aehnlich.
const STOPP = new Set(('in welchem welcher welche welches jahr erschien wer war wurde wird ist sind ' +
  'das der die den dem des ein eine einer einem eines von vom fuer für mit auf bei als und oder ' +
  'wie viele viel hat hatte haben sich es er sie an im am zu zum zur nach aus durch ueber über ' +
  'gilt galt gibt nannte heisst heißt bekannt welchem welchen erste ersten erster erstes').split(/\s+/));

const worte = s => {
  const roh = String(s).toLowerCase()
    .replace(/[^a-zäöüß0-9\s]/g, ' ')
    .split(/\s+/).filter(Boolean);
  // Zahlen zaehlen immer als Inhaltswort, auch zweistellige. Sonst gelten
  // "Was enthaelt Art. 21 GG?" und "Was enthaelt Art. 14 GG?" als identisch -
  // beim ersten Lauf ueber politik_schwer genau so passiert.
  const inhalt = roh.filter(w => !STOPP.has(w) && (w.length > 2 || /^\d+$/.test(w)));
  // Wenn nach dem Filtern fast nichts uebrig bleibt, lieber die Rohwoerter
  // nehmen als eine leere Menge zu vergleichen (die waere zu allem aehnlich).
  return new Set(inhalt.length >= 2 ? inhalt : roh);
};

const jaccard = (a, b) => {
  if (!a.size || !b.size) return 0;
  let schnitt = 0;
  a.forEach(w => { if (b.has(w)) schnitt++; });
  return schnitt / (a.size + b.size - schnitt);
};

const antwort = q => {
  const o = q.options || [];
  const i = typeof q.correct === 'number' ? q.correct : -1;
  return String(o[i] === undefined ? '' : o[i]).trim().toLowerCase();
};

let dateien;
if (ALLE) {
  dateien = fs.readdirSync(DIR).filter(f => f.endsWith('.json') && f !== '_index.json' && f.startsWith(ziel));
} else {
  if (!ziel) { console.error('Aufruf: node check_dubletten.js <datei|--alle> [--dir <ordner>]'); process.exit(1); }
  dateien = [ziel.endsWith('.json') ? ziel : ziel + '.json'];
}

let gesamt = 0;
for (const f of dateien) {
  const p = path.join(DIR, f);
  if (!fs.existsSync(p)) { console.log(`  fehlt: ${f}`); continue; }
  const qs = JSON.parse(fs.readFileSync(p, 'utf8'));
  const mengen = qs.map(q => worte(q.question));
  const antw   = qs.map(antwort);
  const treffer = [];

  for (let i = 0; i < qs.length; i++) {
    for (let j = i + 1; j < qs.length; j++) {
      const s = jaccard(mengen[i], mengen[j]);
      const gleicheAntwort = antw[i] && antw[i] === antw[j];
      // Zwei Schwellen: sehr aehnlicher Text allein reicht, oder gleiche
      // Antwort bei nur maessig aehnlichem Text.
      if (s >= 0.6 || (gleicheAntwort && s >= 0.34)) {
        treffer.push({ i, j, s, gleicheAntwort });
      }
    }
  }

  if (treffer.length) {
    console.log(`\n${f}  –  ${treffer.length} Verdachtsfall${treffer.length === 1 ? '' : 'e'}`);
    treffer.sort((a, b) => b.s - a.s).forEach(t => {
      console.log(`  ${Math.round(t.s * 100)}%${t.gleicheAntwort ? '  gleiche Antwort' : '                '}  [${t.i}] ${qs[t.i].question}`);
      console.log(`                          [${t.j}] ${qs[t.j].question}`);
      if (t.gleicheAntwort) console.log(`                          -> beide: ${qs[t.i].options[qs[t.i].correct]}`);
    });
    gesamt += treffer.length;
  }
}

console.log(`\n${gesamt} Verdachtsfall/-faelle in ${dateien.length} Datei(en).`);
console.log('Aehnlichkeit ist ein Hinweis, kein Urteil - jeden Fall selbst ansehen.');
if (gesamt) process.exit(1);
