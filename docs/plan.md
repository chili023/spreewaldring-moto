# Plan: Browser-Motorrad-Rennspiel „Spreewaldring“ (Multiplayer)

## Context
Ziel ist ein Motorrad-Rennspiel, das im Browser läuft und auf der echten Strecke des STC Spreewaldring (Schönwald/Waldow, Brandenburg) spielt. Gefahren wird online gegeneinander.
Festgelegte Entscheidungen:
- **Physik:** Simcade. Schräglage, Grip-Grenze und Lowside wirken echt, die Steuerung ist mit Gamepad und Tastatur aber verzeihend.
- **Multiplayer v1:** Geister-Modus. Andere Fahrer sind sichtbar, aber es gibt keine Kollisionen zwischen Motorrädern.
- **Zielgruppe:** Freunde und Verein. Private Räume per Code, kein Login, nicht kommerziell.
- **Strecke:** Aus Geodaten gebaut (Brandenburger Open Data, OSM nur zum Gegenprüfen).

Die bestehenden Repos `code_pst-PST` und `code_pst-ECU` sind Hardware-Projekte und haben nichts damit zu tun. Das Spiel bekommt ein **eigenes neues Repo**. Der Nutzer legt es an (z. B. `spreewald-moto`) und hängt es an die Session an, weil ich keine Repos anlegen darf.

## Kritische Punkte vorab
1. **Größtes Risiko ist das Fahrgefühl, nicht Grafik oder Netzwerk.** Deshalb kommt zuerst ein Single-Player-Prototyp mit Graubox-Strecke. Multiplayer und Optik folgen erst, wenn sich das Fahren gut anfühlt.
2. **Die Streckendaten im Netz widersprechen sich.** Genannt werden 2,57 / 2,6 / 2,7 / 3,4 km und 9 bzw. 17 Kurven. Halbwegs belastbar ist: rund 2,6–2,7 km, im Uhrzeigersinn, 10 m breit, ca. 6 m Höhenunterschied, 17 Kurven (7 links, 10 rechts). Dazu kommen Speed- und Handlingvariante über Kurzanbindungen, ein teilweise bewässerter Handlingteil und eine separate Kartbahn mit 0,8 km. **Die echten Werte werden in M0 aus den Geodaten gemessen und nicht aus dem Netz übernommen.**
3. **Name und Logo.** „STC Spreewaldring“ ist ein Markenname. Bevor eine Seite öffentlich erreichbar ist, kurz beim Betreiber nachfragen, auch wenn es nur für Freunde ist. Keine echten Motorradmarken und Modellnamen verwenden. Das Motorrad ist eine fiktive 600er-Supersport.
4. **Lizenzen der Daten.** Brandenburger Geobasisdaten (DOP20, DGM1, LoD2) stehen unter dl-de/by-2-0 und verlangen nur eine Namensnennung („GeoBasis-DE/LGB“). OSM steht unter ODbL mit Share-Alike für abgeleitete Datenbanken. Deshalb wird die **endgültige Mittellinie selbst aus DOP20 abgezeichnet** und OSM nur als Startpunkt und zum Abgleich genutzt.
5. **Aufwand:** realistisch 11–15 Wochen Vollzeit bis zu einer spielbaren, hübschen Version 1. Der größte Brocken ist die Strecken-Optik.

## Wie es aussieht
- **Optik:** realistisch-stilisiert, Sommernachmittag. Flaches Gelände, Kiefernwald und sandige Ränder, typisch Lausitz und Spreewald. Rot-weiße Curbs, Kiesbetten, Boxengebäude nach Luftbild. Die Beleuchtung ist vorgebacken (Lightmaps), damit es auch auf Laptops flüssig läuft.
- **Kameras:** Verfolgerkamera, die etwa 30 % der Schräglage mitneigt, und Helmkamera mit teilweisem Ausgleich der Kopfneigung. Das Sichtfeld wird mit der Geschwindigkeit etwas weiter.
- **HUD (DOM-Overlay):**
```
┌───────────────────────────────────────────────────────────┐
│ POS 3/8   RUNDE 2/5            SEKTOR ■■□   Δ −0.42 (grün) │
│ Runde 1:14.832   Best 1:13.910                 [Minimap]  │
│                                                           │
│                    (Strecke / Motorrad)                   │
│                                                           │
│  Schräglage ◜ 47° ◝     4. Gang  ▓▓▓▓▓▓▓▓▓░ 12.400 U/min   │
│                           187 km/h                        │
└───────────────────────────────────────────────────────────┘
```
  Die Schräglagen-Anzeige wie bei einem echten Datalogger ist das Motorrad-typische Merkmal.
- **Menüs:** Startseite (Name und Farbe wählen) → „Raum erstellen“ (6-stelliger Code, Runden, Variante) oder „Raum beitreten“ → Lobby mit Bereit-Status → Startaufstellung mit Ampel-Countdown → Rennen → Ergebnis mit Rundenzeiten → Bestenliste und Zeitfahren mit Geistern.

## Tools und Stack (Empfehlung)
| Bereich | Tool | Warum |
|---|---|---|
| Sprache | **TypeScript** auf Client und Server | Physik und Protokoll werden einmal geschrieben und überall genutzt |
| Build | **Vite**, **pnpm** Workspaces, Biome (Lint/Format) | schnell und schlank |
| 3D-Engine | **Three.js** (WebGLRenderer, WebGL2) | kleinstes Bundle, ausgereift, volle Kontrolle. Unity-WebGL ist zu schwer und auf Mobilgeräten schlecht. Godot-Web hat Header- und Threading-Hürden. |
| Physik | **eigene Fahrphysik in TS** (kein Rapier in v1) | Ein Motorrad lässt sich mit einer Rigid-Body-Engine schlecht abbilden. Ein eigenes Modell plus Strecken-Koordinaten ist robuster und gut testbar. |
| Multiplayer | **Colyseus 0.18** (Node LTS), WebSocket-Transport | Räume, Raumcodes, Zustandssync und Reconnect sind schon eingebaut. WebTransport ist inzwischen „Baseline“, aber auf Node noch über eine Fremdbibliothek. Deshalb erst später als Option. |
| Menü-UI | **Preact** + CSS über dem Canvas | klein, gut für Lobby und Menüs |
| Audio | **Web Audio API** direkt | Der Motorsound braucht Tonhöhe und Überblendung nach Drehzahl. Dafür ist Howler.js zu grob. |
| Persistenz | **SQLite** (`node:sqlite` oder better-sqlite3) | Bestenliste und Geister-Daten. Für Freunde reicht das völlig. |
| Geodaten | **QGIS**, Overpass Turbo (OSM), LGB OpenGeoData (DOP20, DGM1, LoD2) | Alles im Koordinatensystem EPSG:25833 (UTM 33N, Meter). Das passt direkt zu den Brandenburger Daten. |
| 3D-Content | **Blender** (aktuelle LTS), Geometry Nodes entlang der Mittellinie | Asphaltband, Curbs, Linien, Kies und Gras werden aus der Kurve erzeugt, Lightmaps gebacken |
| Asset-Optimierung | **gltf-transform** (Meshopt, KTX2/Basis) | Ziel: Erst-Download unter 20 MB |
| Tuning und Debug | lil-gui (Physik live einstellen), stats.js, Spector.js | Fahrphysik-Werte direkt im Spiel abstimmen |
| Tests | **Vitest** (Physik, Strecke, Protokoll), **Playwright** (Multiplayer mit mehreren Browser-Kontexten und Netzwerk-Drosselung) | |
| Hosting | **1 Hetzner-VPS** (DE) mit Docker Compose: Caddy (TLS, statische Dateien, wss-Proxy) und Game-Server | niedriger Ping in DE, ca. 5 €/Monat, eine Domain |
| CI/CD | GitHub Actions (Tests, Build, Deploy per SSH) | |
| Repo | Git LFS für `.blend`-Dateien und Texturen | |

## Architektur (neues Repo)
```
spreewald-moto/
  apps/client/            Vite + Three.js + Preact (Rendering, Input, HUD, Audio, Netz-Client)
  apps/server/            Colyseus-Räume, Rennablauf, Prüfung, SQLite
  packages/shared/
    physics/              Bike-Modell (fester Zeitschritt 60 Hz, deterministisch)
    track/                Abfragen auf track.json: Weltposition ↔ (s, d), Untergrund, Höhe
    protocol/             Nachrichtentypen, Binärformat, Konstanten
  tools/track-pipeline/   Skripte: GeoJSON/DOP-Abzeichnung → track.json (+ Prüfreport)
  assets-src/             Blender-Dateien (LFS), Export → apps/client/public/assets/*.glb
```

### Strecken-Datenmodell (Kern-Idee)
`track.json` enthält die Mittellinie im Abstand von 0,5 m. Jeder Punkt hat Position, Tangente, Breite links und rechts, Curb-Breite, Höhe aus DGM1 und Untergrund-Zonen (Asphalt, Curb, Gras, Kies, nasser Handlingteil) mit seitlichem Abstand. Dazu kommen Start/Ziel, 3 Sektoren, ca. 16 versteckte Checkpoints, Boxengasse, Startplätze und Ideallinie.
Jede Position wird als **(s, d)** ausgedrückt: zurückgelegte Strecke s und seitlicher Abstand d zur Mittellinie. Die Suche startet beim letzten s und kostet deshalb fast nichts. Damit gibt es ohne Physik-Engine:
- Untergrund und Grip,
- Abseits der Strecke und Streckenbegrenzung (Sturz oder Abprallen),
- Fortschritt für die Rennposition (`runde · L + s`),
- Erkennung von Falschfahren und Rundenprüfung.

Dieselbe Mittellinie dient als Blender-Kurve für das Mesh. Damit passen Grafik und Logik garantiert zusammen.

### Fahrphysik (Simcade)
Zustand: Position, Gierwinkel, Geschwindigkeit v, Schräglage φ, Gang, Drehzahl.
- **Kurvenfahrt:** stationär gilt Querbeschleunigung a = g·tan φ, also Gierrate ω = g·tan φ / v und Radius r = v²/(g·tan φ).
- **Schräglage:** Der Eingang setzt eine Zielschräglage, φ folgt mit begrenzter Rollrate. Die Rollrate sinkt mit v (Kreiseleffekt) und ist bei wenig Tempo zum Ausbalancieren hoch. Maximal 55°. Echtes Gegenlenken bleibt dem Spieler erspart (Simcade).
- **Haftkreis:** √(a_quer² + a_längs²) ≤ μ·g. Wird das länger als ca. 150 ms überschritten, folgt ein Lowside: Sturz-Animation und nach 3 s Neustart auf der Strecke.
- **Längsdynamik:** Drehmomentkurve, 6 Gänge (Automatik, manuell optional), Luftwiderstand ½ρ·c_w·A·v², Rollwiderstand. Vorder- und Hinterbremse. Die Grenzen für Stoppie und Wheelie ergeben sich aus Schwerpunkthöhe und Radstand.
- **Untergrund-μ (Startwerte):** Asphalt 1,2 · Curb 1,0 + Vibration · nasser Handlingteil 0,6 · Gras 0,5 + Zusatzwiderstand · Kies 0,4 + starke Bremswirkung.
- **Eingabe:** Gamepad API (Analogstick und Trigger, Hauptziel). Tastatur mit Eingangsrampen. Touch nur einfach, mit geringer Priorität.

### Netzwerk (Geister-Modus)
- **Colyseus-Raumzustand (Schema, niedrige Frequenz):** Phase (Lobby/Countdown/Rennen/Ergebnis), Spieler (Name, Farbe, bereit, Runde, Bestzeit, im Ziel), Einstellungen (Runden, Variante). Maximal 12 Spieler pro Raum.
- **Bewegung als eigene Binär-Nachrichten, nicht über Schema:** Jeder Client sendet 30 Hz sein Paket (Tick, x/y/z, Gierwinkel, Schräglage, v, Gas/Bremse, ca. 28 Byte). Der Server verteilt es an die anderen. Die eigene Bewegung berechnet der Client selbst, das ist ohne Kollisionen vertretbar.
- **Fremde Fahrer:** Interpolationspuffer von 100 ms mit Hermite-Interpolation über die Geschwindigkeit, bei Paketverlust Extrapolation bis 250 ms. Bei Überlappung halbtransparent.
- **Zeit:** Der Server gibt die Uhr vor (NTP-artiger Ping-Abgleich, Median). Der Startzeitpunkt wird als gemeinsamer Zeitstempel verteilt.
- **Rennhoheit liegt beim Server:** Er nimmt die Checkpoint-Durchfahrten an und prüft Reihenfolge, Mindestzeiten pro Sektor, Höchsttempo und Sprungweite. Er berechnet Rennposition, Rundenzeiten und Ergebnis. Das reicht als Anti-Cheat für Freunde.
- **Geister:** Die beste Runde wird mit 20 Hz als (s, d, Gierwinkel, Schräglage, v) aufgezeichnet, etwa 30 KB. Bei neuer Bestzeit wird sie hochgeladen. Für das Zeitfahren lassen sich Geister aus der Bestenliste laden.

## Meilensteine
**M0 – Daten und Grundgerüst (ca. 1 Woche)**
- Repo, Monorepo-Gerüst und CI einrichten.
- OSM-Raceway per Overpass holen. DOP20-Kacheln und DGM1 für das Gelände laden.
- In QGIS beide Fahrbahnränder aus DOP20 abzeichnen, daraus Mittellinie und Breite. `tools/track-pipeline` erzeugt `track.json` und einen Report (Länge, Kurvenzahl, Höhe).
- Three.js zeigt das Fahrbahnband mit DOP20 als Bodentextur, ein Würfel fährt die Linie ab.
- *Fertig, wenn:* Länge und Kurvenzahl aus eigenen Daten dokumentiert sind und die Abweichung zu OSM unter 1 % liegt (sonst Ursache klären).

**M1 – Fahrgefühl im Single-Player (3–4 Wochen) – Abbruchpunkt**
- Physik in `packages/shared/physics`, Eingabe, beide Kameras, HUD, Rundenzeit und Sektoren, Zeitfahren mit lokalem Geist, Motorsound v1. Graubox-Strecke mit farbigen Untergrund-Zonen.
- Physik live mit lil-gui abstimmen.
- *Fertig, wenn:* 3 Testfahrer nach 10 Runden sagen „fühlt sich nach Motorrad an“ und ihre Rundenzeiten konvergieren. Die Rundenzeit eines guten Fahrers liegt höchstens ±10 % neben echten 600er-Zeiten der Strecke (z. B. von LapMeta oder RaceChrono). **Wenn das nicht klappt: an der Physik weiterarbeiten, nicht mit M2 beginnen.**

**M2 – Multiplayer (2–3 Wochen)**
- Colyseus-Server, Räume mit Code, Lobby, Bewegungs-Sync, Interpolation, Uhrabgleich, Startaufstellung, Ampel, Rennablauf, Ergebnis, Reconnect.
- Bot-Clients in Node, die die Ideallinie fahren, für Tests.
- *Fertig, wenn:* 8 Clients (2 echte, 6 Bots) 5 Runden bei 150 ms Latenz und 2 % Paketverlust ruckelfrei fahren und Ergebnis und Rundenzeiten bei allen gleich sind.

**M3 – Strecke und Optik (3–5 Wochen)**
- Blender: Fahrbahn per Geometry Nodes aus der Mittellinie, Curbs, Markierungen, Kiesbetten, Begrenzungen, Gelände aus DGM1, Gebäude (LoD2 plus Luftbild), Kiefernwald als Instanzen, gebackene Lightmaps, HDRI-Himmel (Poly Haven, CC0).
- Motorrad und Fahrer: fiktives Modell (gekauft mit Spiele-Lizenz oder CC0/CC-BY), Fahrerposen aufrecht, geduckt, Hang-off links/rechts als Überblendung. Detailstufen (LOD). Komprimierung mit gltf-transform.
- *Fertig, wenn:* 60 fps bei 1080p auf einem Mittelklasse-Laptop (Klasse Intel Iris Xe) laufen und der Erst-Download unter 20 MB liegt.

**M4 – Bestenliste und Release (ca. 2 Wochen)**
- SQLite-Bestenliste, Geister teilen, Einstellungen (Tastenbelegung, Kamera, Grafikstufe), einfache Touch-Steuerung.
- Deployment auf den VPS, Logs und einfache Kennzahlen, Credits mit Datennamensnennung (GeoBasis-DE/LGB, ggf. © OpenStreetMap-Mitwirkende, Asset-Urheber).
- *Fertig, wenn:* Ein Freund kann über einen Link ohne Installation einem Raum beitreten und ein Rennen fahren.

**M5 – Optional, danach:** Handlingkurs-Variante, nasser Handlingabschnitt als Spielelement, KI-Gegner auf der Ideallinie, weiche Kollisionen v2, weitere Motorradklassen, Kartbahn.

## Prüfung (End-to-End)
- **Vitest Physik:** Stationäre Kreisfahrt bestätigt r = v²/(g·tan φ) (±2 %). Haftkreis-Überschreitung löst Lowside aus. Gleiche Eingaben liefern bit-gleiche Ergebnisse (Determinismus).
- **Vitest Strecke:** Die Abbildung Weltposition ↔ (s, d) ist umkehrbar (< 1 cm Fehler). Die Rundenlänge entspricht dem Geodaten-Wert. Die Untergrund-Zonen stimmen an Stichpunkten mit dem Luftbild überein.
- **Playwright:** 2 bis 4 Browser-Kontexte plus Node-Bots in einem Raum, Netzwerk über CDP gedrosselt. Geprüft werden Rennablauf, Ergebnis-Konsistenz und Reconnect.
- **Performance:** Chrome DevTools Performance plus stats.js auf der Ziel-Hardware. Bundle- und Asset-Größe werden in der CI geprüft und dürfen nicht über dem Budget liegen.
- **Manuell:** Testfahrten mit Gamepad und Tastatur in Chrome, Firefox und Safari.

## Offene Punkte
- Neues GitHub-Repo anlegen und an die Session anhängen (macht der Nutzer).
- Kurze Anfrage beim Spreewaldring-Betreiber wegen Name und Logo, bevor die Seite öffentlich ist.
- Echte Referenz-Rundenzeiten einer 600er besorgen, als Abgleich für M1.
