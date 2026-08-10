'use strict';
// Sammelt Fragen, die im Qualitaetsdurchlauf durch andere ersetzt wurden.
//
// Hintergrund: Die pruefenden Agenten ersetzen Fragen, die zu leicht sind, nicht
// eindeutig loesbar sind oder thematisch nicht zur Kategorie passen. Der Inhalt
// dieser Fragen ist deshalb nicht zwangslaeufig schlecht - er stand nur am
// falschen Ort oder auf dem falschen Niveau. Der Nutzer hat entschieden, sie
// alle aufzuheben und spaeter in Ruhe darueber zu befinden.
//
//   node collect_replaced.js <basis-ref> [--write]
//   node collect_replaced.js ec75149 --write
//
// Ziel ist ERSETZTE_FRAGEN.json im Projektroot - bewusst NICHT in questionbank/,
// damit die Datei nicht in den Firebase-Abgleich geraet.
//
// Erkennung: Die Agenten muessen Anzahl und Reihenfolge erhalten, also
// entspricht Position i alt der Position i neu. Verglichen wird allein der
// FRAGETEXT an derselben Position.
//
// Warum nur der Fragetext: Zwei Vorversionen dieses Skripts sind gescheitert.
// Der Vergleich jeder alten Frage gegen ALLE neuen meldete zu 70% Fehltreffer,
// weil fast jede Frage umformuliert wurde. Der Vergleich von Frage+Optionen an
// derselben Position war noch schlechter - die Optionen wurden beim Balancieren
// praktisch ueberall neu geschrieben, dadurch fiel die Aehnlichkeit sogar bei
// woertlich identischen Fragen unter jede Schwelle.
//
// Die Grenze bleibt unscharf: Eine stark umformulierte Frage ("Welches Wort ist
// korrekt?" -> "Welche Schreibweise ist richtig?") landet mit hier drin. Das ist
// gewollt - lieber eine zu volle Sammlung als eine verlorene Frage. Zu jedem
// Eintrag steht deshalb die Nachfolgerin dabei, damit sich das beurteilen laesst.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const ZIEL = path.join(REPO, 'ERSETZTE_FRAGEN.json');
const BASE = process.argv[2];
const WRITE = process.argv.includes('--write');
const SCHWELLE = 0.20;

if (!BASE || BASE.startsWith('--')) {
  console.error('Aufruf: node collect_replaced.js <basis-ref> [--write]');
  process.exit(1);
}

const norm = s => String(s || '').toLowerCase().replace(/[^\wäöüß\s]/g, ' ').replace(/\s+/g, ' ').trim();
const worte = s => new Set(norm(s).split(' ').filter(w => w.length > 2));
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let s = 0; for (const w of a) if (b.has(w)) s++;
  return s / (a.size + b.size - s);
}
const lies = txt => { const d = JSON.parse(txt); return Array.isArray(d) ? d : (d.questions || []); };

// Beide Ordner: Seit der sechsten Charge werden auch Katalogfragen ersetzt, und
// eine ersetzte Katalogfrage ist genauso aufhebenswert wie eine Schulfrage.
const dateien = execSync(`git ls-tree --name-only ${BASE} questionbank/ questionbank_katalog/`, { cwd: REPO, encoding: 'utf8' })
  .split('\n').filter(f => f.endsWith('.json') && !path.basename(f).startsWith('_'));

const gefunden = [];
const bericht = [];
const uebersprungen = [];

for (const rel of dateien) {
  const datei = path.basename(rel);
  let alt;
  try { alt = lies(execSync(`git show ${BASE}:"${rel}"`, { cwd: REPO, encoding: 'utf8', maxBuffer: 64e6 })); }
  catch { continue; }

  const p = path.join(REPO, rel);
  if (!fs.existsSync(p)) { uebersprungen.push(`${datei}: existiert nicht mehr`); continue; }
  const neu = lies(fs.readFileSync(p, 'utf8'));

  // Ohne gleiche Laenge traegt der Positionsvergleich nicht. Lieber melden als raten.
  if (alt.length !== neu.length) { uebersprungen.push(`${datei}: ${alt.length} -> ${neu.length} Fragen`); continue; }

  let weg = 0;
  alt.forEach((q, i) => {
    // Eine blosse Umformulierung liegt nur dann vor, wenn der Text aehnlich
    // bleibt UND die richtige Antwort dieselbe ist. Ohne die zweite Bedingung
    // fielen echte Ersetzungen durch: "In welchem Jahr erschien Album X von
    // Kuenstler Y?" -> "Wer produzierte Album X von Kuenstler Y?" teilt
    // zwangslaeufig Album- und Kuenstlernamen und lag damit ueber der
    // Schwelle. In musik_schwer waren davon 10 von 67 Aenderungen betroffen.
    const antwortAlt = String((q.options || [])[q.correct] || '').trim();
    const antwortNeu = String((neu[i].options || [])[neu[i].correct] || '').trim();
    if (antwortAlt === antwortNeu &&
        jaccard(worte(q.question), worte(neu[i].question)) >= SCHWELLE) return;
    weg++;
    gefunden.push({
      question: q.question, options: q.options, correct: q.correct,
      explanation: q.explanation, topic: q.topic,
      _herkunft: {
        datei, index: i, basis: BASE,
        ersetztDurch: neu[i].question,
        aehnlichkeit: +jaccard(worte(q.question), worte(neu[i].question)).toFixed(2),
      },
    });
  });
  if (weg) bericht.push([datei, alt.length, weg]);
}

bericht.sort((a, b) => b[2] - a[2]);
console.log('Datei                                     Fragen  ersetzt');
bericht.forEach(([d, a, w]) => console.log(`  ${d.padEnd(40)} ${String(a).padStart(5)}  ${String(w).padStart(5)}`));
if (uebersprungen.length) {
  console.log('\nNicht vergleichbar:');
  uebersprungen.forEach(u => console.log('  ' + u));
}
console.log(`\n${gefunden.length} ersetzte Fragen aus ${bericht.length} Dateien`);

if (!WRITE) { console.log('\nProbelauf. Mit --write schreiben.'); process.exit(0); }

// Anfuegen statt ueberschreiben, damit spaetere Laeufe die frueheren nicht loeschen.
let bestand = { hinweis: '', erzeugt: '', fragen: [] };
if (fs.existsSync(ZIEL)) bestand = JSON.parse(fs.readFileSync(ZIEL, 'utf8'));

const schluessel = new Set((bestand.fragen || []).map(q => norm(q.question) + '|' + q._herkunft.datei));
let neuAufgenommen = 0;
for (const q of gefunden) {
  const k = norm(q.question) + '|' + q._herkunft.datei;
  if (schluessel.has(k)) continue;
  schluessel.add(k); bestand.fragen.push(q); neuAufgenommen++;
}

bestand.hinweis = 'Fragen, die im Qualitaetsdurchlauf durch andere ersetzt wurden. '
  + 'Nicht zwangslaeufig schlecht - meist zu leicht, nicht eindeutig loesbar oder '
  + 'thematisch am falschen Ort. Erzeugt von question-generator/collect_replaced.js. '
  + 'Die Zuordnung ist unscharf: stark umformulierte Fragen koennen faelschlich '
  + 'enthalten sein, deshalb steht bei jedem Eintrag die Nachfolgerin dabei. '
  + 'Diese Datei gehoert NICHT in den Firebase-Abgleich.';
bestand.erzeugt = new Date().toISOString().slice(0, 10);

fs.writeFileSync(ZIEL, JSON.stringify(bestand, null, 2), 'utf8');
console.log(`\n${neuAufgenommen} neu aufgenommen, Bestand jetzt ${bestand.fragen.length}.`);
console.log(`Geschrieben: ${ZIEL}`);
