'use strict';
// Einmalig-Skript: importiert alle klasse10_block*.json Dateien nach Firebase
// Pfad-Schema: questionBank/<subject>/<subcategory>/klasse10

const fs   = require('fs');
const path = require('path');

const FIREBASE_DB_URL      = 'https://school-duel-default-rtdb.europe-west1.firebasedatabase.app';
const FIREBASE_WEB_API_KEY = 'AIzaSyCGSqcQSKwU3JqcLfl7AXIIIbcShNOrjB8';

const fbSafe = s => s.replace(/[.#$\[\]\/]/g, '_');
const qbPath = (subj, subcat, grade) => 'questionBank/' + fbSafe(subj) + '/' + fbSafe(subcat) + '/klasse' + grade;

// Mapping: Datei-Suffix → [subject, subcategory, grade]
const BLOCK_MAP = {
  'block01_mathe_algebra':       ['Mathematik', 'Algebra',        '10'],
  'block02_mathe_geo':           ['Mathematik', 'Geometrie',      '10'],
  'block03_deutsch_literatur':   ['Deutsch',    'Literatur',      '10'],
  'block04_deutsch_grammatik':   ['Deutsch',    'Grammatik',      '10'],
  'block05_englisch_komm':       ['Englisch',   'Kommunikation',  '10'],
};

// ── Firebase Auth ──
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
      body: JSON.stringify({ email, password, returnSecureToken: true }) }
  );
  const data = await res.json();
  if (!res.ok) throw new Error('Auth failed: ' + JSON.stringify(data));
  _auth.idToken     = data.idToken;
  _auth.refreshToken= data.refreshToken;
  _auth.expiresAt   = Date.now() + (parseInt(data.expiresIn,10) - 60) * 1000;
}

async function ensureToken() {
  if (Date.now() < _auth.expiresAt) return;
  const res = await fetch(
    `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_WEB_API_KEY}`,
    { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body: `grant_type=refresh_token&refresh_token=${_auth.refreshToken}` }
  );
  const data = await res.json();
  if (!res.ok) throw new Error('Refresh failed: ' + JSON.stringify(data));
  _auth.idToken   = data.id_token;
  _auth.expiresAt = Date.now() + (parseInt(data.expires_in,10) - 60) * 1000;
}

async function fbLoad(subj, subcat, grade) {
  await ensureToken();
  const url = `${FIREBASE_DB_URL}/${qbPath(subj,subcat,grade)}.json?auth=${_auth.idToken}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error('GET failed: ' + JSON.stringify(data));
  return Array.isArray(data) ? data : (data ? Object.values(data) : []);
}

async function fbSave(subj, subcat, grade, questions) {
  await ensureToken();
  const url = `${FIREBASE_DB_URL}/${qbPath(subj,subcat,grade)}.json?auth=${_auth.idToken}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(questions)
  });
  const data = await res.json();
  if (!res.ok) throw new Error('PUT failed: ' + JSON.stringify(data));
  return data;
}

async function main() {
  const username = readEnv('FIREBASE_USERNAME');
  const password = readEnv('FIREBASE_PASSWORD');
  const email = username
    ? username.toLowerCase().replace(/[^a-z0-9]/g,'') + '@schoolduel.game'
    : readEnv('FIREBASE_EMAIL');
  if (!email || !password) throw new Error('FIREBASE_USERNAME / FIREBASE_PASSWORD fehlen in .env');

  await fbSignIn(email, password);
  console.log('Firebase Auth OK');

  const ROOT = path.join(__dirname, '..');
  let totalNew = 0;

  for (const [suffix, [subj, subcat, grade]] of Object.entries(BLOCK_MAP)) {
    const filename = `klasse10_${suffix}.json`;
    const filepath = path.join(ROOT, filename);
    if (!fs.existsSync(filepath)) { console.warn('FEHLT:', filename); continue; }

    const local = JSON.parse(fs.readFileSync(filepath, 'utf8'));
    const existing = await fbLoad(subj, subcat, grade);
    const existingTexts = new Set(existing.map(q => q.question));

    const newQs = local.filter(q => !existingTexts.has(q.question));
    const merged = existing.concat(newQs);

    if (newQs.length > 0) {
      await fbSave(subj, subcat, grade, merged);
      console.log(`  ${filename}: +${newQs.length} neu → ${merged.length} gesamt`);
      totalNew += newQs.length;
    } else {
      console.log(`  ${filename}: 0 neu (${existing.length} bereits vorhanden)`);
    }
  }

  console.log(`\nFertig. ${totalNew} neue Fragen importiert.`);
}

main().catch(e => { console.error(e); process.exit(1); });
