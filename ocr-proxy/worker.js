// OCR-Proxy fuer School Duel — Cloudflare Worker
//
// Zweck: Der Gemini-API-Schluessel verlaesst nie diesen Worker. Die App schickt
// nur das Karteikarten-Foto (Base64) plus das Firebase-Login-Token; der Worker
// prueft das Token, zaehlt serverseitige Tageslimits und ruft erst dann Gemini.
//
// Warum der Prompt HIER liegt und nicht vom Client kommt: Duerfte der Client
// den Prompt mitschicken, waere der Worker ein offener Gemini-Proxy fuer
// beliebige Zwecke. So kann er ausschliesslich Karteikarten lesen.
//
// Einrichtung (einmalig, siehe ANLEITUNG.md):
//   1. KV-Namespace "OCR_KV" anlegen und an den Worker binden
//   2. Secret GEMINI_API_KEY setzen (frischen Schluessel verwenden!)
//   3. Unten ALLOWED_ORIGINS an die eigene App-Domain anpassen

const FIREBASE_PROJECT = 'school-duel';

// Nur diese Origins duerfen den Worker aus dem Browser aufrufen.
const ALLOWED_ORIGINS = [
  'https://c4llm3k1ng.github.io',
  'http://localhost:8080', // lokales Testen; bei Bedarf entfernen
];

const LIMIT_PRO_NUTZER = 20;   // Fotos je Nutzer und Tag (serverseitig, unumgehbar)
const LIMIT_GLOBAL     = 500;  // Fotos insgesamt je Tag - die harte Kostenbremse.
                               // Achtung: KV im Gratis-Tarif erlaubt 1000
                               // Schreibvorgaenge/Tag; jedes Foto braucht zwei
                               // (Nutzer- + Globalzaehler). 500 ist daher auch
                               // die technische Obergrenze im Gratis-Tarif.

const GEMINI_MODEL = 'gemini-2.5-flash';

// Wortgleich mit OCR_PROMPT in school-duel.html. Aenderungen dort nachziehen.
const OCR_PROMPT = `Du bekommst das Foto einer oder mehrerer handgeschriebener Karteikarten auf Deutsch.

AUFGABE
1. Lies die Handschrift so genau wie möglich.
2. Erkenne, wie viele einzelne Karten bzw. Frage-Antwort-Paare auf dem Bild sind.
3. Mache aus jeder Karte eine Multiple-Choice-Frage mit genau vier Optionen.

ZWEI FÄLLE
- Stehen auf der Karte bereits vier Antwortmöglichkeiten (z.B. a/b/c/d) und ist eine als richtig markiert (unterstrichen, angekreuzt, abgehakt): Übernimm sie WORTGETREU. Erfinde nichts dazu.
- Steht nur eine Antwort da: Übernimm sie als richtige Antwort und erfinde drei falsche dazu.

REGELN FÜR ERFUNDENE FALSCHE ANTWORTEN
- Sie müssen eindeutig falsch sein. Prüfe jede: Wenn sie auch zutreffen könnte, ist die Frage unlösbar.
- Sie müssen ungefähr gleich lang sein wie die richtige Antwort. Die richtige Antwort darf nicht daran erkennbar sein, dass sie mehr Text hat.
- Keine Option darf sich selbst entlarven ("gibt es nicht", offensichtlich Absurdes neben ernsthaften Antworten).
- Klammerzusätze entweder bei allen vier Optionen oder bei keiner. Trägt nur die richtige eine Klammer, verrät das die Antwort.
- Gute falsche Antworten sind typische Verwechslungen und häufige Fehler, keine Fantasiebegriffe.

WEITERES
- Setze "correct" auf den 0-basierten Index der richtigen Antwort und variiere ihn über die Karten.
- "explanation": ein kurzer Satz, warum die Antwort richtig ist. Steht auf der Karte selbst eine Begründung, nimm diese.
- Echte Umlaute verwenden (ä ö ü ß), niemals ae/oe/ue/ss.
- Ist eine Stelle schwer zu lesen, rate trotzdem plausibel und trage sie in "unsicher" ein.
- "unsicher": Liste der Wörter, bei denen du dir beim Lesen nicht sicher warst. Leeres Array, wenn alles klar war.
- "erfunden": true, wenn du die falschen Antworten selbst erzeugt hast, false wenn sie auf der Karte standen.

Antworte NUR mit einem JSON-Array, ohne Markdown und ohne Vorrede:
[{"question":"...","options":["...","...","...","..."],"correct":0,"explanation":"...","topic":"...","unsicher":["..."],"erfunden":true}]

Ist auf dem Bild keine lesbare Karteikarte zu erkennen, antworte mit: []`;

// ---------------------------------------------------------------------------

function corsHeaders(origin) {
  const ok = ALLOWED_ORIGINS.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function antwort(origin, status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

// Firebase-ID-Token pruefen: Signatur gegen Googles oeffentliche Zertifikate,
// dazu Aussteller, Zielprojekt und Ablaufzeit. Gibt die Nutzer-ID zurueck.
let _certCache = { certs: null, bis: 0 };
async function firebaseUidAusToken(token) {
  const teile = token.split('.');
  if (teile.length !== 3) throw new Error('Kein JWT');
  const b64urlJson = (s) =>
    JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))));
  const header = b64urlJson(teile[0]);
  const payload = b64urlJson(teile[1]);

  const jetzt = Math.floor(Date.now() / 1000);
  if (payload.exp <= jetzt) throw new Error('Token abgelaufen');
  if (payload.aud !== FIREBASE_PROJECT) throw new Error('Falsches Projekt');
  if (payload.iss !== 'https://securetoken.google.com/' + FIREBASE_PROJECT) throw new Error('Falscher Aussteller');
  if (!payload.sub) throw new Error('Keine Nutzer-ID');

  if (!_certCache.certs || _certCache.bis < Date.now()) {
    const r = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
    if (!r.ok) throw new Error('Zertifikate nicht abrufbar');
    const cacheControl = r.headers.get('cache-control') || '';
    const maxAge = parseInt((cacheControl.match(/max-age=(\d+)/) || [])[1] || '3600', 10);
    _certCache = { certs: await r.json(), bis: Date.now() + maxAge * 1000 };
  }
  const pem = _certCache.certs[header.kid];
  if (!pem) throw new Error('Unbekannte Schluessel-ID');

  // PEM-Zertifikat -> oeffentlicher Schluessel
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '')), c => c.charCodeAt(0));
  // Aus dem X.509-Zertifikat den SubjectPublicKeyInfo-Block extrahieren waere
  // muehsam - WebCrypto kann aber direkt mit dem Zertifikat nichts anfangen.
  // Stattdessen: Signaturpruefung ueber die im Zertifikat enthaltene RSA-Key-
  // Struktur, die WebCrypto als 'spki' nur nach Extraktion akzeptiert.
  const spki = extrahiereSpki(der);
  const key = await crypto.subtle.importKey('spki', spki, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const daten = new TextEncoder().encode(teile[0] + '.' + teile[1]);
  const sig = Uint8Array.from(atob(teile[2].replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  const gueltig = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, daten);
  if (!gueltig) throw new Error('Signatur ungueltig');
  return payload.sub;
}

// Minimaler ASN.1-Spaziergang: findet den SubjectPublicKeyInfo im Zertifikat
// (die erste BIT-STRING-Struktur nach der Algorithmus-Kennung rsaEncryption).
function extrahiereSpki(der) {
  const RSA_OID = [0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01];
  for (let i = 0; i < der.length - RSA_OID.length; i++) {
    if (RSA_OID.every((b, j) => der[i + j] === b)) {
      // Rueckwaerts zum umschliessenden SEQUENCE-Header des SPKI laufen
      for (let s = i - 1; s >= Math.max(0, i - 8); s--) {
        if (der[s] === 0x30) {
          const { laenge, kopf } = asn1Laenge(der, s + 1);
          const gesamt = 1 + kopf + laenge;
          const kandidat = der.slice(s, s + gesamt);
          if (s + gesamt <= der.length && gesamt > RSA_OID.length + 20) return kandidat;
        }
      }
    }
  }
  throw new Error('SPKI nicht gefunden');
}
function asn1Laenge(der, pos) {
  const b = der[pos];
  if (b < 0x80) return { laenge: b, kopf: 1 };
  const n = b & 0x7f;
  let l = 0;
  for (let i = 1; i <= n; i++) l = (l << 8) | der[pos + i];
  return { laenge: l, kopf: 1 + n };
}

// Tageszaehler in KV. Gibt { erlaubt, rest } zurueck und zaehlt bei Erlaubnis hoch.
async function kontingentVerbrauchen(env, uid) {
  const tag = new Date().toISOString().slice(0, 10);
  const kU = 'u:' + uid + ':' + tag, kG = 'g:' + tag;
  const [nU, nG] = await Promise.all([env.OCR_KV.get(kU), env.OCR_KV.get(kG)]);
  const zU = parseInt(nU || '0', 10), zG = parseInt(nG || '0', 10);
  if (zG >= LIMIT_GLOBAL) return { erlaubt: false, grund: 'Tagesbudget der App erschöpft. Morgen wieder!' };
  if (zU >= LIMIT_PRO_NUTZER) return { erlaubt: false, grund: 'Dein Tageslimit ist erreicht. Morgen wieder!' };
  await Promise.all([
    env.OCR_KV.put(kU, String(zU + 1), { expirationTtl: 172800 }),
    env.OCR_KV.put(kG, String(zG + 1), { expirationTtl: 172800 }),
  ]);
  return { erlaubt: true, rest: LIMIT_PRO_NUTZER - zU - 1 };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (request.method !== 'POST') return antwort(origin, 405, { error: 'Nur POST' });

    // 1. Login pruefen
    const auth = request.headers.get('Authorization') || '';
    if (!auth.startsWith('Bearer ')) return antwort(origin, 401, { error: 'Anmeldung erforderlich' });
    let uid;
    try { uid = await firebaseUidAusToken(auth.slice(7)); }
    catch (e) { return antwort(origin, 401, { error: 'Anmeldung ungültig: ' + e.message }); }

    // 2. Bild entgegennehmen (max ~1,5 MB Base64 nach der Verkleinerung in der App)
    let body;
    try { body = await request.json(); } catch { return antwort(origin, 400, { error: 'Kein JSON' }); }
    const b64 = String(body?.image || '');
    if (!b64 || b64.length < 100) return antwort(origin, 400, { error: 'Kein Bild' });
    if (b64.length > 2_500_000) return antwort(origin, 413, { error: 'Bild zu groß' });

    // 3. Tageslimits (serverseitig)
    const k = await kontingentVerbrauchen(env, uid);
    if (!k.erlaubt) return antwort(origin, 429, { error: k.grund });

    // 4. Gemini rufen - der Schluessel existiert nur hier
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent?key=' + env.GEMINI_API_KEY,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { text: OCR_PROMPT },
            { inline_data: { mime_type: 'image/jpeg', data: b64 } },
          ]}],
          generationConfig: { maxOutputTokens: 8192 },
        }),
      }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return antwort(origin, 502, { error: err?.error?.message || 'Gemini-Fehler ' + res.status });
    }
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!text) return antwort(origin, 502, { error: 'Leere Antwort vom Modell' });

    return antwort(origin, 200, { text, rest: k.rest });
  },
};
