"""
Mittellinie, Breiten und Höhe des Spreewaldrings aus Brandenburger Open Data (LGB) gewinnen.

Ablauf:
  1. DOP20-Luftbild (0,2 m/px) zuschneiden.
  2. Asphalt über Farbe segmentieren (grau = geringe Sättigung, mittlere Helligkeit).
  3. Straße/Parkplatz/Kartbahn abschneiden, Boxenmauer als Trennlinie einzeichnen.
  4. Skelett der Asphaltfläche; die Runde folgt dem Skelett zwischen festen Wegpunkten.
  5. Linie verfeinern: Querschnitte zu beiden Rändern messen, Mitte nachführen, glätten.
     An Einmündungen (Querschnitt zu breit) wird die Breite aus den Nachbarn interpoliert.
  6. Höhe aus DGM1 (1 m Raster) bilinear abtasten.

Ausgabe: JSON mit Punkten [E, N, H, breiteLinks, breiteRechts] in EPSG:25833 und
einem Kontrollbild. Daten: GeoBasis-DE/LGB, dl-de/by-2-0.

Aufruf:  python -I extract.py <config.json> <cache-dir> <out.json> [preview.jpg]
"""

import json
import sys
from pathlib import Path

import cv2
import networkx as nx
import numpy as np
import tifffile
from PIL import Image, ImageDraw
from skimage.morphology import remove_small_holes, skeletonize

Image.MAX_IMAGE_PIXELS = None
PX = 0.2  # Meter pro Pixel im DOP20


def load_crop(cfg, cache: Path):
    c = cfg["crop"]
    tiles = {}
    for t in cfg["dopTiles"]:
        e, n = (int(v) for v in t.removeprefix("33").split("-"))
        tiles[(e, n)] = cache / f"dop_33{e}-{n}.jpg"
    es = sorted({k[0] for k in tiles})
    ns = sorted({k[1] for k in tiles})
    e_min, n_max = es[0], ns[-1] + 1  # Kachelname = linke untere Ecke in km
    w, h = len(es) * 5000, len(ns) * 5000
    mosaic = Image.new("RGB", (w, h))
    for (e, n), f in tiles.items():
        mosaic.paste(Image.open(f), ((e - e_min) * 5000, (n_max - 1 - n) * 5000))
    ox, oy = e_min * 1000, n_max * 1000  # Weltkoordinate der linken oberen Ecke
    box = (
        round((c["e0"] - ox) / PX),
        round((oy - c["n1"]) / PX),
        round((c["e1"] - ox) / PX),
        round((oy - c["n0"]) / PX),
    )
    return np.asarray(mosaic.crop(box).convert("RGB")), (c["e0"], c["n1"])


class Geo:
    """Umrechnung Weltkoordinate <-> Pixel im Zuschnitt."""

    def __init__(self, origin):
        self.e0, self.n1 = origin

    def to_px(self, e, n):
        return (np.asarray(e) - self.e0) / PX, (self.n1 - np.asarray(n)) / PX

    def to_world(self, x, y):
        return self.e0 + np.asarray(x) * PX, self.n1 - np.asarray(y) * PX


def asphalt_mask(img, cfg, geo: Geo):
    a = cfg["asphalt"]
    f = img.astype(np.float32)
    mx, mn = f.max(-1), f.min(-1)
    sat = (mx - mn) / (mx + 1)
    m = ((sat < a["maxSaturation"]) & (mx > a["minValue"]) & (mx < a["maxValue"])).astype(np.uint8)
    h, w = m.shape
    (ea, na), (eb, nb) = cfg["excludeEastOf"]
    x0, y0 = geo.to_px(ea, na)
    x1, y1 = geo.to_px(eb, nb)
    yy, xx = np.mgrid[0:h, 0:w]
    m[((x1 - x0) * (yy - y0) - (y1 - y0) * (xx - x0)) < 0] = 0
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    wall = np.array([geo.to_px(e, n) for e, n in cfg["pitWall"]], np.int32)
    cv2.polylines(m, [wall], False, 0, 7)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
    # Größte Komponente, die nicht am linken Bildrand klebt (sonst Ackerflächen)
    cands = [i for i in range(1, n) if st[i, 0] > 100 and st[i, 2] > 1000]
    k = max(cands, key=lambda i: st[i, 4])
    return remove_small_holes(lab == k, max_size=4000)


def route_on_skeleton(mask, cfg, geo: Geo):
    sk = skeletonize(mask)
    ys, xs = np.nonzero(sk)
    idx = {(y, x): i for i, (y, x) in enumerate(zip(ys, xs))}
    g = nx.Graph()
    for (y, x), i in idx.items():
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                j = idx.get((y + dy, x + dx))
                if j is not None and j > i:
                    g.add_edge(i, j, weight=(dx * dx + dy * dy) ** 0.5)

    def snap(e, n):
        x, y = geo.to_px(e, n)
        return int(np.argmin((xs - x) ** 2 + (ys - y) ** 2))

    nodes = [snap(e, n) for e, n in cfg["waypoints"]]
    path = []
    for a, b in zip(nodes, nodes[1:] + nodes[:1]):
        path += nx.shortest_path(g, a, b, weight="weight")[:-1]
    px = np.array([(xs[i], ys[i]) for i in path], float)
    e, n = geo.to_world(px[:, 0], px[:, 1])
    return np.stack([e, n], 1)


def resample_closed(p, step):
    q = np.vstack([p, p[:1]])
    seg = np.hypot(*np.diff(q, axis=0).T)
    s = np.concatenate([[0], np.cumsum(seg)])
    L = s[-1]
    t = np.arange(0, L, L / round(L / step))
    return np.stack([np.interp(t, s, q[:, 0]), np.interp(t, s, q[:, 1])], 1)


def smooth_closed(p, sigma_pts):
    if sigma_pts <= 0:
        return p
    r = int(3 * sigma_pts)
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma_pts) ** 2)
    k /= k.sum()
    pad = np.vstack([p[-r:], p, p[:r]])
    return np.stack([np.convolve(pad[:, i], k, mode="valid") for i in range(2)], 1)


def normals(p):
    d = np.roll(p, -1, 0) - np.roll(p, 1, 0)
    d /= np.linalg.norm(d, axis=1, keepdims=True)
    # rechts in Fahrtrichtung (x Ost, y Nord): (ty, -tx)
    return np.stack([d[:, 1], -d[:, 0]], 1)


def edge_distances(p, mask, geo: Geo, max_m):
    """Abstand von jedem Punkt bis zum Asphaltrand nach links und rechts (Meter)."""
    h, w = mask.shape
    nr = normals(p)
    steps = np.arange(0, max_m, PX / 2)
    out = np.zeros((len(p), 2))
    for side, sgn in ((0, -1.0), (1, 1.0)):
        e = p[:, 0:1] + sgn * nr[:, 0:1] * steps
        n = p[:, 1:2] + sgn * nr[:, 1:2] * steps
        x, y = geo.to_px(e, n)
        xi = np.clip(np.round(x).astype(int), 0, w - 1)
        yi = np.clip(np.round(y).astype(int), 0, h - 1)
        inside = mask[yi, xi]
        first_out = np.argmax(~inside, axis=1)
        none_out = inside.all(axis=1)
        d = steps[first_out]
        d[none_out] = max_m
        out[:, side] = d
    return out  # [:,0] links, [:,1] rechts


def interp_bad(values, bad):
    """Werte an schlechten Stellen zyklisch aus den guten Nachbarn interpolieren."""
    n = len(values)
    good = np.nonzero(~bad)[0]
    if len(good) == 0:
        return values
    xs = np.concatenate([good - n, good, good + n])
    ys = np.concatenate([values[good]] * 3)
    out = values.copy()
    out[bad] = np.interp(np.nonzero(bad)[0], xs, ys)
    return out


def side_widths(p, mask, geo: Geo, r):
    """Breite links/rechts; Seiten, die in Einmündungen laufen, werden aus Nachbarn interpoliert."""
    d = edge_distances(p, mask, geo, r["maxHalfWidthM"])
    half = np.median(d.sum(1)) / 2
    lim = r["sideFactor"] * half
    bad_l = (d[:, 0] > lim) | (d[:, 0] < 0.5)
    bad_r = (d[:, 1] > lim) | (d[:, 1] < 0.5)
    return interp_bad(d[:, 0], bad_l), interp_bad(d[:, 1], bad_r), bad_l | bad_r


def refine(p, mask, cfg, geo: Geo):
    r = cfg["refine"]
    step = r["stepM"]
    p = resample_closed(p, step)
    p = smooth_closed(p, r["smoothSigmaM"] / step)
    for _ in range(r["iterations"]):
        wl, wr, bad = side_widths(p, mask, geo, r)
        # Mitte nur dort nachführen, wo beide Ränder echt gemessen sind
        shift = interp_bad(np.where(bad, 0.0, (wr - wl) / 2), bad)
        p = p + normals(p) * shift[:, None]
        p = resample_closed(p, step)
        p = smooth_closed(p, r["smoothSigmaM"] / step)
    wl, wr, bad = side_widths(p, mask, geo, r)
    k = 3  # Breiten leicht glätten
    wl = smooth_closed(np.stack([wl, wl], 1), k)[:, 0]
    wr = smooth_closed(np.stack([wr, wr], 1), k)[:, 0]
    return p, wl, wr, float(np.mean(bad))


def sample_dgm(p, cfg, cache: Path):
    tiles = []
    for t in cfg["dgmTiles"]:
        arr = tifffile.imread(cache / f"dgm_{t}.tif")
        tfw = [float(v) for v in (cache / f"dgm_{t}.tfw").read_text().split()]
        tiles.append((arr, tfw))
    out = np.full(len(p), np.nan)
    for arr, (sx, _, _, sy, x0, y0) in tiles:
        fx = (p[:, 0] - x0) / sx
        fy = (p[:, 1] - y0) / sy
        h, w = arr.shape
        # bis zu 1 Rasterzelle außerhalb auf den Rand klemmen (Kachelgrenzen)
        ok = (fx >= -1) & (fy >= -1) & (fx < w) & (fy < h) & np.isnan(out)
        fx = np.clip(fx, 0, w - 1.0001)
        fy = np.clip(fy, 0, h - 1.0001)
        ix, iy = np.floor(fx[ok]).astype(int), np.floor(fy[ok]).astype(int)
        tx, ty = fx[ok] - ix, fy[ok] - iy
        v = (
            arr[iy, ix] * (1 - tx) * (1 - ty)
            + arr[iy, ix + 1] * tx * (1 - ty)
            + arr[iy + 1, ix] * (1 - tx) * ty
            + arr[iy + 1, ix + 1] * tx * ty
        )
        out[ok] = v
    if np.isnan(out).any():
        raise SystemExit("Höhe fehlt für einige Punkte: DGM-Kacheln in config.json ergänzen")
    return out


def main():
    cfg_path, cache, out_path = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
    preview = Path(sys.argv[4]) if len(sys.argv) > 4 else None
    cfg = json.loads(cfg_path.read_text())
    img, origin = load_crop(cfg, cache)
    geo = Geo(origin)
    mask = asphalt_mask(img, cfg, geo)
    raw = route_on_skeleton(mask, cfg, geo)
    p, wl, wr, bad_share = refine(raw, mask, cfg, geo)
    h = sample_dgm(p, cfg, cache)
    L = float(np.sum(np.hypot(*np.diff(np.vstack([p, p[:1]]), axis=0).T)))
    result = {
        "crs": "EPSG:25833",
        "name": cfg["name"],
        "lengthM": round(L, 1),
        "junctionShare": round(bad_share, 3),
        "startFinish": cfg["startFinish"],
        "points": [[round(float(a), 2), round(float(b), 2), round(float(c), 2), round(float(d), 2), round(float(e), 2)]
                   for (a, b), c, d, e in zip(p, h, wl, wr)],
        "sources": [
            "Luftbild DOP20 und Höhenmodell DGM1: GeoBasis-DE/LGB, Datenlizenz Deutschland – Namensnennung – 2.0 (dl-de/by-2-0)"
        ],
    }
    out_path.write_text(json.dumps(result))
    print(f"Länge {L:.1f} m, {len(p)} Punkte, Breite median {np.median(wl + wr):.2f} m, "
          f"Höhe {h.min():.1f}–{h.max():.1f} m, Einmündungsanteil {bad_share:.1%}")
    if preview:
        im = Image.fromarray(img)
        d = ImageDraw.Draw(im)
        nr = normals(p)
        for arr, col in ((p, (255, 0, 0)), (p - nr * wl[:, None], (0, 255, 255)), (p + nr * wr[:, None], (255, 255, 0))):
            x, y = geo.to_px(arr[:, 0], arr[:, 1])
            pts = list(zip(x.tolist(), y.tolist()))
            d.line(pts + pts[:1], fill=col, width=2)
        x, y = geo.to_px(*cfg["startFinish"])
        d.ellipse([x - 12, y - 12, x + 12, y + 12], outline=(0, 255, 0), width=4)
        im.save(preview, quality=88)


if __name__ == "__main__":
    main()
