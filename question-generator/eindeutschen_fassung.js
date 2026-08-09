'use strict';
// Setzt die Nutzer-Entscheidung "deutsche Fassung" in den Anime-Katalogen um.
//
//   node eindeutschen_fassung.js          Probelauf, zeigt jede Aenderung
//   node eindeutschen_fassung.js --apply  schreibt
//
// Warum kein einfaches Suchen-und-Ersetzen: "Quirk" ist maskulin, "Macke"
// feminin. Ein blindes Ersetzen erzeugt "Welchen Macke hat Bakugo?". Die
// Muster unten fangen deshalb Artikel, Possessivpronomen und Fragewoerter
// mit ab - und sind BEWUSST geordnet: die langen, spezifischen zuerst,
// das nackte Wort zuletzt.
//
// Nach dem Lauf wird der Laengenrang jeder Frage nachgemessen. Namen in
// Optionen aendern die Zeichenzahl, und die Dateien liegen im Korridor -
// eine Verschiebung muss sichtbar werden.
const fs   = require('fs');
const path = require('path');

const REPO   = path.resolve(__dirname, '..');
const DIR    = path.join(REPO, 'questionbank_katalog');
const APPLY  = process.argv.includes('--apply');
const DATEIEN = ['anime_leicht', 'anime_mittel', 'anime_schwer'];

// Reihenfolge ist bedeutsam. \b vor "Quirk" reicht, weil Quirk rein
// lateinisch geschrieben ist - anders als bei Woertern mit Umlaut.
const REGELN = [
  // ── Quirk -> Macke, mit Genuswechsel maskulin -> feminin ──
  // Dativ zuerst, sonst greift die Akkusativregel zu frueh.
  [/\bseinem Quirk\b/g,         'seiner Macke'],
  [/\bihrem Quirk\b/g,          'ihrer Macke'],
  [/\bdem Quirk\b/g,            'der Macke'],
  [/\beinem Quirk\b/g,          'einer Macke'],
  [/\bdiesem Quirk\b/g,         'dieser Macke'],
  [/\bWelchen Quirk\b/g,        'Welche Macke'],
  [/\bden Quirk\b/g,            'die Macke'],
  [/\bDen Quirk\b/g,            'Die Macke'],
  [/\bder Quirk\b/g,            'die Macke'],
  [/\bDer Quirk\b/g,            'Die Macke'],
  [/\beinen Quirk\b/g,          'eine Macke'],
  [/\bein Quirk\b/g,            'eine Macke'],
  [/\bEin Quirk\b/g,            'Eine Macke'],
  [/\bseinen Quirk\b/g,         'seine Macke'],
  [/\bsein Quirk\b/g,           'seine Macke'],
  [/\bSein Quirk\b/g,           'Seine Macke'],
  [/\bihren Quirk\b/g,          'ihre Macke'],
  [/\bihr Quirk\b/g,            'ihre Macke'],
  [/\bdiesen Quirk\b/g,         'diese Macke'],
  [/\bdieser Quirk\b/g,         'diese Macke'],
  // Faelle, die im Bestand schon faelschlich feminin standen - jetzt korrekt
  [/\bWelche Quirk\b/g,         'Welche Macke'],
  [/\beine Quirk\b/g,           'eine Macke'],
  [/\bEine Quirk\b/g,           'Eine Macke'],
  [/\bseine Quirk\b/g,          'seine Macke'],
  [/\bdie Quirk\b/g,            'die Macke'],
  [/\bDie Quirk\b/g,            'Die Macke'],
  // Zusammensetzungen und Plural
  [/\bQuirk-Kategorien\b/g,     'Macken-Kategorien'],
  [/\bQuirk-Kategorie\b/g,      'Macken-Kategorie'],
  [/-Quirks\b/g,                '-Macken'],
  [/\bQuirks\b/g,               'Macken'],
  // Genitiv ohne Artikel ("Bakugos Quirk") und alles Uebrige
  [/\bQuirk\b/g,                'Macke'],

  // ── Bleach: die deutsche Fassung behaelt den japanischen Begriff ──
  [/\bSeelenrichterin\b/g,      'Shinigami'],
  [/\bSeelenrichter\b/g,        'Shinigami'],

  // ── Dragon Ball ──
  [/\bSuper[ -]Saiyan\b/g,      'Super-Saiyajin'],
  [/\bSaiyans\b/g,              'Saiyajin'],

  // ── My Hero Academia: eine Schreibweise fuer die Schurken-Organisation ──
  [/\bLeague of Villains\b/g,   'Liga der Schurken'],
  [/\bSchurkenliga\b/g,         'Liga der Schurken'],

  // ── Nachlese: Relativpronomen, die sich auf das jetzt feminine Wort
  // beziehen. Muss NACH allen Quirk-Regeln laufen. Der optionale Teil in
  // Anfuehrungszeichen faengt "die Macke 'Zero Gravity', der ..." mit ab.
  [/(\bMacke\b(?: '[^']*')?), der\b/g,  '$1, die'],
  [/(\bMacke\b(?: '[^']*')?), den\b/g,  '$1, die'],
  [/(\bMacke\b(?: '[^']*')?), dem\b/g,  '$1, der'],
  [/(\bMacken\b(?: '[^']*')?), der\b/g, '$1, die'],

  // ── Einzelfaelle, die kein Muster zuverlaessig fassen kann:
  // Genitiv nach "Besitzer", Zahlwort vor Plural, und zwei Pronomen, die
  // sich ueber eine Satzgrenze hinweg auf das jetzt feminine Wort beziehen.
  [/\bBesitzer die Macke\b/g,   'Besitzer der Macke'],
  [/\beiner der in One For All gespeicherten Macken\b/g,
                                'eine der in One For All gespeicherten Macken'],
  [/(war die Macke von Nana Shimura[^;]*;) er blieb\b/g, '$1 sie blieb'],
  [/(Wessen Macke war 'Float', bevor) er\b/g,           '$1 sie'],
];

const rang = q => {
  const L = (q.options || []).map(o => String(o).length);
  const m = L[q.correct];
  if (L.filter(x => x === m).length > 1) return 0;      // Gleichstand
  return L.filter(x => x > m).length + 1;
};

const ersetze = t => REGELN.reduce((s, [re, zu]) => s.replace(re, zu), String(t));

let gesamt = 0;
for (const name of DATEIEN) {
  const voll = path.join(DIR, name + '.json');
  const qs = JSON.parse(fs.readFileSync(voll, 'utf8'));
  const aenderungen = [];
  const rangwechsel = [];
  let n = 0;

  qs.forEach((q, i) => {
    const vorher = rang(q);
    const merke = (feld, alt, neu) => {
      if (alt !== neu) { aenderungen.push(`  Q${i} ${feld}\n     alt: ${alt}\n     neu: ${neu}`); n++; }
    };
    const nf = ersetze(q.question); merke('question', q.question, nf); q.question = nf;
    q.options = q.options.map((o, j) => { const x = ersetze(o); merke('option ' + j, o, x); return x; });
    const ne = ersetze(q.explanation || ''); merke('explanation', q.explanation || '', ne); q.explanation = ne;
    const nachher = rang(q);
    if (vorher !== nachher) rangwechsel.push(`  Q${i}: Rang ${vorher || 'Gleichstand'} -> ${nachher || 'Gleichstand'}`);
  });

  console.log(`\n═══ ${name}: ${n} Änderungen ═══`);
  aenderungen.forEach(a => console.log(a));
  if (rangwechsel.length) { console.log('  Rangwechsel:'); rangwechsel.forEach(r => console.log(r)); }
  else console.log('  Kein Rangwechsel.');
  gesamt += n;

  if (APPLY && n) fs.writeFileSync(voll, JSON.stringify(qs, null, 2) + '\n', 'utf8');
}

console.log(`\n${gesamt} Änderungen` + (APPLY ? ' geschrieben.' : ' (Probelauf).'));
