import type { Surface } from "../track/types";

/** Kenndaten des Motorrads (fiktive 600er-Supersport) plus Fahrer. Alle Werte SI. */
export interface BikeParams {
  /** Gesamtmasse Motorrad + Fahrer [kg]. */
  mass: number;
  wheelbase: number;
  /** Schwerpunkthöhe [m]. */
  cogHeight: number;
  /** Waagerechter Abstand Hinterrad-Aufstandspunkt -> Schwerpunkt [m]. */
  cogFromRear: number;
  wheelRadius: number;
  /** Luftwiderstand c_w * A [m²] (geduckt). */
  cdA: number;
  airDensity: number;
  rollingResistance: number;
  /** Drehmomentkurve: [Drehzahl, Nm] aufsteigend; dazwischen linear. */
  torqueCurve: [number, number][];
  idleRpm: number;
  redline: number;
  /** Mindestdrehzahl beim Anfahren (Kupplung schleift). */
  launchRpm: number;
  primaryRatio: number;
  finalRatio: number;
  gearRatios: number[];
  drivetrainEfficiency: number;
  /** Automatik-Schaltpunkte [U/min]. */
  shiftUpRpm: number;
  shiftDownRpm: number;
  shiftTime: number;
  /** Bremsvermögen vorne/hinten als Vielfaches von g bei voller Betätigung. */
  frontBrakeG: number;
  rearBrakeG: number;
  /** Motorbremse bei geschlossenem Gas [m/s² bei Nenndrehzahl]. */
  engineBrake: number;
  /** Größte Schräglage [rad]. */
  maxLean: number;
  /** Rollrate [rad/s] bei Stillstand und bei 70 m/s (dazwischen linear). */
  rollRateLow: number;
  rollRateHigh: number;
  /** Größter Lenkeinschlag bei Schritttempo [rad]. */
  maxSteer: number;
  /** Unter dieser Geschwindigkeit kinematisch lenken, darüber über Schräglage [m/s]. */
  lowSpeedBlend: [number, number];
}

/** Fahrhilfen (Simcade). */
export interface Aids {
  /** Schräglage nicht über die Haftgrenze hinaus zulassen (Motorrad schiebt stattdessen weit). */
  leanCap: boolean;
  /** Traktionskontrolle: Antrieb nie über den verbleibenden Haftkreis. */
  tractionControl: boolean;
  /** ABS: Bremsen aufrecht nie über die Haftgrenze. In Schräglage gilt der Haftkreis trotzdem. */
  abs: boolean;
  /** Toleranz, bevor Haftkreis-Überschreitung zum Sturz führt (1.0 = keine). */
  crashMargin: number;
  /** So lange darf die Überschreitung dauern, bevor es zum Sturz kommt [s]. */
  crashDelay: number;
}

export interface SurfaceProps {
  /** Reibwert. */
  mu: number;
  /** Zusätzlicher Rollwiderstand als Verzögerung [m/s²]. */
  drag: number;
  /** Zusätzliche quadratische Verzögerung [1/m]. */
  dragQuad: number;
  /** Vibration fürs Gamepad/Kamera (0..1). */
  rumble: number;
}

export const SURFACE_PROPS: Record<Surface, SurfaceProps> = {
  asphalt: { mu: 1.2, drag: 0, dragQuad: 0, rumble: 0 },
  curb: { mu: 1.0, drag: 0.2, dragQuad: 0, rumble: 0.6 },
  wet: { mu: 0.6, drag: 0, dragQuad: 0, rumble: 0 },
  grass: { mu: 0.5, drag: 2.0, dragQuad: 0.01, rumble: 0.4 },
  gravel: { mu: 0.4, drag: 5.0, dragQuad: 0.03, rumble: 1.0 },
  barrier: { mu: 0.4, drag: 30, dragQuad: 0, rumble: 1.0 },
};

export const DEFAULT_BIKE: BikeParams = {
  mass: 185 + 75,
  wheelbase: 1.38,
  cogHeight: 0.62,
  cogFromRear: 0.68,
  wheelRadius: 0.31,
  cdA: 0.32,
  airDensity: 1.2,
  rollingResistance: 0.015,
  torqueCurve: [
    [1500, 30],
    [4000, 42],
    [7000, 52],
    [9500, 58],
    [11500, 66],
    [13000, 62],
    [14500, 52],
    [15000, 0],
  ],
  idleRpm: 1500,
  redline: 14500,
  launchRpm: 5500,
  primaryRatio: 2.07,
  finalRatio: 2.69,
  gearRatios: [2.58, 1.95, 1.6, 1.36, 1.21, 1.11],
  drivetrainEfficiency: 0.9,
  shiftUpRpm: 14000,
  shiftDownRpm: 8000,
  shiftTime: 0.06,
  frontBrakeG: 1.15,
  rearBrakeG: 0.45,
  engineBrake: 1.2,
  maxLean: (55 * Math.PI) / 180,
  rollRateLow: 4.0,
  rollRateHigh: 1.5,
  maxSteer: (30 * Math.PI) / 180,
  lowSpeedBlend: [3, 7],
};

export const DEFAULT_AIDS: Aids = {
  leanCap: true,
  tractionControl: true,
  abs: true,
  crashMargin: 1.08,
  crashDelay: 0.15,
};
