/**
 * Werkzeuge, um aus Rohgeometrie (Polylinien in Metern) eine TrackFile zu bauen.
 * Wird von der Pipeline und von Tests genutzt; läuft auch im Browser.
 */
export type P2 = [number, number];

export function signedArea(pts: P2[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/** Fahrtrichtung einer geschlossenen Linie (x Ost, y Nord). */
export function direction(pts: P2[]): "cw" | "ccw" {
  return signedArea(pts) < 0 ? "cw" : "ccw";
}

export function polylineLength(pts: P2[], closed = true): number {
  let l = 0;
  const m = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < m; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    l += Math.hypot(q[0] - p[0], q[1] - p[1]);
  }
  return l;
}

/** Doppelte Endpunkte entfernen (OSM schließt Wege mit identischem Start- und Endknoten). */
export function openRing(pts: P2[]): P2[] {
  const out = pts.filter((p, i) => {
    if (i === 0) return true;
    const q = pts[i - 1]!;
    return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6;
  });
  const a = out[0]!;
  const b = out[out.length - 1]!;
  if (out.length > 1 && Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6) out.pop();
  return out;
}

/**
 * Geschlossene Linie in gleichmäßigen Abständen neu abtasten (zentripetale Catmull-Rom,
 * damit Ecken der Rohdaten weich werden, ohne Überschwinger).
 */
export function resampleClosed(raw: P2[], spacing: number): P2[] {
  const pts = openRing(raw);
  const n = pts.length;
  // 1) Dicht entlang Catmull-Rom abtasten
  const dense: P2[] = [];
  const sub = 16;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]!;
    const p1 = pts[i]!;
    const p2 = pts[(i + 1) % n]!;
    const p3 = pts[(i + 2) % n]!;
    for (let k = 0; k < sub; k++) dense.push(catmullRom(p0, p1, p2, p3, k / sub));
  }
  // 2) Nach Bogenlänge gleichmäßig verteilen
  const L = polylineLength(dense);
  const count = Math.max(8, Math.round(L / spacing));
  const step = L / count;
  const out: P2[] = [];
  let seg = 0;
  let segStart = 0;
  for (let k = 0; k < count; k++) {
    const target = k * step;
    for (;;) {
      const a = dense[seg % dense.length]!;
      const b = dense[(seg + 1) % dense.length]!;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (segStart + len >= target || seg >= dense.length - 1) {
        const t = len > 0 ? (target - segStart) / len : 0;
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        break;
      }
      segStart += len;
      seg++;
    }
  }
  return out;
}

function catmullRom(p0: P2, p1: P2, p2: P2, p3: P2, t: number): P2 {
  const alpha = 0.5;
  const tj = (ti: number, a: P2, b: P2) => ti + Math.max(1e-6, Math.hypot(b[0] - a[0], b[1] - a[1]) ** alpha);
  const t0 = 0;
  const t1 = tj(t0, p0, p1);
  const t2 = tj(t1, p1, p2);
  const t3 = tj(t2, p2, p3);
  const u = t1 + (t2 - t1) * t;
  const lerp = (a: P2, b: P2, ta: number, tb: number): P2 => {
    const w = (u - ta) / (tb - ta);
    return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w];
  };
  const a1 = lerp(p0, p1, t0, t1);
  const a2 = lerp(p1, p2, t1, t2);
  const a3 = lerp(p2, p3, t2, t3);
  const b1 = lerp(a1, a2, t0, t2);
  const b2 = lerp(a2, a3, t1, t3);
  return lerp(b1, b2, t1, t2);
}

/** Kürzester Abstand eines Punktes zu einer geschlossenen Polylinie (mit Fußpunkt). */
export function nearestOnPolyline(p: P2, line: P2[]): { dist: number; q: P2 } {
  let best = Infinity;
  let bq: P2 = line[0]!;
  for (let i = 0; i < line.length; i++) {
    const a = line[i]!;
    const b = line[(i + 1) % line.length]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
    t = Math.min(1, Math.max(0, t));
    const q: P2 = [a[0] + dx * t, a[1] + dy * t];
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (d < best) {
      best = d;
      bq = q;
    }
  }
  return { dist: best, q: bq };
}

/**
 * Mittellinie und Breiten aus zwei abgezeichneten Fahrbahnrändern.
 * Startet mit einer Schätzung und schiebt jeden Punkt iterativ in die Mitte zwischen die Ränder.
 */
export function centerlineFromEdges(
  left: P2[],
  right: P2[],
  spacing: number,
  iterations = 3,
): { center: P2[]; widthLeft: number[]; widthRight: number[] } {
  const L = resampleClosed(left, spacing / 2);
  const R = resampleClosed(right, spacing / 2);
  // Startschätzung: für jeden Punkt des linken Randes Mitte zum nächsten rechten Punkt
  let center: P2[] = L.map((p) => {
    const { q } = nearestOnPolyline(p, R);
    return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] as P2;
  });
  center = resampleClosed(center, spacing);
  for (let it = 0; it < iterations; it++) {
    center = resampleClosed(
      center.map((c) => {
        const a = nearestOnPolyline(c, L).q;
        const b = nearestOnPolyline(c, R).q;
        return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as P2;
      }),
      spacing,
    );
  }
  const widthLeft = center.map((c) => nearestOnPolyline(c, L).dist);
  const widthRight = center.map((c) => nearestOnPolyline(c, R).dist);
  return { center, widthLeft, widthRight };
}

/** Linie so drehen, dass sie bei dem Punkt beginnt, der `start` am nächsten liegt. */
export function rotateToStart<T>(pts: P2[], start: P2, extra: T[][] = []): { pts: P2[]; extra: T[][] } {
  let bi = 0;
  let bd = Infinity;
  pts.forEach((p, i) => {
    const d = Math.hypot(p[0] - start[0], p[1] - start[1]);
    if (d < bd) {
      bd = d;
      bi = i;
    }
  });
  const rot = <U>(a: U[]) => a.slice(bi).concat(a.slice(0, bi));
  return { pts: rot(pts), extra: extra.map(rot) };
}

export interface Corner {
  /** Scheitel (Punkt größter Krümmung), s in Metern. */
  apexS: number;
  sStart: number;
  sEnd: number;
  /** Richtungsänderung in Grad (positiv = links). */
  angleDeg: number;
  /** Engster Radius in Metern. */
  minRadius: number;
  side: "L" | "R";
}

/**
 * Kurven zählen. Eine Kurve ist ein zusammenhängender Bereich mit Radius < maxRadius,
 * der die Richtung um mindestens minAngleDeg ändert. Die Zahl hängt von diesen Schwellen ab;
 * offizielle Zählungen nutzen keine feste Definition.
 */
export function findCorners(
  pts: P2[],
  spacing: number,
  opts: { smoothM?: number; maxRadius?: number; minAngleDeg?: number } = {},
): Corner[] {
  const smoothM = opts.smoothM ?? 8;
  const maxR = opts.maxRadius ?? 120;
  const minAng = opts.minAngleDeg ?? 20;
  const n = pts.length;
  const h: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % n]!;
    h.push(Math.atan2(b[1] - a[1], b[0] - a[0]));
  }
  const wrapA = (x: number) => Math.atan2(Math.sin(x), Math.cos(x));
  const raw = h.map((v, i) => wrapA(h[(i + 1) % n]! - v) / spacing); // Krümmung 1/m
  const w = Math.max(1, Math.round(smoothM / spacing / 2));
  const k = raw.map((_, i) => {
    let s = 0;
    for (let j = -w; j <= w; j++) s += raw[(i + j + n) % n]!;
    return s / (2 * w + 1);
  });
  const thr = 1 / maxR;
  // Beginn an einer geraden Stelle, damit keine Kurve über den Index 0 zerschnitten wird
  let start = k.findIndex((v) => Math.abs(v) < thr);
  if (start < 0) start = 0;
  const corners: Corner[] = [];
  let i = 0;
  while (i < n) {
    const idx = (start + i) % n;
    const v = k[idx]!;
    if (Math.abs(v) >= thr) {
      const sign = Math.sign(v);
      let sum = 0;
      let peak = 0;
      let peakIdx = idx;
      const i0 = i;
      while (i < n) {
        const id2 = (start + i) % n;
        const v2 = k[id2]!;
        if (Math.abs(v2) < thr || Math.sign(v2) !== sign) break;
        sum += v2 * spacing;
        if (Math.abs(v2) > peak) {
          peak = Math.abs(v2);
          peakIdx = id2;
        }
        i++;
      }
      const deg = (sum * 180) / Math.PI;
      if (Math.abs(deg) >= minAng) {
        corners.push({
          apexS: peakIdx * spacing,
          sStart: ((start + i0) % n) * spacing,
          sEnd: ((start + i - 1) % n) * spacing,
          angleDeg: deg,
          minRadius: 1 / peak,
          side: deg > 0 ? "L" : "R",
        });
      }
    } else {
      i++;
    }
  }
  return corners.sort((a, b) => a.apexS - b.apexS);
}
