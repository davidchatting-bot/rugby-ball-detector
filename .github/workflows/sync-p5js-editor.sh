#!/usr/bin/env bash
# Downloads index.html/sketch.js/style.css from the p5.js editor sketch (package.json's
# homepage) and overwrites the repo's copies - the editor is the source of truth for these
# files, not the repo (see README.md "Syncing with the p5.js Editor"). Run from the repo root.
set -euo pipefail

SKETCH_ID=$(node -p "require('./package.json').homepage.split('/').pop()")
curl -sL "https://editor.p5js.org/editor/projects/${SKETCH_ID}/zip" -o p5-demo.zip

rm -rf p5-demo-tmp
mkdir -p p5-demo-tmp
python3 -c "import zipfile; zipfile.ZipFile('p5-demo.zip').extractall('p5-demo-tmp')"

# Only the actual sketch files - not the CDN libraries (p5.js, p5.sound.min.js, ort.min.js)
# the editor bundles into the zip for its own standalone-download use case.
cp p5-demo-tmp/index.html index.html
cp p5-demo-tmp/sketch.js sketch.js
cp p5-demo-tmp/style.css style.css

rm -rf p5-demo-tmp p5-demo.zip
