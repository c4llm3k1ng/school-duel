# OCR-Proxy einrichten (Cloudflare Worker)

Ziel: Der Gemini-Schlüssel verschwindet aus Firebase und aus dem Browser. Die
Karteikarten-Erkennung läuft über einen kleinen, kostenlosen Server, der Login
und Tageslimits **serverseitig** prüft.

Dauer: etwa 15 Minuten. Kosten: keine (Gratis-Tarif, keine Kreditkarte nötig).

## 1. Cloudflare-Konto und Worker anlegen

1. Auf https://dash.cloudflare.com ein Konto anlegen (E-Mail genügt).
2. Links **Workers & Pages** → **Create** → **Create Worker**.
3. Namen vergeben, z. B. `school-duel-ocr` → **Deploy** (erst mal mit dem Beispielcode).
4. **Edit code** öffnen, den Beispielcode löschen und den kompletten Inhalt von
   `worker.js` aus diesem Ordner einfügen → **Deploy**.

## 2. KV-Speicher für die Tageszähler

1. Links **Storage & Databases** → **KV** → **Create a namespace**, Name z. B. `ocr-limits`.
2. Zurück zum Worker → **Settings** → **Bindings** → **Add** → **KV namespace**:
   - Variable name: `OCR_KV` (exakt so, der Code erwartet diesen Namen)
   - KV namespace: das eben angelegte auswählen
3. Speichern.

## 3. Frischen Gemini-Schlüssel als Secret hinterlegen

Wichtig: **Nicht den alten Schlüssel weiterverwenden** — der war bislang für
alle Angemeldeten lesbar. In https://aistudio.google.com einen neuen erzeugen
(und dort gleich auf die „Generative Language API" beschränken plus ein
Tageskontingent setzen — doppelter Boden).

1. Worker → **Settings** → **Variables and Secrets** → **Add**:
   - Type: **Secret**
   - Name: `GEMINI_API_KEY` (exakt so)
   - Value: der neue Schlüssel
2. Speichern.

## 4. Erlaubte Domains prüfen

In `worker.js` oben steht `ALLOWED_ORIGINS`. Dort muss die Domain stehen, unter
der die App läuft. Voreingetragen ist `https://c4llm3k1ng.github.io` — falls die
App woanders liegt, anpassen und neu deployen.

## 5. Worker-URL in die App eintragen

1. Die Worker-URL kopieren (steht oben im Worker-Dashboard, Form:
   `https://school-duel-ocr.<dein-name>.workers.dev`).
2. In `school-duel.html` die Konstante `OCR_PROXY_URL` (bei den anderen
   OCR-Konstanten) auf diese URL setzen.
3. Committen/pushen wie gewohnt — `sw.js` ist schon auf v62 erhöht.

## 6. Alten Schlüssel stilllegen

Erst wenn ein Foto über den Proxy erfolgreich erkannt wurde:

1. In der Firebase-Konsole unter `config` den Eintrag `geminiKey` **löschen**.
   (Achtung: Falls andere Funktionen der App den Zentralkey nutzen — z. B. die
   Fragen-Nachgenerierung — brauchen die ihn noch! Dann den alten Schlüssel in
   der Google-Konsole nur mit Kontingent + API-Beschränkung versehen statt ihn
   zu löschen, und den neuen ausschließlich im Worker verwenden.)
2. Den alten Schlüssel in https://aistudio.google.com widerrufen, sobald ihn
   nichts mehr benutzt.

## Was der Worker durchsetzt

| Regel | Wert | wo |
|---|---|---|
| Nur angemeldete Nutzer | Firebase-Token-Prüfung inkl. Signatur | `worker.js` |
| Limit je Nutzer und Tag | 20 Fotos (`LIMIT_PRO_NUTZER`) | serverseitig, unumgehbar |
| Limit für alle zusammen | 500 Fotos/Tag (`LIMIT_GLOBAL`) | harte Kostenbremse |
| Nur Karteikarten-Erkennung | Prompt liegt im Worker, Client schickt nur das Bild | kein Missbrauch als allgemeiner KI-Proxy |
| Bildgröße | max. ~1,8 MB nach Verkleinerung | `worker.js` |

Nutzer mit eigenem API-Schlüssel sind nicht betroffen — sie gehen weiter direkt
zu Google und zahlen selbst.

## Kosten im Blick

- Cloudflare Gratis-Tarif: 100.000 Worker-Aufrufe/Tag. Darüber wird **nichts
  berechnet** — der Worker liefert dann bis Mitternacht (UTC) Fehler. Kein
  Kostenrisiko.
- Die KV-Schreibgrenze des Gratis-Tarifs (1.000/Tag) begrenzt die Erkennung
  technisch auf ~500 Fotos/Tag — deckt sich mit `LIMIT_GLOBAL`.
- Die eigentlichen Kosten je Foto entstehen bei Gemini (Bruchteile eines
  Cents). 500 Fotos/Tag ≈ grob 1–2 € Obergrenze am Tag, real weit darunter.
