/**
 * Einfacher Motorsound (Platzhalter): zwei Sägezahn-Oszillatoren auf Zündfrequenz
 * eines Vierzylinders (2 Zündungen pro Umdrehung), Tiefpass nach Gas, dazu Fahrtwind.
 * Wird später durch aufgenommene Samples ersetzt.
 */
export class EngineAudio {
  private ctx: AudioContext | null = null;
  private o1!: OscillatorNode;
  private o2!: OscillatorNode;
  private filter!: BiquadFilterNode;
  private gain!: GainNode;
  private wind!: GainNode;
  muted = false;

  start(): void {
    if (this.ctx) return;
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.Q.value = 4;
    this.o1 = ctx.createOscillator();
    this.o1.type = "sawtooth";
    this.o2 = ctx.createOscillator();
    this.o2.type = "square";
    const g2 = ctx.createGain();
    g2.gain.value = 0.35;
    this.o1.connect(this.filter);
    this.o2.connect(g2).connect(this.filter);
    this.filter.connect(this.gain).connect(ctx.destination);
    // Fahrtwind: Rauschen durch Bandpass
    const noise = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noise.buffer = buf;
    noise.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 700;
    this.wind = ctx.createGain();
    this.wind.gain.value = 0;
    noise.connect(bp).connect(this.wind).connect(ctx.destination);
    this.o1.start();
    this.o2.start();
    noise.start();
  }

  update(rpm: number, throttle: number, speed: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = (rpm / 60) * 2;
    this.o1.frequency.setTargetAtTime(f, t, 0.02);
    this.o2.frequency.setTargetAtTime(f / 2, t, 0.02);
    this.filter.frequency.setTargetAtTime(400 + throttle * 2600 + rpm * 0.08, t, 0.04);
    const vol = this.muted ? 0 : 0.05 + throttle * 0.08;
    this.gain.gain.setTargetAtTime(vol, t, 0.05);
    this.wind.gain.setTargetAtTime(this.muted ? 0 : Math.min(0.25, (speed / 80) ** 2 * 0.25), t, 0.1);
  }
}
