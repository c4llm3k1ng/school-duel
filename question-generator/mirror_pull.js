'use strict';
// Spiegelt die komplette Firebase-questionBank in lokale Dateien: eine Datei je Pfad.
// Damit ist die Zuordnung Firebase <-> lokal eindeutig; die alten Block-Dateien
// deckten nur einen Teil ab (rund 1950 Fragen existierten nur in Firebase).
//
//   node mirror_pull.js            spiegelt alles nach ../questionbank/
//   node mirror_pull.js 5          nur Klasse 5
//
// Gegenstueck: mirror_push.js

const fs   = require('fs');
const path = require('path');

const FIREBASE_DB_URL      = 'https://school-duel-default-rtdb.europe-west1.firebasedatabase.app';
const FIREBASE_WEB_API_KEY = 'AIzaSyCGSqcQSKwU3JqcLfl7AXIIIbcShNOrjB8';
const OUTDIR = path.join(__dirname, '..', 'questionbank');

const ONLY = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : null;

// Dateiname aus dem Firebase-Pfad. Umkehrbar, damit mirror_push zurueckfindet.
const slug = s => String(s)
  .replace(/[äÄ]/g,'ae').replace(/[öÖ]/g,'oe').replace(/[üÜ]/g,'ue').replace(/ß/g,'ss')
  .replace(/[^A-Za-z0-9]+/g,'_').replace(/^_|_$/g,'');

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

async function main() {
  const username = readEnv('FIREBASE_USERNAME');
  const password = readEnv('FIREBASE_PASSWORD');
  const email = username
    ? username.toLowerCase().replace(/[^a-z0-9]/g,'') + '@schoolduel.game'
    : readEnv('FIREBASE_EMAIL');
  if (!email || !password) throw new Error('FIREBASE_USERNAME / FIREBASE_PASSWORD fehlen in .env');

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_WEB_API_KEY}`,
    { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ email, password, returnSecureToken: true }) });
  const auth = await res.json();
  if (!res.ok) throw new Error('Auth failed: ' + JSON.stringify(auth));

  const bank = await (await fetch(`${FIREBASE_DB_URL}/questionBank.json?auth=${auth.idToken}`)).json();
  if (!fs.existsSync(OUTDIR)) fs.mkdirSync(OUTDIR, { recursive: true });

  const index = [];
  let files = 0, total = 0, skippedJunk = 0;

  for (const [subject, subcats] of Object.entries(bank || {})) {
    for (const [subcategory, grades] of Object.entries(subcats || {})) {
      for (const [gradeKey, entry] of Object.entries(grades || {})) {
        const grade = gradeKey.replace(/^klasse/, '');
        if (ONLY && grade !== ONLY) continue;

        const raw = (entry && Array.isArray(entry.questions)) ? entry.questions
                  : (Array.isArray(entry) ? entry : null);
        if (!raw) continue;

        // Muell-Eintraege aus alten Importfehlern nicht mitspiegeln
        const questions = raw.filter(q => q && typeof q === 'object' && !Array.isArray(q)
                                          && typeof q.question === 'string');
        skippedJunk += raw.length - questions.length;
        if (!questions.length) continue;

        const name = `k${grade}__${slug(subject)}__${slug(subcategory)}.json`;
        fs.writeFileSync(path.join(OUTDIR, name), JSON.stringify(questions, null, 2), 'utf8');

        index.push({ file: name, grade, subject, subcategory, count: questions.length });
        files++; total += questions.length;
      }
    }
  }

  index.sort((a,b) => (parseInt(a.grade)-parseInt(b.grade)) || a.file.localeCompare(b.file));
  fs.writeFileSync(path.join(OUTDIR, '_index.json'), JSON.stringify(index, null, 2), 'utf8');

  console.log(`${files} Dateien, ${total} Fragen -> ${OUTDIR}`);
  if (skippedJunk) console.log(`${skippedJunk} Muell-Eintraege uebersprungen`);

  const byGrade = {};
  index.forEach(r => { byGrade[r.grade] = (byGrade[r.grade]||0) + r.count; });
  console.log('\nKlasse | Pfade | Fragen');
  Object.keys(byGrade).sort((a,b)=>parseInt(a)-parseInt(b)).forEach(g => {
    const n = index.filter(r=>r.grade===g).length;
    console.log(`  ${('K'+g).padEnd(5)}|${String(n).padStart(6)} |${String(byGrade[g]).padStart(7)}`);
  });
  console.log(`\n_index.json geschrieben (Zuordnung Datei <-> Firebase-Pfad).`);
}

main().catch(e => { console.error(e); process.exit(1); });
