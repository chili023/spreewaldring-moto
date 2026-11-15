/** Untergrundarten. Reihenfolge ist Teil des Datenformats, nicht umsortieren. */
export const SURFACES = ["asphalt", "curb", "grass", "gravel", "wet", "barrier"] as const;
export type Surface = (typeof SURFACES)[number];

/**
 * Untergrund-Zone entlang der Strecke.
 * s0/s1: Bereich in Metern Laufstrecke (s0 > s1 erlaubt = über Start/Ziel hinweg).
 * dMin/dMax: seitlicher Abstand zur Mittellinie in Metern (links negativ, rechts positiv).
 */
export interface SurfaceZone {
  s0: number;
  s1: number;
  dMin: number;
  dMax: number;
  surface: Surface;
}

/** Datei-Format `track.json` (Version 1). Koordinaten lokal in Metern: x = Ost, y = Nord, z = Höhe. */
export interface TrackFile {
  version: 1;
  name: string;
  /** Quell-Koordinatensystem; origin ist der lokale Nullpunkt darin. */
  crs: string;
  origin: { e: number; n: number; h: number };
  /** Fahrtrichtung, wie sie aus der Linie folgt (zur Kontrolle). */
  direction: "cw" | "ccw";
  /** Abstand der Stützpunkte in Metern. */
  spacing: number;
  /** Rundenlänge in Metern. */
  length: number;
  /** Stützpunkte: [x, y, z, breiteLinks, breiteRechts]. Geschlossene Linie, letzter Punkt != erster. */
  points: [number, number, number, number, number][];
  /** s-Werte der Sektorgrenzen (ohne 0 = Start/Ziel). */
  sectors: number[];
  /** s-Werte versteckter Checkpoints für die Rundenprüfung. */
  checkpoints: number[];
  zones: SurfaceZone[];
  /** Herkunft und Namensnennung der Daten. */
  sources: string[];
  /** Freitext-Hinweise der Pipeline (z. B. "Breite geschätzt"). */
  notes: string[];
}
