'use strict';
// Prueft bearbeitete Teile aus _work/ gegen die noch unveraenderte Ursprungsdatei,
// BEVOR sie zusammengefuegt werden.
//
//   node check_teile.js                          alle Teile in questionbank/_work
//   node check_teile.js --dir questionbank_katalog
//
// chunk.js split kopiert nur, es aendert die Quelldatei nicht. Solange nicht
// gemergt wurde, laesst sich also jeder Teil Frage fuer Frage mit seinem
// Original vergleichen.
//
// Geprueft wird, was ein Agent NICHT tun durfte:
//   - Fragetext geaendert          (question ist gesetzt)
//   - Fragen verloren oder dazu    (Anzahl je Teil)
//   - Reihenfolge vertauscht       (Position der Fragetexte)
//   - correct zeigt ins Leere      (Index ausserhalb 0-3)
//   - zwei gleiche Optionen        (gross-/kleinschreibungsGENAU, sonst
//                                   verschwindet in Rechtschreibdateien
//                                   genau die Unterscheidung, um die es geht)
//   - Umlaut-Umschreibungen        (ae/oe/ue/ss statt ä/ö/ü/ß)
//   - kaputte Kodierung, BOM, leere Felder
const fs   = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const _di  = process.argv.indexOf('--dir');
const BASE = (_di >= 0 && process.argv[_di + 1]) ? process.argv[_di + 1] : 'questionbank';
const DIR  = path.join(REPO, BASE);
const WORK = path.join(DIR, '_work');

if (!fs.existsSync(WORK)) { console.log('Kein _work/ in ' + BASE + '.'); process.exit(0); }

// Verdaechtige Umschreibungen. Kurze Woerter wie "aus", "neue", "Sue" treffen
// die Muster nicht, weil ein Umlaut dort nie gemeint ist.
const UMSCHRIFT = /\b(ae|oe|ue)(?=[a-zäöüß]{2})|(?:strasse|gross|weiss|heiss|muessen|koennen|haette|waere|fuer|ueber|moeglich|naechst|spaeter|zaehl|waehl|hoeh|schoen|groess|maessig)/i;

let teile = 0, befunde = 0;
const melde = (teil, text) => { befunde++; console.log(`  ${teil}: ${text}`); };

for (const p of fs.readdirSync(WORK).filter(f => f.endsWith('.json')).sort()) {
  const basis = p.replace(/##\d+\.json$/, '.json');
  const teilNr = parseInt(/##(\d+)\.json$/.exec(p)[1], 10);
  const roh = fs.readFileSync(path.join(WORK, p), 'utf8');
  teile++;

  if (roh.charCodeAt(0) === 0xFEFF) melde(p, 'BOM am Dateianfang');
  if (/Ã[¤¶¼]|â€/.test(roh))        melde(p, 'kaputte Kodierung (Ã¤ / â€)');

  let qs;
  try { qs = JSON.parse(roh); } catch (e) { melde(p, 'ungueltiges JSON – ' + e.message); continue; }
  if (!Array.isArray(qs)) { melde(p, 'kein Array'); continue; }

  // Der passende Ausschnitt des Originals: alle Teile derselben Datei sind
  // gleich gross, nur der letzte ist kleiner.
  const orig = JSON.parse(fs.readFileSync(path.join(DIR, basis), 'utf8'));
  const geschwister = fs.readdirSync(WORK).filter(f => f.replace(/##\d+\.json$/, '.json') === basis);
  const per = Math.ceil(orig.length / geschwister.length);
  const ausschnitt = orig.slice((teilNr - 1) * per, teilNr * per);

  if (qs.length !== ausschnitt.length) {
    melde(p, `Anzahl weicht ab – ${ausschnitt.length} vorher, ${qs.length} nachher`);
    continue;                                  // Positionsvergleich waere sinnlos
  }

  qs.forEach((q, i) => {
    const o = ausschnitt[i];
    const wo = `${p} Q${(teilNr - 1) * per + i}`;
    if (String(q.question).trim() !== String(o.question).trim())
      melde(wo, 'Fragetext geaendert\n      vorher:  ' + String(o.question).slice(0, 90) +
                '\n      nachher: ' + String(q.question).slice(0, 90));
    const opts = q.options || [];
    if (opts.length !== 4)                          melde(wo, 'nicht 4 Optionen');
    if (opts.some(x => typeof x !== 'string' || !x.trim())) melde(wo, 'leere Option');
    if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct > 3)
      melde(wo, 'correct = ' + q.correct);
    const doppelt = opts.filter((x, j) => opts.indexOf(x) !== j);
    if (doppelt.length)                             melde(wo, 'doppelte Option: ' + doppelt[0]);
    if (!String(q.explanation || '').trim())        melde(wo, 'Erklaerung fehlt');
    [...opts, q.question, q.explanation || ''].forEach(t => {
      if (UMSCHRIFT.test(String(t))) melde(wo, 'Umlaut-Umschreibung: ' + String(t).slice(0, 70));
    });
  });
}

console.log(`\n${teile} Teile geprueft, ${befunde} Befund(e).`);
process.exit(befunde ? 1 : 0);
