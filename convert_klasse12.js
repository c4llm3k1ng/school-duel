'use strict';
// Konvertiert die alten output/-Dateien für Klasse 12 ins Block-Format
// Erzeugt: klasse12_block01_*.json … klasse12_block25_*.json im Projektroot

const fs   = require('fs');
const path = require('path');

const OUTPUT = path.join(__dirname, 'question-generator', 'output');
const ROOT   = __dirname;

// (source-file relativ zu OUTPUT, target-block-slug)
const BLOCKS = [
  ['Mathematik/Analysis_klasse12.json',           '01_mathe_analysis'],
  ['Mathematik/Statistik_klasse12_opus.json',     '02_mathe_stochastik'],
  ['Mathematik/Vektoren_klasse12.json',           '03_mathe_vektoren'],
  ['Biologie/Evolution_klasse12.json',            '04_bio_evolution'],
  ['Biologie/Genetik_klasse12.json',              '05_bio_genetik'],
  ['Biologie/Oekologie_klasse12.json',            '06_bio_oekologie'],
  ['Biologie/Zellbiologie_klasse12.json',         '07_bio_zellbiologie'],
  ['Chemie/Atombau_klasse12.json',                '08_chemie_atombau'],
  ['Chemie/Elektrochemie_klasse12.json',          '09_chemie_elektrochemie'],
  ['Chemie/Organische_Chemie_klasse12.json',      '10_chemie_organik'],
  ['Chemie/Saeuren_Basen_klasse12.json',          '11_chemie_saeuren'],
  ['Physik/Atomphysik_klasse12.json',             '12_physik_atom'],
  ['Physik/Elektrizitaet_klasse12.json',          '13_physik_elektrizitaet'],
  ['Physik/Mechanik_klasse12.json',               '14_physik_mechanik'],
  ['Physik/Optik_klasse12.json',                  '15_physik_optik'],
  ['Physik/Waermelehre_klasse12.json',            '16_physik_waerme'],
  ['Geschichte/Industrialisierung_klasse12.json', '17_geschichte_industrie'],
  ['Geschichte/Nachkriegszeit_klasse12.json',     '18_geschichte_nachkrieg'],
  ['Geschichte/Weltkriege_klasse12.json',         '19_geschichte_weltkriege'],
  ['Deutsch/Grammatik_klasse12.json',             '20_deutsch_grammatik'],
  ['Deutsch/Literatur_klasse12.json',             '21_deutsch_literatur'],
  ['Englisch/Grammatik_klasse12.json',            '22_englisch_grammatik'],
  ['Englisch/Zeitformen_klasse12.json',           '23_englisch_zeitformen'],
  ['Allgemeinwissen/Geographie_klasse12.json',    '24_aw_geographie'],
  ['Allgemeinwissen/Politik_klasse12.json',       '25_aw_politik'],
];

let total = 0;
for (const [src, slug] of BLOCKS) {
  const srcPath = path.join(OUTPUT, src);
  const raw  = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
  const qs   = Array.isArray(raw) ? raw : (raw.questions || []);

  // Normalisierung: sicherstellen dass jede Frage question/options/correct/explanation/topic hat
  const clean = qs.map(q => ({
    question:    q.question    || '',
    options:     q.options     || [],
    correct:     typeof q.correct === 'number' ? q.correct : 0,
    explanation: q.explanation || '',
    topic:       q.topic       || '',
  }));

  const outName = 'klasse12_block' + slug + '.json';
  fs.writeFileSync(path.join(ROOT, outName), JSON.stringify(clean, null, 2), 'utf8');
  console.log('✓', outName, '–', clean.length, 'Fragen');
  total += clean.length;
}
console.log('\nGesamt:', total, 'Fragen in', BLOCKS.length, 'Blöcken.');
