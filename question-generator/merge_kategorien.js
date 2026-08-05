'use strict';
// Legt doppelte Unterkategorien zusammen.
//
//   node merge_kategorien.js            Probelauf
//   node merge_kategorien.js --apply    schreiben
//
// Anlass: Die Bank fuehrte zwei Schubladen fuer dasselbe Thema - Bruchrechnung
// neben Bruechen, Statistik neben Stochastik neben Statistik & Zufall,
// Zellbiologie neben Zellen. Im Auswahlmenue der App sind das getrennte
// Eintraege, und ein Kind kann nicht wissen, was der Unterschied sein soll.
//
// Der Dateiname kodiert subject__subcategory und bestimmt damit den
// Firebase-Pfad. Zusammenlegen heisst also: Datei umbenennen oder anhaengen,
// _index.json nachziehen - und die alten Firebase-Pfade spaeter loeschen,
// sonst bleiben Karteileichen stehen, die die App weiterhin ausliefert.
const fs = require('fs');
const path = require('path');

const REPO  = path.resolve(__dirname, '..');
const DIR   = path.join(REPO, 'questionbank');
const IDX   = path.join(DIR, '_index.json');
const APPLY = process.argv.includes('--apply');

// Quelle -> Ziel, jeweils innerhalb desselben Fachs.
const ZUSAMMEN = {
  'Mathematik|Brüche':                 'Bruchrechnung',
  'Mathematik|Stochastik':             'Statistik',
  'Mathematik|Statistik & Zufall':     'Statistik',
  'Biologie|Zellen':                   'Zellbiologie',
  'Biologie|Ökologie & Umwelt':        'Ökologie',
  'Physik|Elektrizität & Magnetismus': 'Elektrizität',
  'Chemie|Säuren, Laugen & Salze':     'Säuren & Basen',
  'Englisch|Vokabular':                'Vokabeln',
};

const idxRaw = JSON.parse(fs.readFileSync(IDX, 'utf8'));
const eintraege = Array.isArray(idxRaw) ? idxRaw : Object.values(idxRaw);

// Den Dateinamen fuer eine Zielkategorie NICHT selbst konstruieren, sondern von
// einer vorhandenen Datei derselben Kategorie abschauen. Die Namensregel ist
// historisch gewachsen und uneinheitlich - "Körper & Gesundheit" wurde zu
// "Koerper_Gesundheit", "Ökologie" aber zu "oekologie" mit kleinem o. Wer die
// Regel nachbaut, trifft sie irgendwo nicht.
function namensmuster(subject, subcategory) {
  const vorbild = eintraege.find(e => e.subject === subject && e.subcategory === subcategory);
  if (!vorbild) return null;
  const m = /^k\d+__(.+)\.json$/.exec(vorbild.file);
  return m ? m[1] : null;
}

const plan = [];
for (const e of eintraege) {
  const ziel = ZUSAMMEN[e.subject + '|' + e.subcategory];
  if (!ziel) continue;

  const muster = namensmuster(e.subject, ziel);
  if (!muster) { plan.push({ e, fehler: 'kein Namensvorbild fuer "' + ziel + '" gefunden' }); continue; }

  const neueDatei = 'k' + e.grade + '__' + muster + '.json';
  const vorhanden = eintraege.find(y => y.file === neueDatei);
  plan.push({ e, ziel, neueDatei, vorhanden });
}

if (plan.some(p => p.fehler)) {
  plan.filter(p => p.fehler).forEach(p => console.log('FEHLER  ' + p.e.file + ': ' + p.fehler));
  process.exit(1);
}

console.log(plan.length + ' Dateien betroffen.\n');
let neueGesamt = 0;
for (const p of plan) {
  const quelle = JSON.parse(fs.readFileSync(path.join(DIR, p.e.file), 'utf8'));
  if (p.vorhanden) {
    const zielQs = JSON.parse(fs.readFileSync(path.join(DIR, p.neueDatei), 'utf8'));
    // Wortgleiche Fragen nicht doppelt uebernehmen.
    const bekannt = new Set(zielQs.map(q => String(q.question).trim()));
    const neu = quelle.filter(q => !bekannt.has(String(q.question).trim()));
    const doppelt = quelle.length - neu.length;
    console.log('  ANHAENGEN  ' + p.e.file.replace('.json', '').padEnd(38) +
      String(quelle.length).padStart(3) + 'F  ->  ' + p.neueDatei.replace('.json', '') +
      ' (' + zielQs.length + ' + ' + neu.length + ' = ' + (zielQs.length + neu.length) + ')' +
      (doppelt ? '   ' + doppelt + ' Dublette(n) uebersprungen' : ''));
    neueGesamt += neu.length;
    if (APPLY) {
      fs.writeFileSync(path.join(DIR, p.neueDatei), JSON.stringify(zielQs.concat(neu), null, 2) + '\n', 'utf8');
      fs.unlinkSync(path.join(DIR, p.e.file));
    }
  } else {
    console.log('  UMBENENNEN ' + p.e.file.replace('.json', '').padEnd(38) +
      String(quelle.length).padStart(3) + 'F  ->  ' + p.neueDatei.replace('.json', ''));
    neueGesamt += quelle.length;
    if (APPLY) fs.renameSync(path.join(DIR, p.e.file), path.join(DIR, p.neueDatei));
  }
}

// _index.json neu aufbauen: betroffene Eintraege entfernen, Zieleintraege
// mit der neuen Fragenzahl versehen.
if (APPLY) {
  const behalten = eintraege.filter(e => !ZUSAMMEN[e.subject + '|' + e.subcategory]);
  for (const p of plan) {
    if (p.vorhanden) continue;                       // Zieleintrag entsteht neu
    behalten.push({ file: p.neueDatei, grade: p.e.grade, subject: p.e.subject, subcategory: p.ziel, count: 0 });
  }
  behalten.forEach(e => {
    const f = path.join(DIR, e.file);
    e.count = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')).length : 0;
  });
  behalten.sort((a, b) => a.file.localeCompare(b.file, 'de'));
  fs.writeFileSync(IDX, JSON.stringify(behalten, null, 2) + '\n', 'utf8');
  console.log('\n_index.json neu geschrieben: ' + behalten.length + ' Eintraege, ' +
              behalten.reduce((s, e) => s + e.count, 0) + ' Fragen.');
}

console.log('\n' + (APPLY ? 'Geschrieben.' : 'Probelauf beendet. Mit --apply schreiben.'));
console.log('\nDanach NICHT VERGESSEN: die alten Firebase-Pfade loeschen, sonst liefert');
console.log('die App die Fragen doppelt aus. Betroffen:');
plan.forEach(p => console.log('  questionBank/' + p.e.subject.replace(/[.#$/[\]]/g, '_') + '/' +
  p.e.subcategory.replace(/[.#$/[\]]/g, '_') + '/klasse' + p.e.grade));
