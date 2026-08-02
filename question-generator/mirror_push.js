'use strict';
// Schreibt den lokalen Spiegel (questionbank/) zurueck nach Firebase.
// Gegenstueck zu mirror_pull.js.
//
//   node mirror_push.js 9            Dry-Run fuer Klasse 9
//   node mirror_push.js 9 --apply    schreibt
//   node mirror_push.js --all --apply
//
// Sicherheiten: Dry-Run als Default, Verlustpruefung gegen den Live-Stand,
// Strukturvalidierung jeder Datei, Backup vor dem Schreiben.

const fs   = require('fs');
const path = require('path');

const FIREBASE_DB_URL      = 'https://school-duel-default-rtdb.europe-west1.firebasedatabase.app';
const FIREBASE_WEB_API_KEY = 'AIzaSyCGSqcQSKwU3JqcLfl7AXIIIbcShNOrjB8';
const DIR = path.join(__dirname, '..', 'questionbank');

const arg   = process.argv[2];
const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force-lost');
if (!arg) { console.error('Aufruf: node mirror_push.js <klasse|--all> [--apply] [--force-lost]'); process.exit(1); }

const fbSafe = s => s.replace(/[.#$\[\]\/]/g, '_');
let _auth = { idToken:null, refreshToken:null, expiresAt:0 };

function readEnv(name) {
  if (process.env[name]) return process.env[name].trim();
  const p = path.join(__dirname, '.env');
  if (fs.existsSync(p)) {
    const line = fs.readFileSync(p,'utf8').split(/\r?\n/).find(l => l.trim().startsWith(name));
    if (line) {
      const v = line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g,'');
      if (v && !/^(sk-ant-\.\.\.|AIza\.\.\.|dein)/i.test(v)) return v;
    }
  }
  return null;
}

async function signIn() {
  const u = readEnv('FIREBASE_USERNAME'), pw = readEnv('FIREBASE_PASSWORD');
  const email = u ? u.toLowerCase().replace(/[^a-z0-9]/g,'')+'@schoolduel.game' : readEnv('FIREBASE_EMAIL');
  if (!email || !pw) throw new Error('FIREBASE_USERNAME / FIREBASE_PASSWORD fehlen in .env');
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_WEB_API_KEY}`,
    { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ email, password: pw, returnSecureToken:true }) });
  const d = await r.json();
  if (!r.ok) throw new Error('Auth failed: ' + JSON.stringify(d));
  _auth = { idToken:d.idToken, refreshToken:d.refreshToken, expiresAt: Date.now() + (parseInt(d.expiresIn,10)-120)*1000 };
}
async function token() {
  if (Date.now() < _auth.expiresAt) return _auth.idToken;
  const r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${FIREBASE_WEB_API_KEY}`,
    { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:`grant_type=refresh_token&refresh_token=${_auth.refreshToken}` });
  const d = await r.json();
  _auth.idToken = d.id_token; _auth.expiresAt = Date.now() + (parseInt(d.expires_in,10)-120)*1000;
  return _auth.idToken;
}

function validate(qs) {
  const bad = [];
  if (!Array.isArray(qs) || !qs.length) return ['kein nichtleeres Array'];
  qs.forEach((q,i) => {
    if (typeof q.question !== 'string' || !q.question.trim()) bad.push(`Q${i}: question fehlt`);
    if (!Array.isArray(q.options) || q.options.length !== 4)  bad.push(`Q${i}: nicht 4 Optionen`);
    else if (q.options.some(o => typeof o !== 'string' || !o.trim())) bad.push(`Q${i}: leere Option`);
    if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct > 3) bad.push(`Q${i}: correct=${q.correct}`);
  });
  if (/Ã[¤¶¼]|â€/.test(JSON.stringify(qs))) bad.push('Verdacht auf kaputte Umlaute');
  return bad;
}

async function main() {
  const index = JSON.parse(fs.readFileSync(path.join(DIR,'_index.json'),'utf8'));
  const todo = index.filter(e => arg === '--all' || e.grade === arg);
  if (!todo.length) { console.error('Keine passenden Pfade.'); process.exit(1); }

  await signIn();
  console.log(APPLY ? 'Modus: SCHREIBEN\n' : 'Modus: DRY-RUN\n');

  const plan = [];
  let blocked = false, lostTotal = 0;

  for (const e of todo) {
    const qs = JSON.parse(fs.readFileSync(path.join(DIR, e.file),'utf8'));
    const problems = validate(qs);
    if (problems.length) {
      console.log(`  FEHLERHAFT ${e.file}:`);
      problems.slice(0,4).forEach(p => console.log(`     ${p}`));
      blocked = true; continue;
    }
    const fbPath = `questionBank/${fbSafe(e.subject)}/${fbSafe(e.subcategory)}/klasse${e.grade}`;
    const cur = await (await fetch(`${FIREBASE_DB_URL}/${fbPath}.json?auth=${await token()}`)).json();
    const curQs = (cur && Array.isArray(cur.questions)) ? cur.questions : (Array.isArray(cur) ? cur : []);
    const localTexts = new Set(qs.map(q => String(q.question).trim()));
    const lost = curQs.filter(q => q && typeof q.question === 'string' && !localTexts.has(q.question.trim()));
    lostTotal += lost.length;

    plan.push({ ...e, fbPath, qs, lost });
    console.log(`${fbPath.padEnd(56)} ${String(curQs.length).padStart(4)} -> ${String(qs.length).padStart(4)}` +
                (lost.length ? `   *** ${lost.length} nur in Firebase ***` : ''));
    lost.slice(0,2).forEach(q => console.log(`       verlöre: ${q.question.slice(0,72)}`));
  }

  console.log(`\n${plan.length} Pfade, ${plan.reduce((a,p)=>a+p.qs.length,0)} Fragen.`);
  if (blocked) { console.log('\nABBRUCH: fehlerhafte Datei(en). Nichts geschrieben.'); process.exit(1); }

  if (lostTotal) {
    console.log(`\nWARNUNG: ${lostTotal} Fragen stehen in Firebase, aber nicht im Spiegel.`);
    if (!FORCE) { console.log('ABBRUCH. Erst klaeren, dann --force-lost.'); process.exit(1); }
  } else console.log('Kein Datenverlust.');

  if (!APPLY) { console.log('\nDry-Run beendet. Mit --apply schreiben.'); return; }

  const stamp = new Date().toISOString().replace(/[:.]/g,'-');
  const bak = path.join(__dirname, `_backup_questionbank_${stamp}.json`);
  const backup = {};
  for (const p of plan) backup[p.fbPath] = await (await fetch(`${FIREBASE_DB_URL}/${p.fbPath}.json?auth=${await token()}`)).json();
  fs.writeFileSync(bak, JSON.stringify(backup,null,2),'utf8');
  console.log(`\nBackup: ${bak}\n`);

  let ok = 0;
  for (const p of plan) {
    const body = { questions:p.qs, subject:p.subject, subcategory:p.subcategory, grade:p.grade, updatedAt:Date.now() };
    const r = await fetch(`${FIREBASE_DB_URL}/${p.fbPath}.json?auth=${await token()}`,
      { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    if (!r.ok) { console.log(`  FEHLER ${p.fbPath}: ${r.status}`); continue; }
    console.log(`  OK  ${p.fbPath}  (${p.qs.length})`);
    ok++;
  }
  console.log(`\nFertig. ${ok}/${plan.length} Pfade geschrieben.`);
}

main().catch(e => { console.error(e); process.exit(1); });
