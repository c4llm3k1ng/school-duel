'use strict';
// Lädt alle Klasse-11-Fragen aus Firebase und speichert sie als lokale JSON-Dateien.
// Eine Datei pro eindeutigem Firebase-Pfad (subject/subcategory).
// Ausgabe: klasse11_<subject>_<subcat>.json im Projektroot

const fs   = require('fs');
const path = require('path');

const FIREBASE_DB_URL      = 'https://school-duel-default-rtdb.europe-west1.firebasedatabase.app';
const FIREBASE_WEB_API_KEY = 'AIzaSyCGSqcQSKwU3JqcLfl7AXIIIbcShNOrjB8';

const fbSafe    = s => s.replace(/[.#$\[\]\/]/g, '_');
const fileSafe  = s => s.replace(/[^a-zA-Z0-9äöüÄÖÜ]/g, '_');
const qbPath    = (subj, subcat) => 'questionBank/' + fbSafe(subj) + '/' + fbSafe(subcat) + '/klasse11';

// Eindeutige Pfade (dedupliziert aus BLOCK_MAP)
const PATHS = [
  ['Mathematik',      'Algebra'          ],
  ['Mathematik',      'Statistik'        ],
  ['Mathematik',      'Geometrie'        ],
  ['Deutsch',         'Literatur'        ],
  ['Deutsch',         'Grammatik'        ],
  ['Geschichte',      'Weltkriege'       ],
  ['Geschichte',      'Nachkriegszeit'   ],
  ['Biologie',        'Genetik'          ],
  ['Biologie',        'Evolution'        ],
  ['Biologie',        'Zellbiologie'     ],
  ['Chemie',          'Organische Chemie'],
  ['Chemie',          'Reaktionen'       ],
  ['Physik',          'Mechanik'         ],
  ['Physik',          'Optik'            ],
  ['Physik',          'Atomphysik'       ],
  ['Physik',          'Elektrizität'     ],
  ['Englisch',        'Grammatik'        ],
  ['Allgemeinwissen', 'Geographie'       ],
  ['Allgemeinwissen', 'Musik & Kunst'    ],
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

async function fbLoad(subj, subcat) {
  const url = FIREBASE_DB_URL + '/' + qbPath(subj, subcat) + '.json' + (await authQuery());
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return (data && Array.isArray(data.questions)) ? data.questions : [];
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
  console.log('Eingeloggt. Starte Download…\n');

  const rootDir = path.join(__dirname, '..');
  let ok = 0, failed = 0, total = 0;

  for (const [subj, subcat] of PATHS) {
    const filename = 'klasse11_' + fileSafe(subj) + '_' + fileSafe(subcat) + '.json';
    const outPath  = path.join(rootDir, filename);
    process.stdout.write('[' + filename + '] … ');
    try {
      const questions = await fbLoad(subj, subcat);
      fs.writeFileSync(outPath, JSON.stringify(questions, null, 2), 'utf8');
      console.log(questions.length + ' Fragen gespeichert');
      total += questions.length;
      ok++;
    } catch (e) {
      console.log('FEHLER: ' + e.message);
      failed++;
    }
  }

  console.log('\n--- Fertig ---');
  console.log('Gesamt: ' + total + ' Fragen in ' + ok + ' Dateien (' + failed + ' Fehler)');
}

main().catch(e => { console.error(e); process.exit(1); });
