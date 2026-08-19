# Rugby Ball Detector

<!-- index.html/sketch.js/style.css/screenshot.png are synced from the p5.js editor sketch
     (package.json's homepage) by .github/workflows/build.yml on every push to master - don't
     hand-edit them, they'll just get overwritten. See "Syncing with the p5.js Editor" below. -->
[![Screenshot of the demo detecting a rugby ball](screenshot.png)](https://davidchatting.com/rugby-ball-detector/)
<sub>[https://commons.wikimedia.org/wiki/File:ST_vs_RCT_2012_12_Jonny_Wilkinson_kicking_a_penalty_(cropped).jpg](https://commons.wikimedia.org/wiki/File:ST_vs_RCT_2012_12_Jonny_Wilkinson_kicking_a_penalty_(cropped).jpg)</sub>

[Try the p5.js demo](https://davidchatting.com/rugby-ball-detector/) with images or video.

A small YOLOv8 model for detecting rugby balls in photos and video, running entirely in the
browser (no server, no upload) via ONNX Runtime Web and p5.js. The model is trained on a small set of images, so it's not production quality. The training photos are exclusively of **Gilbert** balls, and this may not generalise well to other brands.

## Use it in your own sketch

The model is public - load it straight from jsDelivr's GitHub CDN, no need to host your own
copy or clone this repo:

```
https://cdn.jsdelivr.net/gh/davidchatting/rugby-ball-detector@v1.0.0/rugby-ball-detector.onnx
```

That's an [ONNX](https://onnx.ai/) file, pinned to the [`v1.0.0`](https://github.com/davidchatting/rugby-ball-detector/releases/tag/v1.0.0)
release tag so the URL won't change under you - run with
[`onnxruntime-web`](https://github.com/microsoft/onnxruntime), one class (`rugby_ball`), 640x640
input, output shape `[1, 5, 8400]` (`cx, cy, w, h, conf`, needs NMS). See
[`sketch.js`](sketch.js) for a complete working example, including pre/post-processing.

## Syncing with the p5.js Editor

This repository automatically synchronises with the
[p5.js editor](https://editor.p5js.org/davidchatting/sketches/tCE7wAUM-), where `index.html`,
`sketch.js`, and `style.css` are maintained. Using the github workflows,
[build.yml](.github/workflows/build.yml) automatically downloads the sketch's files via the
editor's export API and commits them into the repo, along with a freshly regenerated
`screenshot.png`. The reference for the p5.js sketch is held in the
[package.json](package.json) `homepage` field.

## Contents

- `index.html` / `style.css` / `sketch.js` - the browser demo (p5.js UI, `rugby-ball-detector.onnx`
  run with `onnxruntime-web`), synced from the p5.js editor - see "Syncing with the p5.js Editor" above
- `rugby-ball-detector.onnx` / `rugby-ball-detector.pt` - the trained model weights (ONNX and
  PyTorch formats)
- `screenshot.png` - a screenshot of the live demo, regenerated on every push by
  [`.github/workflows/build.yml`](.github/workflows/build.yml) (headless Chromium via
  Playwright, see [`screenshot.js`](.github/workflows/screenshot.js))
- [`dataset/`](dataset/) - the training data: every image's Wikimedia Commons URL and ball
  location(s) as `dataset.json`, plus `export_yolo.py` to turn that into a YOLO-ready
  directory. See [`dataset/README.md`](dataset/README.md) for the JSON schema and how to
  rebuild a full training set from it.

The training images themselves aren't included in this repo (see `.gitignore`) - it's a
local-only YOLOv8 export from Roboflow, 178 images (117 train, 41 valid, 20 test), one class
(`rugby_ball`), fully covered by `dataset/dataset.json`.
