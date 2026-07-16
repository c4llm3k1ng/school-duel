'use strict';
// Hängt neue Fragen aus _fussball_block01-05.js an die Arrays LEICHT/MITTEL/SCHWER
// in fussball-katalog.html an.
// Aufruf: node append_fussball.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CATALOG_FILE = path.join(ROOT, 'fussball-katalog.html');
const SOURCE_FILE  = path.join(ROOT, '_fussball_block01-05.js');

// ── Serializer (gleich wie in fix_fussball.js) ───────────────────────
function serializeQuestion(q) {
  return `{question:${JSON.stringify(q.question)},options:${JSON.stringify(q.options)},correct:${q.correct},explanation:${JSON.stringify(q.explanation || '')},topic:${JSON.stringify(q.topic || '')}}`;
}

// ── Neue Fragen laden ─────────────────────────────────────────────────
// module.exports wird von _fussball_block01-05.js bereitgestellt
const { FUSSBALL_NEU_LEICHT, FUSSBALL_NEU_MITTEL, FUSSBALL_NEU_SCHWER } =
  require(SOURCE_FILE);

process.stderr.write('Neue Fragen geladen:\n');
process.stderr.write('  LEICHT: ' + FUSSBALL_NEU_LEICHT.length + '\n');
process.stderr.write('  MITTEL: ' + FUSSBALL_NEU_MITTEL.length + '\n');
process.stderr.write('  SCHWER: ' + FUSSBALL_NEU_SCHWER.length + '\n');

// ── HTML laden und Arrays erweitern ──────────────────────────────────
let html = fs.readFileSync(CATALOG_FILE, 'utf8');

const additions = {
  LEICHT: FUSSBALL_NEU_LEICHT,
  MITTEL: FUSSBALL_NEU_MITTEL,
  SCHWER: FUSSBALL_NEU_SCHWER,
};

for (const [name, newQuestions] of Object.entries(additions)) {
  // Muster: das schließende ];  des Arrays finden
  // Das Array endet mit einer Zeile, die nur ]; enthält
  const re = new RegExp(`(const ${name}\\s*=\\s*\\[[\\s\\S]*?)(\\n\\];)`);
  const m = html.match(re);
  if (!m) {
    process.stderr.write(`FEHLER: Array ${name} nicht gefunden!\n`);
    continue;
  }

  const appendStr = newQuestions
    .map(q => '  ' + serializeQuestion(q))
    .join(',\n');

  // Anhängen: zwischen letztem Eintrag und schließendem ]; einfügen
  html = html.replace(re, m[1] + ',\n' + appendStr + m[2]);

  process.stderr.write(`${name}: ${newQuestions.length} Fragen angehängt.\n`);
}

fs.writeFileSync(CATALOG_FILE, html, 'utf8');
process.stderr.write('\nGeschrieben: ' + CATALOG_FILE + '\n');

// ── Kurze Verifikation: Anzahl Fragen pro Array ausgeben ──────────────
for (const name of ['LEICHT', 'MITTEL', 'SCHWER']) {
  const re = new RegExp(`const ${name}\\s*=\\s*(\\[[\\s\\S]*?\\n\\]);`);
  const m = html.match(re);
  if (m) {
    try {
      const arr = eval(m[1]);
      process.stderr.write(`Verifiziert ${name}: ${arr.length} Fragen gesamt.\n`);
    } catch(e) {
      process.stderr.write(`Verifikation ${name} fehlgeschlagen: ${e.message}\n`);
    }
  }
}
