# Spreewaldring Moto

Motorrad-Rennspiel im Browser auf der Strecke des Spreewaldring Training Center (Schönwald/Waldow, Brandenburg). Multiplayer ist geplant.

**Stand:** M0. Die Strecke ist aus amtlichen Geodaten vermessen, der Kern der Fahrphysik ist mit Tests abgesichert. Dazu gibt es einen ersten fahrbaren Prototyp im Browser.

## Aufbau
```
apps/client/            Browser-Spiel (Vite + Three.js)
packages/shared/        Fahrphysik und Strecken-Abfragen (Client und später Server)
tools/track-pipeline/   Geodaten -> track.json (Python für Raster, TypeScript für Streckenlogik)
docs/                   Streckenreport, Plan
```

## Befehle
```bash
pnpm install
pnpm test              # Vitest: Physik und Strecke
pnpm dev               # Spiel lokal starten
pnpm --filter @moto/track-pipeline extract   # Geodaten laden und Mittellinie extrahieren (Python 3, siehe py/requirements.txt)
pnpm track             # track.json und docs/strecke-report.md neu erzeugen
```

## Daten und Lizenzen
- Luftbild DOP20 und Höhenmodell DGM1: © GeoBasis-DE/LGB, [dl-de/by-2-0](https://www.govdata.de/dl-de/by-2-0).
- Der Name „Spreewaldring“ und das Logo gehören dem Betreiber. Vor einer öffentlichen Veröffentlichung sind die Rechte zu klären.
- Das Motorrad ist fiktiv. Es werden keine echten Marken oder Modellnamen verwendet.
