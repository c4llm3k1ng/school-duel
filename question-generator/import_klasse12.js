'use strict';
// Importiert alle klasse12_block*.json Dateien nach Firebase
// Pfad-Schema: questionBank/<subject>/<subcategory>/klasse12

const fs   = require('fs');
const path = require('path');

const FIREBASE_DB_URL      = 'https://school-duel-default-rtdb.europe-west1.firebasedatabase.app';
const FIREBASE_WEB_API_KEY = 'AIzaSyCGSqcQSKwU3JqcLfl7AXIIIbcShNOrjB8';

const fbSafe = s => s.replace(/[.#$\[\]\/]/g, '_');
const qbPath = (subj, subcat) => 'questionBank/' + fbSafe(subj) + '/' + fbSafe(subcat) + '/klasse12';

const BLOCK_MAP = {
  'block01_mathe_analysis':         ['Mathematik',      'Analysis'],
  'block02_mathe_stochastik':       ['Mathematik',      'Stochastik'],
  'block03_mathe_vektoren':         ['Mathematik',      'Vektoren'],
  'block04_bio_evolution':          ['Biologie',        'Evolution'],
  'block05_bio_genetik':            ['Biologie',        'Genetik'],
  'block06_bio_oekologie':          ['Biologie',        'Ökologie'],
  'block07_bio_zellbiologie':       ['Biologie',        'Zellbiologie'],
  'block08_chemie_atombau':         ['Chemie',          'Atombau'],
  'block09_chemie_elektrochemie':   ['Chemie',          'Elektrochemie'],
  'block10_chemie_organik':         ['Chemie',          'Organische Chemie'],
  'block11_chemie_saeuren':         ['Chemie',          'Säuren & Basen'],
  'block12_physik_atom':            ['Physik',          'Atomphysik'],
  'block13_physik_elektrizitaet':   ['Physik',          'Elektrizität'],
  'block14_physik_mechanik':        ['Physik',          'Mechanik'],
  'block15_physik_optik':           ['Physik',          'Optik'],
  'block16_physik_waerme':          ['Physik',          'Wärmelehre'],
  'block17_geschichte_industrie':   ['Geschichte',      'Industrialisierung'],
  'block18_geschichte_nachkrieg':   ['Geschichte',      'Nachkriegszeit'],
  'block19_geschichte_weltkriege':  ['Geschichte',      'Weltkriege'],
  'block20_deutsch_grammatik':      ['Deutsch',         'Grammatik'],
  'block21_deutsch_literatur':      ['Deutsch',         'Literatur'],
  'block22_englisch_grammatik':     ['Englisch',        'Grammatik'],
  'block23_englisch_zeitformen':    ['Englisch',        'Zeitformen'],
  'block24_aw_geographie':          ['Allgemeinwissen', 'Geographie'],
  'block25_aw_politik':             ['Allgemeinwissen', 'Politik'],
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

async function fbLoad(subj, subcat) {
  const url = FIREBASE_DB_URL + '/' + qbPath(subj, subcat) + '.json' + (await authQuery());
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return (data && Array.isArray(data.questions)) ? data.questions : [];
}

async function fbSave(subj, subcat, questions) {
  const url = FIREBASE_DB_URL + '/' + qbPath(subj, subcat) + '.json' + (await authQuery());
  const body = { questions, subject: subj, subcategory: subcat, grade: '12', updatedAt: Date.now() };
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
  const files = fs.readdirSync(rootDir).filter(f => f.startsWith('klasse12_block') && f.endsWith('.json'));
  files.sort();

  let totalAdded = 0, ok = 0, failed = 0;
  for (const filename of files) {
    const key = filename.replace('klasse12_','').replace('.json','');
    const mapping = BLOCK_MAP[key];
    if (!mapping) {
      console.log('Kein Mapping fuer: ' + filename + ' (key=' + key + ') – uebersprungen');
      failed++;
      continue;
    }
    const [subj, subcat] = mapping;
    const questions = JSON.parse(fs.readFileSync(path.join(rootDir, filename), 'utf8'));

    process.stdout.write('[' + filename + '] → ' + subj + ' / ' + subcat + ' … ');
    try {
      const existing = await fbLoad(subj, subcat);
      const seen = new Set(existing.map(q => q.question));
      const toAdd = questions.filter(q => q && q.question && !seen.has(q.question));
      const merged = [...existing, ...toAdd];
      await fbSave(subj, subcat, merged);
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
