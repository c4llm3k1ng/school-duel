'use strict';
// Prueft, ob der Inhalt einer Datei zu ihrer Kategorie passt.
//
//   node check_kategorien.js            Kurzuebersicht der Verdachtsfaelle
//   node check_kategorien.js --alle     Tabelle aller 210 Dateien
//   node check_kategorien.js --csv      maschinenlesbar
//
// Anlass: Mehrfach fiel nur zufaellig auf, dass eine Datei etwas anderes
// enthaelt, als ihr Name sagt - k11__Mathematik__Algebra besteht ueberwiegend
// aus Analysis, k11__Biologie__Zellbiologie fast vollstaendig aus
// Neurobiologie, k5__Allgemeinwissen__Technik aus Chemie und Weltall,
// k5__Geschichte__Fruehe_Neuzeit zur Haelfte aus Antike. Wer im Spiel eine
// Kategorie waehlt, bekommt dann etwas anderes.
//
// Das Signal ist das topic-Feld jeder Frage. Es ist bei allen 8281 Fragen
// gefuellt und beschreibt das Thema feiner als der Dateiname. Dieses Skript
// stellt beides nebeneinander; die Bewertung bleibt beim Menschen, weil ein
// Themenname wie "Burg" zu "Mittelalter" passt, ohne es zu wiederholen.
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const DIR  = path.join(REPO, 'questionbank');
const ALLE = process.argv.includes('--alle');
const CSV  = process.argv.includes('--csv');

const norm = s => String(s).toLowerCase()
  .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')
  .replace(/[^a-z0-9]/g, '');

const idxRaw = JSON.parse(fs.readFileSync(path.join(DIR, '_index.json'), 'utf8'));
const eintraege = Array.isArray(idxRaw) ? idxRaw : Object.values(idxRaw);

// Welche Unterkategorien gibt es je Fach? Das ist die Taxonomie, gegen die
// geprueft wird - sie stammt aus dem Bestand selbst, nicht aus einer Annahme.
const subsProFach = new Map();
for (const e of eintraege) {
  if (!subsProFach.has(e.subject)) subsProFach.set(e.subject, new Set());
  subsProFach.get(e.subject).add(e.subcategory);
}

const zeilen = [];
for (const e of eintraege) {
  const p = path.join(DIR, e.file);
  if (!fs.existsSync(p)) continue;
  const qs = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!qs.length) continue;

  const themen = new Map();
  qs.forEach(q => { const t = String(q.topic || '-').trim(); themen.set(t, (themen.get(t) || 0) + 1); });
  const sortiert = [...themen.entries()].sort((a, b) => b[1] - a[1]);

  // Das entscheidende Signal: Zeigt ein Thema auf eine ANDERE Unterkategorie,
  // die es im selben Fach tatsaechlich gibt?
  //
  // Die blosse Wortuebereinstimmung mit dem eigenen Namen ist als Mass
  // unbrauchbar - "Multiplikation" unter Mathematik/Allgemein ist voellig
  // richtig, faellt aber durch. Umgekehrt ist "Elektrizitaet" unter
  // Physik/Mechanik eindeutig falsch, und zwar erkennbar daran, dass
  // "Elektrizitaet" anderswo eine eigene Unterkategorie ist. Die Taxonomie
  // der Bank pruefen wir also gegen sich selbst.
  const nSub = norm(e.subcategory), nSubj = norm(e.subject);
  const fremde = new Map();
  let eigen = 0;
  for (const [t, n] of sortiert) {
    const nt = norm(t);
    if (!nt) continue;
    if (nt.includes(nSub) || nSub.includes(nt)) { eigen += n; continue; }
    // Passt das Thema zu einer anderen Unterkategorie desselben Fachs?
    const ziel = [...subsProFach.get(e.subject) || []].find(s => {
      const ns = norm(s);
      return ns !== nSub && (nt === ns || nt.includes(ns) || ns.includes(nt));
    });
    if (ziel) fremde.set(ziel, (fremde.get(ziel) || 0) + n);
  }
  const fremdN = [...fremde.values()].reduce((a, b) => a + b, 0);

  zeilen.push({
    datei: e.file.replace('.json', ''),
    fach: e.subject, unter: e.subcategory, klasse: e.grade,
    n: qs.length,
    quote: Math.round(eigen / qs.length * 100),
    fremdN, fremdAnteil: Math.round(fremdN / qs.length * 100),
    fremde: [...fremde.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => k + '(' + v + ')').join(', '),
    top: sortiert.slice(0, 6).map(([t, n]) => t + '(' + n + ')').join(', '),
  });
}

zeilen.sort((a, b) => b.fremdAnteil - a.fremdAnteil || b.n - a.n);

if (CSV) {
  console.log('datei;fach;unterkategorie;klasse;fragen;fremdanteil;zeigt_auf;themen');
  zeilen.forEach(z => console.log([z.datei, z.fach, z.unter, z.klasse, z.n, z.fremdAnteil, z.fremde, z.top].join(';')));
  process.exit(0);
}

const verdacht = zeilen.filter(z => z.fremdN > 0);
const zeige = ALLE ? zeilen : verdacht;
console.log(`${zeilen.length} Dateien geprueft. ${verdacht.length} enthalten Fragen, deren Thema auf eine ANDERE`);
console.log(`Unterkategorie desselben Fachs zeigt - insgesamt ${verdacht.reduce((s, z) => s + z.fremdN, 0)} Fragen.\n`);
console.log('Das ist ein Verdacht, kein Urteil: "Kraefte" kann in Mechanik und in Allgemein');
console.log('richtig stehen. Aber es zeigt, wo man hinsehen sollte.\n');

zeige.forEach(z => {
  console.log(`${String(z.fremdAnteil).padStart(3)}%  ${z.datei.padEnd(38)} ${String(z.n).padStart(4)}F  [${z.fach} / ${z.unter}]`);
  if (z.fremde) console.log(`      zeigt auf: ${z.fremde}`);
  console.log(`      Themen:    ${z.top}`);
});
