// p5.js-based demo for the rugby ball detector. Loads rugby-ball-detector.onnx directly with
// onnxruntime-web and uses p5 for the canvas, drawing, and drag-and-drop handling.

// Loaded from jsDelivr's GitHub CDN rather than the repo-relative file, pinned to a release
// tag so the URL never moves under anyone using it (CDN caches by tag, CORS open by default) -
// this is also the URL to use from other people's own sketches, see README.md.
const MODEL_URL = 'https://cdn.jsdelivr.net/gh/davidchatting/rugby-ball-detector@v1.0.0/rugby-ball-detector.onnx';
const IMG_SIZE = 640;

// 0.25 (Ultralytics' own default prediction threshold) cleanly isolates the single true
// detection on the default test image below: 91% confidence vs. a 6% false positive.
const CONF_THRESHOLD = 0.25;

// ST vs RCT 2012 12 Jonny Wilkinson kicking a penalty (cropped).jpg, from the training set's
// "test" split - see dataset/dataset.json
//
// Loaded from upload.wikimedia.org directly (not the commons.wikimedia.org/Special:FilePath
// redirect) because a crossOrigin='anonymous' image load requires an
// Access-Control-Allow-Origin header on every hop of the redirect chain, and Commons' own
// redirect responses don't send one - only the final upload.wikimedia.org response does.
const DEFAULT_IMAGE_URL =
  'https://upload.wikimedia.org/wikipedia/commons/5/50/ST_vs_RCT_2012_12_Jonny_Wilkinson_kicking_a_penalty_%28cropped%29.jpg';
const DEFAULT_IMAGE_CREDIT_URL =
  'https://commons.wikimedia.org/wiki/File:ST_vs_RCT_2012_12_Jonny_Wilkinson_kicking_a_penalty_(cropped).jpg';

// Fixed target-area size: the canvas never resizes per image - instead the image is
// letterboxed (scaled to fit, centered, transparent padding) inside it, the same idea as the
// model's own 640x640 preprocessing below but for display.
const TARGET_W = 700;
const TARGET_H = 480;

let session = null;
let currentSource = null; // native HTMLImageElement or HTMLVideoElement currently displayed
let detections = [];
let creditURL = null;
let cnv = null;
let videoEl = null;

function setup() {
  cnv = createCanvas(TARGET_W, TARGET_H);
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

  if (file.type === 'image') {
    const img = new Image();
    img.onload = () => runDetection(img, null);
    img.src = file.data;
  } else if (file.type === 'video') {
    runVideoDetection(file.data, null);
  } else {
    setStatus('Drop an image or video file');
  }
}

async function runInference(source) {
  const { tensor, s, padX, padY } = preprocess(source);
  const inputTensor = new ort.Tensor('float32', tensor, [1, 3, IMG_SIZE, IMG_SIZE]);
  const feeds = { [session.inputNames[0]]: inputTensor };
  const results = await session.run(feeds);
  const output = results[session.outputNames[0]];
  return parseOutput(output, s, padX, padY);
}

async function runDetection(img, credit) {
  stopVideo(); // in case a video was already running
  setStatus('Running detection…');
  currentSource = img;
  creditURL = credit;
  updateCredit();

  detections = await runInference(img);
  redraw();
  setStatus(`Detected ${detections.length} ball${detections.length !== 1 ? 's' : ''}`);
}

// Video is processed frame-by-frame, not played in real time: requestVideoFrameCallback
// fires once per frame the browser actually decodes, we pause immediately, run detection on
// exactly that frame, draw it, and only then arm the next callback and play() just long
// enough to decode the next frame. The video can't advance until the current frame's
// detection and drawing are completely finished. Loops back to the start at the end.
function stopVideo() {
  if (videoEl) {
    videoEl.pause();
    videoEl.src = '';
    videoEl = null;
  }
}

function runVideoDetection(dataURI, credit) {
  stopVideo();
  creditURL = credit;
  updateCredit();

  videoEl = document.createElement('video');
  videoEl.muted = true;
  videoEl.playsInline = true;
  videoEl.src = dataURI;

  videoEl.addEventListener(
    'loadeddata',
    function onLoaded() {
      videoEl.removeEventListener('loadeddata', onLoaded);
      // video.width/height (used by preprocess/draw) reflect HTML attributes, not the
      // decoded frame size, so they need setting explicitly from videoWidth/videoHeight.
      videoEl.width = videoEl.videoWidth;
      videoEl.height = videoEl.videoHeight;
      armNextVideoFrame();
      videoEl.play().catch(() => {}); // play() can be interrupted by the next frame's pause() - harmless, ignore
    },
    { once: true }
  );

  videoEl.addEventListener('ended', () => {
    if (!videoEl) return;
    videoEl.currentTime = 0;
    armNextVideoFrame();
    videoEl.play().catch(() => {}); // play() can be interrupted by the next frame's pause() - harmless, ignore
  });
}

function armNextVideoFrame() {
  if (videoEl) videoEl.requestVideoFrameCallback(onVideoFrame);
}

async function onVideoFrame() {
  if (!videoEl) return;
  videoEl.pause();

  currentSource = videoEl;
  setStatus('Running detection…');

  detections = await runInference(videoEl);
  redraw();
  setStatus(`Detected ${detections.length} ball${detections.length !== 1 ? 's' : ''} (video)`);

  armNextVideoFrame();
  if (videoEl) videoEl.play().catch(() => {}); // play() can be interrupted by the next frame's pause() - harmless, ignore
}

// Drawn via p5's underlying 2D context (drawingContext) rather than p5's own image()/rect()/
// text(), because currentSource is a plain HTMLImageElement or HTMLVideoElement (loaded
// manually so an image's crossOrigin can be set before loading - see loadDefaultImage/
// handleDroppedFile) and p5's high-level drawing functions expect a p5.Image, not a native
// one. p5 still owns the canvas itself, its sizing, and the drag-and-drop handling below.
function draw() {
  const ctx = drawingContext;

  ctx.clearRect(0, 0, width, height);

  if (!currentSource) return;

  // Letterbox: scale to fit the fixed target area, centered, same idea as preprocess() below
  const s = Math.min(width / currentSource.width, height / currentSource.height);
  const drawW = currentSource.width * s;
  const drawH = currentSource.height * s;
  const offX = (width - drawW) / 2;
  const offY = (height - drawH) / 2;

  ctx.drawImage(currentSource, offX, offY, drawW, drawH);

  detections.forEach((d) => {
    const bx1 = offX + d.x1 * s;
    const by1 = offY + d.y1 * s;
    const bx2 = offX + d.x2 * s;
    const by2 = offY + d.y2 * s;

    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 3;
    ctx.strokeRect(bx1, by1, bx2 - bx1, by2 - by1);

    // Solid chip behind the label, not bare colored text, so it stays legible regardless of
    // what's underneath (white letterbox padding or busy photo content) - and flipped below
    // the box instead of above when there's no room, so it can't get clipped off the canvas.
    const label = `rugby_ball ${(d.conf * 100).toFixed(0)}%`;
    ctx.font = 'bold 14px sans-serif';
    const labelW = ctx.measureText(label).width + 8;
    const labelH = 20;
    const labelY = by1 - labelH >= 0 ? by1 - labelH : by2;

    ctx.fillStyle = '#00ff88';
    ctx.fillRect(bx1, labelY, labelW, labelH);
    ctx.fillStyle = '#000';
    ctx.fillText(label, bx1 + 4, labelY + labelH - 6);
  });
}

function setStatus(msg) {
  document.getElementById('status').textContent = msg;
}

function updateCredit() {
  const el = document.getElementById('credit');
  if (creditURL) {
    el.innerHTML = `<a href="${creditURL}" target="_blank" rel="noopener">${creditURL}</a>`;
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
  const s = Math.min(IMG_SIZE / img.width, IMG_SIZE / img.height);
  const newW = Math.round(img.width * s);
  const newH = Math.round(img.height * s);
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

  return { tensor, s, padX, padY };
}

function parseOutput(output, s, padX, padY) {
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
    const x1 = (cx - w / 2 - padX) / s;
    const y1 = (cy - h / 2 - padY) / s;
    const x2 = (cx + w / 2 - padX) / s;
    const y2 = (cy + h / 2 - padY) / s;

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