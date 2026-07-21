'use strict';
// Einmalig-Skript: importiert alle klasse7_block*.json Dateien nach Firebase
// Pfad-Schema: questionBank/<subject>/<subcategory>/klasse7

const fs   = require('fs');
const path = require('path');

const FIREBASE_DB_URL      = 'https://school-duel-default-rtdb.europe-west1.firebasedatabase.app';
const FIREBASE_WEB_API_KEY = 'AIzaSyCGSqcQSKwU3JqcLfl7AXIIIbcShNOrjB8';

const fbSafe = s => s.replace(/[.#$\[\]\/]/g, '_');
const qbPath = (subj, subcat, grade) => 'questionBank/' + fbSafe(subj) + '/' + fbSafe(subcat) + '/klasse' + grade;

// Mapping: Datei-Suffix → [subject, subcategory, grade]
const BLOCK_MAP = {
  'block01_mathe_brueche':            ['Mathematik',  'Brüche',                    '7'],
  'block02_mathe_prozent':            ['Mathematik',  'Prozentrechnung',           '7'],
  'block03_mathe_geometrie':          ['Mathematik',  'Geometrie',                 '7'],
  'block04_mathe_gleichungen':        ['Mathematik',  'Gleichungen',               '7'],
  'block05_deutsch_grammatik':        ['Deutsch',     'Grammatik',                 '7'],
  'block06_deutsch_textsorten':       ['Deutsch',     'Textsorten',                '7'],
  'block07_englisch_grammatik':       ['Englisch',    'Grammatik',                 '7'],
  'block08_geschichte_mittelalter1':  ['Geschichte',  'Mittelalter I',             '7'],
  'block09_geschichte_mittelalter2':  ['Geschichte',  'Mittelalter II',            '7'],
  'block10_geschichte_frueheneuzeit': ['Geschichte',  'Frühe Neuzeit',             '7'],
  'block11_biologie_zellen':          ['Biologie',    'Zellen',                    '7'],
  'block12_physik_mechanik':          ['Physik',      'Mechanik',                  '7'],
  'block13_chemie_stoffe':            ['Chemie',      'Stoffe',                    '7'],
  'block14_geo_klima':                ['Geographie',  'Klima & Landschaften',      '7'],
  'block15_mathe_statistik':          ['Mathematik',  'Statistik & Zufall',        '7'],
  'block16_religion_weltreligionen':  ['Religion',    'Weltreligionen',            '7'],
  'block17_musik_theorie':            ['Musik',       'Musiktheorie',              '7'],
  'block18_kunst_stile':              ['Kunst',       'Kunststile & Techniken',    '7'],
  'block19_deutsch_literatur':        ['Deutsch',     'Literatur',                 '7'],
  'block20_englisch_landeskunde':     ['Englisch',    'Landeskunde',               '7'],
  'block21_mathe_proportionen':       ['Mathematik',  'Proportionen & Dreisatz',   '7'],
  'block22_biologie_oekologie':       ['Biologie',    'Ökologie & Umwelt',         '7'],
  'block23_physik_elektrizitaet':     ['Physik',      'Elektrizität & Magnetismus','7'],
  'block24_chemie_saeuren':           ['Chemie',      'Säuren, Laugen & Salze',    '7'],
  'block25_geo_deutschland':          ['Geographie',  'Geographie Deutschlands',   '7'],
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
    const filename = `klasse7_${suffix}.json`;
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
