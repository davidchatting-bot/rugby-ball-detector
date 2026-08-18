// p5.js-based demo for the rugby ball detector. Loads best.onnx directly with
// onnxruntime-web and uses p5 for the canvas, drawing, and drag-and-drop handling.

const MODEL_URL = 'best.onnx';
const IMG_SIZE = 640;

// 0.25 (Ultralytics' own default prediction threshold) cleanly isolates the single true
// detection on the default test image below: 91% confidence vs. a 6% false positive.
const CONF_THRESHOLD = 0.25;

// ST vs RCT 2012 12 Wilkinson & Gaüzère.JPG, from the training set's "test" split - see
// dataset/dataset.json
//
// Loaded from upload.wikimedia.org directly (not the commons.wikimedia.org/Special:FilePath
// redirect) because a crossOrigin='anonymous' image load requires an
// Access-Control-Allow-Origin header on every hop of the redirect chain, and Commons' own
// redirect responses don't send one - only the final upload.wikimedia.org response does.
const DEFAULT_IMAGE_URL =
  'https://upload.wikimedia.org/wikipedia/commons/c/c7/ST_vs_RCT_2012_12_Wilkinson_%26_Ga%C3%BCz%C3%A8re.JPG';
const DEFAULT_IMAGE_CREDIT_URL =
  'https://commons.wikimedia.org/wiki/File:ST_vs_RCT_2012_12_Wilkinson_%26_Ga%C3%BCz%C3%A8re.JPG';

let session = null;
let currentImg = null; // native HTMLImageElement currently displayed
let detections = [];
let creditURL = null;
let cnv = null;

function setup() {
  cnv = createCanvas(640, 360);
  cnv.parent('canvas-holder');
  cnv.drop(handleDroppedFile);
  cnv.dragOver(() => document.getElementById('canvas-holder').classList.add('drag-over'));
  cnv.dragLeave(() => document.getElementById('canvas-holder').classList.remove('drag-over'));
  noLoop();
  init();
}

async function init() {
  setStatus('Loading model…');
  session = await ort.InferenceSession.create(MODEL_URL, { executionProviders: ['wasm'] });
  setStatus('Loading test image…');
  loadDefaultImage();
}

function loadDefaultImage() {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => runDetection(img, DEFAULT_IMAGE_CREDIT_URL);
  img.onerror = () => setStatus('Could not load the test image');
  img.src = DEFAULT_IMAGE_URL;
}

function handleDroppedFile(file) {
  document.getElementById('canvas-holder').classList.remove('drag-over');
  if (!session) return setStatus('Model not loaded yet');
  if (file.type !== 'image') return setStatus('Drop an image file');

  const img = new Image();
  img.onload = () => runDetection(img, null);
  img.src = file.data;
}

async function runDetection(img, credit) {
  setStatus('Running detection…');
  currentImg = img;
  creditURL = credit;
  resizeCanvasFor(img);
  updateCredit();

  const { tensor, scale, padX, padY } = preprocess(img);
  const inputTensor = new ort.Tensor('float32', tensor, [1, 3, IMG_SIZE, IMG_SIZE]);
  const feeds = { [session.inputNames[0]]: inputTensor };
  const results = await session.run(feeds);
  const output = results[session.outputNames[0]];

  detections = parseOutput(output, scale, padX, padY);
  redraw();
  setStatus(
    `Detected ${detections.length} ball${detections.length !== 1 ? 's' : ''} — ` +
      'drag another image onto the canvas to try it'
  );
}

function resizeCanvasFor(img) {
  const maxW = 700;
  const scale = Math.min(1, maxW / img.width);
  resizeCanvas(Math.round(img.width * scale), Math.round(img.height * scale));
}

// Drawn via p5's underlying 2D context (drawingContext) rather than p5's own image()/rect()/
// text(), because currentImg is a plain HTMLImageElement (loaded manually so its crossOrigin
// can be set before loading - see loadDefaultImage/handleDroppedFile) and p5's high-level
// drawing functions expect a p5.Image, not a native one. p5 still owns the canvas itself,
// its sizing, and the drag-and-drop handling below.
function draw() {
  const ctx = drawingContext;

  if (!currentImg) {
    ctx.fillStyle = '#141414';
    ctx.fillRect(0, 0, width, height);
    return;
  }

  ctx.drawImage(currentImg, 0, 0, width, height);

  const sx = width / currentImg.width;
  const sy = height / currentImg.height;

  detections.forEach((d) => {
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 3;
    ctx.strokeRect(d.x1 * sx, d.y1 * sy, (d.x2 - d.x1) * sx, (d.y2 - d.y1) * sy);

    ctx.fillStyle = '#00ff88';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(`rugby_ball ${(d.conf * 100).toFixed(0)}%`, d.x1 * sx, d.y1 * sy - 6);
  });
}

function setStatus(msg) {
  document.getElementById('status').textContent = msg;
}

function updateCredit() {
  const el = document.getElementById('credit');
  if (creditURL) {
    el.innerHTML = `Test image: <a href="${creditURL}" target="_blank" rel="noopener">Wikimedia Commons</a> (see the page for its specific license &amp; author)`;
  } else {
    el.textContent = '';
  }
}

// --- Model I/O: preprocessing, output parsing, NMS - same contract as ../index.html ---

function preprocess(img) {
  const canvas = document.createElement('canvas');
  canvas.width = IMG_SIZE;
  canvas.height = IMG_SIZE;
  const ctx = canvas.getContext('2d');

  // Letterbox: scale image to fit 640x640 with padding
  const scale = Math.min(IMG_SIZE / img.width, IMG_SIZE / img.height);
  const newW = Math.round(img.width * scale);
  const newH = Math.round(img.height * scale);
  const padX = (IMG_SIZE - newW) / 2;
  const padY = (IMG_SIZE - newH) / 2;

  ctx.fillStyle = '#888';
  ctx.fillRect(0, 0, IMG_SIZE, IMG_SIZE);
  ctx.drawImage(img, padX, padY, newW, newH);

  const imageData = ctx.getImageData(0, 0, IMG_SIZE, IMG_SIZE).data;
  const tensor = new Float32Array(3 * IMG_SIZE * IMG_SIZE);

  for (let i = 0; i < IMG_SIZE * IMG_SIZE; i++) {
    tensor[i] = imageData[i * 4] / 255; // R
    tensor[i + IMG_SIZE * IMG_SIZE] = imageData[i * 4 + 1] / 255; // G
    tensor[i + IMG_SIZE * IMG_SIZE * 2] = imageData[i * 4 + 2] / 255; // B
  }

  return { tensor, scale, padX, padY };
}

function parseOutput(output, scale, padX, padY) {
  // YOLOv8 output: [1, 5, 8400] - 5 = cx, cy, w, h, conf
  const data = output.data;
  const numBoxes = output.dims[2];
  const dets = [];

  for (let i = 0; i < numBoxes; i++) {
    const conf = data[4 * numBoxes + i];
    if (conf < CONF_THRESHOLD) continue;

    const cx = data[0 * numBoxes + i];
    const cy = data[1 * numBoxes + i];
    const w = data[2 * numBoxes + i];
    const h = data[3 * numBoxes + i];

    // Convert from padded 640x640 space back to original image space
    const x1 = (cx - w / 2 - padX) / scale;
    const y1 = (cy - h / 2 - padY) / scale;
    const x2 = (cx + w / 2 - padX) / scale;
    const y2 = (cy + h / 2 - padY) / scale;

    dets.push({ x1, y1, x2, y2, conf });
  }

  return nms(dets, 0.45);
}

function nms(dets, iouThreshold) {
  dets.sort((a, b) => b.conf - a.conf);
  const keep = [];
  const used = new Set();

  for (let i = 0; i < dets.length; i++) {
    if (used.has(i)) continue;
    keep.push(dets[i]);
    for (let j = i + 1; j < dets.length; j++) {
      if (iou(dets[i], dets[j]) > iouThreshold) used.add(j);
    }
  }
  return keep;
}

function iou(a, b) {
  const ix1 = Math.max(a.x1, b.x1);
  const iy1 = Math.max(a.y1, b.y1);
  const ix2 = Math.min(a.x2, b.x2);
  const iy2 = Math.min(a.y2, b.y2);
  const inter = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1);
  const areaA = (a.x2 - a.x1) * (a.y2 - a.y1);
  const areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
  return inter / (areaA + areaB - inter);
}
