# Fussball-Triage — Zwischenstand 10.8.2026

Ergebnis der Dubletten-Triage über alle drei `fussball_*`-Kataloge (1458 Verdachtspaare,
lockerer Modus von `check_dubletten.js`, von 6 Agenten einzeln beurteilt). Die
Auflösung wurde auf Wunsch des Nutzers VOR dem Schreiben gestoppt — an den
Katalogdateien in `questionbank_katalog/` ist noch **nichts geändert**.

## Inhalt der worklist-Dateien

Je Katalog eine Datei mit:

- `cluster` — bestätigte Dubletten als Cluster (per Union-Find aus den Paaren);
  je Cluster soll genau EINE Frage überleben, die übrigen Indizes bekommen
  Ersatzfragen. 0-basierte Indizes ins rohe JSON-Array.
- `kreuzverrat` — Frage/Erklärung verrät die Antwort einer anderen Frage
  (häufigstes Muster: Serien-Erklärungen zählen alle Siegjahre auf).
- `unsicher` — Zweifelsfälle der Triage.
- `sachfehler` (mittel/schwer) — inhaltliche Fehler, u. a.:
  - schwer 480/598: correct=Kopa, richtig ist Stanley Matthews (erster Ballon d'Or 1956)
  - mittel 120: Copa-América-Rekord veraltet (seit 2024 Argentinien, 16 Titel)
  - mittel 577: „Trainer mit drei CL-Vereinen" — sachlich falsch
  - mittel 224: „Welcher Verein gewann 1994 die WM-Trophäe?" — Brasilien ist kein Verein
  - schwer 111/318: Sieger und Gegner gefragt, korrekt markiert ist der Unterlegene

## Umfang

| Katalog | Cluster | zu ersetzen | Kreuzverrat | unsicher |
|---|---|---|---|---|
| fussball_leicht | 52 | 62 | 3 | 1 |
| fussball_mittel | 43 | 50 | 15 | 3 |
| fussball_schwer | 31 | 40 | 7 | 1 |

## Nächste Schritte

1. Auflösung: je Katalog EIN Agent (Konvergenzgefahr bei parallelen Agenten),
   Ersatzfragen mit den zwei Prüfungen (Antwort schon korrekt woanders?
   Schlüsselwort-Kollision?), correct-Position der ersetzten Frage beibehalten.
2. Danach Längenbalance: fussball_mittel (39/20/21/20, „längste" 33 %) und
   fussball_schwer (41/26/15/18, 33 %). fussball_leicht ist längenfertig (26/24/25/25).
3. QA-Gate, `catalog_push.js --apply`, `collect_replaced.js`, OFFENE_PUNKTE.

Dieser Ordner kann nach abgeschlossener Auflösung gelöscht werden.
