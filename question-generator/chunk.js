'use strict';
// Teilt grosse Spiegel-Dateien in bearbeitbare Haeppchen und fuegt sie wieder zusammen.
// Agenten koennen nicht mehr als ca. 40-45 Fragen in einem Durchgang zurueckschreiben,
// ohne ins Token-Limit zu laufen.
//
//   node chunk.js split k5 40      zerlegt alle k5-Dateien in Teile zu je max. 40 Fragen
//   node chunk.js merge k5         fuegt zusammen und loescht die Teile
//   node chunk.js status k5        zeigt offene Teile
//
// Mit --dir questionbank_katalog arbeitet es auf den Katalogen statt auf dem
// Schulfragen-Spiegel. Das _work/ liegt dann ebenfalls dort: merge findet die
// Ursprungsdatei nur im selben Ordner wieder.
//
// Die Teile liegen in <ordner>/_work/ und heissen <datei>##<n>.json.
// Reihenfolge und Anzahl bleiben beim Zusammenfuegen exakt erhalten.

const fs   = require('fs');
const path = require('path');

const _di  = process.argv.indexOf('--dir');
const BASE = (_di >= 0 && process.argv[_di + 1]) ? process.argv[_di + 1] : 'questionbank';
const DIR  = path.join(__dirname, '..', BASE);
const WORK = path.join(DIR, '_work');

const _args  = process.argv.slice(2).filter((a, i, arr) => a !== '--dir' && arr[i - 1] !== '--dir');
const mode   = _args[0];
const prefix = _args[1] || '';
const size   = parseInt(_args[2], 10) || 40;

if (!['split','merge','status'].includes(mode)) {
  console.error('Aufruf: node chunk.js <split|merge|status> <praefix> [groesse]');
  process.exit(1);
}

const partName = (file, i) => file.replace(/\.json$/, '') + '##' + String(i).padStart(2,'0') + '.json';
const baseName = p => p.replace(/##\d+\.json$/, '.json');

if (mode === 'split') {
  if (!fs.existsSync(WORK)) fs.mkdirSync(WORK, { recursive: true });
  const files = fs.readdirSync(DIR).filter(f => f.endsWith('.json') && f !== '_index.json' && f.startsWith(prefix));
  let parts = 0, whole = 0;
  for (const f of files) {
    const qs = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
    if (qs.length <= size) { whole++; continue; }
    const n = Math.ceil(qs.length / size);
    // moeglichst gleich grosse Teile statt eines Rests von 1-2 Fragen
    const per = Math.ceil(qs.length / n);
    for (let i = 0; i < n; i++) {
      fs.writeFileSync(path.join(WORK, partName(f, i+1)),
                       JSON.stringify(qs.slice(i*per, (i+1)*per), null, 2), 'utf8');
      parts++;
    }
    console.log(`  ${f.padEnd(44)} ${String(qs.length).padStart(4)} -> ${n} Teile a ~${per}`);
  }
  console.log(`\n${parts} Teile in _work/, ${whole} Dateien klein genug (bleiben in ${BASE}/).`);
}

if (mode === 'merge') {
  if (!fs.existsSync(WORK)) { console.log('Kein _work/ vorhanden.'); process.exit(0); }
  const parts = fs.readdirSync(WORK).filter(f => f.endsWith('.json') && f.startsWith(prefix)).sort();
  const groups = {};
  parts.forEach(p => { const b = baseName(p); (groups[b] = groups[b] || []).push(p); });

  let ok = 0, problems = 0;
  for (const [base, list] of Object.entries(groups)) {
    list.sort();
    const orig = JSON.parse(fs.readFileSync(path.join(DIR, base), 'utf8'));
    let merged = [];
    let bad = false;
    for (const p of list) {
      let qs;
      try { qs = JSON.parse(fs.readFileSync(path.join(WORK, p), 'utf8')); }
      catch (e) { console.log(`  UNGUELTIGES JSON: ${p} – ${e.message}`); bad = true; break; }
      if (!Array.isArray(qs)) { console.log(`  KEIN ARRAY: ${p}`); bad = true; break; }
      merged = merged.concat(qs);
    }
    if (bad) { problems++; continue; }
    if (merged.length !== orig.length) {
      console.log(`  ANZAHL WEICHT AB: ${base} – ${orig.length} vorher, ${merged.length} nachher. Nicht zusammengefuegt.`);
      problems++; continue;
    }
    // Dubletten ueber Teilgrenzen hinweg. Ein Agent sieht immer nur seinen
    // eigenen Teil und kann deshalb nicht bemerken, dass dieselbe Frage in
    // einem anderen Teil noch einmal steht. Erst hier, nach dem Zusammenfuegen,
    // ist der Blick auf die ganze Datei moeglich - deshalb gehoert die Pruefung
    // genau an diese Stelle. (Gefunden in musik_schwer: zwei exakte Dubletten.)
    const zaehl = {};
    merged.forEach(q => { const t = String(q.question).trim(); zaehl[t] = (zaehl[t] || 0) + 1; });
    const dubletten = Object.entries(zaehl).filter(([, n]) => n > 1);
    if (dubletten.length) {
      console.log(`  DOPPELTE FRAGETEXTE in ${base}:`);
      dubletten.forEach(([t, n]) => console.log(`     ${n}x  ${t.slice(0, 80)}`));
      console.log('     (Datei wurde trotzdem geschrieben - bitte eine der Fragen ersetzen.)');
      problems++;
    }

    fs.writeFileSync(path.join(DIR, base), JSON.stringify(merged, null, 2), 'utf8');
    list.forEach(p => fs.unlinkSync(path.join(WORK, p)));
    console.log(`  ${base.padEnd(44)} ${list.length} Teile -> ${merged.length} Fragen`);
    ok++;
  }
  const rest = fs.existsSync(WORK) ? fs.readdirSync(WORK).filter(f => f.endsWith('.json')) : [];
  if (!rest.length && fs.existsSync(WORK)) fs.rmdirSync(WORK);
  console.log(`\n${ok} Dateien zusammengefuegt, ${problems} Problem(e), ${rest.length} Teile bleiben offen.`);
  if (problems) process.exit(1);
}

if (mode === 'status') {
  if (!fs.existsSync(WORK)) { console.log('Kein _work/ vorhanden – nichts offen.'); process.exit(0); }
  const parts = fs.readdirSync(WORK).filter(f => f.endsWith('.json') && f.startsWith(prefix)).sort();
  parts.forEach(p => {
    let n = '?';
    try { n = JSON.parse(fs.readFileSync(path.join(WORK, p),'utf8')).length; } catch(e) { n = 'KAPUTT'; }
    console.log(`  ${p.padEnd(50)} ${n}`);
  });
  console.log(`\n${parts.length} Teile offen.`);
}
