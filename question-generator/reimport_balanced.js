'use strict';
// Force-Overwrite der balance-korrigierten Block-JSONs nach Firebase.
//
// WARUM NICHT import_klasse<N>.js?
// Die Import-Skripte mergen: sie halten alles, was in Firebase liegt, und haengen
// nur an, was ihr Dedup-Schluessel (Fragetext + Optionen) nicht kennt. Ein
// Balance-Fix aendert genau die Optionen – jede korrigierte Frage saehe also "neu"
// aus und wuerde ZUSAETZLICH zur alten unbalancierten Version eingefuegt.
// Nach einem Balance-Fix muss deshalb hart ueberschrieben werden.
//
// Aufruf:
//   node reimport_balanced.js 7             Dry-Run
//   node reimport_balanced.js 7 --apply     schreibt
//   node reimport_balanced.js 10 --apply

const fs   = require('fs');
const path = require('path');

const FIREBASE_DB_URL      = 'https://school-duel-default-rtdb.europe-west1.firebasedatabase.app';
const FIREBASE_WEB_API_KEY = 'AIzaSyCGSqcQSKwU3JqcLfl7AXIIIbcShNOrjB8';

const GRADE = process.argv[2];
const APPLY = process.argv.includes('--apply');

if (!GRADE || !/^\d+$/.test(GRADE)) {
  console.error('Aufruf: node reimport_balanced.js <klasse> [--apply]');
  process.exit(1);
}

// Datei-Praefix und Import-Skript pro Klasse
const SETUP = {
  '5':  { script: 'import_klasse05.js', prefix: 'klasse05_' },
  '6':  { script: 'import_klasse06.js', prefix: 'klasse06_' },
  '7':  { script: 'import_klasse7.js',  prefix: 'klasse7_'  },
  '10': { script: 'import_klasse10.js', prefix: 'klasse10_' },
  '12': { script: 'import_klasse12.js', prefix: 'klasse12_' },
}[GRADE];

if (!SETUP) { console.error('Keine Konfiguration fuer Klasse ' + GRADE); process.exit(1); }

const fbSafe = s => s.replace(/[.#$\[\]\/]/g, '_');
const qbPath = (subj, subcat) => 'questionBank/' + fbSafe(subj) + '/' + fbSafe(subcat) + '/klasse' + GRADE;

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
  const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${FIREBASE_WEB_API_KEY}`,
    { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body: `grant_type=refresh_token&refresh_token=${_auth.refreshToken}` });
  const d = await res.json();
  if (!res.ok) throw new Error('Refresh failed: ' + JSON.stringify(d));
  _auth.idToken = d.id_token;
  _auth.expiresAt = Date.now() + (parseInt(d.expires_in,10) - 120) * 1000;
}

// Struktur einer lokalen Datei pruefen, bevor sie live geht
function validate(questions, filename) {
  const problems = [];
  if (!Array.isArray(questions) || !questions.length) { problems.push('kein nichtleeres Array'); return problems; }
  questions.forEach((q, i) => {
    if (typeof q.question !== 'string' || !q.question.trim()) problems.push(`Q${i}: question fehlt`);
    if (!Array.isArray(q.options) || q.options.length !== 4)  problems.push(`Q${i}: nicht genau 4 Optionen`);
    else if (q.options.some(o => typeof o !== 'string' || !o.trim())) problems.push(`Q${i}: leere Option`);
    if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct > 3) problems.push(`Q${i}: correct=${q.correct} ungueltig`);
  });
  // Mojibake-Verdacht (UTF-8 als Windows-1252 gelesen)
  const raw = JSON.stringify(questions);
  if (/Ã[¤¶¼]|â€|Â[^\s]/.test(raw)) problems.push('Verdacht auf kaputte Umlaute (Mojibake)');
  return problems;
}

async function main() {
  const src = fs.readFileSync(path.join(__dirname, SETUP.script), 'utf8');
  const m = src.match(/BLOCK_MAP\s*=\s*\{[\s\S]*?\n\};/);
  if (!m) throw new Error('BLOCK_MAP nicht gefunden in ' + SETUP.script);
  const BLOCK_MAP = eval('(' + m[0].replace(/^.*?=\s*/, '').replace(/;$/, '') + ')');

  const username = readEnv('FIREBASE_USERNAME');
  const password = readEnv('FIREBASE_PASSWORD');
  const email = username
    ? username.toLowerCase().replace(/[^a-z0-9]/g,'') + '@schoolduel.game'
    : readEnv('FIREBASE_EMAIL');
  if (!email || !password) throw new Error('FIREBASE_USERNAME / FIREBASE_PASSWORD fehlen in .env');

  await fbSignIn(email, password);
  console.log(`Klasse ${GRADE} | ${APPLY ? 'Modus: SCHREIBEN (Force-Overwrite)' : 'Modus: DRY-RUN'}\n`);

  const ROOT = path.join(__dirname, '..');

  // Auf Pfad-Kollisionen pruefen – bei Force-Overwrite wuerde sonst der letzte
  // Block alle vorherigen desselben Pfades loeschen.
  const byPath = new Map();
  for (const [suffix, v] of Object.entries(BLOCK_MAP)) {
    const key = qbPath(v[0], v[1]);
    if (!byPath.has(key)) byPath.set(key, []);
    byPath.get(key).push(suffix);
  }

  const plan = [];
  let blocked = false;
  for (const [key, suffixes] of byPath) {
    const [subj, subcat] = [BLOCK_MAP[suffixes[0]][0], BLOCK_MAP[suffixes[0]][1]];
    let merged = [];
    const parts = [];
    for (const suffix of suffixes) {
      const filename = SETUP.prefix + suffix + '.json';
      const filepath = path.join(ROOT, filename);
      if (!fs.existsSync(filepath)) { console.log(`  FEHLT: ${filename}`); blocked = true; continue; }
      let qs;
      try { qs = JSON.parse(fs.readFileSync(filepath, 'utf8')); }
      catch (e) { console.log(`  UNGUELTIGES JSON: ${filename} – ${e.message}`); blocked = true; continue; }
      const problems = validate(qs, filename);
      if (problems.length) {
        console.log(`  PROBLEM in ${filename}:`);
        problems.slice(0, 5).forEach(p => console.log(`     ${p}`));
        if (problems.length > 5) console.log(`     … und ${problems.length - 5} weitere`);
        blocked = true;
        continue;
      }
      merged = merged.concat(qs);
      parts.push(`${suffix} (${qs.length})`);
    }

    await ensureToken();
    const cur = await (await fetch(`${FIREBASE_DB_URL}/${key}.json?auth=${_auth.idToken}`)).json();
    const curQs = cur && Array.isArray(cur.questions) ? cur.questions
                : Array.isArray(cur) ? cur : [];

    // Force-Overwrite loescht alles, was nicht in den lokalen Dateien steht.
    // Gleiche Anzahl beweist noch nicht gleiche Fragen – deshalb hier ueber den
    // Fragetext abgleichen, welche Fragen dabei verloren gingen.
    const localTexts = new Set(merged.map(q => String(q.question).trim()));
    const lost = curQs.filter(q => q && !localTexts.has(String(q.question).trim()));

    plan.push({ key, subj, subcat, questions: merged, lost });
    console.log(`${key.padEnd(56)} ${String(curQs.length).padStart(4)} -> ${String(merged.length).padStart(4)}` +
                (parts.length > 1 ? `   [${parts.join(' + ')}]` : '') +
                (lost.length ? `   *** ${lost.length} nur in Firebase ***` : ''));
    if (lost.length) {
      lost.slice(0, 3).forEach(q => console.log(`       verlöre: ${String(q.question).slice(0, 80)}`));
      if (lost.length > 3) console.log(`       … und ${lost.length - 3} weitere`);
    }
  }

  const total     = plan.reduce((a, p) => a + p.questions.length, 0);
  const lostTotal = plan.reduce((a, p) => a + p.lost.length, 0);
  console.log(`\n${plan.length} Pfade, ${total} Fragen.`);

  if (blocked) { console.log('\nABBRUCH: mindestens eine Datei ist fehlerhaft. Nichts geschrieben.'); process.exit(1); }

  if (lostTotal) {
    console.log(`\nWARNUNG: ${lostTotal} Fragen stehen in Firebase, aber in keiner lokalen Datei.`);
    console.log('Der Force-Overwrite wuerde sie loeschen. Erst klaeren, dann mit --force-lost erzwingen.');
    if (!process.argv.includes('--force-lost')) { console.log('ABBRUCH.'); process.exit(1); }
  } else {
    console.log('Kein Datenverlust: jede Frage aus Firebase ist lokal vorhanden.');
  }

  if (!APPLY) { console.log('\nDry-Run beendet. Mit --apply schreiben.'); return; }

  // Backup des Ist-Zustands
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const bak = path.join(__dirname, `_backup_questionbank_klasse${GRADE}_${stamp}.json`);
  const backup = {};
  for (const p of plan) {
    await ensureToken();
    backup[p.key] = await (await fetch(`${FIREBASE_DB_URL}/${p.key}.json?auth=${_auth.idToken}`)).json();
  }
  fs.writeFileSync(bak, JSON.stringify(backup, null, 2), 'utf8');
  console.log(`\nBackup: ${bak}\n`);

  let ok = 0;
  for (const p of plan) {
    await ensureToken();
    const body = {
      questions: p.questions,
      subject: p.subj, subcategory: p.subcat, grade: GRADE,
      updatedAt: Date.now()
    };
    const res = await fetch(`${FIREBASE_DB_URL}/${p.key}.json?auth=${_auth.idToken}`,
      { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    if (!res.ok) { console.log(`  FEHLER ${p.key}: ${res.status}`); continue; }
    console.log(`  OK  ${p.key}  (${p.questions.length})`);
    ok++;
  }
  console.log(`\nFertig. ${ok}/${plan.length} Pfade ueberschrieben, ${total} Fragen.`);
}

main().catch(e => { console.error(e); process.exit(1); });
