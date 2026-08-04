'use strict';
// Stellt echte Umlaute wieder her, wo sie zu ae/oe/ue umgeschrieben wurden.
//
//   node fix_umlaute.js          nur anzeigen, was passieren wuerde
//   node fix_umlaute.js --apply  schreiben
//   node fix_umlaute.js --rest   zeigt, was uebrig bleibt und warum
//
// Anlass: Ein Agent hat beim Ueberarbeiten von k6__Geschichte__Antike alle
// echten Umlaute zu ae/oe/ue normalisiert. Der Nutzer will das Gegenteil.
//
// Das Verfahren: KEIN blindes ae->ä. Von 1685 Wortformen mit ae/oe/ue im
// Bestand sind die meisten voellig korrekt - "Sauerstoff", "Goethe",
// "Michael", "Frauen", "Quelle", "neue", "Feuer", "League". Ein blinder
// Ersatz wuerde sie zerstoeren.
//
// Stattdessen ein Beweis aus dem Bestand selbst: Eine Form gilt nur dann als
// Umschreibung, wenn DASSELBE Wort anderswo im Bestand mit echtem Umlaut
// vorkommt. "roemischen" wird ersetzt, weil "römischen" belegt ist;
// "Sauerstoff" nicht, weil es kein "Säuerstoff" gibt. Bei 12175 Fragen ist
// die Belegdichte hoch genug, dass das traegt.
//
// Was dabei durchrutscht, sind Woerter, die IMMER umgeschrieben sind und nie
// mit Umlaut vorkommen. Die zeigt --rest an; sie muessen von Hand.
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const REST = process.argv.includes('--rest');

const WORT = /\b[A-Za-zÄÖÜäöüß]+\b/g;

// Nach dem Ersetzen: ss -> ß, wo nach langem Vokal ein Eszett steht.
const NACHBESSERN = [
  [/gröss/g, 'größ'], [/Gröss/g, 'Größ'],
  [/mässig/g, 'mäßig'], [/Mässig/g, 'Mäßig'],
  [/gross/g, 'groß'], [/Gross/g, 'Groß'],
];

// Formen, bei denen der Beweis zwar greift, das Ergebnis aber falsch waere.
// "berquerte" ist der Rest von "überquerte" - das ü ist ganz verlorengegangen,
// ein ue->ü daraus ergaebe "berqürte".
const SONDERFAELLE = { berquerte: 'überquerte', Berquerte: 'Überquerte' };

const umlaut = w => w.replace(/ae/g, 'ä').replace(/Ae/g, 'Ä')
                     .replace(/oe/g, 'ö').replace(/Oe/g, 'Ö')
                     .replace(/ue/g, 'ü').replace(/Ue/g, 'Ü');

function ziel(w) {
  let r = umlaut(w);
  for (const [re, s] of NACHBESSERN) r = r.replace(re, s);
  return r;
}

// Dateien, die gerade von Agenten in _work/ bearbeitet werden, bleiben aussen
// vor - sonst ueberschreibt der spaetere Merge die Korrektur wieder.
const workDir = path.join(REPO, 'questionbank/_work');
const GESPERRT = new Set(
  fs.existsSync(workDir)
    ? fs.readdirSync(workDir).map(f => f.replace(/##\d+\.json$/, '') + '.json')
    : []
);

const dateien = [];
for (const dir of ['questionbank', 'questionbank_katalog']) {
  const p = path.join(REPO, dir);
  if (!fs.existsSync(p)) continue;
  for (const f of fs.readdirSync(p).filter(x => x.endsWith('.json') && !x.startsWith('_'))) {
    if (dir === 'questionbank' && GESPERRT.has(f)) continue;
    dateien.push({ rel: dir + '/' + f, voll: path.join(p, f) });
  }
}

// Schritt 1: den gesamten Wortschatz einlesen. Auch die gesperrten Dateien
// zaehlen als Beleg mit - sie sind Teil desselben Bestands.
const belegt = new Set();
for (const dir of ['questionbank', 'questionbank_katalog']) {
  const p = path.join(REPO, dir);
  if (!fs.existsSync(p)) continue;
  for (const f of fs.readdirSync(p).filter(x => x.endsWith('.json') && !x.startsWith('_')))
    (fs.readFileSync(path.join(p, f), 'utf8').match(WORT) || []).forEach(w => belegt.add(w.toLowerCase()));
}

// Schritt 2: Karte aufbauen.
const karte = new Map();
const offen = new Map();
for (const { voll } of dateien) {
  for (const w of fs.readFileSync(voll, 'utf8').match(WORT) || []) {
    if (!/ae|oe|ue/.test(w) || karte.has(w) || offen.has(w)) continue;
    if (SONDERFAELLE[w]) { karte.set(w, SONDERFAELLE[w]); continue; }
    const z = ziel(w);
    if (z === w) continue;                                  // nichts zu tun
    if (w.length > 1 && w === w.toUpperCase()) continue;     // Akronym: UEFA, OECD
    if (belegt.has(z.toLowerCase())) karte.set(w, z);
    else offen.set(w, z);
  }
}

if (REST) {
  const a = [...offen.entries()].sort();
  console.log(`${a.length} Formen ohne Beleg - nicht angefasst.`);
  console.log('Die allermeisten davon sind korrekt (Sauerstoff, Goethe, Frauen).\n');
  console.log(a.map(([w, z]) => w + '?' + z).join('  '));
  process.exit(0);
}

// Schritt 3: ersetzen. Wortweise, damit "neue" nicht zu "nü" wird.
let n = 0, d = 0;
for (const { rel, voll } of dateien) {
  const alt = fs.readFileSync(voll, 'utf8');
  let k = 0;
  const neu = alt.replace(WORT, w => { const z = karte.get(w); if (!z) return w; k++; return z; });
  if (!k) continue;
  d++; n += k;
  console.log(String(k).padStart(5) + '  ' + rel.replace('.json', ''));
  if (APPLY) { JSON.parse(neu); fs.writeFileSync(voll, neu, 'utf8'); }
}

console.log(`\n${karte.size} belegte Wortformen, ${n} Ersetzungen in ${d} Dateien` +
            (APPLY ? ' geschrieben.' : ' (Probelauf).'));
if (GESPERRT.size) console.log(`${GESPERRT.size} Dateien uebersprungen (gerade in _work/).`);
console.log(`${offen.size} Formen ohne Beleg - "node fix_umlaute.js --rest" zeigt sie.`);
