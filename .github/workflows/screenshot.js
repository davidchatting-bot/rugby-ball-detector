// Regenerates screenshot.png from the live demo (index.html/style.css/sketch.js at the repo
// root) - run by CI on every push, so the README's screenshot always reflects the current
// demo and default test image (see .github/workflows/build.yml).
//
// Waits on the page's own #status text reaching "Detected ..." (set once sketch.js's
// runDetection() finishes - see ../../sketch.js) rather than a fixed delay, so it's not flaky
// under CI load or while the model/wasm runtime are still loading.
const { chromium } = require('playwright');
const path = require('path');

const DEMO_URL = process.argv[2] || 'http://localhost:8099/';
const OUT_PATH = path.join(__dirname, '..', '..', 'screenshot.png'); // repo root, two levels up from .github/workflows/

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });

  await page.goto(DEMO_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForFunction(
    () => document.getElementById('status')?.textContent?.startsWith('Detected'),
    { timeout: 60000 }
  );
  await page.waitForTimeout(300); // let the frame with the result actually paint

  const statusText = await page.textContent('#status');
  if (!/^Detected [1-9]/.test(statusText)) {
    await browser.close();
    throw new Error(`Demo ran but found no ball ("${statusText}") - not updating screenshot.png`);
  }

  // Just the canvas itself, not the surrounding heading/status/hint text.
  await page.locator('#canvas-holder canvas').screenshot({ path: OUT_PATH });
  console.log(`Wrote ${OUT_PATH}`);
  await browser.close();
})();
