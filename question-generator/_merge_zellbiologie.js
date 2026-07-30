'use strict';
const fs   = require('fs');
const path = require('path');

const FIREBASE_DB_URL      = 'https://school-duel-default-rtdb.europe-west1.firebasedatabase.app';
const FIREBASE_WEB_API_KEY = 'AIzaSyCGSqcQSKwU3JqcLfl7AXIIIbcShNOrjB8';

function readEnv(name) {
  if (process.env[name]) return process.env[name].trim();
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const line = fs.readFileSync(envPath, 'utf8').split(/\r?\n/).find(l => l.trim().startsWith(name));
    if (line) {
      const val = line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
      if (val && !/^(sk-ant-\.\.\.|AIza\.\.\.|dein)/i.test(val)) return val;
    }
  }
  return null;
}

async function fbSignIn(email, password) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_WEB_API_KEY}`,
    { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ email, password, returnSecureToken: true }) }
  );
  const d = await res.json();
  if (!res.ok) throw new Error('Login fehlgeschlagen: ' + (d?.error?.message || res.status));
  return d.idToken;
}

// Extrahiert alle "options": [...] Arrays aus einem potenziell invaliden JSON-Text
// per Bracket-Counting (robust gegen garbled Strings in anderen Feldern)
function extractOptionsArrays(text) {
  const results = [];
  const marker = '"options":';
  let pos = 0;

  while (true) {
    const idx = text.indexOf(marker, pos);
    if (idx === -1) break;

    // Finde die öffnende [
    let start = idx + marker.length;
    while (start < text.length && text[start] !== '[') start++;
    if (start >= text.length) break;

    // Bracket-Counting: extrahiere das komplette Array
    let depth = 0;
    let inStr = false;
    let esc = false;
    let end = start;

    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '[') depth++;
      else if (ch === ']') { depth--; if (depth === 0) { end = i; break; } }
    }

    const arrText = text.slice(start, end + 1);
    try {
      const arr = JSON.parse(arrText);
      results.push(arr);
    } catch(e) {
      console.warn('Konnte options-Array nicht parsen:', e.message, arrText.slice(0, 100));
      results.push(null);
    }
    pos = end + 1;
  }
  return results;
}

async function main() {
  const username = readEnv('FIREBASE_USERNAME');
  const password = readEnv('FIREBASE_PASSWORD');
  const email = username
    ? username.toLowerCase().replace(/[^a-z0-9]/g,'') + '@schoolduel.game'
    : readEnv('FIREBASE_EMAIL');
  if (!email || !password) { console.error('Fehlt: FIREBASE_USERNAME / FIREBASE_PASSWORD'); process.exit(1); }

  console.log('Anmelden…');
  const token = await fbSignIn(email, password);

  console.log('Lade Zellbiologie aus Firebase…');
  const url = `${FIREBASE_DB_URL}/questionBank/Biologie/Zellbiologie/klasse11.json?auth=${token}`;
  const res = await fetch(url);
  const data = await res.json();
  const original = data.questions;
  console.log(`${original.length} Fragen aus Firebase geladen`);

  const rootDir = path.join(__dirname, '..');

  console.log('Extrahiere options aus p1 (bracket-counting)…');
  const p1text = fs.readFileSync(path.join(rootDir, 'klasse11_Biologie_Zellbiologie_p1.json'), 'utf8');
  const p1options = extractOptionsArrays(p1text);
  console.log(`p1: ${p1options.length} options-Arrays extrahiert`);

  console.log('Lade p2…');
  const p2 = JSON.parse(fs.readFileSync(path.join(rootDir, 'klasse11_Biologie_Zellbiologie_p2.json'), 'utf8'));
  const p2options = p2.map(q => q.options);
  console.log(`p2: ${p2options.length} options-Arrays`);

  const allOptions = [...p1options, ...p2options];
  if (allOptions.length !== original.length) {
    throw new Error(`Längen stimmen nicht: Firebase=${original.length}, p1+p2=${allOptions.length}`);
  }

  // Prüfe ob alle options-Arrays valide sind
  const nullIdx = allOptions.findIndex(o => o === null);
  if (nullIdx !== -1) throw new Error(`options[${nullIdx}] konnte nicht geparst werden`);

  // Merge: question/explanation/topic/correct aus Firebase (korrekt), options aus p1+p2 (balanciert)
  const merged = original.map((q, i) => ({ ...q, options: allOptions[i] }));

  const outPath = path.join(rootDir, 'klasse11_Biologie_Zellbiologie.json');
  fs.writeFileSync(outPath, JSON.stringify(merged, null, 2), 'utf8');
  console.log(`\nFertig! ${merged.length} Fragen gespeichert.`);
  console.log('Beispiel Q0:', merged[0].question);
  console.log('options[0]:', merged[0].options[0].slice(0, 60));
  console.log('options[1]:', merged[0].options[1].slice(0, 60));
}

main().catch(e => { console.error(e); process.exit(1); });
