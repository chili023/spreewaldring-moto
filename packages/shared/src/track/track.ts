import type { Surface, TrackFile } from "./types";

export interface TrackPos {
  /** Laufstrecke ab Start/Ziel in Metern, 0 <= s < length. */
  s: number;
  /** Seitlicher Abstand zur Mittellinie in Metern, rechts (in Fahrtrichtung) positiv. */
  d: number;
  /** Index des Segments, auf dem der Punkt liegt (als Hinweis für die nächste Abfrage). */
  seg: number;
}

export interface Frame {
  x: number;
  y: number;
  z: number;
  /** Einheitstangente in Fahrtrichtung. */
  tx: number;
  ty: number;
  /** Fahrtrichtung als Gierwinkel (rad, 0 = Ost, gegen den Uhrzeigersinn positiv). */
  heading: number;
  widthLeft: number;
  widthRight: number;
}

/**
 * Laufzeit-Abfragen auf einer Strecke: Welt <-> (s, d), Untergrund, Höhe.
 * Arbeitet auf dem Polygonzug der Stützpunkte (Abstand ~0,5 m), das ist genau genug
 * und exakt umkehrbar.
 */
export class Track {
  readonly length: number;
  readonly n: number;
  private readonly x: Float64Array;
  private readonly y: Float64Array;
  private readonly z: Float64Array;
  private readonly wl: Float64Array;
  private readonly wr: Float64Array;
  /** Kumulierte Laufstrecke am Stützpunkt i. */
  private readonly sAt: Float64Array;

  constructor(readonly data: TrackFile) {
    const pts = data.points;
    const n = pts.length;
    if (n < 4) throw new Error("Strecke braucht mindestens 4 Punkte");
    this.n = n;
    this.x = new Float64Array(n);
    this.y = new Float64Array(n);
    this.z = new Float64Array(n);
    this.wl = new Float64Array(n);
    this.wr = new Float64Array(n);
    this.sAt = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) {
      const p = pts[i]!;
      this.x[i] = p[0];
      this.y[i] = p[1];
      this.z[i] = p[2];
      this.wl[i] = p[3];
      this.wr[i] = p[4];
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      this.sAt[i + 1] = this.sAt[i]! + Math.hypot(this.x[j]! - this.x[i]!, this.y[j]! - this.y[i]!);
    }
    this.length = this.sAt[n]!;
  }

  /** s auf [0, length) normieren. */
  wrap(s: number): number {
    const L = this.length;
    return ((s % L) + L) % L;
  }

  /** Vorzeichenbehaftete Differenz b - a auf dem Rundkurs, im Bereich (-L/2, L/2]. */
  delta(a: number, b: number): number {
    const L = this.length;
    let d = this.wrap(b - a);
    if (d > L / 2) d -= L;
    return d;
  }

  private segOf(s: number): number {
    // Binärsuche: größtes i mit sAt[i] <= s
    let lo = 0;
    let hi = this.n - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.sAt[mid]! <= s) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /** Position und Ausrichtung der Mittellinie bei s. */
  frameAt(sIn: number): Frame {
    const s = this.wrap(sIn);
    const i = this.segOf(s);
    const j = (i + 1) % this.n;
    const segLen = this.sAt[i + 1]! - this.sAt[i]!;
    const t = segLen > 0 ? (s - this.sAt[i]!) / segLen : 0;
    const dx = this.x[j]! - this.x[i]!;
    const dy = this.y[j]! - this.y[i]!;
    const l = Math.hypot(dx, dy) || 1;
    return {
      x: this.x[i]! + dx * t,
      y: this.y[i]! + dy * t,
      z: this.z[i]! + (this.z[j]! - this.z[i]!) * t,
      tx: dx / l,
      ty: dy / l,
      heading: Math.atan2(dy, dx),
      widthLeft: this.wl[i]! + (this.wl[j]! - this.wl[i]!) * t,
      widthRight: this.wr[i]! + (this.wr[j]! - this.wr[i]!) * t,
    };
  }

  /** Weltpunkt aus (s, d). */
  toWorld(s: number, d: number): { x: number; y: number; z: number } {
    const f = this.frameAt(s);
    // rechts in Fahrtrichtung = Tangente um -90° gedreht
    return { x: f.x + f.ty * d, y: f.y - f.tx * d, z: f.z };
  }

  private projectOnSeg(i: number, px: number, py: number): { dist2: number; s: number; d: number } {
    const j = (i + 1) % this.n;
    const ax = this.x[i]!;
    const ay = this.y[i]!;
    const dx = this.x[j]! - ax;
    const dy = this.y[j]! - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = Math.min(1, Math.max(0, t));
    const qx = ax + dx * t;
    const qy = ay + dy * t;
    const l = Math.sqrt(l2) || 1;
    // Kreuzprodukt: positiv = links. Wir wollen rechts positiv.
    const cross = (dx * (py - ay) - dy * (px - ax)) / l;
    const dist2 = (px - qx) ** 2 + (py - qy) ** 2;
    return { dist2, s: this.sAt[i]! + t * l, d: -Math.sign(cross) * Math.sqrt(dist2) };
  }

  /**
   * Weltpunkt -> (s, d). Mit `hint` (Segment der letzten Abfrage) wird nur lokal gesucht,
   * das ist O(1) pro Frame. Ohne Hinweis oder wenn lokal nichts Plausibles liegt: volle Suche.
   */
  project(px: number, py: number, hint?: number, window = 40): TrackPos {
    let best = { dist2: Infinity, s: 0, d: 0 };
    let bestSeg = 0;
    const scan = (from: number, count: number) => {
      for (let k = 0; k < count; k++) {
        const i = (((from + k) % this.n) + this.n) % this.n;
        const r = this.projectOnSeg(i, px, py);
        if (r.dist2 < best.dist2) {
          best = r;
          bestSeg = i;
        }
      }
    };
    if (hint !== undefined) {
      scan(hint - window, 2 * window + 1);
      const maxW = Math.max(this.wl[bestSeg]!, this.wr[bestSeg]!) + 60;
      if (best.dist2 > maxW * maxW) scan(0, this.n);
    } else {
      scan(0, this.n);
    }
    return { s: this.wrap(best.s), d: best.d, seg: bestSeg };
  }

  /** Untergrund an (s, d). Zonen gehen vor; sonst Asphalt innerhalb der Breite, außerhalb Gras. */
  surfaceAt(s: number, d: number): Surface {
    for (const z of this.data.zones) {
      const inS = z.s0 <= z.s1 ? s >= z.s0 && s <= z.s1 : s >= z.s0 || s <= z.s1;
      if (inS && d >= z.dMin && d <= z.dMax) return z.surface;
    }
    const f = this.frameAt(s);
    if (d >= -f.widthLeft && d <= f.widthRight) return "asphalt";
    return "grass";
  }
}
