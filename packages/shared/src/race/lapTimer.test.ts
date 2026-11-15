import { describe, expect, it } from "vitest";
import { LapTimer, type Lap1D, type LapEvent } from "./lapTimer";

const L = 1000;
const track: Lap1D = {
  length: L,
  delta(a, b) {
    let d = (((b - a) % L) + L) % L;
    if (d > L / 2) d -= L;
    return d;
  },
};
const wrap = (s: number) => ((s % L) + L) % L;

function drive(timer: LapTimer, from: number, to: number, speed: number, t0: number, dt = 0.1) {
  const ev: LapEvent[] = [];
  let s = from;
  let t = t0;
  while (s < to) {
    const ns = s + speed * dt;
    ev.push(...timer.update(wrap(s), wrap(ns), t, t + dt, dt));
    s = ns;
    t += dt;
  }
  return { ev, t };
}

describe("LapTimer", () => {
  it("startet beim ersten Überfahren und misst die Runde exakt", () => {
    const timer = new LapTimer(track, [300, 600], [100, 500, 900]);
    const a = drive(timer, 950, 1000 + 1000 + 10, 50, 0);
    const kinds = a.ev.map((e) => e.kind);
    expect(kinds).toEqual(["start", "sector", "sector", "lap"]);
    const lap = a.ev.find((e) => e.kind === "lap")!;
    expect(lap.kind === "lap" && lap.time).toBeCloseTo(20, 6);
    expect(lap.kind === "lap" && lap.valid).toBe(true);
    expect(timer.best).toBeCloseTo(20, 6);
    expect(lap.kind === "lap" && lap.sectors.reduce((x, y) => x + y)).toBeCloseTo(20, 6);
  });

  it("Abkürzen über fehlende Checkpoints macht die Runde ungültig", () => {
    const timer = new LapTimer(track, [], [100, 500, 900]);
    drive(timer, 990, 1010, 10, 0); // Start
    // Sprung von s=10 nach s=400 überspringt Checkpoint 100 (Abkürzung)
    timer.update(400, 600, 10, 10.1, 0.1);
    const { ev } = drive(timer, 600, 1010, 50, 10.1);
    const lap = ev.find((e) => e.kind === "lap");
    expect(lap && lap.kind === "lap" && lap.valid).toBe(false);
    expect(timer.best).toBeNull();
  });

  it("erkennt Falschfahrt", () => {
    const timer = new LapTimer(track, [], []);
    let s = 500;
    for (let i = 0; i < 20; i++) {
      timer.update(s, s - 1, i * 0.1, (i + 1) * 0.1, 0.1);
      s -= 1;
    }
    expect(timer.wrongWay).toBe(true);
  });

  it("Rückwärts über die Linie zählt keine Runde", () => {
    const timer = new LapTimer(track, [], []);
    const ev = timer.update(5, 995, 0, 0.1, 0.1);
    expect(ev).toHaveLength(0);
  });
});
