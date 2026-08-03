'use strict';
// Schreibt die Kataloge aus questionbank_katalog/ nach Firebase unter catalogs/.
//
//   node catalog_push.js            Probelauf
//   node catalog_push.js --apply    schreibt
//
// Sicherheiten wie bei mirror_push: Probelauf als Default, Strukturpruefung,
// Verlustpruefung gegen den Live-Stand, Backup vor dem Schreiben.
//
// Ablage je Katalog:
//   catalogs/<id> = { id, name, desc, icon, questions: [...], count, updatedAt }
//
// Die gemischten Kataloge (fussball_gemischt usw.) werden NICHT abgelegt - die
// App setzt sie aus den drei Schwierigkeitsgraden zusammen. Sonst laegen
// dieselben Fragen doppelt in der Datenbank.
const fs = require('fs');
const path = require('path');

const FIREBASE_DB_URL = 'https://school-duel-default-rtdb.europe-west1.firebasedatabase.app';
const FIREBASE_WEB_API_KEY = 'AIzaSyCGSqcQSKwU3JqcLfl7AXIIIbcShNOrjB8';
const DIR = path.join(__dirname, '..', 'questionbank_katalog');
const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force-lost');

// Anzeigenamen wie bisher in ensureBuiltinCatalogs()
const META = {
  fussball_leicht: { icon: '⚽', name: 'Fußball – Leicht', desc: 'Grundwissen Fußball' },
  fussball_mittel: { icon: '⚽', name: 'Fußball – Mittel', desc: 'Fortgeschrittenes Fußballwissen' },
  fussball_schwer: { icon: '⚽', name: 'Fußball – Schwer', desc: 'Experten- & Historikwissen' },
  musik_leicht:    { icon: '🎵', name: 'Musik – Leicht',   desc: 'Grundwissen Musik' },
  musik_mittel:    { icon: '🎵', name: 'Musik – Mittel',   desc: 'Musikwissen für Fortgeschrittene' },
  musik_schwer:    { icon: '🎵', name: 'Musik – Schwer',   desc: 'Expertenwissen Musik' },
  anime_leicht:    { icon: '🎌', name: 'Anime – Leicht',   desc: 'Grundwissen Anime' },
  anime_mittel:    { icon: '🎌', name: 'Anime – Mittel',   desc: 'Anime für Fortgeschrittene' },
  anime_schwer:    { icon: '🎌', name: 'Anime – Schwer',   desc: 'Expertenwissen Anime' },
  politik_schwer:  { icon: '🏛️', name: 'Politik – Schwer', desc: 'Schwere Politikfragen' },
};

function readEnv(name) {
  if (process.env[name]) return process.env[name].trim();
  const p = path.join(__dirname, '.env');
  if (!fs.existsSync(p)) return null;
  const line = fs.readFileSync(p, 'utf8').split(/\r?\n/).find(l => l.trim().startsWith(name));
  if (!line) return null;
  const v = line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
  return v && !/^(sk-ant-\.\.\.|AIza\.\.\.|dein)/i.test(v) ? v : null;
}

let _auth = { idToken: null, expiresAt: 0 };
async function token() {
  if (Date.now() < _auth.expiresAt) return _auth.idToken;
  const u = readEnv('FIREBASE_USERNAME'), pw = readEnv('FIREBASE_PASSWORD');
  const email = u ? u.toLowerCase().replace(/[^a-z0-9]/g, '') + '@schoolduel.game' : readEnv('FIREBASE_EMAIL');
  if (!email || !pw) throw new Error('FIREBASE_USERNAME / FIREBASE_PASSWORD fehlen in .env');
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_WEB_API_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pw, returnSecureToken: true }) });
  const d = await r.json();
  if (!r.ok) throw new Error('Auth: ' + JSON.stringify(d));
  _auth = { idToken: d.idToken, expiresAt: Date.now() + (parseInt(d.expiresIn, 10) - 120) * 1000 };
  return _auth.idToken;
}

// Firebase kann die Verbindung bei vielen Abfragen hintereinander schliessen.
const schlaf = ms => new Promise(r => setTimeout(r, ms));
async function anfrage(url, opt, versuche = 4) {
  for (let i = 0; i < versuche; i++) {
    try { const r = await fetch(url, opt); return { ok: r.ok, data: await r.json().catch(() => null) }; }
    catch (e) { if (i === versuche - 1) throw e; await schlaf(500 * (i + 1)); }
  }
}

function validate(qs) {
  const bad = [];
  if (!Array.isArray(qs) || !qs.length) return ['kein nichtleeres Array'];
  qs.forEach((q, i) => {
    if (typeof q.question !== 'string' || !q.question.trim()) bad.push(`Q${i}: question fehlt`);
    if (!Array.isArray(q.options) || q.options.length !== 4) bad.push(`Q${i}: nicht 4 Optionen`);
    else if (q.options.some(o => typeof o !== 'string' || !o.trim())) bad.push(`Q${i}: leere Option`);
    if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct > 3) bad.push(`Q${i}: correct=${q.correct}`);
  });
  if (/Ã[¤¶¼]|â€/.test(JSON.stringify(qs))) bad.push('Verdacht auf kaputte Umlaute');
  return bad;
}

(async () => {
  const index = JSON.parse(fs.readFileSync(path.join(DIR, '_index.json'), 'utf8'));
  console.log(APPLY ? 'Modus: SCHREIBEN\n' : 'Modus: PROBELAUF\n');

  const plan = [];
  let blockiert = false, verlorenGesamt = 0;

  for (const e of index) {
    const qs = JSON.parse(fs.readFileSync(path.join(DIR, e.file), 'utf8'));
    const fehler = validate(qs);
    if (fehler.length) { console.log(`  ${e.katalog}: ${fehler.slice(0, 3).join(', ')}`); blockiert = true; continue; }

    const fbPath = `catalogs/${e.katalog}`;
    const { data: live } = await anfrage(`${FIREBASE_DB_URL}/${fbPath}.json?auth=${await token()}`);
    const liveQs = (live && Array.isArray(live.questions)) ? live.questions : [];

    const lokal = new Set(qs.map(q => String(q.question).trim()));
    const verloren = liveQs.filter(q => q && typeof q.question === 'string' && !lokal.has(q.question.trim()));
    verlorenGesamt += verloren.length;

    plan.push({ ...e, fbPath, qs });
    console.log(`${fbPath.padEnd(34)} ${String(liveQs.length).padStart(5)} -> ${String(qs.length).padStart(5)}`
      + (verloren.length ? `   *** ${verloren.length} nur in Firebase ***` : ''));
    verloren.slice(0, 2).forEach(q => console.log(`      verlöre: ${q.question.slice(0, 66)}`));
  }

  if (blockiert) { console.log('\nABBRUCH: Strukturfehler.'); process.exit(1); }
  console.log(`\n${plan.length} Kataloge, ${plan.reduce((a, p) => a + p.qs.length, 0)} Fragen.`);

  if (verlorenGesamt) {
    console.log(`\nWARNUNG: ${verlorenGesamt} Fragen stehen in Firebase, aber nicht lokal.`);
    if (!FORCE) { console.log('ABBRUCH. Erst klaeren, dann --force-lost.'); process.exit(1); }
  } else console.log('Kein Datenverlust.');

  if (!APPLY) { console.log('\nProbelauf beendet. Mit --apply schreiben.'); return; }

  // Backup des Live-Stands, bevor irgendetwas ueberschrieben wird
  const backup = {};
  for (const p of plan) backup[p.fbPath] = (await anfrage(`${FIREBASE_DB_URL}/${p.fbPath}.json?auth=${await token()}`)).data;
  const bpfad = path.join(__dirname, `_backup_catalogs_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(bpfad, JSON.stringify(backup, null, 2), 'utf8');
  console.log(`\nBackup: ${path.basename(bpfad)}`);

  for (const p of plan) {
    const meta = META[p.katalog] || {};
    const body = { id: p.katalog, ...meta, count: p.qs.length, questions: p.qs, updatedAt: Date.now() };
    const { ok } = await anfrage(`${FIREBASE_DB_URL}/${p.fbPath}.json?auth=${await token()}`,
      { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    console.log(`  ${ok ? 'OK ' : 'FEHLER'} ${p.fbPath}  (${p.qs.length})`);
    if (!ok) process.exitCode = 1;
  }
  console.log('\nFertig.');
})();
