import { describe, expect, it } from "vitest";
import { createBike, DT, G, stepBike, type BikeInput, type Env } from "./bike";
import { DEFAULT_AIDS, DEFAULT_BIKE, SURFACE_PROPS } from "./params";

const asphalt: Env = { surface: SURFACE_PROPS.asphalt, z: 0 };
const input = (o: Partial<BikeInput>): BikeInput => ({ steer: 0, throttle: 0, frontBrake: 0, rearBrake: 0, shift: 0, ...o });
const run = (seconds: number, fn: (t: number) => void) => {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) fn(i * DT);
};

function circumradius(a: [number, number], b: [number, number], c: [number, number]): number {
  const ab = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const bc = Math.hypot(c[0] - b[0], c[1] - b[1]);
  const ca = Math.hypot(a[0] - c[0], a[1] - c[1]);
  const area2 = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]));
  return (ab * bc * ca) / (2 * area2);
}

describe("Fahrphysik", () => {
  it("stationäre Kreisfahrt: r = v² / (g·tan φ) auf ±2 %", () => {
    // Ohne Widerstände, damit v konstant bleibt
    const params = { ...DEFAULT_BIKE, cdA: 0, rollingResistance: 0, engineBrake: 0 };
    const b = createBike(0, 0, 0, 0);
    b.v = 25;
    const steer = 0.6;
    run(3, () => stepBike(b, input({ steer }), asphalt, DT, { params })); // Schräglage einschwingen
    const lean = b.lean;
    const xs: number[] = [];
    const ys: number[] = [];
    run(4, () => {
      stepBike(b, input({ steer }), asphalt, DT, { params });
      xs.push(b.x);
      ys.push(b.y);
    });
    // Kreismittelpunkt: Mittel der Punkte über ganze Umläufe ist ungenau, daher Radius aus Krümmung
    const rExpected = (b.v * b.v) / (G * Math.tan(lean));
    const rMeasured = b.v / Math.abs(b.yawRate);
    expect(Math.abs(rMeasured - rExpected) / rExpected).toBeLessThan(0.02);
    // Rechts lehnen -> im Uhrzeigersinn (Gierrate negativ)
    expect(b.yawRate).toBeLessThan(0);
    // und die Spur ist tatsächlich ein Kreis dieses Radius
    const r = circumradius(
      [xs[0]!, ys[0]!],
      [xs[xs.length >> 1]!, ys[ys.length >> 1]!],
      [xs[xs.length - 1]!, ys[ys.length - 1]!],
    );
    expect(Math.abs(r - rExpected) / rExpected).toBeLessThan(0.02);
  });

  it("erreicht eine plausible Höchstgeschwindigkeit (250–290 km/h)", () => {
    const b = createBike(0, 0, 0, 0);
    run(60, () => stepBike(b, input({ throttle: 1 }), asphalt, DT));
    const kmh = b.v * 3.6;
    expect(kmh).toBeGreaterThan(250);
    expect(kmh).toBeLessThan(290);
    expect(b.gear).toBe(6);
  });

  it("0–100 km/h in 2,8–4,0 s", () => {
    const b = createBike(0, 0, 0, 0);
    let t100 = -1;
    run(10, (t) => {
      stepBike(b, input({ throttle: 1 }), asphalt, DT);
      if (t100 < 0 && b.v >= 100 / 3.6) t100 = t;
    });
    expect(t100).toBeGreaterThan(2.8);
    expect(t100).toBeLessThan(4.0);
  });

  it("Vollbremsung aufrecht 100–0 km/h in 33–45 m ohne Sturz (ABS)", () => {
    const b = createBike(0, 0, 0, 0);
    b.v = 100 / 3.6;
    b.gear = 3;
    run(6, () => stepBike(b, input({ frontBrake: 1, rearBrake: 1 }), asphalt, DT));
    expect(b.v).toBe(0);
    expect(b.crashed).toBe(false);
    expect(b.x).toBeGreaterThan(33);
    expect(b.x).toBeLessThan(45);
  });

  it("Vollbremsung in voller Schräglage führt zum Sturz", () => {
    const b = createBike(0, 0, 0, 0);
    b.v = 30;
    b.gear = 4;
    run(2, () => stepBike(b, input({ steer: 1 }), asphalt, DT));
    expect(b.crashed).toBe(false);
    run(1, () => stepBike(b, input({ steer: 1, frontBrake: 1 }), asphalt, DT));
    expect(b.crashed).toBe(true);
  });

  it("ohne Schräglagen-Begrenzung führt zu viel Schräglage zum Sturz", () => {
    const b = createBike(0, 0, 0, 0);
    b.v = 30;
    run(3, () => stepBike(b, input({ steer: 1 }), asphalt, DT, { aids: { ...DEFAULT_AIDS, leanCap: false } }));
    expect(b.crashed).toBe(true);
  });

  it("auf Kies bremst das Motorrad stark ab", () => {
    const b = createBike(0, 0, 0, 0);
    b.v = 30;
    b.gear = 4;
    run(3, () => stepBike(b, input({}), { surface: SURFACE_PROPS.gravel, z: 0 }, DT));
    expect(b.v).toBeLessThan(10);
  });

  it("ist deterministisch", () => {
    const sim = () => {
      const b = createBike(0, 0, 0, 0);
      run(20, (t) =>
        stepBike(b, input({ throttle: t % 4 < 2 ? 1 : 0, steer: Math.sin(t), frontBrake: t % 4 > 3 ? 0.7 : 0 }), asphalt, DT),
      );
      return [b.x, b.y, b.v, b.lean, b.heading];
    };
    expect(sim()).toEqual(sim());
  });
});
