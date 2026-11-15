/**
 * Baut apps/client/public/data/track.json aus der Python-Ausgabe (centerline.json)
 * und schreibt einen Prüfreport (Länge, Richtung, Kurven, Breite, Höhe).
 *
 * Aufruf: tsx src/build-track.ts <centerline.json> <track.json> <report.md>
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  direction,
  findCorners,
  resampleClosed,
  rotateToStart,
  Track,
  type P2,
  type TrackFile,
} from "@moto/shared/track";

interface Centerline {
  crs: string;
  name: string;
  lengthM: number;
  startFinish: [number, number];
  points: [number, number, number, number, number][];
  sources: string[];
}

const SPACING = 0.5;
const [inPath, outPath, reportPath] = process.argv.slice(2);
if (!inPath || !outPath || !reportPath) throw new Error("Aufruf: build-track <in> <out> <report>");
const cl = JSON.parse(readFileSync(inPath, "utf8")) as Centerline;

// Lokaler Nullpunkt = Start/Ziel (gerundet), damit Zahlen klein und float32-tauglich bleiben
const origin = { e: Math.round(cl.startFinish[0]), n: Math.round(cl.startFinish[1]) };
const hMin = Math.min(...cl.points.map((p) => p[2]));
const h0 = Math.floor(hMin);
let pts: P2[] = cl.points.map((p) => [p[0] - origin.e, p[1] - origin.n]);
let extra = [cl.points.map((p) => [p[2] - h0, p[3], p[4]])];

// Fahrtrichtung: Uhrzeigersinn erwartet (Wegpunkte so gewählt)
const dir = direction(pts);
if (dir !== "cw") throw new Error(`Fahrtrichtung ist ${dir}, erwartet cw – Wegpunkte prüfen`);

// Bei Start/Ziel beginnen
const sf: P2 = [cl.startFinish[0] - origin.e, cl.startFinish[1] - origin.n];
({ pts, extra } = rotateToStart(pts, sf, extra));
const attrs = extra[0]!;

// Auf 0,5 m neu abtasten; Attribute über Bogenlänge-Anteil übertragen
const fine = resampleClosed(pts, SPACING);
const m = attrs.length;
const points: TrackFile["points"] = fine.map((p, i) => {
  const f = (i / fine.length) * m;
  const a = attrs[Math.floor(f) % m]!;
  const b = attrs[(Math.floor(f) + 1) % m]!;
  const t = f - Math.floor(f);
  const lerp = (k: number) => +(a[k]! + (b[k]! - a[k]!) * t).toFixed(2);
  return [+p[0].toFixed(3), +p[1].toFixed(3), lerp(0), lerp(1), lerp(2)];
});

const draft: TrackFile = {
  version: 1,
  name: cl.name,
  crs: cl.crs,
  origin: { e: origin.e, n: origin.n, h: h0 },
  direction: "cw",
  spacing: SPACING,
  length: 0,
  points,
  sectors: [],
  checkpoints: [],
  zones: [],
  sources: cl.sources,
  notes: [
    "Start/Ziel-Position geschätzt (Querlinie am Ende der Startaufstellung im Luftbild).",
    "Untergrund-Zonen (Curbs, Kies) noch nicht erfasst: außerhalb der Fahrbahn gilt Gras.",
    "Breite an Einmündungen aus Nachbarwerten interpoliert.",
  ],
};
const track = new Track(draft);
const L = track.length;
draft.length = +L.toFixed(2);
draft.sectors = [+(L / 3).toFixed(1), +((2 * L) / 3).toFixed(1)];
draft.checkpoints = Array.from({ length: 16 }, (_, i) => +(((i + 0.5) * L) / 16).toFixed(1));

const corners = findCorners(
  points.map((p) => [p[0], p[1]] as P2),
  L / points.length,
);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(draft));

const widths = points.map((p) => p[3] + p[4]).sort((a, b) => a - b);
const q = (f: number) => widths[Math.floor(f * (widths.length - 1))]!.toFixed(2);
const hs = points.map((p) => p[2] + h0);
const left = corners.filter((c) => c.side === "L").length;
const report = `# Streckenreport: ${cl.name}

Automatisch erzeugt von \`tools/track-pipeline\` aus Luftbild (DOP20) und Höhenmodell (DGM1) der LGB Brandenburg.

| Größe | Wert |
|---|---|
| Rundenlänge (Mittellinie) | **${L.toFixed(1)} m** |
| Fahrtrichtung | Uhrzeigersinn |
| Fahrbahnbreite (Median, 10 %–90 %) | ${q(0.5)} m (${q(0.1)}–${q(0.9)} m) |
| Höhe über NN | ${Math.min(...hs).toFixed(1)}–${Math.max(...hs).toFixed(1)} m (Unterschied ${(Math.max(...hs) - Math.min(...hs)).toFixed(1)} m) |
| Kurven (Radius < 120 m, Richtungsänderung ≥ 20°) | **${corners.length}** (${left} links, ${corners.length - left} rechts) |
| Stützpunkte | ${points.length} (Abstand ${SPACING} m) |

Die Kurvenzahl hängt von der Definition ab. Offizielle Angaben nennen 17 (7 links, 10 rechts).

## Kurven

| Nr. | Scheitel bei s [m] | Richtung | Winkel [°] | engster Radius [m] |
|---|---|---|---|---|
${corners.map((c, i) => `| ${i + 1} | ${c.apexS.toFixed(0)} | ${c.side === "L" ? "links" : "rechts"} | ${Math.abs(c.angleDeg).toFixed(0)} | ${c.minRadius.toFixed(1)} |`).join("\n")}

## Hinweise
${draft.notes.map((n) => `- ${n}`).join("\n")}

## Quellen
${cl.sources.map((s) => `- ${s}`).join("\n")}
`;
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, report);
console.log(`Länge ${L.toFixed(1)} m, ${corners.length} Kurven (${left} L), ${points.length} Punkte`);
