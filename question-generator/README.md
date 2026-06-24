# School Duel – Schulfragen-Generator

Generiert lehrplangerechte Multiple-Choice-Fragen (mit **Gemini** oder **Claude**) und
füllt damit deine Firebase-`questionBank`. Die App (`school-duel.html`) lädt Schulfragen
**automatisch** aus dieser Bank, bevor sie die KI live befragt – nach einem Lauf
haben also alle Spieler sofort fertige Fragen, ganz ohne eigenen API-Key.

## Voraussetzungen

- **Node.js 18 oder neuer** (für das eingebaute `fetch`). Prüfen mit `node --version`.
- **Ein API-Key**, je nach Anbieter:
  - **Gemini** (günstig/teils kostenlos – empfohlen für die Masse): <https://aistudio.google.com/app/apikey>
  - **Claude** (teurer, Top-Qualität): <https://console.anthropic.com/settings/keys>

Keine `npm install` nötig – das Script hat keine Abhängigkeiten.

## Anbieter & Kosten

| Anbieter | Modell | Kosten | wofür |
|---|---|---|---|
| `gemini` | gemini-2.5-flash | sehr günstig / Free-Tier | **Standard**, große Mengen |
| `claude` | claude-opus-4-8 | teuer (~5–12 ct/Charge) | wo Top-Qualität zählt |

Welcher Anbieter genutzt wird:
- mit `--provider gemini` oder `--provider claude` explizit wählen, **sonst**
- automatisch **Gemini**, falls ein `GEMINI_API_KEY` in der `.env` steht, andernfalls Claude.

## Einrichtung

1. Key hinterlegen:
   ```
   copy .env.example .env
   ```
   Dann `.env` öffnen und den/die echten Key(s) eintragen (du brauchst nur den
   für den Anbieter, den du nutzt).

## Verwendung

```bash
# Ein Fach, alle Klassen (5–12), 16 Fragen pro Thema → lokal + Firebase (Standard: Gemini)
node generate.js Mathematik

# Erst testen, OHNE in Firebase zu schreiben (nur ./output/):
node generate.js Mathematik --dry-run

# Anbieter erzwingen:
node generate.js Mathematik --provider gemini
node generate.js Mathematik --provider claude

# Anderes Modell:
node generate.js Mathematik --model gemini-2.5-pro

# Nur bestimmte Klassen:
node generate.js Mathematik --grades 5,6,7

# Mehr/weniger Fragen pro Kombination:
node generate.js Mathematik --count 24

# ALLE Fächer (groß – mit Gemini aber günstig):
node generate.js --all
```

## Import-Modus: fertige JSON-Dateien hochladen (ohne KI-Kosten)

Wenn du Fragen **woanders** erzeugt hast (z.B. von Claude/Opus direkt in Claude Code,
das über dein Abo läuft – nicht über die kostenpflichtige API), legst du sie als
JSON-Dateien in `./output/<Fach>/` ab und lädst sie ohne weitere KI-Kosten hoch:

```bash
# Alles aus ./output/ nach Firebase laden:
node generate.js --import

# Nur ein Fach importieren:
node generate.js Geschichte --import
```

Jede Datei muss dieses Format haben (genau wie die generierten Dateien):
```json
{
  "subject": "Geschichte",
  "subcategory": "Weltkriege",
  "grade": "9",
  "questions": [
    { "question": "…", "options": ["A","B","C","D"], "correct": 0, "explanation": "…", "topic": "…" }
  ]
}
```
Der Import meldet sich an, führt mit dem Firebase-Bestand zusammen (Duplikat-Schutz)
und macht **keine** KI-Anfragen – kostet also nichts beim Anbieter.

### Verfügbare Fächer
`Mathematik`, `Deutsch`, `Englisch`, `Geschichte`, `Biologie`, `Physik`, `Chemie`, `Allgemeinwissen`

## Was passiert?

Für jede Kombination **Klasse × Fach × Thema**:

1. Vorhandene Fragen werden aus Firebase geladen (Duplikat-Schutz, Fortsetzen möglich).
2. Claude erzeugt neue Fragen (2 Batches à 8 = 16 bei Standard).
3. Ergebnis wird gemerged und gespeichert:
   - **Lokal:** `./output/<Fach>/<Thema>_klasse<N>.json`
   - **Firebase:** `questionBank/<Fach>/<Thema>/klasse<N>`

Das Format pro Frage ist identisch zur App:
```json
{ "question": "…", "options": ["A","B","C","D"], "correct": 0, "explanation": "…", "topic": "…" }
```

## Empfohlener erster Lauf

```bash
node generate.js Mathematik --dry-run
```
Schau dir die Dateien in `./output/Mathematik/` an. Passt die Qualität, dann ohne
`--dry-run` laufen lassen, um Firebase zu füllen – danach Schritt für Schritt die
weiteren Fächer.
