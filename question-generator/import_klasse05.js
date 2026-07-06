'use strict';
// Einmalig-Skript: importiert alle 25 klasse05_block*.json Dateien nach Firebase
// Pfad-Schema: questionBank/<subject>/<subcategory>/klasse5

const fs   = require('fs');
const path = require('path');

const FIREBASE_DB_URL      = 'https://school-duel-default-rtdb.europe-west1.firebasedatabase.app';
const FIREBASE_WEB_API_KEY = 'AIzaSyCGSqcQSKwU3JqcLfl7AXIIIbcShNOrjB8';

const fbSafe = s => s.replace(/[.#$\[\]\/]/g, '_');
const qbPath = (subj, subcat) => 'questionBank/' + fbSafe(subj) + '/' + fbSafe(subcat) + '/klasse5';

// Mapping: Dateiname-Präfix → [subject, subcategory]
const BLOCK_MAP = {
  'block01_mathe_zahlen':           ['Mathematik',        'Allgemein'],
  'block02_mathe_geo':              ['Mathematik',        'Geometrie'],
  'block03_deutsch_grammatik':      ['Deutsch',           'Grammatik'],
  'block04_deutsch_rechtschreibung':['Deutsch',           'Rechtschreibung'],
  'block05_englisch':               ['Englisch',          'Allgemein'],
  'block06_erdkunde_deutschland':   ['Allgemeinwissen',   'Geographie'],
  'block07_geschichte_antike':      ['Geschichte',        'Antike'],
  'block08_bio_tiere':              ['Biologie',          'Allgemein'],
  'block09_mathe_brueche':          ['Mathematik',        'Bruchrechnung'],
  'block10_deutsch_texte':          ['Deutsch',           'Literatur'],
  'block11_erdkunde_europa':        ['Allgemeinwissen',   'Geographie'],
  'block12_mathe_groessen':         ['Mathematik',        'Allgemein'],
  'block13_geschichte_mittelalter': ['Geschichte',        'Mittelalter'],
  'block14_bio_mensch':             ['Biologie',          'Körper & Gesundheit'],
  'block15_physik_sachkunde':       ['Physik',            'Allgemein'],
  'block16_deutsch_schreiben':      ['Deutsch',           'Aufsatz'],
  'block17_englisch_vertiefung':    ['Englisch',          'Allgemein'],
  'block18_geschichte_fruehzeit':   ['Geschichte',        'Frühe Neuzeit'],
  'block19_mathe_statistik':        ['Mathematik',        'Statistik'],
  'block20_erdkunde_klima':         ['Allgemeinwissen',   'Natur & Tiere'],
  'block21_bio_oekosystem':         ['Biologie',          'Ökologie'],
  'block22_musik_grundlagen':       ['Allgemeinwissen',   'Musik & Kunst'],
  'block23_kunst_grundlagen':       ['Allgemeinwissen',   'Musik & Kunst'],
  'block24_naturwissenschaft':      ['Allgemeinwissen',   'Technik'],
  'block25_gemischt':               ['Allgemeinwissen',   'Allgemein'],
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
  const body = { questions, subject: subj, subcategory: subcat, grade: '5', updatedAt: Date.now() };
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
  const files = fs.readdirSync(rootDir).filter(f => f.startsWith('klasse05_block') && f.endsWith('.json'));
  files.sort();

  let totalAdded = 0, ok = 0, failed = 0;
  for (const filename of files) {
    // Schlüssel aus Dateiname extrahieren: klasse05_blockNN_xxx → blockNN_xxx
    const key = filename.replace('klasse05_','').replace('.json','')
      // Normalize: block18_geschichte_früh... → block18_geschichte_fruehzeit
      .replace(/ü/g,'ue').replace(/ä/g,'ae').replace(/ö/g,'oe')
      .replace(/ß/g,'ss');

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
