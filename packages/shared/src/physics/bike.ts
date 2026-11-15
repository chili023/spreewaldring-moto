import { DEFAULT_AIDS, DEFAULT_BIKE, SURFACE_PROPS, type Aids, type BikeParams, type SurfaceProps } from "./params";

export const G = 9.81;
/** Fester Physik-Zeitschritt [s]. */
export const DT = 1 / 120;

export interface BikeInput {
  /** -1 = links, +1 = rechts (gewünschte Schräglage). */
  steer: number;
  /** 0..1 */
  throttle: number;
  /** 0..1 */
  frontBrake: number;
  /** 0..1 */
  rearBrake: number;
  /** Manuell schalten: +1 hoch, -1 runter, 0 nichts (nur wirksam, wenn autoShift aus). */
  shift: -1 | 0 | 1;
}

export const NO_INPUT: BikeInput = { steer: 0, throttle: 0, frontBrake: 0, rearBrake: 0, shift: 0 };

export interface BikeState {
  x: number;
  y: number;
  z: number;
  /** Gierwinkel [rad], 0 = Ost, gegen den Uhrzeigersinn positiv. */
  heading: number;
  /** Geschwindigkeit [m/s], >= 0. */
  v: number;
  /** Schräglage [rad], positiv = nach rechts. */
  lean: number;
  /** 1-basiert. */
  gear: number;
  rpm: number;
  shiftTimer: number;
  /** Wie lange der Haftkreis schon überschritten ist [s]. */
  slipTimer: number;
  crashed: boolean;
  crashTime: number;
  /** Für HUD/Audio/Kamera: */
  yawRate: number;
  aLong: number;
  aLat: number;
  /** Ausnutzung des Haftkreises (1 = Grenze). */
  gripUse: number;
  /** Anteil Vorderrad-Entlastung (Wheelie) bzw. Hinterrad (Stoppie), 0..1, nur Optik. */
  pitch: number;
}

export interface Env {
  surface: SurfaceProps;
  /** Fahrbahnhöhe an der Position. */
  z: number;
}

export interface Options {
  params?: BikeParams;
  aids?: Aids;
  autoShift?: boolean;
}

export function createBike(x: number, y: number, z: number, heading: number): BikeState {
  return {
    x, y, z, heading, v: 0, lean: 0, gear: 1, rpm: DEFAULT_BIKE.idleRpm, shiftTimer: 0, slipTimer: 0,
    crashed: false, crashTime: 0, yawRate: 0, aLong: 0, aLat: 0, gripUse: 0, pitch: 0,
  };
}

export function respawn(s: BikeState, x: number, y: number, z: number, heading: number): void {
  Object.assign(s, createBike(x, y, z, heading));
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export function torqueAt(p: BikeParams, rpm: number): number {
  const c = p.torqueCurve;
  if (rpm <= c[0]![0]) return c[0]![1];
  for (let i = 1; i < c.length; i++) {
    const [r1, t1] = c[i]!;
    if (rpm <= r1) {
      const [r0, t0] = c[i - 1]!;
      return t0 + ((t1 - t0) * (rpm - r0)) / (r1 - r0);
    }
  }
  return 0;
}

export function totalRatio(p: BikeParams, gear: number): number {
  return p.primaryRatio * p.finalRatio * p.gearRatios[gear - 1]!;
}

export function rpmFor(p: BikeParams, v: number, gear: number): number {
  return ((v / p.wheelRadius) * 60 * totalRatio(p, gear)) / (2 * Math.PI);
}

/**
 * Einen Zeitschritt rechnen. Verändert `s` direkt (keine Allokation pro Frame).
 * Deterministisch: gleiche Eingaben in gleicher Reihenfolge -> gleiche Ergebnisse.
 */
export function stepBike(s: BikeState, input: BikeInput, env: Env, dt: number, opt: Options = {}): void {
  const p = opt.params ?? DEFAULT_BIKE;
  const aids = opt.aids ?? DEFAULT_AIDS;
  const autoShift = opt.autoShift ?? true;
  s.z = env.z;

  if (s.crashed) {
    // Rutschen bis zum Stillstand, Motorrad liegt
    s.crashTime += dt;
    s.v = Math.max(0, s.v - (6 + env.surface.drag) * dt);
    s.lean += (Math.sign(s.lean || 1) * 1.45 - s.lean) * Math.min(1, 6 * dt);
    s.x += s.v * Math.cos(s.heading) * dt;
    s.y += s.v * Math.sin(s.heading) * dt;
    s.yawRate = 0;
    s.rpm = p.idleRpm;
    return;
  }

  const mu = env.surface.mu;
  const gripMax = mu * G;
  const v = s.v;

  // --- Schräglage ---------------------------------------------------------
  let target = clamp(input.steer, -1, 1) * p.maxLean;
  if (aids.leanCap) {
    const cap = Math.atan(mu * 0.97);
    target = clamp(target, -cap, cap);
  }
  const rollRate = p.rollRateLow + (p.rollRateHigh - p.rollRateLow) * clamp(v / 70, 0, 1);
  const dLean = clamp((target - s.lean) * Math.min(1, 10 * dt), -rollRate * dt, rollRate * dt);
  s.lean += dLean;

  // --- Gierrate: Schritttempo kinematisch, sonst aus der Schräglage ---------
  const b = smoothstep(p.lowSpeedBlend[0], p.lowSpeedBlend[1], v);
  const wKin = (-v * Math.tan(clamp(input.steer, -1, 1) * p.maxSteer)) / p.wheelbase;
  const wLean = (-G * Math.tan(s.lean)) / Math.max(v, 0.5);
  const yawRate = (1 - b) * wKin + b * wLean;
  const aLat = v * Math.abs(yawRate);

  // --- Getriebe -----------------------------------------------------------
  if (s.shiftTimer > 0) s.shiftTimer = Math.max(0, s.shiftTimer - dt);
  const rpmNow = rpmFor(p, v, s.gear);
  if (autoShift) {
    if (rpmNow > p.shiftUpRpm && s.gear < p.gearRatios.length) {
      s.gear++;
      s.shiftTimer = p.shiftTime;
    } else if (s.gear > 1 && rpmNow < p.shiftDownRpm && rpmFor(p, v, s.gear - 1) < p.shiftUpRpm - 800) {
      s.gear--;
      s.shiftTimer = p.shiftTime;
    }
  } else if (input.shift !== 0 && s.shiftTimer === 0) {
    const g = clamp(s.gear + input.shift, 1, p.gearRatios.length);
    if (g !== s.gear && (g > s.gear || rpmFor(p, v, g) < p.redline)) {
      s.gear = g;
      s.shiftTimer = p.shiftTime;
    }
  }
  const ratio = totalRatio(p, s.gear);
  const throttle = clamp(input.throttle, 0, 1);
  let rpm = Math.max(rpmFor(p, v, s.gear), p.idleRpm);
  const rpmTorque = s.gear === 1 && throttle > 0 ? Math.max(rpm, p.launchRpm) : rpm;
  if (s.gear === 1 && throttle > 0) rpm = Math.max(rpm, p.idleRpm + (p.launchRpm - p.idleRpm) * throttle);
  s.rpm = Math.min(rpm, p.redline + 200);

  // --- Längskräfte (als Beschleunigungen) ---------------------------------
  let aDrive = 0;
  if (s.shiftTimer === 0 && rpm < p.redline) {
    aDrive = (throttle * torqueAt(p, rpmTorque) * ratio * p.drivetrainEfficiency) / p.wheelRadius / p.mass;
  }
  const wheelieLimit = (G * p.cogFromRear) / p.cogHeight;
  aDrive = Math.min(aDrive, wheelieLimit);

  // Bremse und Motorbremse teilen sich die Grenzen (Stoppie, Haftung)
  const aEngine = throttle < 0.05 ? p.engineBrake * clamp(rpm / p.redline, 0, 1) * (ratio / totalRatio(p, 1)) ** 0.5 : 0;
  let aBrake = (clamp(input.frontBrake, 0, 1) * p.frontBrakeG + clamp(input.rearBrake, 0, 1) * p.rearBrakeG) * G + aEngine;
  const stoppieLimit = (G * (p.wheelbase - p.cogFromRear)) / p.cogHeight;
  aBrake = Math.min(aBrake, stoppieLimit);
  if (aids.abs) aBrake = Math.min(aBrake, gripMax);

  if (aids.tractionControl) {
    const avail = Math.sqrt(Math.max(0, gripMax * gripMax - aLat * aLat));
    aDrive = Math.min(aDrive, avail);
  }

  const aResist =
    (0.5 * p.airDensity * p.cdA * v * v) / p.mass +
    p.rollingResistance * G +
    env.surface.drag +
    env.surface.dragQuad * v * v;

  // Reifen-Längskraft (Luftwiderstand geht nicht über die Reifen)
  const tireLong = aDrive - (v > 0 ? aBrake : 0);
  const aLong = aDrive - (v > 0 ? aBrake + aResist : 0);

  // --- Haftkreis / Sturz --------------------------------------------------
  const use = Math.hypot(aLat, tireLong) / gripMax;
  s.gripUse = use;
  if (use > aids.crashMargin && v > 2) {
    s.slipTimer += dt;
  } else {
    s.slipTimer = Math.max(0, s.slipTimer - 2 * dt);
  }
  if (s.slipTimer > aids.crashDelay) {
    s.crashed = true;
    s.crashTime = 0;
  }

  // --- Integration --------------------------------------------------------
  s.v = Math.max(0, v + aLong * dt);
  s.heading += yawRate * dt;
  s.x += s.v * Math.cos(s.heading) * dt;
  s.y += s.v * Math.sin(s.heading) * dt;
  s.yawRate = yawRate;
  s.aLong = aLong;
  s.aLat = aLat;
  s.pitch = clamp(aDrive / wheelieLimit - aBrake / stoppieLimit, -1, 1);
}

export { SURFACE_PROPS };
