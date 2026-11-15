import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { direction, findCorners, resampleClosed, type P2 } from "./build";
import { Track } from "./track";
import type { TrackFile } from "./types";

function circleTrack(R: number, n: number, cw = true): TrackFile {
  const points: TrackFile["points"] = [];
  for (let i = 0; i < n; i++) {
    const a = ((cw ? -1 : 1) * 2 * Math.PI * i) / n;
    points.push([R * Math.cos(a), R * Math.sin(a), 0, 5, 5]);
  }
  return {
    version: 1, name: "Kreis", crs: "local", origin: { e: 0, n: 0, h: 0 }, direction: cw ? "cw" : "ccw",
    spacing: (2 * Math.PI * R) / n, length: 0, points, sectors: [], checkpoints: [], zones: [], sources: [], notes: [],
  };
}

describe("Track", () => {
  const t = new Track(circleTrack(100, 2000));

  it("misst die Rundenlänge eines Kreises", () => {
    expect(t.length).toBeCloseTo(2 * Math.PI * 100, 0);
  });

  it("Welt <-> (s, d) ist umkehrbar (< 1 cm)", () => {
    for (const [s, d] of [[0, 0], [123.4, 3.2], [400, -4.9], [620, 1]] as const) {
      const w = t.toWorld(s, d);
      const p = t.project(w.x, w.y);
      expect(Math.abs(t.delta(p.s, s))).toBeLessThan(0.01);
      expect(Math.abs(p.d - d)).toBeLessThan(0.01);
    }
  });

  it("rechts ist im Uhrzeigersinn die Kreisinnenseite", () => {
    const p = t.project(90, 0); // 10 m innen
    expect(p.d).toBeCloseTo(10, 1);
  });

  it("lokale Suche mit Hinweis liefert dasselbe wie die volle Suche", () => {
    const w = t.toWorld(300, 2);
    const full = t.project(w.x, w.y);
    const local = t.project(w.x, w.y, full.seg + 5);
    expect(local.s).toBeCloseTo(full.s, 6);
  });

  it("Untergrund: innerhalb der Breite Asphalt, außerhalb Gras, Zonen gehen vor", () => {
    const data = circleTrack(100, 2000);
    data.zones = [{ s0: 600, s1: 20, dMin: 5, dMax: 7, surface: "curb" }];
    const tz = new Track(data);
    expect(tz.surfaceAt(100, 4)).toBe("asphalt");
    expect(tz.surfaceAt(100, 6)).toBe("grass");
    expect(tz.surfaceAt(610, 6)).toBe("curb");
    expect(tz.surfaceAt(10, 6)).toBe("curb"); // Zone über Start/Ziel hinweg
  });
});

describe("build", () => {
  it("erkennt die Fahrtrichtung", () => {
    const sq: P2[] = [[0, 0], [0, 10], [10, 10], [10, 0]];
    expect(direction(sq)).toBe("cw");
    expect(direction([...sq].reverse())).toBe("ccw");
  });

  it("findet die vier Ecken eines abgerundeten Rechtecks", () => {
    const raw: P2[] = [];
    const corner = (cx: number, cy: number, a0: number) => {
      for (let k = 0; k <= 8; k++) {
        const a = a0 - (k / 8) * (Math.PI / 2);
        raw.push([cx + 20 * Math.cos(a), cy + 20 * Math.sin(a)]);
      }
    };
    // im Uhrzeigersinn
    corner(0, 100, Math.PI);
    corner(200, 100, Math.PI / 2);
    corner(200, -100, 0);
    corner(0, -100, -Math.PI / 2);
    const pts = resampleClosed(raw, 0.5);
    const c = findCorners(pts, 0.5);
    expect(c).toHaveLength(4);
    expect(c.every((k) => k.side === "R")).toBe(true);
    for (const k of c) expect(Math.abs(k.angleDeg)).toBeGreaterThan(80);
  });
});

describe("Spreewaldring track.json", () => {
  const data = JSON.parse(
    readFileSync(new URL("../../../../apps/client/public/data/track.json", import.meta.url), "utf8"),
  ) as TrackFile;
  const t = new Track(data);

  it("Länge und Breite liegen im erwarteten Bereich", () => {
    expect(t.length).toBeGreaterThan(2400);
    expect(t.length).toBeLessThan(2800);
    const w = data.points.map((p) => p[3] + p[4]).sort((a, b) => a - b);
    expect(w[Math.floor(w.length / 2)]).toBeGreaterThan(9);
    expect(w[Math.floor(w.length / 2)]).toBeLessThan(11);
  });

  it("Start/Ziel liegt bei s = 0 und die Linie ist geschlossen", () => {
    const a = data.points[0]!;
    const b = data.points[data.points.length - 1]!;
    expect(Math.hypot(a[0], a[1])).toBeLessThan(2);
    expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(1);
  });
});
