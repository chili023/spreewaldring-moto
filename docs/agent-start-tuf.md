# Prompt für den Agenten auf dem TUF-Rechner

Den folgenden Block komplett in Claude Code auf dem TUF einfügen.

---

Du richtest auf diesem Rechner das Projekt **Spreewaldring Moto** ein und startest es. Es ist ein Motorrad-Rennspiel im Browser auf der Strecke des Spreewaldring Training Center (Brandenburg), Multiplayer ist geplant. Danach arbeiten wir hier gemeinsam weiter, vor allem am Fahrgefühl.

## Repo
- GitHub: `chili023/spreewaldring-moto`
- Arbeits-Branch: `claude/beautiful-cray-6hqvdu`. Dort liegt der ganze bisherige Stand, `main` ist noch leer.
- Klonen und auf den Branch wechseln:
  `git clone https://github.com/chili023/spreewaldring-moto.git` und dann `git checkout claude/beautiful-cray-6hqvdu`
- Wenn das Repo schon existiert: `git fetch` und dann `git checkout claude/beautiful-cray-6hqvdu` und `git pull`.

## Voraussetzungen
Prüfe die Werkzeuge und installiere nur, was fehlt. Frag mich vorher, wenn du etwas systemweit installieren musst.
- **Node.js 22 LTS oder neuer** (`node -v`)
- **pnpm 10** über Corepack: `corepack enable` und dann `corepack prepare pnpm@10.28.0 --activate`
- **Git**
- **Python 3.11+ ist nur für die Geodaten-Pipeline nötig.** Für das Spiel brauchst du es nicht, die erzeugten Daten liegen schon im Repo unter `apps/client/public/data/`.

Der Rechner läuft vermutlich unter Windows. Nutze dann PowerShell-taugliche Befehle und keine Bash-Spezialitäten.

## Starten
1. `pnpm install` im Repo-Hauptordner.
2. `pnpm test`: Es müssen **21 Tests grün** sein (Physik, Strecke, Zeitnahme). Wenn nicht, brich ab und zeig mir die Ausgabe.
3. `pnpm typecheck`: Es dürfen keine Fehler kommen.
4. `pnpm dev`: Startet Vite. Die URL steht in der Ausgabe (meist `http://localhost:5173`). Öffne sie im Browser, am besten Chrome oder Edge mit Hardware-Beschleunigung.
5. Prüfe im Browser:
   - Luftbild als Boden, graue Fahrbahn mit weißen Rändern, rotes Platzhalter-Motorrad, HUD und Minimap oben rechts.
   - Mit ↑ beschleunigen, mit ←/→ in Schräglage gehen, mit C die Kamera wechseln.
   - Die Browser-Konsole zeigt keine Fehler.
   - Die Bildrate ist flüssig (über 50 fps).
6. Melde mir kurz: Node- und pnpm-Version, Testergebnis, ob das Spiel läuft, gemessene fps und Auffälligkeiten.

## Projektstand (zum Einlesen)
- Plan: `docs/plan.md` (Stack, Architektur, Meilensteine M0–M5).
- Streckenvermessung: `docs/strecke-report.md`. Ergebnis: 2485 m, 17 Kurven, 9,9 m breit, Uhrzeigersinn.
- Aufbau:
  - `packages/shared/`: Fahrphysik (`physics/bike.ts`, `physics/params.ts`, fester Zeitschritt 120 Hz), Strecken-Abfragen (`track/track.ts`, Welt ↔ (s, d)), Zeitnahme (`race/lapTimer.ts`).
  - `apps/client/`: Vite + Three.js. `main.ts` enthält Schleife, Kamera und Geist, dazu `scene.ts`, `input.ts`, `hud.ts` und `audio.ts`.
  - `tools/track-pipeline/`: Geodaten (LGB DOP20/DGM1) → `track.json`. Python für Raster, TypeScript für Streckenlogik.
- Stand: M0 ist erledigt, M1 (Fahrgefühl) hat begonnen. Der Prototyp ist fahrbar, aber noch nicht abgestimmt.

## Nächste Aufgaben (erst nach meiner Freigabe)
1. **Fahrgefühl abstimmen (M1).** Ich fahre, du stimmst nach meinem Feedback ab. Das Panel „Fahrphysik“ oben rechts ändert Werte live. Was gut ist, übernimmst du in `DEFAULT_BIKE` bzw. `DEFAULT_AIDS` in `packages/shared/src/physics/params.ts`. Die Physik-Tests müssen grün bleiben. Ändert sich ein Testgrenzwert, nennst du den Grund.
2. Untergrund-Zonen erfassen: Curbs, Kiesbetten und Begrenzungen aus dem Luftbild, als `zones` in `track.json`.
3. Motorsound aus echten Samples statt Synth.

## Regeln
- Commits nur auf `claude/beautiful-cray-6hqvdu`, nie direkt auf `main`. Pushen erst, wenn ich es sage.
- Keine Pull Requests ohne meine Aufforderung.
- Keine echten Motorradmarken, Logos oder Modellnamen. Den Namen „Spreewaldring“ nicht in öffentliche Texte oder Werbung übernehmen, bevor die Rechte mit dem Betreiber geklärt sind.
- Datenquellen nennen: Luftbild und Höhenmodell © GeoBasis-DE/LGB (dl-de/by-2-0). Die Angabe steht unten im Spiel und muss bleiben.
- Sei kritisch: Wenn ich etwas Schlechtes vorschlage, sag es mir. Ergebnisse ehrlich melden, auch wenn etwas nicht klappt.
