# Firebase-Regeln für das Gruppen-Feature

Die vollständigen Regeln stehen in **`firebase-rules.json`** — deine bestehenden elf Pfade
unverändert, plus vier neue.

## Einfügen

Firebase-Konsole → Realtime Database → **Regeln** → den gesamten Inhalt von
`firebase-rules.json` einfügen (alles ersetzen) → **Veröffentlichen**.

Ohne diesen Schritt schlägt jeder Gruppenzugriff mit „Permission denied" fehl, genau wie
damals bei `catalogs/`. Die App zeigt dann „Gruppen konnten nicht geladen werden".

## Was neu dazukommt

### `reports` — ein bestehender Fehler, kein Gruppen-Thema

Die App schreibt gemeldete Fragen nach `reports/`, aber dafür gab es keine Regel. Alle
diese Schreibvorgänge wurden abgelehnt — und der Fehler durch ein `.catch(() => {})`
verschluckt. Fragenmeldungen landeten also nur im lokalen Speicher des Meldenden, du hast
sie nie gesehen. Die Regel behebt das.

### `groups`, `groupInvites`, `userGroups`

| Regel | Wirkung |
|---|---|
| `groups/$gid` lesen | Nur Mitglieder — und Eingeladene, damit sie den Gruppennamen in der Einladung sehen |
| `groups/$gid` schreiben | Nur Admins. Neu anlegen darf jeder Angemeldete (`!data.exists()`) |
| `members/$uid` | Man trägt sich selbst ein (nur mit gültiger Einladung) oder aus. Admins dürfen jeden eintragen und entfernen |
| `scores/$qid/$uid` | Jeder schreibt nur seinen eigenen Punktestand, und nur als Mitglied |
| `groupInvites/$uid` | Nur der Empfänger liest. Schreiben dürfen der Empfänger (zum Löschen) und Gruppenadmins |
| `userGroups/$uid` | Nur der Betroffene und Gruppenadmins |

Damit sind die Adminrechte **serverseitig** durchgesetzt, nicht nur in der Oberfläche.
Das ist der Unterschied zwischen „der Knopf wird nicht angezeigt" und „es geht wirklich
nicht": Ohne diese Regeln könnte jeder Angemeldete über die Browser-Konsole die Quizze
jeder Gruppe verändern.

Deine bestehenden Regeln haben **kein** globales `".read": true` an der Wurzel — jeder Pfad
ist einzeln geregelt. Deshalb greifen die neuen Regeln tatsächlich und werden nicht von
oben überschrieben.

## Was diese Regeln bewusst nicht abdecken

**Ein Angemeldeter kann beim Anlegen einer neuen Gruppe fremde uids in die Mitgliederliste
schreiben.** Sichtbar wird die Gruppe für die Betroffenen dadurch nicht: `userGroups/<fremde-uid>`
bleibt gesperrt, und ohne diesen Indexeintrag taucht die Gruppe in ihrer Liste nicht auf.
Es bliebe ein wirkungsloser Karteileichen-Eintrag.

**`friends`, `friendRequests`, `challenges` und `rooms` bleiben so offen wie bisher** —
jeder Angemeldete darf dort überall schreiben. Das habe ich nicht angefasst, weil es das
vorhandene Duell- und Freundschaftssystem betrifft und ein unbedachtes Zudrehen beides
lahmlegen würde. Wenn du willst, gehen wir das getrennt an.
