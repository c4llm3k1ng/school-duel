'use strict';
// Konvertiert vorhandene Klasse-5-Mathe-Dateien (output/) in 3 Block-Dateien
// Block 01: Zahlen & Allgemein + Kopfrechnen (40)
// Block 02: Geometrie + Bruchrechnung + Gleichungen (40)
// Block 12: Größen → Statistik + Algebra-Rest (40)

const fs   = require('fs');
const path = require('path');
const OUT  = path.join(__dirname, 'question-generator', 'output', 'Mathematik');
const ROOT = __dirname;

function load(file) {
  const d = JSON.parse(fs.readFileSync(path.join(OUT, file), 'utf8'));
  const qs = Array.isArray(d) ? d : (d.questions || []);
  return qs.map(q => ({
    question:    q.question    || '',
    options:     q.options     || [],
    correct:     typeof q.correct === 'number' ? q.correct : 0,
    explanation: q.explanation || '',
    topic:       q.topic       || '',
  }));
}

const allgemein    = load('Allgemein_klasse5.json');    // 24
const kopfrechnen  = load('Kopfrechnen_klasse5.json');  // 32
const algebra      = load('Algebra_klasse5.json');      // 16
const geometrie    = load('Geometrie_klasse5.json');    // 24
const bruchrechnung= load('Bruchrechnung_klasse5.json');// 16
const statistik    = load('Statistik_klasse5.json');    // 16
const gleichungen  = load('Gleichungen_klasse5.json');  // 16

// Block 01: Zahlen & Rechnen (Allgemein 24 + Kopfrechnen 16 = 40)
const b01 = [...allgemein, ...kopfrechnen.slice(0, 16)];
// Block 12: Größen & Kopfrechnen (Kopfrechnen-Rest 16 + Statistik 16 + Algebra 8 = 40)
const b12 = [...kopfrechnen.slice(16), ...statistik, ...algebra.slice(0, 8)];
// Block 02: Geometrie & Bruchrechnung (Geometrie 24 + Bruchrechnung 16 = 40)
const b02 = [...geometrie, ...bruchrechnung];
// Block 09: Brüche & Gleichungen (Algebra-Rest 8 + Gleichungen 16 + Allgemein fehlt – pad mit Algebra)
const b09 = [...algebra.slice(8), ...gleichungen, ...algebra.slice(0, 8), ...gleichungen.slice(0,8)];
// b09 wäre zu groß – besser: Algebra 16 + Gleichungen 16 + 8 aus Kopfrechnen

const b09_clean = [...algebra.slice(8), ...gleichungen].slice(0, 40);

const blocks = [
  ['klasse05_block01_mathe_zahlen.json',    b01],
  ['klasse05_block02_mathe_geo.json',       b02],
  ['klasse05_block09_mathe_brueche.json',   b09_clean],
  ['klasse05_block12_mathe_groessen.json',  b12],
];

for (const [name, qs] of blocks) {
  const out = qs.slice(0, 40);
  fs.writeFileSync(path.join(ROOT, name), JSON.stringify(out, null, 2), 'utf8');
  console.log('✓', name, '–', out.length, 'Fragen');
}
console.log('\nFertig. Fehlende 21 Blöcke werden manuell generiert.');
