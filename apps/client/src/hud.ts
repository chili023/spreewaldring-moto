import type { Track } from "@moto/shared/track";

const $ = (id: string) => document.getElementById(id)!;

export function fmtTime(t: number | null): string {
  if (t === null || !isFinite(t)) return "–";
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, "0")}`;
}

export class Hud {
  private mm = $("minimap") as HTMLCanvasElement;
  private mmCtx = this.mm.getContext("2d")!;
  private mmPath: Path2D;
  private mmMap: (x: number, y: number) => [number, number];
  private msgUntil = 0;
  maxLean = 0;

  constructor(track: Track) {
    const pts = track.data.points;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pts) {
      x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]);
      y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
    }
    const pad = 12;
    const sc = Math.min((this.mm.width - 2 * pad) / (x1 - x0), (this.mm.height - 2 * pad) / (y1 - y0));
    const ox = (this.mm.width - (x1 - x0) * sc) / 2;
    const oy = (this.mm.height - (y1 - y0) * sc) / 2;
    this.mmMap = (x, y) => [ox + (x - x0) * sc, this.mm.height - (oy + (y - y0) * sc)];
    this.mmPath = new Path2D();
    pts.forEach((p, i) => {
      const [u, v] = this.mmMap(p[0], p[1]);
      if (i === 0) this.mmPath.moveTo(u, v);
      else this.mmPath.lineTo(u, v);
    });
    this.mmPath.closePath();
  }

  message(text: string, seconds: number, now: number) {
    $("msg").textContent = text;
    this.msgUntil = now + seconds;
  }

  update(o: {
    now: number;
    v: number; gear: number; rpm: number; redline: number; lean: number; gripUse: number;
    lap: number; sector: number; current: number; last: number | null; best: number | null; delta: number | null;
    x: number; y: number; others?: { x: number; y: number; color: string }[];
  }) {
    $("speed").firstChild!.textContent = String(Math.round(o.v * 3.6));
    $("gear").textContent = o.v < 0.5 && o.rpm < 2000 ? "N" : `${o.gear}.`;
    $("rpm").textContent = (Math.round(o.rpm / 100) * 100).toLocaleString("de-DE");
    ($("rpmbar").firstElementChild as HTMLElement).style.width = `${Math.min(100, (o.rpm / o.redline) * 100)}%`;
    ($("grip").firstElementChild as HTMLElement).style.width = `${Math.min(100, o.gripUse * 100)}%`;
    const leanDeg = Math.round(Math.abs(o.lean) * 180 / Math.PI);
    this.maxLean = Math.max(this.maxLean, leanDeg);
    $("lean").firstChild!.textContent = `${leanDeg}° ${o.lean > 0.02 ? "▶" : o.lean < -0.02 ? "◀" : ""}`;
    $("leanmax").textContent = String(this.maxLean);
    $("lap").textContent = o.lap > 0 ? String(o.lap) : "Aus";
    $("sector").textContent = o.lap > 0 ? String(o.sector) : "–";
    $("cur").textContent = fmtTime(o.current);
    $("last").textContent = fmtTime(o.last);
    $("best").textContent = fmtTime(o.best);
    const de = $("delta");
    if (o.delta === null) {
      de.textContent = "–";
      de.className = "";
    } else {
      de.textContent = `${o.delta >= 0 ? "+" : "−"}${Math.abs(o.delta).toFixed(2)}`;
      de.className = o.delta <= 0 ? "good" : "bad";
    }
    if (o.now > this.msgUntil) $("msg").textContent = "";

    const c = this.mmCtx;
    c.clearRect(0, 0, this.mm.width, this.mm.height);
    c.lineWidth = 5;
    c.strokeStyle = "#ddd";
    c.stroke(this.mmPath);
    for (const p of o.others ?? []) {
      const [u, v] = this.mmMap(p.x, p.y);
      c.fillStyle = p.color;
      c.beginPath(); c.arc(u, v, 4, 0, Math.PI * 2); c.fill();
    }
    const [u, v] = this.mmMap(o.x, o.y);
    c.fillStyle = "#e22";
    c.beginPath(); c.arc(u, v, 5, 0, Math.PI * 2); c.fill();
  }
}
