'use strict';
// Re-importiert alle klasse11_<subj>_<subcat>.json Dateien nach Firebase (Force-Overwrite).
// Verwendet nach dem Balance-Fix, um die korrigierten Versionen hochzuladen.

const fs   = require('fs');
const path = require('path');

const FIREBASE_DB_URL      = 'https://school-duel-default-rtdb.europe-west1.firebasedatabase.app';
const FIREBASE_WEB_API_KEY = 'AIzaSyCGSqcQSKwU3JqcLfl7AXIIIbcShNOrjB8';

const fbSafe = s => s.replace(/[.#$\[\]\/]/g, '_');
const qbPath = (subj, subcat) => 'questionBank/' + fbSafe(subj) + '/' + fbSafe(subcat) + '/klasse11';

const PATHS = [
  ['Mathematik',      'Algebra',           'klasse11_Mathematik_Algebra.json'                ],
  ['Mathematik',      'Statistik',         'klasse11_Mathematik_Statistik.json'              ],
  ['Mathematik',      'Geometrie',         'klasse11_Mathematik_Geometrie.json'              ],
  ['Deutsch',         'Literatur',         'klasse11_Deutsch_Literatur.json'                 ],
  ['Deutsch',         'Grammatik',         'klasse11_Deutsch_Grammatik.json'                 ],
  ['Geschichte',      'Weltkriege',        'klasse11_Geschichte_Weltkriege.json'             ],
  ['Geschichte',      'Nachkriegszeit',    'klasse11_Geschichte_Nachkriegszeit.json'         ],
  ['Biologie',        'Genetik',           'klasse11_Biologie_Genetik.json'                  ],
  ['Biologie',        'Evolution',         'klasse11_Biologie_Evolution.json'                ],
  ['Biologie',        'Zellbiologie',      'klasse11_Biologie_Zellbiologie.json'             ],
  ['Chemie',          'Organische Chemie', 'klasse11_Chemie_Organische_Chemie.json'         ],
  ['Chemie',          'Reaktionen',        'klasse11_Chemie_Reaktionen.json'                 ],
  ['Physik',          'Mechanik',          'klasse11_Physik_Mechanik.json'                   ],
  ['Physik',          'Optik',             'klasse11_Physik_Optik.json'                      ],
  ['Physik',          'Atomphysik',        'klasse11_Physik_Atomphysik.json'                 ],
  ['Physik',          'Elektrizität',      'klasse11_Physik_Elektrizit_t.json'               ],
  ['Englisch',        'Grammatik',         'klasse11_Englisch_Grammatik.json'                ],
  ['Allgemeinwissen', 'Geographie',        'klasse11_Allgemeinwissen_Geographie.json'        ],
  ['Allgemeinwissen', 'Musik & Kunst',     'klasse11_Allgemeinwissen_Musik___Kunst.json'     ],
];

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

async function fbSave(subj, subcat, questions) {
  const url = FIREBASE_DB_URL + '/' + qbPath(subj, subcat) + '.json' + (await authQuery());
  const body = { questions, subject: subj, subcategory: subcat, grade: '11', updatedAt: Date.now() };
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
  console.log('Eingeloggt. Starte Re-Import (Force-Overwrite)…\n');

  const rootDir = path.join(__dirname, '..');
  let ok = 0, failed = 0, total = 0;

  for (const [subj, subcat, filename] of PATHS) {
    const filePath = path.join(rootDir, filename);
    process.stdout.write('[' + filename + '] → ' + subj + '/' + subcat + ' … ');
    if (!fs.existsSync(filePath)) {
      console.log('ÜBERSPRUNGEN (Datei fehlt)');
      failed++;
      continue;
    }
    try {
      const questions = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      await fbSave(subj, subcat, questions);
      console.log(questions.length + ' Fragen überschrieben');
      total += questions.length;
      ok++;
    } catch (e) {
      console.log('FEHLER: ' + e.message);
      failed++;
    }
  }

  console.log('\n--- Fertig ---');
  console.log('Gesamt: ' + total + ' Fragen in ' + ok + ' Pfaden (' + failed + ' Fehler)');
}

main().catch(e => { console.error(e); process.exit(1); });
