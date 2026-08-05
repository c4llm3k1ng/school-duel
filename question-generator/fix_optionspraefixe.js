'use strict';
// Entfernt Buchstabenpraefixe aus Antwortoptionen ("A) München" -> "München").
//
//   node fix_optionspraefixe.js          Probelauf
//   node fix_optionspraefixe.js --apply  schreiben
//
// Anlass: Die App stellt die Buchstaben selbst voran (span.ans-letter). Eine
// Option mit eigenem Praefix erscheint im Spiel als "A  A) München".
//
// Seit die Optionen zur Laufzeit gemischt werden, ist das Praefix ausserdem
// irrefuehrend: Eine mit "A)" beschriftete Option kann an Position C landen.
//
// Sicherheitsregel: Nur wenn ALLE VIER Optionen einer Frage ein Praefix
// tragen. Dann ist es zweifelsfrei ein Formatierungsartefakt und kein Inhalt.
// Traegt nur eine Option so etwas, koennte es zur Antwort gehoeren.
//
// Die Laengenverteilung bleibt erhalten: Allen vier Optionen werden gleich
// viele Zeichen abgezogen, die Reihenfolge nach Laenge aendert sich nicht.
const fs = require('fs');
const path = require('path');

const REPO  = path.resolve(__dirname, '..');
const APPLY = process.argv.includes('--apply');

const PRAEFIX = /^\s*[A-Da-d]\s*[)\].:]\s+/;

// Dateien, die gerade in _work/ zerlegt sind, auslassen - der spaetere Merge
// wuerde die Korrektur sonst ueberschreiben.
const workDir = path.join(REPO, 'questionbank/_work');
const GESPERRT = new Set(
  fs.existsSync(workDir)
    ? fs.readdirSync(workDir).map(f => f.replace(/##\d+\.json$/, '') + '.json')
    : []
);

let dateien = 0, fragen = 0, uebersprungen = 0;
const hinweise = [];

for (const dir of ['questionbank', 'questionbank_katalog']) {
  const p = path.join(REPO, dir);
  if (!fs.existsSync(p)) continue;
  for (const f of fs.readdirSync(p).filter(x => x.endsWith('.json') && !x.startsWith('_'))) {
    if (dir === 'questionbank' && GESPERRT.has(f)) {
      const qs = JSON.parse(fs.readFileSync(path.join(p, f), 'utf8'));
      const n = qs.filter(q => (q.options || []).filter(o => PRAEFIX.test(String(o))).length === 4).length;
      if (n) { uebersprungen += n; console.log(`  UEBERSPRUNGEN ${f.replace('.json','')} (${n} Fragen) - liegt in _work/`); }
      continue;
    }
    const voll = path.join(p, f);
    const qs = JSON.parse(fs.readFileSync(voll, 'utf8'));
    let k = 0;
    qs.forEach((q, i) => {
      const opts = q.options || [];
      if (opts.length !== 4) return;
      if (opts.filter(o => PRAEFIX.test(String(o))).length !== 4) return;
      k++;
      // Verweise in der Erklaerung melden - sie zeigen nach dem Mischen
      // ohnehin ins Leere, werden aber durch das Entfernen noch unklarer.
      if (/\bOption\s+[A-D]\b|\bAntwort\s+[A-D]\b/.test(String(q.explanation || '')))
        hinweise.push(`${f.replace('.json','')} Q${i}: Erklaerung verweist auf einen Optionsbuchstaben`);
      q.options = opts.map(o => String(o).replace(PRAEFIX, ''));
    });
    if (!k) continue;
    dateien++; fragen += k;
    console.log(`  ${String(k).padStart(3)} Fragen  ${dir}/${f.replace('.json', '')}`);
    if (APPLY) { fs.writeFileSync(voll, JSON.stringify(qs, null, 2) + '\n', 'utf8'); }
  }
}

console.log(`\n${fragen} Fragen in ${dateien} Dateien` + (APPLY ? ' bereinigt.' : ' (Probelauf).'));
if (uebersprungen) console.log(`${uebersprungen} Fragen uebersprungen, weil ihre Datei gerade in _work/ bearbeitet wird.`);
if (hinweise.length) {
  console.log('\nErklaerungen mit Verweis auf einen Optionsbuchstaben:');
  hinweise.forEach(h => console.log('  ' + h));
}
