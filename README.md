# Rugby Ball Detector

![Grid of rugby ball crops from the training data](balls_grid.jpg)

⚠️ **Experimental.** This is a quick proof of concept, not a polished or maintained tool -
detection quality is limited by a small (178-image) training set, and the code hasn't had
much hardening. Expect rough edges. The training images are mostly professional rugby
photos, which almost exclusively feature **Gilbert** balls (the official supplier for World
Rugby, Six Nations, etc.) - don't expect this to generalise well to other ball brands.

A YOLOv8-trained object detector for spotting rugby balls in photos and videos, running
entirely in the browser via ONNX Runtime Web - no server, no upload.

**Live demo: https://davidchatting-bot.github.io/rugby-ball-detector/**

Drop an image or video onto the page and it'll run the model client-side and draw a box
around any rugby ball it finds.

## Contents

- `index.html` - the browser demo (loads `best.onnx` and runs inference with `onnxruntime-web`)
- `best.onnx` / `best.pt` - the trained model weights (ONNX and PyTorch formats)
- [`p5-test/`](p5-test/) - a p5.js-based test harness for the same model: loads a fixed
  training-set image by default, and lets you drag another image onto the canvas to try it
- [`dataset/`](dataset/) - the training data: every image's Wikimedia Commons URL and ball
  location(s) as `dataset.json`, plus `export_yolo.py` to turn that into a YOLO-ready
  directory. See [`dataset/README.md`](dataset/README.md) for the JSON schema and how to
  rebuild a full training set from it.

The training images themselves aren't included in this repo (see `.gitignore`) - it's a
local-only YOLOv8 export from Roboflow, 178 images (117 train, 41 valid, 20 test), one class
(`rugby_ball`), fully covered by `dataset/dataset.json`.
