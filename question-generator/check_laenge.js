'use strict';
// Misst, wie stark die Antwortlaenge die richtige Antwort verraet.
//
//   node check_laenge.js                      alle Dateien, nur die auffaelligen
//   node check_laenge.js --alle               auch die im Korridor
//   node check_laenge.js --datei <name>       eine Datei, zusaetzlich pro Teil
//   node check_laenge.js --teile 4            Teilgroesse fuer die Teilmessung
//   node check_laenge.js --dir questionbank_katalog
//
// ZWEI KENNZAHLEN, beide noetig:
//
// 1. Rangverteilung. Rang = Zahl der echt laengeren Optionen + 1. Fragen mit
//    Laengengleichstand der richtigen Option zaehlen NICHT mit: Sind zwei
//    Optionen gleich lang, traegt die Laenge dort keine Information, und die
//    Frage wuerde die Verteilung nur verwaessern. Zielkorridor je Rang 15-40 %.
//
// 2. Erwartete Trefferquote der Strategie "immer die laengste anklicken",
//    ueber ALLE Fragen. Gleichstaende zaehlen mit 1/n. Zielwert 25 % =
//    Zufallsniveau.
//
// Warum beide: Ein Durchlauf kann Rang 1 druecken, indem er Gleichstaende
// aufloest und den Nenner vergroessert, ohne dass Raten schwerer wird. Und
// umgekehrt faengt die Rangverteilung den Fall ab, dass die richtige Antwort
// NIE die laengste ist - dann streicht man diese Option von vornherein weg.
const fs   = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const wert = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const ALLE      = argv.includes('--alle');
const NUR_DATEI = wert('--datei', null);
const TEILE     = parseInt(wert('--teile', '0'), 10);
const DIRS      = argv.includes('--dir') ? [wert('--dir', 'questionbank')]
                                         : ['questionbank', 'questionbank_katalog'];

const UNTEN = 15, OBEN = 40;          // Korridor je Rang, in Prozent

function messen(qs) {
  const raenge = [0, 0, 0, 0];        // Index 0 = Rang 1
  let gewertet = 0, gewinn = 0;
  for (const q of qs) {
    const opts = (q.options || []).map(o => String(o).length);
    if (opts.length !== 4 || !Number.isInteger(q.correct) || !opts[q.correct]) continue;
    const meine = opts[q.correct];

    // Kennzahl 2: was bringt "die laengste anklicken"?
    const max = Math.max(...opts);
    const wieViele = opts.filter(l => l === max).length;
    if (meine === max) gewinn += 1 / wieViele;

    // Kennzahl 1: Rang, nur bei eindeutiger Laenge
    if (opts.filter(l => l === meine).length > 1) continue;
    raenge[opts.filter(l => l > meine).length]++;
    gewertet++;
  }
  const anteil = i => (gewertet ? Math.round(raenge[i] / gewertet * 100) : 0);
  return {
    n: qs.length, gewertet, raenge,
    prozent: [0, 1, 2, 3].map(anteil),
    laengste: qs.length ? Math.round(gewinn / qs.length * 100) : 0,
  };
}

const auffaellig = m => m.gewertet >= 10 && m.prozent.some(p => p < UNTEN || p > OBEN);
const zeile = (name, m) =>
  name.padEnd(42).slice(0, 42) + ' ' +
  String(m.n).padStart(4) + '  ' +
  m.prozent.map(p => String(p).padStart(3)).join('/') + '  ' +
  String(m.laengste).padStart(3) + ' %' +
  (m.gewertet < m.n ? '   (' + (m.n - m.gewertet) + ' gleich lang)' : '');

const kopf = 'Datei'.padEnd(42) + ' Frag  Rang 1/2/3/4  laengste';

let dateien = 0, ausserhalb = 0;
const treffer = [];

for (const dir of DIRS) {
  const p = path.join(REPO, dir);
  if (!fs.existsSync(p)) continue;
  for (const f of fs.readdirSync(p).filter(x => x.endsWith('.json') && !x.startsWith('_'))) {
    const name = f.replace('.json', '');
    if (NUR_DATEI && name !== NUR_DATEI) continue;
    let qs;
    try { qs = JSON.parse(fs.readFileSync(path.join(p, f), 'utf8')); } catch { continue; }
    if (!Array.isArray(qs)) continue;
    const m = messen(qs);
    dateien++;
    if (auffaellig(m)) ausserhalb++;
    if (ALLE || NUR_DATEI || auffaellig(m)) treffer.push({ name, dir, m, qs });
  }
}

// Schlimmste zuerst: das groesste Abweichen vom Idealwert 25 % entscheidet.
treffer.sort((a, b) => {
  const ab = x => Math.max(...x.m.prozent.map(p => Math.abs(p - 25)));
  return ab(b) - ab(a);
});

console.log('\n' + kopf);
console.log('-'.repeat(kopf.length + 8));
treffer.forEach(t => console.log(zeile(t.name, t.m)));

if (NUR_DATEI && TEILE) {
  const t = treffer[0];
  if (t) {
    const proTeil = Math.ceil(t.qs.length / TEILE);
    console.log('\nPro Teil (' + TEILE + ' Teile a ' + proTeil + ' Fragen):');
    console.log(kopf);
    console.log('-'.repeat(kopf.length + 8));
    for (let i = 0; i < TEILE; i++) {
      const stueck = t.qs.slice(i * proTeil, (i + 1) * proTeil);
      if (!stueck.length) continue;
      console.log(zeile('  Teil ' + String(i + 1).padStart(2, '0'), messen(stueck)));
    }
  }
}

console.log(`\n${dateien} Dateien geprueft, ${ausserhalb} ausserhalb des Korridors (${UNTEN}-${OBEN} % je Rang).`);
console.log('Zielwerte: je Rang rund 25 %, "laengste gewinnt" rund 25 %.');
