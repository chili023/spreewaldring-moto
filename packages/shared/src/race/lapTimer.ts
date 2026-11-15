/** Minimal-Schnittstelle der Strecke, die der Rundenzähler braucht. */
export interface Lap1D {
  readonly length: number;
  /** Vorzeichenbehaftete Differenz b - a auf dem Rundkurs. */
  delta(a: number, b: number): number;
}

export type LapEvent =
  | { kind: "start"; t: number }
  | { kind: "sector"; index: number; time: number; t: number }
  | { kind: "lap"; lap: number; time: number; valid: boolean; sectors: number[]; t: number };

/**
 * Zeitnahme über die Laufstrecke s. Erkennt Überfahren von Start/Ziel, Sektorgrenzen und
 * Checkpoints in Fahrtrichtung, mit linear interpolierter Überfahrzeit.
 * Eine Runde ist gültig, wenn alle Checkpoints in dieser Runde passiert wurden.
 */
export class LapTimer {
  lap = 0;
  lapStart = -1;
  sectorStart = -1;
  sectorTimes: number[] = [];
  last: number | null = null;
  best: number | null = null;
  bestSectors: number[] = [];
  private cpHit: boolean[];
  /** Fortschritt seit Start (Meter, kann bei Rückwärtsfahrt sinken). */
  progress = 0;
  private wrongWayTime = 0;

  constructor(
    private readonly track: Lap1D,
    private readonly sectors: number[],
    private readonly checkpoints: number[],
  ) {
    this.cpHit = checkpoints.map(() => false);
  }

  get running(): boolean {
    return this.lapStart >= 0;
  }

  /** Ist der Fahrer seit über 1,5 s falsch herum unterwegs? */
  get wrongWay(): boolean {
    return this.wrongWayTime > 1.5;
  }

  current(t: number): number {
    return this.running ? t - this.lapStart : 0;
  }

  /** Wurde `mark` zwischen prevS und s vorwärts überfahren? Liefert den Anteil 0..1 oder -1. */
  private crossed(prevS: number, s: number, mark: number): number {
    const step = this.track.delta(prevS, s);
    if (step <= 0) return -1;
    const toMark = this.track.delta(prevS, mark);
    if (toMark > 0 && toMark <= step) return toMark / step;
    return -1;
  }

  /**
   * Nach jedem Physik-Schritt aufrufen.
   * @param dt Länge des Schritts, für die Falschfahrt-Erkennung
   */
  update(prevS: number, s: number, tPrev: number, t: number, dt: number): LapEvent[] {
    const ev: LapEvent[] = [];
    const step = this.track.delta(prevS, s);
    this.progress += step;
    this.wrongWayTime = step < -1e-4 ? this.wrongWayTime + dt : Math.max(0, this.wrongWayTime - dt);

    this.checkpoints.forEach((c, i) => {
      if (this.crossed(prevS, s, c) >= 0) this.cpHit[i] = true;
    });

    if (this.running) {
      this.sectors.forEach((m, i) => {
        if (i !== this.sectorTimes.length) return;
        const f = this.crossed(prevS, s, m);
        if (f >= 0) {
          const tc = tPrev + f * (t - tPrev);
          const time = tc - this.sectorStart;
          this.sectorTimes.push(time);
          this.sectorStart = tc;
          ev.push({ kind: "sector", index: i, time, t: tc });
        }
      });
    }

    const f = this.crossed(prevS, s, 0);
    if (f >= 0) {
      const tc = tPrev + f * (t - tPrev);
      if (this.running) {
        const time = tc - this.lapStart;
        const valid = this.cpHit.every(Boolean) && this.sectorTimes.length === this.sectors.length;
        const sectors = [...this.sectorTimes, tc - this.sectorStart];
        this.lap++;
        this.last = time;
        if (valid && (this.best === null || time < this.best)) {
          this.best = time;
          this.bestSectors = sectors;
        }
        ev.push({ kind: "lap", lap: this.lap, time, valid, sectors, t: tc });
      } else {
        ev.push({ kind: "start", t: tc });
      }
      this.lapStart = tc;
      this.sectorStart = tc;
      this.sectorTimes = [];
      this.cpHit = this.checkpoints.map(() => false);
    }
    return ev;
  }

  /** Zeitnahme abbrechen (z. B. Neustart an der Box). */
  reset(): void {
    this.lapStart = -1;
    this.sectorStart = -1;
    this.sectorTimes = [];
    this.cpHit = this.checkpoints.map(() => false);
  }
}
