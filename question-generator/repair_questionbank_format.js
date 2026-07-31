'use strict';
// Repariert questionBank-Pfade, die als ROHES ARRAY gespeichert sind.
//
// Hintergrund: loadFromQuestionBank / loadMixFromBank in school-duel.html
// pruefen Array.isArray(data.questions) und geben bei einem rohen Array
// kommentarlos null zurueck – solche Fragen sind im Spiel unsichtbar.
// Verursacht durch die alte fbSave-Version in import_klasse7.js / _klasse10.js.
//
// Das Skript aendert AUSSCHLIESSLICH die Huelle:
//   [ ...fragen ]  ->  { questions: [ ...fragen ], subject, subcategory, grade, updatedAt }
// Die Fragen selbst werden nicht angefasst.
//
// Aufruf:
//   node repair_questionbank_format.js              (Dry-Run: zeigt nur, was passieren wuerde)
//   node repair_questionbank_format.js --apply      (schreibt tatsaechlich)
//
// Vor dem Schreiben wird immer ein Backup als JSON-Datei abgelegt.

const fs   = require('fs');
const path = require('path');

const FIREBASE_DB_URL      = 'https://school-duel-default-rtdb.europe-west1.firebasedatabase.app';
const FIREBASE_WEB_API_KEY = 'AIzaSyCGSqcQSKwU3JqcLfl7AXIIIbcShNOrjB8';

const APPLY = process.argv.includes('--apply');

let _auth = { idToken: null, refreshToken: null, expiresAt: 0 };

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
      body: JSON.stringify({ email, password, returnSecureToken: true }) });
  const d = await res.json();
  if (!res.ok) throw new Error('Auth failed: ' + JSON.stringify(d));
  _auth = { idToken: d.idToken, refreshToken: d.refreshToken,
            expiresAt: Date.now() + (parseInt(d.expiresIn,10) - 120) * 1000 };
}

async function ensureToken() {
  if (Date.now() < _auth.expiresAt) return;
  const res = await fetch(
    `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_WEB_API_KEY}`,
    { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body: `grant_type=refresh_token&refresh_token=${_auth.refreshToken}` });
  const d = await res.json();
  if (!res.ok) throw new Error('Refresh failed: ' + JSON.stringify(d));
  _auth.idToken = d.id_token;
  _auth.expiresAt = Date.now() + (parseInt(d.expires_in,10) - 120) * 1000;
}

async function main() {
  const username = readEnv('FIREBASE_USERNAME');
  const password = readEnv('FIREBASE_PASSWORD');
  const email = username
    ? username.toLowerCase().replace(/[^a-z0-9]/g,'') + '@schoolduel.game'
    : readEnv('FIREBASE_EMAIL');
  if (!email || !password) throw new Error('FIREBASE_USERNAME / FIREBASE_PASSWORD fehlen in .env');

  await fbSignIn(email, password);
  console.log(APPLY ? 'Modus: SCHREIBEN\n' : 'Modus: DRY-RUN (nichts wird geschrieben)\n');

  await ensureToken();
  const bank = await (await fetch(`${FIREBASE_DB_URL}/questionBank.json?auth=${_auth.idToken}`)).json();

  // Alle Pfade mit rohem Array einsammeln
  const broken = [];
  for (const [subj, subcats] of Object.entries(bank || {})) {
    for (const [subcat, grades] of Object.entries(subcats || {})) {
      for (const [gradeKey, entry] of Object.entries(grades || {})) {
        if (!Array.isArray(entry)) continue;
        const grade = gradeKey.replace(/^klasse/, '');
        broken.push({ subj, subcat, gradeKey, grade, questions: entry });
      }
    }
  }

  if (!broken.length) { console.log('Nichts zu reparieren – alle Pfade im Objekt-Format.'); return; }

  let total = 0;
  for (const b of broken) {
    console.log(`  questionBank/${b.subj}/${b.subcat}/${b.gradeKey}`.padEnd(60) +
                `${b.questions.length} Fragen  ->  {questions, subject, subcategory, grade:'${b.grade}'}`);
    total += b.questions.length;
  }
  console.log(`\n${broken.length} Pfade / ${total} Fragen betroffen.`);

  if (!APPLY) { console.log('\nDry-Run beendet. Mit --apply tatsaechlich schreiben.'); return; }

  // Backup des Ist-Zustands
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(__dirname, `_backup_questionbank_${stamp}.json`);
  const backup = {};
  for (const b of broken) backup[`questionBank/${b.subj}/${b.subcat}/${b.gradeKey}`] = b.questions;
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2), 'utf8');
  console.log(`\nBackup: ${backupPath}\n`);

  const fbSafe = s => s.replace(/[.#$\[\]\/]/g, '_');
  let ok = 0;
  for (const b of broken) {
    await ensureToken();
    const url = `${FIREBASE_DB_URL}/questionBank/${fbSafe(b.subj)}/${fbSafe(b.subcat)}/${b.gradeKey}.json?auth=${_auth.idToken}`;
    const body = {
      questions: b.questions,
      subject: b.subj, subcategory: b.subcat, grade: b.grade,
      updatedAt: Date.now()
    };
    const res = await fetch(url, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    if (!res.ok) { console.log(`  FEHLER ${b.subj}/${b.subcat}/${b.gradeKey}: ${res.status}`); continue; }
    console.log(`  OK  ${b.subj}/${b.subcat}/${b.gradeKey}  (${b.questions.length})`);
    ok++;
  }
  console.log(`\nFertig. ${ok}/${broken.length} Pfade repariert, ${total} Fragen wieder sichtbar.`);
}

main().catch(e => { console.error(e); process.exit(1); });
