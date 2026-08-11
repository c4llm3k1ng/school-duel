# Fussball-Triage — Stand 11.8.2026

Ergebnis der Dubletten-Triage über alle drei `fussball_*`-Kataloge (1458 Verdachtspaare,
lockerer Modus von `check_dubletten.js`, von 6 Agenten einzeln beurteilt) und der
teilweise durchgeführten Auflösung.

## Fortschritt der Auflösung

| Katalog | Cluster erledigt | Ersetzungen | Rest |
|---|---|---|---|
| fussball_leicht | **40 von 52** | 48 | 12 Cluster |
| fussball_mittel | **0 von 43** | 0 | 43 Cluster |
| fussball_schwer | **25 von 31** | 36 | 6 Cluster |

Die Auflösungs-Agenten wurden zweimal unterbrochen (einmal Guthaben aufgebraucht,
einmal auf Nutzerwunsch). `fussball_mittel` wurde dabei nie erreicht — die Datei ist
unverändert.

**Noch offene Cluster** (0-basierte Indizes):

- **leicht:** 332/483/617 · 334/396 · 348/488/559 · 372/484 · 397/519 · 408/593 ·
  458/635 · 486/622 · 526/546 · 532/620 · 539/645 · 560/629
- **schwer:** 216/467 · 295/491 · 298/488/612 · 305/371 · 313/471 · **480/598**
  (Ballon-d'Or-Sachfehler, siehe unten — noch NICHT behoben)
- **mittel:** alle 43

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

Die Cluster-Einträge zeigen den Fragetext-Stand der Triage. Wo bereits ersetzt wurde,
stimmt er nicht mehr mit der Datei überein — die Indizes bleiben gültig, weil Anzahl
und Reihenfolge erhalten werden.

## Messwerte nach der Teilauflösung

    Katalog            Rang 1/2/3/4  „längste"   streng. Dublettencheck
    fussball_leicht     26/24/25/24     25 %      0 Verdachtsfälle
    fussball_mittel     39/20/21/20     33 %      12 Verdachtsfälle
    fussball_schwer     39/25/16/20     32 %      2 Verdachtsfälle

QA-Gate (`check_questions.js`): 7 Befunde, alle schon vor der Auflösung vorhanden —
es kam keiner hinzu, ein exaktes Dublettenpaar in schwer verschwand.

## Nächste Schritte

1. Auflösung fortsetzen: je Katalog EIN Agent (parallele Agenten konvergieren auf
   dieselben Ersatzfragen), Ersatzfragen mit den zwei Prüfungen (Antwort schon
   korrekt woanders? Schlüsselwort-Kollision?), correct-Position der ersetzten Frage
   beibehalten, blockweise zurückschreiben.
2. Danach Längenbalance: fussball_mittel (39/20/21/20) und fussball_schwer
   (39/25/16/20). fussball_leicht ist längenfertig.
3. QA-Gate, `catalog_push.js --apply`, `collect_replaced.js`, OFFENE_PUNKTE.

Dieser Ordner kann nach abgeschlossener Auflösung gelöscht werden.
