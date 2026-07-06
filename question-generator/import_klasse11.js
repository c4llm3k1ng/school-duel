'use strict';
// Einmalig-Skript: importiert alle 25 klasse11_block*.json Dateien nach Firebase
// Pfad-Schema: questionBank/<subject>/<subcategory>/klasse11

const fs   = require('fs');
const path = require('path');

const FIREBASE_DB_URL      = 'https://school-duel-default-rtdb.europe-west1.firebasedatabase.app';
const FIREBASE_WEB_API_KEY = 'AIzaSyCGSqcQSKwU3JqcLfl7AXIIIbcShNOrjB8';

const fbSafe = s => s.replace(/[.#$\[\]\/]/g, '_');
const qbPath = (subj, subcat, grade) => 'questionBank/' + fbSafe(subj) + '/' + fbSafe(subcat) + '/klasse' + grade;

// Mapping: Datei-Suffix → [subject, subcategory, grade]
const BLOCK_MAP = {
  'block01_mathe_diff':      ['Mathematik',        'Algebra',           '11'],
  'block02_mathe_int':       ['Mathematik',        'Algebra',           '11'],
  'block03_mathe_stoch':     ['Mathematik',        'Statistik',         '11'],
  'block04_deutsch_lit':     ['Deutsch',           'Literatur',         '11'],
  'block05_gesch_wr_ns':     ['Geschichte',        'Weltkriege',        '11'],
  'block06_gesch_kk':        ['Geschichte',        'Nachkriegszeit',    '11'],
  'block07_bio_genetik':     ['Biologie',          'Genetik',           '11'],
  'block08_bio_evo_oek':     ['Biologie',          'Evolution',         '11'],
  'block09_chem_org':        ['Chemie',            'Organische Chemie', '11'],
  'block10_phys_mech_el':    ['Physik',            'Mechanik',          '11'],
  'block11_mathe_geo':       ['Mathematik',        'Geometrie',         '11'],
  'block12_deutsch_sprache': ['Deutsch',           'Grammatik',         '11'],
  'block13_englisch_grammar':['Englisch',          'Grammatik',         '11'],
  'block14_gesch_global':    ['Geschichte',        'Nachkriegszeit',    '11'],
  'block15_geo_klima':       ['Allgemeinwissen',   'Geographie',        '11'],
  'block16_bio_neuro':       ['Biologie',          'Zellbiologie',      '11'],
  'block17_chem_elektro':    ['Chemie',            'Reaktionen',        '11'],
  'block18_phys_optik':      ['Physik',            'Optik',             '11'],
  'block19_phys_atom':       ['Physik',            'Atomphysik',        '11'],
  'block20_deutsch_drama':   ['Deutsch',           'Literatur',         '11'],
  'block21_mathe_analysis':  ['Mathematik',        'Algebra',           '11'],
  'block22_bio_zelle_oek':   ['Biologie',          'Zellbiologie',      '11'],
  'block23_gesch_weimar_ns': ['Geschichte',        'Weltkriege',        '11'],
  'block24_phys_em':         ['Physik',            'Elektrizität',      '11'],
  'block25_musik_kunst':     ['Allgemeinwissen',   'Musik & Kunst',     '11'],
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
  const d = await res.json();
  if (!res.ok) throw new Error('Login fehlgeschlagen: ' + (d?.error?.message || res.status));
  _auth = { idToken: d.idToken, refreshToken: d.refreshToken,
            expiresAt: Date.now() + (parseInt(d.expiresIn,10) - 120) * 1000 };
  return d.email;
}

async function authQuery() {
  if (!_auth.idToken) return '';
  if (Date.now() > _auth.expiresAt) {
    const res = await fetch(
      `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_WEB_API_KEY}`,
      { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(_auth.refreshToken) }
    );
    const d = await res.json();
    _auth.idToken = d.id_token; _auth.refreshToken = d.refresh_token;
    _auth.expiresAt = Date.now() + (parseInt(d.expires_in,10) - 120) * 1000;
  }
  return '?auth=' + _auth.idToken;
}

async function fbLoad(subj, subcat, grade) {
  const url = FIREBASE_DB_URL + '/' + qbPath(subj, subcat, grade) + '.json' + (await authQuery());
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return (data && Array.isArray(data.questions)) ? data.questions : [];
}

async function fbSave(subj, subcat, grade, questions) {
  const url = FIREBASE_DB_URL + '/' + qbPath(subj, subcat, grade) + '.json' + (await authQuery());
  const body = { questions, subject: subj, subcategory: subcat, grade, updatedAt: Date.now() };
  const res = await fetch(url, {
    method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body)
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error('Firebase PUT fehlgeschlagen (' + res.status + '): ' + t.slice(0,120));
  }
}

async function main() {
  const username = readEnv('FIREBASE_USERNAME');
  const password = readEnv('FIREBASE_PASSWORD');
  const email = username
    ? username.toLowerCase().replace(/[^a-z0-9]/g,'') + '@schoolduel.game'
    : readEnv('FIREBASE_EMAIL');
  if (!email || !password) {
    console.error('Fehlt: FIREBASE_USERNAME / FIREBASE_PASSWORD in .env'); process.exit(1);
  }
  console.log('Anmelden…');
  await fbSignIn(email, password);
  console.log('Eingeloggt. Starte Upload…\n');

  const rootDir = path.join(__dirname, '..');
  const files = fs.readdirSync(rootDir).filter(f => f.startsWith('klasse11_block') && f.endsWith('.json'));
  files.sort();

  let totalAdded = 0, ok = 0, failed = 0;
  for (const filename of files) {
    const key = filename.replace('klasse11_','').replace('.json','');
    const mapping = BLOCK_MAP[key];
    if (!mapping) {
      console.log('Kein Mapping fuer: ' + filename + ' – uebersprungen');
      failed++;
      continue;
    }
    const [subj, subcat, grade] = mapping;
    let questions;
    try {
      questions = JSON.parse(fs.readFileSync(path.join(rootDir, filename), 'utf8'));
    } catch(e) {
      console.log('[' + filename + '] JSON-PARSEFEHLER: ' + e.message);
      failed++;
      continue;
    }

    process.stdout.write('[' + filename + '] → ' + subj + ' / ' + subcat + ' (Kl.' + grade + ') … ');
    try {
      const existing = await fbLoad(subj, subcat, grade);
      const seen = new Set(existing.map(q => q.question));
      const toAdd = questions.filter(q => q && q.question && !seen.has(q.question));
      const merged = [...existing, ...toAdd];
      await fbSave(subj, subcat, grade, merged);
      totalAdded += toAdd.length;
      ok++;
      console.log('+' + toAdd.length + ' neu (Pool: ' + merged.length + ')');
    } catch (e) {
      failed++;
      console.log('FEHLER: ' + e.message);
    }
  }

  console.log('\n--- Fertig ---');
  console.log('Neu hochgeladen: ' + totalAdded + ' Fragen');
  console.log('Dateien: ' + ok + ' OK, ' + failed + ' Fehler');
}

main().catch(e => { console.error(e); process.exit(1); });
