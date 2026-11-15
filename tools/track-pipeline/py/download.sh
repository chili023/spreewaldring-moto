#!/usr/bin/env bash
# Lädt die in config.json genannten DOP20- und DGM1-Kacheln (LGB Open Data) in den Cache.
set -euo pipefail
CFG=${1:-config.json}
CACHE=${2:-cache}
BASE=https://data.geobasis-bb.de/geobasis/daten
mkdir -p "$CACHE"
for t in $(python3 -c "import json,sys;print(' '.join(json.load(open('$CFG'))['dopTiles']))"); do
  [ -f "$CACHE/dop_$t.jpg" ] || { curl -fsS -o "$CACHE/dop_$t.zip" "$BASE/dop/rgb_jpg/dop_$t.zip" && unzip -o -q "$CACHE/dop_$t.zip" -d "$CACHE" && rm "$CACHE/dop_$t.zip"; }
done
for t in $(python3 -c "import json,sys;print(' '.join(json.load(open('$CFG'))['dgmTiles']))"); do
  [ -f "$CACHE/dgm_$t.tif" ] || { curl -fsS -o "$CACHE/dgm_$t.zip" "$BASE/dgm/tif/dgm_$t.zip" && unzip -o -q "$CACHE/dgm_$t.zip" -d "$CACHE" && rm "$CACHE/dgm_$t.zip"; }
done
echo "Cache bereit: $CACHE"
