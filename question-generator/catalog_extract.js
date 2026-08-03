'use strict';
// Zieht die eingebauten Kataloge (Fussball, Musik, Anime, Politik) aus
// school-duel.html heraus und legt sie als JSON-Dateien ab.
//
//   node catalog_extract.js            Probelauf
//   node catalog_extract.js --write    schreibt nach questionbank_katalog/
//
// Hintergrund: Diese 3893 Fragen stehen als JS-Konstanten fest im HTML und
// landen beim Start ueber ensureBuiltinCatalogs() im localStorage. Firebase
// kennt sie nicht. Damit sie in den Qualitaetsdurchlauf und spaeter nach
// Firebase koennen, muessen sie erst heraus.
//
// Die Blockstruktur (FB_LEICHT_B1, _B2, ...) ist nur eine Schreibhilfe im HTML;
// zusammengesetzt wird ueber Spread (const FB_LEICHT = [...B1, ...B2]). Hier
// werden die Bloecke je Katalog zusammengefasst, die Reihenfolge bleibt erhalten.
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const HTML = path.join(REPO, 'school-duel.html');
const OUT = path.join(REPO, 'questionbank_katalog');
const WRITE = process.argv.includes('--write');

// Katalog -> erwartete Fragenzahl laut der Beschreibung in ensureBuiltinCatalogs.
// Dient als Gegenprobe: weicht die gezaehlte Zahl ab, stimmt etwas nicht.
const ERWARTET = {
  fussball_leicht: 683, fussball_mittel: 684, fussball_schwer: 640,
  musik_leicht: 273, musik_mittel: 286, musik_schwer: 286,
  anime_leicht: 283, anime_mittel: 278, anime_schwer: 280,
  politik_schwer: 200,
};
const PRAEFIX = { FB: 'fussball', MU: 'musik', AN: 'anime', POLITIK: 'politik' };

const html = fs.readFileSync(HTML, 'utf8');

// Klammern zaehlen statt Regex ueber den ganzen Block - in den Fragetexten
// stehen eckige Klammern, ein nicht-gieriges Muster wuerde zu frueh enden.
function blockAb(index) {
  const s = html.indexOf('[', index);
  let tiefe = 0;
  for (let i = s; i < html.length; i++) {
    const c = html[i];
    if (c === '"' || c === "'") {                    // String ueberspringen
      const q = c; i++;
      while (i < html.length && html[i] !== q) { if (html[i] === '\\') i++; i++; }
      continue;
    }
    if (c === '[') tiefe++;
    else if (c === ']') { tiefe--; if (!tiefe) return { von: s, bis: i + 1 }; }
  }
  throw new Error('Klammer nicht geschlossen ab ' + index);
}

const kataloge = {};
const re = /const\s+(FB|MU|AN|POLITIK)_([A-Z]+)(?:_B(\d+))?\s*=\s*\[/g;
let m;
while ((m = re.exec(html))) {
  const [, praefix, stufe, blockNr] = m;
  const { von, bis } = blockAb(m.index);
  const seg = html.slice(von, bis);
  if (/^\s*\[\s*\.\.\./.test(seg)) continue;         // reine Zusammenfuegung
  if (!blockNr && /\.\.\./.test(seg.slice(0, 40))) continue;

  const key = `${PRAEFIX[praefix]}_${stufe.toLowerCase()}`;
  let fragen;
  try { fragen = eval(seg); }                        // reine Datenliterale, kein Code
  catch (e) { console.log(`  FEHLER beim Lesen von ${m[0].trim()}: ${e.message}`); continue; }
  (kataloge[key] || (kataloge[key] = [])).push(...fragen);
}

console.log('Katalog              gefunden  erwartet');
let summe = 0, abweichung = 0;
for (const [k, v] of Object.entries(kataloge)) {
  const e = ERWARTET[k];
  const ok = e === undefined ? '?' : (v.length === e ? '' : '  <-- WEICHT AB');
  console.log(`  ${k.padEnd(20)} ${String(v.length).padStart(5)}  ${String(e ?? '-').padStart(8)}${ok}`);
  summe += v.length;
  if (e !== undefined && v.length !== e) abweichung++;
}
console.log(`  ${''.padEnd(20)} ${String(summe).padStart(5)}`);

// Struktur pruefen: die Kataloge sind aelter als die Fragenbank und koennen
// ein abweichendes Format haben.
const felder = {};
let strukturfehler = 0;
for (const [k, v] of Object.entries(kataloge)) {
  v.forEach((q, i) => {
    Object.keys(q).forEach(f => felder[f] = (felder[f] || 0) + 1);
    if (!Array.isArray(q.options) || q.options.length !== 4) { if (strukturfehler++ < 5) console.log(`  ! ${k} Q${i}: ${(q.options || []).length} Optionen`); }
    if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct > 3) { if (strukturfehler++ < 5) console.log(`  ! ${k} Q${i}: correct=${q.correct}`); }
  });
}
console.log('\nFelder:', Object.entries(felder).map(([f, n]) => `${f}=${n}`).join('  '));
console.log(`Strukturfehler: ${strukturfehler}`);
if (abweichung) console.log(`\nACHTUNG: ${abweichung} Katalog(e) mit abweichender Fragenzahl.`);

if (!WRITE) { console.log('\nProbelauf. Mit --write schreiben.'); process.exit(abweichung || strukturfehler ? 1 : 0); }

fs.mkdirSync(OUT, { recursive: true });
const index = [];
for (const [k, v] of Object.entries(kataloge)) {
  fs.writeFileSync(path.join(OUT, k + '.json'), JSON.stringify(v, null, 2), 'utf8');
  index.push({ file: k + '.json', katalog: k, count: v.length });
}
fs.writeFileSync(path.join(OUT, '_index.json'), JSON.stringify(index, null, 2), 'utf8');
console.log(`\n${index.length} Dateien nach questionbank_katalog/ geschrieben.`);
