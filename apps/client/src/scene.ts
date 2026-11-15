import * as THREE from "three";
import type { Track, TrackFile } from "@moto/shared/track";

/**
 * Koordinaten: Strecke/Physik nutzen x = Ost, y = Nord, z = Höhe.
 * Three.js: X = Ost, Y = oben, Z = Süd  ->  (x, y, z) => (x, z, -y).
 */
export const toThree = (x: number, y: number, z: number, out = new THREE.Vector3()) => out.set(x, z, -y);

export interface GroundInfo {
  e0: number;
  e1: number;
  n0: number;
  n1: number;
  height: { file: string; hBase: number; step: number; nx: number; ny: number };
}

export function createRenderer(): THREE.WebGLRenderer {
  const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  r.setSize(window.innerWidth, window.innerHeight);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(r.domElement);
  return r;
}

export function createWorld(scene: THREE.Scene): THREE.DirectionalLight {
  scene.background = new THREE.Color(0x9cc7ea);
  scene.fog = new THREE.Fog(0x9cc7ea, 400, 1600);
  scene.add(new THREE.HemisphereLight(0xdfefff, 0x6b6a3a, 1.1));
  const sun = new THREE.DirectionalLight(0xfff2d8, 2.2);
  sun.position.set(-80, 120, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const c = sun.shadow.camera;
  c.left = c.bottom = -15;
  c.right = c.top = 15;
  c.near = 1;
  c.far = 300;
  scene.add(sun, sun.target);
  return sun;
}

/** Bodenfläche mit Luftbild und DGM-Höhen. Höhen relativ zu track.origin.h. */
export async function createGround(scene: THREE.Scene, info: GroundInfo, track: TrackFile, base: string) {
  const { nx, ny, step, hBase } = info.height;
  const buf = await (await fetch(base + info.height.file)).arrayBuffer();
  const hcm = new Uint16Array(buf);
  const w = info.e1 - info.e0;
  const h = info.n1 - info.n0;
  const geo = new THREE.PlaneGeometry(w, h, nx - 1, ny - 1);
  geo.rotateX(-Math.PI / 2); // Ebene in X/Z, Zeile 0 = -Z = Norden
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    // Leicht unter die Fahrbahn legen, damit nichts durchscheint
    pos.setY(i, hBase + hcm[i]! / 100 - track.origin.h - 0.08);
  }
  geo.computeVertexNormals();
  const cx = (info.e0 + info.e1) / 2 - track.origin.e;
  const cy = (info.n0 + info.n1) / 2 - track.origin.n;
  geo.translate(cx, 0, -cy);
  const tex = await new THREE.TextureLoader().loadAsync(base + "ground.jpg");
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex }));
  mesh.receiveShadow = true;
  scene.add(mesh);
  void step;

  // Umgebung außerhalb des Luftbilds: schlichte Fläche bis zum Horizont
  const far = new THREE.Mesh(
    new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0x7d8a4a }),
  );
  far.position.set(cx, hBase - track.origin.h - 0.3, -cy);
  scene.add(far);
}

/** Fahrbahnband, Randlinien und Start/Ziel-Linie aus der Mittellinie. */
export function createTrackMesh(scene: THREE.Scene, track: Track) {
  const d = track.data;
  const n = d.points.length;
  const lift = 0.03;
  const asphalt: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const lines: number[] = [];
  const lineIdx: number[] = [];
  const v = new THREE.Vector3();
  const LINE_W = 0.12;
  let sAcc = 0;
  for (let i = 0; i <= n; i++) {
    const p = d.points[i % n]!;
    const q = d.points[(i + 1) % n]!;
    const r = d.points[(i - 1 + n) % n]!;
    let tx = q[0] - r[0];
    let ty = q[1] - r[1];
    const l = Math.hypot(tx, ty) || 1;
    tx /= l;
    ty /= l;
    const rx = ty;
    const ry = -tx; // rechts in Fahrtrichtung
    const z = p[2] + lift;
    const L = p[3];
    const R = p[4];
    toThree(p[0] - rx * L, p[1] - ry * L, z, v);
    asphalt.push(v.x, v.y, v.z);
    toThree(p[0] + rx * R, p[1] + ry * R, z, v);
    asphalt.push(v.x, v.y, v.z);
    uv.push(0, sAcc / 4, 1, sAcc / 4);
    // weiße Randlinien knapp innerhalb der Kante
    for (const [a, b] of [
      [-L + 0.25, -L + 0.25 + LINE_W],
      [R - 0.25 - LINE_W, R - 0.25],
    ] as const) {
      toThree(p[0] + rx * a, p[1] + ry * a, z + 0.01, v);
      lines.push(v.x, v.y, v.z);
      toThree(p[0] + rx * b, p[1] + ry * b, z + 0.01, v);
      lines.push(v.x, v.y, v.z);
    }
    if (i < n) {
      const a = 2 * i;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      const k = 4 * i;
      for (const o of [0, 2]) lineIdx.push(k + o, k + o + 1, k + o + 4, k + o + 1, k + o + 5, k + o + 4);
    }
    sAcc += Math.hypot(q[0] - p[0], q[1] - p[1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(asphalt, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ color: 0x55585c, map: asphaltNoise() });
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true;
  scene.add(mesh);

  const lg = new THREE.BufferGeometry();
  lg.setAttribute("position", new THREE.Float32BufferAttribute(lines, 3));
  lg.setIndex(lineIdx);
  lg.computeVertexNormals();
  scene.add(new THREE.Mesh(lg, new THREE.MeshLambertMaterial({ color: 0xf2f2f2 })));

  // Start/Ziel: Schachbrett quer über die Fahrbahn bei s = 0
  const f = track.frameAt(0);
  const width = f.widthLeft + f.widthRight;
  const sf = new THREE.Mesh(
    new THREE.PlaneGeometry(width, 1.2).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ map: checker() }),
  );
  const off = (f.widthRight - f.widthLeft) / 2;
  toThree(f.x + f.ty * off, f.y - f.tx * off, f.z + lift + 0.012, sf.position);
  sf.rotation.y = f.heading + Math.PI / 2;
  sf.receiveShadow = true;
  scene.add(sf);
}

function asphaltNoise(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d")!;
  const img = x.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 200 + Math.random() * 55;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function checker(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 160;
  c.height = 16;
  const x = c.getContext("2d")!;
  for (let i = 0; i < 20; i++)
    for (let j = 0; j < 2; j++) {
      x.fillStyle = (i + j) % 2 ? "#111" : "#eee";
      x.fillRect(i * 8, j * 8, 8, 8);
    }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Platzhalter-Motorrad mit Fahrer. Ursprung = Bodenpunkt unter dem Schwerpunkt, Blick nach +X. */
export function createBikeMesh(color = 0xd0202a, opacity = 1): {
  root: THREE.Group;
  lean: THREE.Group;
  rider: THREE.Group;
  frontWheel: THREE.Mesh;
  rearWheel: THREE.Mesh;
} {
  const transparent = opacity < 1;
  const m = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.2, transparent, opacity });
  const root = new THREE.Group();
  const lean = new THREE.Group();
  root.add(lean);
  const wheelGeo = new THREE.TorusGeometry(0.25, 0.07, 10, 24);
  const tire = m(0x1a1a1a);
  const frontWheel = new THREE.Mesh(wheelGeo, tire);
  frontWheel.position.set(0.7, 0.31, 0);
  const rearWheel = new THREE.Mesh(wheelGeo, tire);
  rearWheel.position.set(-0.68, 0.31, 0);
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.38, 0.32), m(color));
  body.position.set(0.05, 0.72, 0);
  body.rotation.z = -0.08;
  const fairing = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 12), m(color));
  fairing.rotation.z = -Math.PI / 2;
  fairing.position.set(0.72, 0.82, 0);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.14, 0.22), m(0x222222));
  tail.position.set(-0.6, 0.92, 0);
  const fork = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 0.18), m(0x999999));
  fork.position.set(0.6, 0.58, 0);
  fork.rotation.z = 0.42;
  lean.add(frontWheel, rearWheel, body, fairing, tail, fork);

  const rider = new THREE.Group();
  const suit = m(0x1d2a44);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.28, 0.34), suit);
  torso.position.set(0.0, 1.12, 0);
  torso.rotation.z = -0.55;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), m(0xf4f4f4));
  helmet.position.set(0.32, 1.3, 0);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.42), suit);
  legs.position.set(-0.25, 0.9, 0);
  rider.add(torso, helmet, legs);
  lean.add(rider);

  lean.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  root.rotation.order = "YXZ";
  return { root, lean, rider, frontWheel, rearWheel };
}
