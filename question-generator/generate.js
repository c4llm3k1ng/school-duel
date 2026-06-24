#!/usr/bin/env node
/**
 * School Duel – Schulfragen-Generator
 * ------------------------------------
 * Generiert lehrplangerechte Multiple-Choice-Fragen mit Claude (Anthropic)
 * und schreibt sie:
 *   1) lokal nach  ./output/<Fach>/<Thema>_klasse<N>.json
 *   2) in deine Firebase questionBank  (questionBank/<Fach>/<Thema>/klasse<N>)
 *
 * Die App (school-duel.html) lädt Schulfragen automatisch aus dieser Bank,
 * BEVOR sie die KI live befragt – d.h. nach einem Lauf haben alle Nutzer
 * sofort fertige Fragen, ganz ohne eigenen API-Key.
 *
 * Voraussetzungen: Node 18+ (globales fetch). Keine npm-Abhängigkeiten.
 *
 * Nutzung:
 *   node generate.js Mathematik                 # ein Fach, Standardwerte
 *   node generate.js --subject Mathematik --count 16
 *   node generate.js --all                      # ALLE Fächer (Achtung: groß)
 *   node generate.js Mathematik --grades 5,6,7  # nur bestimmte Klassen
 *   node generate.js Mathematik --dry-run       # nur lokal, kein Firebase
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────
// Konfiguration
// ─────────────────────────────────────────────────────────────
const FIREBASE_DB_URL = 'https://school-duel-default-rtdb.europe-west1.firebasedatabase.app';
// Öffentlicher Web-API-Key des Firebase-Projekts (steht so auch im HTML der App)
const FIREBASE_WEB_API_KEY = 'AIzaSyCGSqcQSKwU3JqcLfl7AXIIIbcShNOrjB8';
const DEFAULT_MODELS  = { gemini: 'gemini-2.5-flash', claude: 'claude-opus-4-8' };
const BATCH_SIZE      = 8;     // Fragen pro API-Aufruf (wie in der App)
const DEFAULT_COUNT   = 16;    // Ziel-Fragen pro Kombination
const REQUEST_DELAY   = 1200;  // ms Pause zwischen API-Aufrufen (Rate-Limit-Schonung)
const MAX_ATTEMPTS    = 3;

// Spiegelt SUBCATEGORIES aus school-duel.html
const SUBCATEGORIES = {
  'Mathematik':      ['Allgemein','Kopfrechnen','Algebra','Geometrie','Bruchrechnung','Gleichungen','Statistik'],
  'Deutsch':         ['Allgemein','Grammatik','Rechtschreibung','Wortarten','Satzlehre','Literatur','Aufsatz'],
  'Englisch':        ['Allgemein','Vokabeln','Grammatik','Zeitformen','Leseverstehen','Phrasen & Redewendungen'],
  'Geschichte':      ['Allgemein','Antike','Mittelalter','Frühe Neuzeit','Industrialisierung','Weltkriege','Nachkriegszeit'],
  'Biologie':        ['Allgemein','Zellbiologie','Ökologie','Genetik','Evolution','Körper & Gesundheit','Botanik'],
  'Physik':          ['Allgemein','Mechanik','Elektrizität','Optik','Wärmelehre','Atomphysik'],
  'Chemie':          ['Allgemein','Atombau','Chem. Bindungen','Reaktionen','Säuren & Basen','Organische Chemie'],
  'Allgemeinwissen': ['Allgemein','Geographie','Sport','Musik & Kunst','Natur & Tiere','Technik','Essen & Kultur']
};
const ALL_GRADES = ['5','6','7','8','9','10','11','12'];

// ─────────────────────────────────────────────────────────────
// Hilfsfunktionen
// ─────────────────────────────────────────────────────────────

// Liest einen Wert aus Umgebungsvariable oder lokaler .env-Datei
function readEnv(name) {
  if (process.env[name]) return process.env[name].trim();
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const line = fs.readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .find(l => l.trim().startsWith(name));
    if (line) {
      const val = line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
      if (val && !/^(sk-ant-\.\.\.|AIza\.\.\.|dein)/i.test(val)) return val;
    }
  }
  return null;
}

// Lädt beide möglichen Keys
function loadKeys() {
  return {
    gemini: readEnv('GEMINI_API_KEY'),
    claude: readEnv('ANTHROPIC_API_KEY')
  };
}

// Firebase-Key-Sanitisierung (identisch zu qbPath() in der App)
const fbSafe = s => s.replace(/[.#$\[\]\/]/g, '_');
function qbPath(grade, subj, subcat) {
  return 'questionBank/' + fbSafe(subj) + '/' + fbSafe(subcat) + '/klasse' + grade;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Firebase-Anmeldung (E-Mail/Passwort → ID-Token via Identity Toolkit REST) ──
let _auth = { idToken: null, refreshToken: null, expiresAt: 0 };

async function fbSignIn(email, password) {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_WEB_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const d = await res.json();
  if (!res.ok) throw new Error('Login fehlgeschlagen: ' + (d?.error?.message || res.status));
  _auth = {
    idToken: d.idToken,
    refreshToken: d.refreshToken,
    expiresAt: Date.now() + (parseInt(d.expiresIn, 10) - 120) * 1000
  };
  return d.email;
}

async function fbRefresh() {
  const url = `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_WEB_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(_auth.refreshToken)
  });
  const d = await res.json();
  if (!res.ok) throw new Error('Token-Erneuerung fehlgeschlagen');
  _auth.idToken = d.id_token;
  _auth.refreshToken = d.refresh_token;
  _auth.expiresAt = Date.now() + (parseInt(d.expires_in, 10) - 120) * 1000;
}

// Liefert "?auth=TOKEN" (oder "" wenn nicht angemeldet); erneuert Token bei Ablauf
async function authQuery() {
  if (!_auth.idToken) return '';
  if (Date.now() > _auth.expiresAt) await fbRefresh();
  return '?auth=' + _auth.idToken;
}

// Meldet am Spiel-Account an (Benutzername+Passwort aus .env) oder bricht ab
async function loginOrExit() {
  const username = readEnv('FIREBASE_USERNAME');
  const password = readEnv('FIREBASE_PASSWORD');
  // App-Logik: Benutzername → interne E-Mail
  const email = username
    ? username.toLowerCase().replace(/[^a-z0-9]/g, '') + '@schoolduel.game'
    : readEnv('FIREBASE_EMAIL');
  if (!email || !password) {
    console.error('❌ Für den Firebase-Zugriff fehlt deine Anmeldung.');
    console.error('   Trage in die .env-Datei dein Spiel-Login ein:');
    console.error('   FIREBASE_USERNAME=deinBenutzername');
    console.error('   FIREBASE_PASSWORD=deinPasswort');
    process.exit(1);
  }
  try {
    const who = await fbSignIn(email, password);
    console.log('🔐 Angemeldet als ' + who + ' – Firebase-Zugriff bereit.\n');
  } catch (e) {
    console.error('❌ ' + e.message);
    console.error('   Prüfe FIREBASE_USERNAME / FIREBASE_PASSWORD in der .env.');
    process.exit(1);
  }
}

// Argumente parsen
function parseArgs(argv) {
  const args = { subject: null, all: false, count: DEFAULT_COUNT, grades: ALL_GRADES,
                 dryRun: false, provider: null, model: null, import: false, skipExisting: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') args.all = true;
    else if (a === '--import') args.import = true;
    else if (a === '--skip-existing') args.skipExisting = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--subject') args.subject = argv[++i];
    else if (a === '--count') args.count = parseInt(argv[++i], 10) || DEFAULT_COUNT;
    else if (a === '--grades') args.grades = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--provider') args.provider = (argv[++i] || '').toLowerCase();
    else if (a === '--model') args.model = argv[++i];
    else if (!a.startsWith('--')) args.subject = a;
  }
  // Anthropic auch als "anthropic" oder "opus" erlauben
  if (args.provider === 'anthropic' || args.provider === 'opus') args.provider = 'claude';
  return args;
}

// ─────────────────────────────────────────────────────────────
// Claude-Aufruf  (Prompt identisch zur App, Modell = Opus)
// ─────────────────────────────────────────────────────────────
async function fetchBatch(cfg, grade, subj, subcat, attempt = 1) {
  const subcatLine = subcat && subcat !== 'Allgemein' ? `- Themenbereich: ${subcat}\n` : '';
  const prompt = `Du bist ein Lehrer für deutsche Schulen. Erstelle ${BATCH_SIZE} Multiple-Choice-Quizfragen:
- Klassenstufe: ${grade}. Klasse
- Fach: ${subj}
${subcatLine}- Schwierigkeit: gemischt (variiere leicht/mittel/schwer über die ${BATCH_SIZE} Fragen)

Regeln: 4 Antwortoptionen (A-D), nur eine korrekt. Lehrplangerecht für die ${grade}. Klasse. Kurze, lehrreiche Erklärung. Themen abwechslungsreich, keine Wiederholungen.
WICHTIG: Das Quiz ist reiner Text OHNE Bilder. Stelle KEINE Fragen, die sich auf eine Abbildung, ein Bild, eine Grafik, ein Diagramm, eine Skizze oder „die folgende Figur" beziehen. Jede Frage muss allein aus dem Text vollständig beantwortbar sein.
Antworte NUR mit einem JSON-Array ohne Markdown:
[{"question":"...","options":["A","B","C","D"],"correct":0,"explanation":"...","topic":"..."}]
correct = 0-basierter Index der richtigen Antwort.`;

  try {
    let text;
    if (cfg.provider === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent?key=${cfg.apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 8192 } })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err?.error?.message || ('Gemini-Fehler ' + res.status);
        if (attempt < MAX_ATTEMPTS && (res.status >= 500 || res.status === 429)) {
          await sleep(1500 * attempt);
          return fetchBatch(cfg, grade, subj, subcat, attempt + 1);
        }
        throw new Error(msg);
      }
      const data = await res.json();
      text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (!text) throw new Error('Leere Antwort von Gemini');
    } else {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': cfg.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: cfg.model,
          max_tokens: 3500,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err?.error?.message || ('Anthropic-Fehler ' + res.status);
        if (attempt < MAX_ATTEMPTS && (res.status >= 500 || res.status === 429)) {
          await sleep(1500 * attempt);
          return fetchBatch(cfg, grade, subj, subcat, attempt + 1);
        }
        throw new Error(msg);
      }
      const data = await res.json();
      text = (data.content || []).map(i => i.text || '').join('');
    }

    const cleaned = text.trim().replace(/```json|```/g, '').trim();
    const start = cleaned.indexOf('['), end = cleaned.lastIndexOf(']');
    const jsonStr = (start !== -1 && end !== -1) ? cleaned.slice(start, end + 1) : cleaned;
    const parsed = JSON.parse(jsonStr);
    return parsed
      .filter(q => q && q.question && Array.isArray(q.options) && q.options.length === 4)
      .map(q => ({
        question: String(q.question),
        options: q.options.map(String),
        correct: Math.max(0, Math.min(3, parseInt(q.correct, 10) || 0)),
        explanation: String(q.explanation || ''),
        topic: String(q.topic || subcat)
      }));
  } catch (e) {
    if (attempt < MAX_ATTEMPTS) {
      await sleep(1500 * attempt);
      return fetchBatch(cfg, grade, subj, subcat, attempt + 1);
    }
    throw e;
  }
}

// ─────────────────────────────────────────────────────────────
// Firebase REST  (GET bestehende + merge + PUT)
// ─────────────────────────────────────────────────────────────
async function fbLoad(grade, subj, subcat) {
  const url = FIREBASE_DB_URL + '/' + qbPath(grade, subj, subcat) + '.json' + (await authQuery());
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return (data && Array.isArray(data.questions)) ? data.questions : [];
}

async function fbSave(grade, subj, subcat, questions) {
  const url = FIREBASE_DB_URL + '/' + qbPath(grade, subj, subcat) + '.json' + (await authQuery());
  const body = {
    questions,
    subject: subj,
    subcategory: subcat,
    grade,
    updatedAt: Date.now()
  };
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error('Firebase PUT fehlgeschlagen (' + res.status + '): ' + t.slice(0, 120));
  }
}

// ─────────────────────────────────────────────────────────────
// Lokales Speichern
// ─────────────────────────────────────────────────────────────
function saveLocal(grade, subj, subcat, questions) {
  const dir = path.join(__dirname, 'output', fbSafe(subj));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, fbSafe(subcat) + '_klasse' + grade + '.json');
  fs.writeFileSync(file, JSON.stringify({ subject: subj, subcategory: subcat, grade, questions }, null, 2), 'utf8');
  return path.relative(__dirname, file);
}

// ─────────────────────────────────────────────────────────────
// Eine Kombination verarbeiten
// ─────────────────────────────────────────────────────────────
async function processCombo(cfg, grade, subj, subcat, targetCount, dryRun, skipExisting) {
  // Bestehende Fragen (Firebase) laden, damit wir Duplikate vermeiden / fortsetzen
  let existing = [];
  if (!dryRun) {
    try { existing = await fbLoad(grade, subj, subcat) || []; } catch (e) { existing = []; }
  }
  // Bei --skip-existing: Kombinationen mit genug Fragen überspringen (keine KI-Kosten)
  if (skipExisting && existing.length >= targetCount) {
    return { added: 0, total: existing.length, skipped: true };
  }
  const seen = new Set(existing.map(q => q.question));
  const collected = [];

  const batches = Math.ceil(targetCount / BATCH_SIZE);
  for (let b = 0; b < batches; b++) {
    const fresh = await fetchBatch(cfg, grade, subj, subcat);
    for (const q of fresh) {
      if (!seen.has(q.question)) { seen.add(q.question); collected.push(q); }
    }
    if (b < batches - 1) await sleep(REQUEST_DELAY);
  }

  const merged = [...existing, ...collected];

  // Lokal immer speichern
  const localFile = saveLocal(grade, subj, subcat, merged);

  // Firebase nur wenn nicht dry-run
  if (!dryRun) await fbSave(grade, subj, subcat, merged);

  return { added: collected.length, total: merged.length, localFile };
}

// ─────────────────────────────────────────────────────────────
// Import-Modus: fertige JSON-Dateien aus ./output/ nach Firebase laden
// (keine KI-Kosten – nur Upload. Ideal für hier mit Opus erzeugte Fragen.)
// ─────────────────────────────────────────────────────────────
async function runImport(args) {
  const root = path.join(__dirname, 'output');
  if (!fs.existsSync(root)) {
    console.error('❌ Kein ./output/-Ordner gefunden. Lege dort JSON-Dateien ab oder generiere erst Fragen.');
    process.exit(1);
  }

  // Dateien sammeln (optional auf ein Fach eingeschränkt)
  let subjDirs = fs.readdirSync(root).filter(d => {
    try { return fs.statSync(path.join(root, d)).isDirectory(); } catch { return false; }
  });
  if (args.subject && SUBCATEGORIES[args.subject]) {
    const want = fbSafe(args.subject);
    subjDirs = subjDirs.filter(d => d === want);
  }
  const files = [];
  for (const d of subjDirs) {
    const dir = path.join(root, d);
    for (const f of fs.readdirSync(dir)) {
      if (f.toLowerCase().endsWith('.json')) files.push(path.join(dir, f));
    }
  }

  console.log('═══════════════════════════════════════════════');
  console.log('  School Duel – Import (JSON → Firebase)');
  console.log('═══════════════════════════════════════════════');
  console.log('  Quelle:   ./output/' + (args.subject ? fbSafe(args.subject) + '/' : ''));
  console.log('  Dateien:  ' + files.length);
  console.log('═══════════════════════════════════════════════\n');

  if (!files.length) { console.error('Keine JSON-Dateien gefunden.'); process.exit(1); }

  await loginOrExit();

  let done = 0, addedSum = 0, failed = 0;
  for (const file of files) {
    done++;
    const rel = path.relative(__dirname, file);
    process.stdout.write('⏳ [' + done + '/' + files.length + '] ' + rel + ' … ');
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      const { subject, subcategory, grade, questions } = raw;
      if (!subject || !subcategory || !grade || !Array.isArray(questions)) {
        throw new Error('Datei hat kein {subject, subcategory, grade, questions[]}');
      }
      // Mit Firebase-Bestand zusammenführen (Duplikat-Schutz über Fragetext)
      const existing = (await fbLoad(grade, subject, subcategory)) || [];
      const seen = new Set(existing.map(q => q.question));
      const toAdd = questions.filter(q => q && q.question && !seen.has(q.question));
      const merged = [...existing, ...toAdd];
      await fbSave(grade, subject, subcategory, merged);
      addedSum += toAdd.length;
      console.log('✓ +' + toAdd.length + ' (Pool: ' + merged.length + ')');
    } catch (e) {
      failed++;
      console.log('✗ FEHLER: ' + e.message);
    }
  }

  console.log('\n═══════════════════════════════════════════════');
  console.log('  Import fertig. Neue Fragen: ' + addedSum + ' | Dateien ok: ' + (done - failed) + '/' + done);
  console.log('═══════════════════════════════════════════════');
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Import-Modus braucht keine KI – nur Upload
  if (args.import) return runImport(args);

  const keys = loadKeys();

  // Anbieter bestimmen: --provider gewinnt, sonst Gemini (günstig) falls Key da, sonst Claude
  let provider = args.provider;
  if (!provider) provider = keys.gemini ? 'gemini' : 'claude';
  if (provider !== 'gemini' && provider !== 'claude') {
    console.error('❌ Unbekannter Anbieter: ' + provider + ' (erlaubt: gemini, claude)');
    process.exit(1);
  }

  const apiKey = keys[provider];
  if (!apiKey) {
    const envName = provider === 'gemini' ? 'GEMINI_API_KEY' : 'ANTHROPIC_API_KEY';
    const sample  = provider === 'gemini' ? 'AIza...' : 'sk-ant-...';
    console.error('❌ Kein ' + provider + '-API-Key gefunden.');
    console.error('   Trage ihn in die .env-Datei ein:');
    console.error('   ' + envName + '=' + sample);
    process.exit(1);
  }

  const cfg = { provider, apiKey, model: args.model || DEFAULT_MODELS[provider] };

  // Welche Fächer?
  let subjects;
  if (args.all) {
    subjects = Object.keys(SUBCATEGORIES);
  } else if (args.subject && SUBCATEGORIES[args.subject]) {
    subjects = [args.subject];
  } else {
    console.error('❌ Bitte ein gültiges Fach angeben, z.B.:  node generate.js Mathematik');
    console.error('   Verfügbare Fächer: ' + Object.keys(SUBCATEGORIES).join(', '));
    console.error('   Oder --all für alle Fächer.');
    process.exit(1);
  }

  const grades = args.grades;
  let totalCombos = 0;
  subjects.forEach(s => { totalCombos += SUBCATEGORIES[s].length * grades.length; });

  console.log('═══════════════════════════════════════════════');
  console.log('  School Duel – Schulfragen-Generator');
  console.log('═══════════════════════════════════════════════');
  console.log('  Anbieter:     ' + provider + '  (Modell: ' + cfg.model + ')');
  console.log('  Fächer:       ' + subjects.join(', '));
  console.log('  Klassen:      ' + grades.join(', '));
  console.log('  Pro Kombi:    ' + args.count + ' Fragen');
  console.log('  Kombinationen:' + totalCombos);
  console.log('  Ziel:         ' + (args.dryRun ? 'NUR lokal (--dry-run)' : 'lokal + Firebase'));
  console.log('═══════════════════════════════════════════════\n');

  // Für Firebase-Schreibzugriff: am Spiel-Account anmelden (nicht bei --dry-run nötig)
  if (!args.dryRun) await loginOrExit();

  let done = 0, addedSum = 0, failed = 0, skipped = 0;
  const t0 = Date.now();

  for (const subj of subjects) {
    for (const subcat of SUBCATEGORIES[subj]) {
      for (const grade of grades) {
        done++;
        const label = `[${done}/${totalCombos}] ${subj} · ${subcat} · Klasse ${grade}`;
        process.stdout.write('⏳ ' + label + ' … ');
        try {
          const r = await processCombo(cfg, grade, subj, subcat, args.count, args.dryRun, args.skipExisting);
          if (r.skipped) { skipped++; console.log(`⏭ schon voll (Pool: ${r.total})`); }
          else { addedSum += r.added; console.log(`✓ +${r.added} (Pool: ${r.total})`); }
        } catch (e) {
          failed++;
          console.log('✗ FEHLER: ' + e.message);
        }
      }
    }
  }

  const mins = ((Date.now() - t0) / 60000).toFixed(1);
  console.log('\n═══════════════════════════════════════════════');
  console.log(`  Fertig in ${mins} min`);
  console.log(`  Neue Fragen gesamt: ${addedSum}`);
  console.log(`  Kombinationen ok:   ${done - failed - skipped}/${done}`);
  if (skipped) console.log(`  Übersprungen (voll):${skipped}`);
  if (failed) console.log(`  Fehlgeschlagen:     ${failed}`);
  console.log('  Lokale Dateien:     ./output/');
  if (!args.dryRun) console.log('  Firebase:           questionBank/ aktualisiert ✓');
  console.log('═══════════════════════════════════════════════');
}

main().catch(e => { console.error('\n💥 Unerwarteter Fehler:', e); process.exit(1); });
