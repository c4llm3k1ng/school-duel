'use strict';
// Gruppiert die Fragen einer Katalogdatei nach ihrer RICHTIGEN ANTWORT und zeigt
// jede Gruppe mit mehr als einem Eintrag.
//
//   node check_antwortgruppen.js anime_leicht
//   node check_antwortgruppen.js anime_leicht --dir questionbank_katalog
//   node check_antwortgruppen.js --alle anime          alle Dateien mit Praefix
//
// Warum: check_dubletten.js misst Wortaehnlichkeit zwischen Fragen und findet
// deshalb prinzipiell NICHT den Fall "dasselbe Faktum in anderer Formulierung"
// ("Wie heisst die Heldin in 'Sailor Moon'?" / "Wie heisst die weibliche
// Hauptfigur in 'Sailor Moon'?"). Solche Paare haben aber immer dieselbe
// richtige Antwort - danach wird hier gruppiert. Das Ergebnis ist ein Hinweis,
// kein Urteil: Zwei Fragen duerfen dieselbe Antwort haben, wenn sie WIRKLICH
// verschiedene Fakten abfragen ("Nummer 001 im Pokedex" / "Pflanzen-Starter der
// 1. Generation" - beides Bisasam). Jede Gruppe selbst ansehen.
//
// Die Normalisierung entfernt Diakritika: "Shinkiro" und "Shinkirō" sind
// dieselbe Antwort und waren in anime_schwer genau so getarnt.
const fs   = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const di   = argv.indexOf('--dir');
const BASE = (di >= 0 && argv[di + 1]) ? argv[di + 1] : 'questionbank_katalog';
const DIR  = path.join(__dirname, '..', BASE);
const rest = argv.filter((a, i) => a !== '--dir' && argv[i - 1] !== '--dir' && !a.startsWith('--'));
const ALLE = argv.includes('--alle');
const ziel = rest[0] || '';

if (!ziel) {
  console.error('Aufruf: node check_antwortgruppen.js <datei|--alle <praefix>> [--dir <ordner>]');
  process.exit(1);
}

const dateien = ALLE
  ? fs.readdirSync(DIR).filter(f => f.endsWith('.json') && !f.startsWith('_') && f.startsWith(ziel))
  : [ziel.endsWith('.json') ? ziel : ziel + '.json'];

const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
                           .toLowerCase().replace(/[^a-z0-9]/g, '');

let gesamt = 0;
for (const f of dateien) {
  const p = path.join(DIR, f);
  if (!fs.existsSync(p)) { console.log(`  fehlt: ${f}`); continue; }
  const qs = JSON.parse(fs.readFileSync(p, 'utf8'));
  const map = new Map();
  qs.forEach((q, i) => {
    const k = norm(q.options[q.correct]);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(i);
  });
  let n = 0;
  for (const idx of map.values()) {
    if (idx.length < 2) continue;
    if (!n) console.log(`\n${f}`);
    n++;
    const antwort = qs[idx[0]].options[qs[idx[0]].correct];
    console.log(`  === "${antwort}"  (${idx.length}x)`);
    for (const i of idx) console.log(`      [${i}] ${qs[i].question}   [${qs[i].topic}]`);
  }
  console.log(`\n${f}: ${n} Gruppe(n) mit mehr als einem Eintrag, ${qs.length} Fragen.`);
  gesamt += n;
}

console.log(`\n${gesamt} Gruppe(n) in ${dateien.length} Datei(en). Aehnliche Antwort ist ein Hinweis, kein Urteil.`);
