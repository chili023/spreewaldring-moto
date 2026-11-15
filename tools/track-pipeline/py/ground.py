"""
Bodentextur für das Spiel: DOP20-Ausschnitt um die Strecke, verkleinert.
Aufruf: python -I ground.py <config.json> <cache-dir> <out-dir> [maxPixel]
Schreibt ground.jpg und ground.json (Weltkoordinaten der Ränder, EPSG:25833).
Daten: GeoBasis-DE/LGB, dl-de/by-2-0.
"""
import json
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from extract import load_crop, sample_dgm  # noqa: E402
import numpy as np  # noqa: E402

cfg = json.loads(Path(sys.argv[1]).read_text())
cache, out = Path(sys.argv[2]), Path(sys.argv[3])
max_px = int(sys.argv[4]) if len(sys.argv) > 4 else 2048
img, _ = load_crop(cfg, cache)
im = Image.fromarray(img)
scale = max_px / max(im.size)
im = im.resize((round(im.size[0] * scale), round(im.size[1] * scale)), Image.LANCZOS)
out.mkdir(parents=True, exist_ok=True)
im.save(out / "ground.jpg", quality=82, optimize=True, progressive=True)
c = cfg["crop"]
# Höhenraster (2 m) aus DGM1, als uint16 in Zentimetern über hBase
STEP = 2.0
es = np.arange(c["e0"], c["e1"] + 1e-6, STEP)
ns = np.arange(c["n1"], c["n0"] - 1e-6, -STEP)  # Zeile 0 = Norden
E, N = np.meshgrid(es, ns)
H = sample_dgm(np.stack([E.ravel(), N.ravel()], 1), cfg, cache).reshape(E.shape)
h_base = float(np.floor(H.min()))
(np.round((H - h_base) * 100).astype("<u2")).tofile(out / "ground_height.bin")
(out / "ground.json").write_text(json.dumps({
    "crs": "EPSG:25833", "e0": c["e0"], "e1": c["e1"], "n0": c["n0"], "n1": c["n1"],
    "height": {"file": "ground_height.bin", "format": "uint16 cm über hBase, Zeile 0 = Norden",
               "hBase": h_base, "step": STEP, "nx": int(E.shape[1]), "ny": int(E.shape[0])},
    "source": "Luftbild DOP20 und Höhenmodell DGM1: GeoBasis-DE/LGB, dl-de/by-2-0",
}))
print("ground.jpg", im.size, f"{(out / 'ground.jpg').stat().st_size / 1e6:.2f} MB")
