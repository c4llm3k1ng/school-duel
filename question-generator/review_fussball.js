'use strict';
// Durchsucht alle Fußballfragen in fussball-katalog.html nach Qualitätsproblemen.
// Aufruf: node review_fussball.js
// Ausgabe: review_report.json (maschinenlesbar) + Konsolenausgabe (lesbar)

const fs   = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'fussball-katalog.html');
const html = fs.readFileSync(FILE, 'utf8');

// ── Alle drei Arrays laden ─────────────────────────────────────────────
function loadArray(name) {
  const re = new RegExp(`const ${name}\\s*=\\s*(\\[[\\s\\S]*?\\n\\]);`);
  const m  = html.match(re);
  if (!m) { process.stderr.write('Array nicht gefunden: ' + name + '\n'); return []; }
  return eval(m[1]);
}

const LEICHT = loadArray('LEICHT');
const MITTEL = loadArray('MITTEL');
const SCHWER = loadArray('SCHWER');

process.stderr.write(`Geladen: LEICHT ${LEICHT.length}, MITTEL ${MITTEL.length}, SCHWER ${SCHWER.length}\n`);

// ── Hilfsfunktionen ────────────────────────────────────────────────────

// Normalisiert Text für Vergleiche
function norm(s) { return s.toLowerCase().replace(/[^a-z0-9äöüß]/g, ' ').replace(/\s+/g, ' ').trim(); }

// Prüft ob ein Wort aus den Antworten im Fragentext vorkommt
function answerLeakCheck(q) {
  const qn = norm(q.question);
  const leaks = [];
  q.options.forEach((opt, i) => {
    // Wörter mit ≥5 Zeichen aus den Antworten suchen
    const words = norm(opt).split(' ').filter(w => w.length >= 5);
    for (const w of words) {
      // Prüfen ob exakt dieses Wort im Fragetext vorkommt
      const re = new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
      if (re.test(qn)) {
        leaks.push({ option: i, word: w, optionText: opt });
        break;
      }
    }
  });
  return leaks;
}

// Prüft auf bekannte Fehler-Muster im Fragetext
function patternCheck(q) {
  const issues = [];
  const qt = q.question;

  // Klammerinhalt (sollte schon entfernt sein, aber sicherheitshalber)
  if (/\([^)]{3,}\)/.test(qt)) issues.push('Klammer im Fragetext');

  // Unfertige Satzenden
  if (/[\s,–-]$/.test(qt)) issues.push('Fragetext endet ohne Satzzeichen');

  // Zu kurze Frage
  if (qt.length < 20) issues.push('Fragetext zu kurz (<20 Zeichen)');

  // "oder [Eigenname]" Pattern das Antwort verrät
  if (/oder\s+[A-ZÄÖÜ][a-zäöüß]+/.test(qt)) issues.push('"oder [Name]" verrät Antwort');

  // "bzw. [Eigenname]"
  if (/bzw\.\s+[A-ZÄÖÜ][a-zäöüß]+/.test(qt)) issues.push('"bzw. [Name]" verrät Antwort');

  // Trickfrage-Formulierung (aus alten generierten Fragen)
  if (/Trickfrage/i.test(qt)) issues.push('"Trickfrage" im Fragetext');

  // Widerspruch in Erklärung ("nein", "allerdings nicht", "tatsächlich" in Erklärung bei positivem Fragetext)
  if (q.explanation) {
    if (/allerdings nicht|tatsächlich.*münchen|tatsächlich.*bayern/i.test(q.explanation) && !/münchen|bayern/i.test(qt)) {
      issues.push('Erklärung widerspricht möglicherweise der Frage');
    }
    if (/kein spieler|nie geschehen|nie getan|nicht möglich/i.test(q.explanation)) {
      issues.push('Erklärung deutet auf ungültige Prämisse hin');
    }
  }

  // Doppelte Optionen
  const normedOpts = q.options.map(norm);
  const seen = new Set();
  for (const o of normedOpts) {
    if (seen.has(o)) { issues.push('Doppelte Antwort-Option'); break; }
    seen.add(o);
  }

  // Leere Option
  if (q.options.some(o => !o || o.trim().length < 2)) issues.push('Leere/sehr kurze Option');

  // correct out of bounds
  if (q.correct < 0 || q.correct > 3) issues.push('correct-Index außerhalb 0–3');

  return issues;
}

// ── Review durchführen ────────────────────────────────────────────────
const report = { LEICHT: [], MITTEL: [], SCHWER: [] };
let totalIssues = 0;

for (const [level, arr] of [['LEICHT', LEICHT], ['MITTEL', MITTEL], ['SCHWER', SCHWER]]) {
  for (let i = 0; i < arr.length; i++) {
    const q = arr[i];
    const issues = patternCheck(q);
    const leaks  = answerLeakCheck(q);
    if (leaks.length) issues.push('Antwort-Leak: ' + leaks.map(l => `Option ${l.option} ("${l.word}")`).join(', '));

    if (issues.length) {
      totalIssues++;
      report[level].push({ index: i, question: q.question, correct: q.correct, answer: q.options[q.correct], options: q.options, explanation: q.explanation || '', issues });
    }
  }
}

// ── Ausgabe ────────────────────────────────────────────────────────────
const outFile = path.join(__dirname, 'review_report.json');
fs.writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf8');

console.log('\n=== FUSSBALL FRAGEN REVIEW ===\n');
for (const level of ['LEICHT', 'MITTEL', 'SCHWER']) {
  const items = report[level];
  if (!items.length) { console.log(`${level}: keine Probleme gefunden ✓`); continue; }
  console.log(`\n── ${level} (${items.length} Probleme) ──`);
  items.forEach(item => {
    console.log(`\n  [${item.index}] ${item.question.substring(0, 80)}${item.question.length > 80 ? '…' : ''}`);
    console.log(`       ✓ Antwort: ${item.answer}`);
    item.issues.forEach(iss => console.log(`       ⚠ ${iss}`));
  });
}
console.log(`\n=== Gesamt: ${totalIssues} Fragen mit Problemen ===`);
process.stderr.write('Report: ' + outFile + '\n');
