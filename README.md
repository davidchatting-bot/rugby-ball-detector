# Rugby Ball Detector

A YOLOv8-trained object detector for spotting rugby balls in photos, running entirely
in the browser via ONNX Runtime Web - no server, no upload.

**Live demo: https://davidchatting-bot.github.io/rugby-ball-detector/**

Drop an image onto the page and it'll run the model client-side and draw a box around
any rugby ball it finds.

## Contents

- `index.html` - the browser demo (loads `best.onnx` and runs inference with `onnxruntime-web`)
- `best.onnx` / `best.pt` - the trained model weights (ONNX and PyTorch formats)
- `CREDITS.md` - source links for the Wikimedia Commons images used to train the model

The training dataset itself isn't included in this repo (see `.gitignore`) - it's a
local-only YOLOv8 export from Roboflow, 179 images, one class (`rugby_ball`).
