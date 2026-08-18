# Rugby Ball Detector

⚠️ **Experimental.** This is a quick proof of concept, not a polished or maintained tool -
detection quality is limited by a small (179-image) training set, and the code hasn't had
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
- [`training.txt`](training.txt) - Wikimedia Commons URL for every training image, one per line;
  each page lists that image's specific Creative Commons license and author

The training dataset itself isn't included in this repo (see `.gitignore`) - it's a
local-only YOLOv8 export from Roboflow, 179 images, one class (`rugby_ball`).
