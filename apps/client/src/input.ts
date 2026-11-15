import type { BikeInput } from "@moto/shared/physics";

/**
 * Tastatur und Gamepad -> BikeInput. Tastatur hat Rampen, damit digitale Tasten
 * wie ein analoger Eingang wirken (sonst ist ein Motorrad mit Tasten kaum fahrbar).
 */
export class Input {
  private keys = new Set<string>();
  private steer = 0;
  private throttle = 0;
  private brake = 0;
  private pressed = new Set<string>();
  usingGamepad = false;

  constructor() {
    addEventListener("keydown", (e) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      this.usingGamepad = false;
    });
    addEventListener("keyup", (e) => this.keys.delete(e.code));
    addEventListener("blur", () => this.keys.clear());
  }

  /** Einmalig gedrückte Taste abholen (z. B. Kamera wechseln). */
  take(code: string): boolean {
    const had = this.pressed.has(code);
    this.pressed.delete(code);
    return had;
  }

  private gamepad(): Gamepad | null {
    for (const g of navigator.getGamepads?.() ?? []) if (g && g.connected) return g;
    return null;
  }

  read(dt: number, speed: number): BikeInput {
    const k = this.keys;
    const gp = this.gamepad();
    if (gp) {
      const sx = gp.axes[0] ?? 0;
      const rt = gp.buttons[7]?.value ?? 0;
      const lt = gp.buttons[6]?.value ?? 0;
      if (Math.abs(sx) > 0.15 || rt > 0.05 || lt > 0.05) this.usingGamepad = true;
      if (gp.buttons[3]?.pressed) this.pressed.add("KeyC");
      if (gp.buttons[9]?.pressed) this.pressed.add("KeyR");
      if (this.usingGamepad) {
        const dz = (v: number) => (Math.abs(v) < 0.08 ? 0 : (v - Math.sign(v) * 0.08) / 0.92);
        const s = dz(sx);
        return {
          steer: Math.sign(s) * Math.abs(s) ** 1.3,
          throttle: rt,
          frontBrake: lt,
          rearBrake: gp.buttons[2]?.pressed ? 1 : 0,
          shift: 0,
        };
      }
    }
    const left = k.has("ArrowLeft") || k.has("KeyA");
    const right = k.has("ArrowRight") || k.has("KeyD");
    const target = (right ? 1 : 0) - (left ? 1 : 0);
    // Bei hohem Tempo langsamer einlenken, damit Tastatur nicht zu ruppig ist
    const rate = (target === 0 ? 4.0 : 2.2) * (speed > 30 ? 0.8 : 1);
    this.steer += Math.max(-rate * dt, Math.min(rate * dt, target - this.steer));
    const up = k.has("ArrowUp") || k.has("KeyW") ? 1 : 0;
    const down = k.has("ArrowDown") || k.has("KeyS") ? 1 : 0;
    this.throttle += Math.max(-6 * dt, Math.min(3 * dt, up - this.throttle));
    this.brake += Math.max(-8 * dt, Math.min(4 * dt, down - this.brake));
    return {
      steer: this.steer,
      throttle: this.throttle,
      frontBrake: this.brake,
      rearBrake: k.has("Space") ? 1 : 0,
      shift: 0,
    };
  }
}
