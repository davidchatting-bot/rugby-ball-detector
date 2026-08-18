# Training data

- [`dataset.json`](dataset.json) - every training image's Wikimedia Commons URL and ball
  location(s), grouped by split (`train` / `valid` / `test`) - see below
- [`export_yolo.py`](export_yolo.py) - downloads the images and writes out a YOLO-ready
  `images/`+`labels/`+`data.yaml` directory from `dataset.json`

The training images themselves aren't included in this repo (see `../.gitignore`) - it's a
local-only YOLOv8 export from Roboflow, 178 images (117 train, 41 valid, 20 test), one class
(`rugby_ball`), fully covered by `dataset.json`.

## dataset.json

```json
{
  "classes": ["rugby_ball"],
  "train": [
    {"url": "https://commons.wikimedia.org/wiki/File:...", "balls": [[0, 0.44, 0.81, 0.13, 0.14]]}
  ],
  "valid": [...],
  "test": [...]
}
```

Each image is one entry: its Commons file page (open it for that image's specific Creative
Commons license and author) plus a `balls` list, one entry per annotated ball. Each ball is
`[class, ...coordinates]`, normalized 0-1 - but the coordinate format isn't consistent across
the dataset, because Roboflow preserved however each ball was originally annotated:

- **83 balls** (72 train+valid, 11 test) are a plain box: `[class, x_center, y_center, width, height]`
- **125 balls** (110 train+valid, 15 test) are a polygon outline instead:
  `[class, x1, y1, x2, y2, ...]` (an even number of coordinates, one vertex per pair, tracing
  the ball's outline rather than a box around it)

`export_yolo.py` writes both straight through as YOLO label lines - Ultralytics' training
pipeline (used to produce `../best.pt` / `../best.onnx`) handles both automatically,
converting a polygon to its enclosing box when training a detector (verified directly against
Ultralytics' `verify_image_label` source: rows with more than 6 fields are treated as segments
and passed through `segments2boxes` before training). If you're consuming `balls` yourself,
branch on the list length:

```python
cls, *coords = ball

if len(coords) == 4:
    xc, yc, w, h = coords          # already a box
else:
    xs, ys = coords[0::2], coords[1::2]
    xc = (min(xs) + max(xs)) / 2    # derive the enclosing box
    yc = (min(ys) + max(ys)) / 2    # from the polygon's extent
    w, h = max(xs) - min(xs), max(ys) - min(ys)

x1, y1 = (xc - w / 2) * image_width, (yc - h / 2) * image_height
x2, y2 = (xc + w / 2) * image_width, (yc + h / 2) * image_height
```

Multiply by the image's actual pixel width/height to get a drawable box - or, for the
polygon coordinates, draw them directly as a filled/outlined polygon (grouped into `(x, y)`
pairs the same way) for a tighter outline than the enclosing box gives you.

## Rebuilding the training set

```
pip install requests
python3 export_yolo.py --out yolo_export
```

Run from inside this `dataset/` folder. Downloads all 178 images from Commons (one request
per file, rate-limited by default) and writes `yolo_export/images/{train,valid,test}/`,
`yolo_export/labels/{train,valid,test}/`, and `yolo_export/data.yaml` - ready to hand to
Ultralytics:

```python
from ultralytics import YOLO
model = YOLO("yolov8n.pt")
model.train(data="yolo_export/data.yaml", epochs=100)
```

See Ultralytics' own [training guide](https://docs.ultralytics.com/modes/train/) and
[dataset format reference](https://docs.ultralytics.com/datasets/detect/) for everything
past that point.
