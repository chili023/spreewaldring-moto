import * as THREE from "three";
import GUI from "lil-gui";
import { Track, type TrackFile } from "@moto/shared/track";
import {
  createBike,
  DEFAULT_AIDS,
  DEFAULT_BIKE,
  DT,
  respawn,
  stepBike,
  SURFACE_PROPS,
  type BikeState,
} from "@moto/shared/physics";
import { LapTimer } from "@moto/shared/race";
import { createBikeMesh, createGround, createRenderer, createTrackMesh, createWorld, toThree, type GroundInfo } from "./scene";
import { Input } from "./input";
import { Hud } from "./hud";
import { EngineAudio } from "./audio";

const BASE = `${import.meta.env.BASE_URL}data/`;

/** Ab diesem Abstand neben der Fahrbahn steht eine Begrenzung (Annahme bis Zonen erfasst sind). */
const RUNOFF = 25;
const RESPAWN_DELAY = 2.5;

interface GhostSample {
  /** Zeit seit Rundenstart */
  t: number;
  /** Fortschritt in der Runde [m] */
  p: number;
  x: number;
  y: number;
  z: number;
  h: number;
  l: number;
}

async function main() {
  const [trackData, groundInfo] = await Promise.all([
    fetch(BASE + "track.json").then((r) => r.json() as Promise<TrackFile>),
    fetch(BASE + "ground.json").then((r) => r.json() as Promise<GroundInfo>),
  ]);
  const track = new Track(trackData);

  const renderer = createRenderer();
  const scene = new THREE.Scene();
  const sun = createWorld(scene);
  await createGround(scene, groundInfo, trackData, BASE);
  createTrackMesh(scene, track);

  const bikeMesh = createBikeMesh();
  scene.add(bikeMesh.root);
  const ghostMesh = createBikeMesh(0x3388ff, 0.35);
  ghostMesh.root.visible = false;
  scene.add(ghostMesh.root);

  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 5000);
  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  const input = new Input();
  const hud = new Hud(track);
  const audio = new EngineAudio();
  const startAudio = () => audio.start();
  addEventListener("keydown", startAudio, { once: true });
  addEventListener("pointerdown", startAudio, { once: true });

  // --- Tuning-Panel (für M1: Fahrgefühl abstimmen) --------------------------
  const params = { ...DEFAULT_BIKE };
  const aids = { ...DEFAULT_AIDS };
  const tune = { maxLeanDeg: (params.maxLean * 180) / Math.PI, autoShift: true };
  const gui = new GUI({ title: "Fahrphysik" });
  gui.add(tune, "maxLeanDeg", 35, 65, 1).name("max. Schräglage °").onChange((v: number) => (params.maxLean = (v * Math.PI) / 180));
  gui.add(params, "rollRateLow", 1, 8, 0.1).name("Rollrate langsam");
  gui.add(params, "rollRateHigh", 0.5, 4, 0.1).name("Rollrate schnell");
  gui.add(params, "frontBrakeG", 0.5, 1.5, 0.05).name("Bremse vorne [g]");
  gui.add(params, "cdA", 0.2, 0.5, 0.01).name("c_w·A");
  gui.add(aids, "leanCap").name("Schräglage begrenzen");
  gui.add(aids, "tractionControl").name("Traktionskontrolle");
  gui.add(aids, "abs").name("ABS");
  gui.add(aids, "crashMargin", 1, 1.4, 0.01).name("Sturz-Toleranz");
  gui.close();

  // --- Zustand -----------------------------------------------------------------
  const bike: BikeState = createBike(0, 0, 0, 0);
  let seg = 0;
  let s = 0;
  let d = 0;
  const placeAt = (sAt: number, dAt = 0) => {
    const f = track.frameAt(sAt);
    const w = track.toWorld(sAt, dAt);
    respawn(bike, w.x, w.y, f.z, f.heading);
    const p = track.project(w.x, w.y);
    seg = p.seg;
    s = p.s;
    d = p.d;
  };
  placeAt(track.length - 30, 0);

  const timer = new LapTimer(track, trackData.sectors, trackData.checkpoints);
  let simTime = 0;
  let lapProgressStart = 0;
  let current: GhostSample[] = [];
  let best: GhostSample[] = loadGhost();
  let ghostRecordAcc = 0;

  let camMode: "chase" | "helmet" = "chase";
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  let camInit = false;

  const tmp = new THREE.Vector3();
  let last = performance.now();
  let acc = 0;

  function physicsStep(inp: ReturnType<Input["read"]>) {
    const prevS = s;
    const tPrev = simTime;
    const surfName = Math.abs(d) > Math.max(track.frameAt(s).widthLeft, track.frameAt(s).widthRight) + RUNOFF
      ? "barrier"
      : track.surfaceAt(s, d);
    const env = { surface: SURFACE_PROPS[surfName], z: track.frameAt(s).z };
    stepBike(bike, inp, env, DT, { params, aids, autoShift: tune.autoShift });
    if (surfName === "barrier" && !bike.crashed && bike.v > 8) bike.crashed = true;
    simTime += DT;
    const p = track.project(bike.x, bike.y, seg);
    seg = p.seg;
    s = p.s;
    d = p.d;
    for (const ev of timer.update(prevS, s, tPrev, simTime, DT)) {
      if (ev.kind === "start") {
        hud.message("Zeitnahme läuft", 1.5, simTime);
      } else if (ev.kind === "lap") {
        const isBest = ev.valid && timer.best === ev.time;
        hud.message(`${ev.valid ? "" : "UNGÜLTIG  "}${fmt(ev.time)}${isBest ? "  Bestzeit!" : ""}`, 3, simTime);
        if (isBest && current.length > 10) {
          best = current;
          saveGhost(best);
        }
      }
      if (ev.kind === "start" || ev.kind === "lap") {
        current = [];
        lapProgressStart = timer.progress;
        ghostRecordAcc = 1;
      }
    }
    // Geist aufzeichnen (20 Hz)
    if (timer.running) {
      ghostRecordAcc += DT;
      if (ghostRecordAcc >= 0.05) {
        ghostRecordAcc = 0;
        current.push({
          t: timer.current(simTime),
          p: timer.progress - lapProgressStart,
          x: bike.x, y: bike.y, z: bike.z, h: bike.heading, l: bike.lean,
        });
      }
    }
    if (bike.crashed && bike.crashTime > RESPAWN_DELAY) placeAt(s, 0);
  }

  function frame(now: number) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    acc += dt;
    const inp = input.read(dt, bike.v);
    if (input.take("KeyC")) camMode = camMode === "chase" ? "helmet" : "chase";
    if (input.take("KeyR")) {
      timer.reset();
      current = [];
      placeAt(track.length - 30, 0);
    }
    if (input.take("KeyM")) audio.muted = !audio.muted;
    let n = 0;
    while (acc >= DT && n < 12) {
      physicsStep(inp);
      acc -= DT;
      n++;
    }
    if (timer.wrongWay && !bike.crashed) hud.message("FALSCHE RICHTUNG", 0.2, simTime);

    // Motorrad darstellen
    toThree(bike.x, bike.y, bike.z, bikeMesh.root.position);
    bikeMesh.root.rotation.y = bike.heading;
    bikeMesh.root.rotation.x = bike.lean;
    bikeMesh.root.rotation.z = bike.crashed ? 0 : bike.pitch * 0.06;
    const spin = (bike.v / 0.31) * dt;
    bikeMesh.frontWheel.rotation.z -= spin;
    bikeMesh.rearWheel.rotation.z -= spin;
    // Fahrer hängt sich etwas in die Kurve
    bikeMesh.rider.position.z = Math.sin(bike.lean) * 0.12;

    // Geist
    const gs = ghostAt(best, timer.running ? timer.current(simTime) : -1);
    ghostMesh.root.visible = !!gs;
    if (gs) {
      toThree(gs.x, gs.y, gs.z, ghostMesh.root.position);
      ghostMesh.root.rotation.y = gs.h;
      ghostMesh.root.rotation.x = gs.l;
    }

    // Kamera
    const fwdX = Math.cos(bike.heading);
    const fwdY = Math.sin(bike.heading);
    if (camMode === "chase") {
      const back = 5.2 + bike.v * 0.015;
      toThree(bike.x - fwdX * back, bike.y - fwdY * back, bike.z + 1.9, tmp);
      if (!camInit) camPos.copy(tmp);
      camPos.lerp(tmp, 1 - Math.exp(-dt * 8));
      toThree(bike.x + fwdX * 6, bike.y + fwdY * 6, bike.z + 0.9, tmp);
      if (!camInit) camLook.copy(tmp);
      camLook.lerp(tmp, 1 - Math.exp(-dt * 12));
      camInit = true;
      camera.position.copy(camPos);
      camera.up.set(0, 1, 0);
      camera.lookAt(camLook);
      camera.rotateZ(-bike.lean * 0.3);
    } else {
      // Helm: Kopf gleicht die Schräglage etwa zur Hälfte aus
      const headLean = bike.lean * 0.55;
      const h = 1.32;
      toThree(
        bike.x + fwdX * 0.25 + Math.sin(bike.lean) * h * fwdY * 0.6,
        bike.y + fwdY * 0.25 - Math.sin(bike.lean) * h * fwdX * 0.6,
        bike.z + Math.cos(bike.lean) * h,
        camera.position,
      );
      toThree(bike.x + fwdX * 40, bike.y + fwdY * 40, bike.z + 0.8, tmp);
      camera.up.set(0, 1, 0);
      camera.lookAt(tmp);
      camera.rotateZ(-headLean);
      camInit = false;
    }
    camera.fov = 68 + Math.min(14, bike.v * 0.18);
    camera.updateProjectionMatrix();
    sun.target.position.copy(bikeMesh.root.position);
    sun.position.copy(bikeMesh.root.position).add(tmp.set(-30, 60, 25));

    audio.update(bike.rpm, inp.throttle, bike.v);

    const sector = timer.running ? Math.min(3, timer.sectorTimes.length + 1) : 0;
    hud.update({
      now: simTime,
      v: bike.v, gear: bike.gear, rpm: bike.rpm, redline: params.redline, lean: bike.lean, gripUse: bike.gripUse,
      lap: timer.running ? timer.lap + 1 : 0,
      sector,
      current: timer.current(simTime),
      last: timer.last,
      best: timer.best ?? (best.length ? best[best.length - 1]!.t : null),
      delta: timer.running ? deltaTo(best, timer.progress - lapProgressStart, timer.current(simTime)) : null,
      x: bike.x, y: bike.y,
      others: gs ? [{ x: gs.x, y: gs.y, color: "#38f" }] : [],
    });

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function fmt(t: number) {
  const m = Math.floor(t / 60);
  return `${m}:${(t - m * 60).toFixed(3).padStart(6, "0")}`;
}

function ghostAt(g: GhostSample[], t: number): GhostSample | null {
  if (g.length < 2 || t < 0 || t > g[g.length - 1]!.t) return null;
  let lo = 0;
  let hi = g.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (g[mid]!.t <= t) lo = mid;
    else hi = mid;
  }
  const a = g[lo]!;
  const b = g[hi]!;
  const f = (t - a.t) / (b.t - a.t || 1);
  const lerpAngle = (x: number, y: number) => x + Math.atan2(Math.sin(y - x), Math.cos(y - x)) * f;
  return {
    t, p: a.p + (b.p - a.p) * f, x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f,
    h: lerpAngle(a.h, b.h), l: a.l + (b.l - a.l) * f,
  };
}

/** Zeitdifferenz zur Bestzeit am gleichen Fortschritt der Runde. */
function deltaTo(g: GhostSample[], progress: number, t: number): number | null {
  if (g.length < 2 || progress <= 1 || progress > g[g.length - 1]!.p) return null;
  let lo = 0;
  let hi = g.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (g[mid]!.p <= progress) lo = mid;
    else hi = mid;
  }
  const a = g[lo]!;
  const b = g[hi]!;
  const f = (progress - a.p) / (b.p - a.p || 1);
  return t - (a.t + (b.t - a.t) * f);
}

const GHOST_KEY = "spreewaldring-moto/ghost/v1";
function saveGhost(g: GhostSample[]) {
  try {
    localStorage.setItem(GHOST_KEY, JSON.stringify(g.map((s) => [s.t, s.p, s.x, s.y, s.z, s.h, s.l].map((v) => +v.toFixed(3)))));
  } catch {
    /* Speicher voll oder gesperrt: Geist nur für diese Sitzung */
  }
}
function loadGhost(): GhostSample[] {
  try {
    const raw = JSON.parse(localStorage.getItem(GHOST_KEY) ?? "[]") as number[][];
    return raw.map(([t, p, x, y, z, h, l]) => ({ t: t!, p: p!, x: x!, y: y!, z: z!, h: h!, l: l! }));
  } catch {
    return [];
  }
}

main().catch((e) => {
  document.body.innerHTML = `<pre style="color:#f66;padding:20px">Fehler beim Laden: ${String(e)}</pre>`;
  console.error(e);
});
