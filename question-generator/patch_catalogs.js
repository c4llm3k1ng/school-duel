'use strict';
// Liest die lokalen Quelldateien und gibt einen Browser-Console-Snippet aus,
// der die korrigierten Fragen in localStorage einspielt.
// Aufruf: node patch_catalogs.js > patch_output.js
// Dann patch_output.js-Inhalt in die Browser-Konsole kopieren.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function loadArraysFromFile(filepath) {
  const code = fs.readFileSync(filepath, 'utf8');
  const results = [];
  const re = /(?:const|let|var)\s+\w+\s*=\s*(\[[\s\S]*?\]);/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    try {
      const arr = eval(m[1]); // safe: we own these files
      if (Array.isArray(arr)) results.push(...arr);
    } catch(e) { /* skip malformed */ }
  }
  return results;
}

// Load a specific named array (e.g. LEICHT) from a file
function loadNamedArray(filepath, varName) {
  const code = fs.readFileSync(filepath, 'utf8');
  const re = new RegExp('(?:const|let|var)\\s+' + varName + '\\s*=\\s*(\\[[\\s\\S]*?\\n\\]);');
  const m = code.match(re);
  if (!m) return [];
  try { const arr = eval(m[1]); return Array.isArray(arr) ? arr : []; } catch(e) { return []; }
}

const catalogs = [
  { name: 'Musik - Leicht', files: ['_musik_tmp.js'] },
  { name: 'Musik - Mittel', files: ['_musik_mittel.js'] },
  { name: 'Musik - Schwer', files: ['_musik_schwer.js'] },
  { name: 'Anime - Leicht', files: ['_push_tmp/_anime_leicht.js'] },
  { name: 'Anime - Mittel', files: ['_push_tmp/_anime_mittel_a.js', '_push_tmp/_anime_mittel_b.js'] },
  { name: 'Anime - Schwer', files: ['_push_tmp/_anime_schwer_a.js', '_push_tmp/_anime_schwer_b.js'] },
  // Fussball: load each difficulty from fussball-katalog.html separately
  { name: 'Fußball - Leicht', fussball: 'LEICHT' },
  { name: 'Fußball - Mittel', fussball: 'MITTEL' },
  { name: 'Fußball - Schwer', fussball: 'SCHWER' },
];

const FUSSBALL_HTML = path.join(ROOT, 'fussball-katalog.html');
const patches = {};
for (const cat of catalogs) {
  let questions;
  if (cat.fussball) {
    questions = loadNamedArray(FUSSBALL_HTML, cat.fussball);
  } else {
    questions = cat.files.flatMap(f => loadArraysFromFile(path.join(ROOT, f)));
  }
  patches[cat.name] = questions;
  process.stderr.write(cat.name + ': ' + questions.length + ' Fragen\n');
}

// Escape non-ASCII chars so the output file is pure ASCII (avoids Windows encoding corruption)
function toAsciiJson(obj) {
  return JSON.stringify(obj).replace(/[^\x00-\x7F]/g, function(c) {
    return '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0');
  });
}

// In the snippet below, \\u2013 and \\u2014 produce literal – — in the output file,
// which the browser then interprets correctly as en-dash / em-dash in the regex.
const snippet = '(function() {\n'
  + '  var patches = ' + toAsciiJson(patches) + ';\n'
  + '  var cats = JSON.parse(localStorage.getItem(\'sd_catalogs\') || \'[]\');\n'
  + '  var updated = 0;\n'
  + '  function norm(s) {\n'
  + '    return s.replace(/[\\u2013\\u2014\\u002d]/g, \'-\').replace(/^[^a-z]+/i, \'\').toLowerCase();\n'
  + '  }\n'
  + '  cats.forEach(function(cat) {\n'
  + '    var catN = norm(cat.name);\n'
  + '    var key = Object.keys(patches).find(function(k) { return catN.includes(norm(k)); });\n'
  + '    if (key) { cat.questions = patches[key]; updated++; }\n'
  + '  });\n'
  + '  localStorage.setItem(\'sd_catalogs\', JSON.stringify(cats));\n'
  + '  console.log(\'Fertig: \' + updated + \' Kataloge aktualisiert.\');\n'
  + '})();';

const outFile = path.join(__dirname, 'patch_output.js');
fs.writeFileSync(outFile, snippet + '\n', 'utf8');
process.stderr.write('Geschrieben: ' + outFile + '\n');
