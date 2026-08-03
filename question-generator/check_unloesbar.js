'use strict';
// Sucht Fragen, deren markierte Antwort in der eigenen Erklaerung nicht vorkommt.
//
//   node check_unloesbar.js            beide Ordner
//   node check_unloesbar.js --verbose  mit allen Fundstellen
//
// Anlass: "Wie viel Energie verbraucht ein 100-W-Geraet in 1 Stunde?" hatte
// 3.600 J als markierte Antwort, die Erklaerung rechnete korrekt 360.000 J vor -
// ein Wert, der unter keiner der vier Optionen stand. Die Frage war fuer
// niemanden loesbar, egal wie gut er rechnet. Kein pruefender Agent hat solche
// Faelle zuverlaessig gefunden; sie fallen nur beim Nachrechnen auf.
//
// Das Signal ist bewusst eng: Nur wenn die richtige Option eine Zahl enthaelt,
// die Erklaerung ebenfalls Zahlen enthaelt, und KEINE der Zahlen der richtigen
// Option in der Erklaerung auftaucht. Rechenaufgaben nennen ihr Ergebnis fast
// immer in der Erklaerung - fehlt es dort, stimmt etwas nicht.
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const VERBOSE = process.argv.includes('--verbose');

// Deutsche Schreibweise: Punkt trennt Tausender, Komma ist das Dezimalzeichen.
function zahlen(s) {
  const m = String(s || '').match(/-?\d{1,3}(?:\.\d{3})+(?:,\d+)?|-?\d+(?:,\d+)?|-?\d+(?:\.\d+)?/g);
  if (!m) return [];
  return m.map(x => {
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(x)) x = x.replace(/\./g, '');
    return parseFloat(x.replace(',', '.'));
  }).filter(n => !Number.isNaN(n));
}

// Zwei Werte gelten als gleich, wenn sie sich um weniger als ein Promille
// unterscheiden - deckt Rundungen in der Erklaerung ab (0,333 vs 1/3).
// Zusaetzlich Faktor 100, weil Erklaerungen Prozentwerte oft als Dezimalzahl
// rechnen: Option "etwa 24,6 %", Erklaerung "0,246".
const nahe = (a, b) => a === b || (b !== 0 && Math.abs(a - b) / Math.abs(b) < 0.001);
const gleich = (a, b) => nahe(a, b) || nahe(a, b * 100) || nahe(a, b / 100);

// Nur knappe Ergebnisoptionen pruefen: eine Zahl, optional mit Einheit oder
// Zusatz wie "etwa" / "rund" / "ca.".
//
// Why: Fliesstext-Optionen ("Unsere Heimatgalaxie: eine Spiralgalaxie mit
// 100 Milliarden Sternen") enthalten Zahlen, sind aber keine Rechenergebnisse.
// Ohne diesen Filter meldete das Skript 264 Faelle, fast alle Rauschen.
const istErgebnis = o => /^\s*(etwa|rund|ca\.|circa|ungefähr|ungefaehr)?\s*[-+]?\d[\d.,]*\s*(%|€|\$|[a-zA-Zμµ°]{0,6}[²³]?(\/[a-zA-Z]{1,4})?)?\s*$/.test(String(o));

const treffer = [];
let geprueft = 0;

for (const dir of ['questionbank', 'questionbank_katalog']) {
  const p = path.join(REPO, dir);
  if (!fs.existsSync(p)) continue;
  for (const f of fs.readdirSync(p).filter(x => x.endsWith('.json') && !x.startsWith('_'))) {
    let qs;
    try { qs = JSON.parse(fs.readFileSync(path.join(p, f), 'utf8')); } catch { continue; }
    if (!Array.isArray(qs)) continue;

    qs.forEach((q, i) => {
      if (!Array.isArray(q.options) || q.options.length !== 4) return;
      if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct > 3) return;
      if (!q.explanation) return;

      if (!istErgebnis(q.options[q.correct])) return;
      const richtig = zahlen(q.options[q.correct]);
      const erklaert = zahlen(q.explanation);
      if (!richtig.length || !erklaert.length) return;

      // Jahreszahlen und Aufzaehlungen erzeugen sonst Rauschen: Wenn die
      // Option nur eine einzige kleine Zahl traegt, die auch ein Index sein
      // koennte, ist das Signal zu schwach.
      if (richtig.length === 1 && Math.abs(richtig[0]) <= 4) return;

      geprueft++;
      const gefunden = richtig.some(r => erklaert.some(e => gleich(r, e)));
      if (gefunden) return;

      // Die markierte Antwort kommt in der Erklaerung nicht vor. Falls ein
      // Wert einer ANDEREN Option dort steht, zeigt die Erklaerung auf eine
      // andere Antwort - das ist der schwerere Fall.
      const andere = q.options
        .map((o, j) => (j === q.correct ? null : { j, z: zahlen(o) }))
        .filter(Boolean)
        .filter(o => o.z.some(x => erklaert.some(e => gleich(x, e))));

      treffer.push({
        datei: f.replace('.json', ''), i,
        frage: String(q.question).slice(0, 70),
        markiert: String(q.options[q.correct]).slice(0, 34),
        zeigtAuf: andere.length ? andere.map(o => `Option ${o.j}: ${String(q.options[o.j]).slice(0, 24)}`) : null,
        erkl: erklaert.slice(0, 6).join(', '),
      });
    });
  }
}

const schwer = treffer.filter(t => t.zeigtAuf);
console.log(`${geprueft} Fragen mit Zahlenantwort geprueft`);
console.log(`${treffer.length} Verdachtsfaelle: markierte Antwort kommt in der eigenen Erklaerung nicht vor`);
console.log(`  davon ${schwer.length} schwer: die Erklaerung nennt stattdessen den Wert einer ANDEREN Option\n`);

const zeigen = VERBOSE ? treffer : schwer.slice(0, 30);
zeigen.forEach(t => {
  console.log(`${t.datei} Q${t.i}`);
  console.log(`   F: ${t.frage}`);
  console.log(`   markiert: ${t.markiert}   | Zahlen der Erklaerung: ${t.erkl}`);
  if (t.zeigtAuf) t.zeigtAuf.forEach(x => console.log(`   -> Erklaerung passt zu ${x}`));
});
