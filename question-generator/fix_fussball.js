'use strict';
// Bereinigt fussball-katalog.html:
//   1. Klammern am Ende UND in der Mitte des Fragetexts werden entfernt
//   2. Manuelle Overrides für Fragen, wo die Antwort im Haupttext steht
// Aufruf: node fix_fussball.js

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'fussball-katalog.html');

// ── Strip ALL parenthetical content from question text ──────────────
function fixQuestion(text) {
  let t = text;
  // Remove all parenthetical groups (mid-sentence and trailing)
  t = t.replace(/\s*\([^)]{1,200}\)/g, '');
  // Clean up whitespace and punctuation artifacts
  t = t.replace(/\s{2,}/g, ' ').trim();
  t = t.replace(/\s+([?!.,;:])/g, '$1');
  t = t.replace(/\s*–\s*$/, '').trim();
  t = t.replace(/\s*,\s*$/, '').trim();
  t = t.replace(/\s*oder\s*$/, '').trim();  // trailing "oder" from "X (A) oder (B)"
  // Ensure sentence ends with punctuation
  if (t && !/[?!.]$/.test(t)) t += '?';
  return t;
}

// ── Manual overrides where answer is revealed in main text ──────────
// Key = original question text, Value = corrected question text
const OVERRIDES = {
  // LEICHT: "oder [Name]" patterns that reveal the answer
  "Welcher Spieler wird 'Der Goldjunge' oder Götze genannt (WM-Siegtor 2014)?":
    "Welcher deutsche Spieler trägt den Spitznamen 'Der Goldjunge' und erzielte 2014 das WM-Siegtor?",
  "Welcher Spieler wird 'Der Zauberer' oder Xavi/Iniesta zugeordnet (Barça-Mittelfeld)?":
    "Welcher spanische Mittelfeldspieler trägt den Spitznamen 'Der Zauberer' oder 'El Ilusionista'?",
  "Welcher Spieler wird 'Der Kaiser' Nachfolger Sammer genannt (Libero)?":
    "Welcher deutsche Spieler gilt als Nachfolger von Franz Beckenbauer auf der Libero-Position?",
  "Welcher Spieler wird 'Der Bayer' oder Wirtz genannt (Leverkusen-Star)?":
    "Welcher Leverkusen-Juwel trägt den Spitznamen 'Der Bayer' und wurde 2024 Nationalspieler?",
  // MITTEL: answer in main text
  "Welcher Spieler wird 'Die Ente' Iniesta zugeordnet oder 'El Ilusionista' (Iniesta)?":
    "Welcher Spieler gilt als Schöpfer des Spitznamens 'El Ilusionista' und prägte das Barça-Mittelfeld?",
  // SCHWER: confusingly written questions
  "Welcher Verein gewann 1992 als letzter Klub den Europapokal der Landesmeister vor der CL-Umbenennung (FC Barcelona) – nein, Marseille 1993 erste CL. Wer gewann 1991 EC1?":
    "Welcher Verein gewann 1991 den letzten Europapokal der Landesmeister vor der Umbenennung zur Champions League?",
  "Welcher Spieler ist mit den meisten Toren Rekordtorschütze der Copa Libertadores oder Argentiniens (Trickfrage Batistuta Nationalteam lange)?":
    "Welcher Spieler ist Rekordtorschütze der Copa Libertadores?",
  "Welcher Spieler erzielte vier Tore in einem Bundesliga-Spiel beim Debüt für Bayern (Trickfrage – Lewandowski-Rekord aus 9 Min)?":
    "Welcher Stürmer erzielte nach seiner Einwechslung beim FC Bayern fünf Tore in neun Minuten?",
  "Welcher Verein gewann 1982 den Europapokal als Aston Villa überraschend?":
    "Welcher englische Verein gewann 1982 überraschend den Europapokal der Landesmeister?",
  "Welcher Verein gewann 1970 als zweiter englischer Klub keinen, aber 1970 Feyenoord Rotterdam?":
    "Welcher niederländische Verein gewann 1970 als erster seiner Nation den Europapokal der Landesmeister?",
};

// ── Serializer ──────────────────────────────────────────────────────
function serializeQuestion(q) {
  return `{question:${JSON.stringify(q.question)},options:${JSON.stringify(q.options)},correct:${q.correct},explanation:${JSON.stringify(q.explanation || '')},topic:${JSON.stringify(q.topic || '')}}`;
}

// ── Process HTML ────────────────────────────────────────────────────
let html = fs.readFileSync(FILE, 'utf8');
let totalFixed = 0;
let totalOverride = 0;

for (const name of ['LEICHT', 'MITTEL', 'SCHWER']) {
  const re = new RegExp(`(const ${name}\\s*=\\s*)(\\[[\\s\\S]*?\\n\\]);`);
  const m = html.match(re);
  if (!m) { process.stderr.write('Array not found: ' + name + '\n'); continue; }

  let arr;
  try { arr = eval(m[2]); }
  catch (e) { process.stderr.write('Eval failed for ' + name + ': ' + e.message + '\n'); continue; }

  const fixed = arr.map((q) => {
    const orig = q.question;
    let newQ;
    if (OVERRIDES[orig]) {
      newQ = OVERRIDES[orig];
      totalOverride++;
    } else {
      newQ = fixQuestion(orig);
    }
    if (newQ !== orig) totalFixed++;
    return Object.assign({}, q, { question: newQ });
  });

  const arrayStr = '[\n' + fixed.map(q => '  ' + serializeQuestion(q)).join(',\n') + '\n]';
  html = html.replace(re, m[1] + arrayStr + ';');
  process.stderr.write(name + ': ' + fixed.length + ' Fragen verarbeitet\n');
}

fs.writeFileSync(FILE, html, 'utf8');
process.stderr.write(`\nGesamt geändert: ${totalFixed} (davon ${totalOverride} manuelle Overrides)\n`);
process.stderr.write('Geschrieben: ' + FILE + '\n');
