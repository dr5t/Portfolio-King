const puppeteer = require('/Users/shauryatiwari/.nvm/versions/node/v25.2.1/lib/node_modules/puppeteer');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const VIEWPORTS = [
  { name: '320px_mobile_small', width: 320, height: 568 },
  { name: '360px_android_standard', width: 360, height: 640 },
  { name: '375px_iphone_se', width: 375, height: 667 },
  { name: '390px_iphone_12_13_14', width: 390, height: 844 },
  { name: '414px_iphone_plus', width: 414, height: 896 },
  { name: '768px_ipad_portrait', width: 768, height: 1024 },
  { name: '1024px_ipad_landscape', width: 1024, height: 768 },
  { name: '1366px_laptop', width: 1366, height: 768 },
  { name: '1440px_desktop_standard', width: 1440, height: 900 },
  { name: '1920px_full_hd', width: 1920, height: 1080 }
];

const OUT_DIR = path.resolve(__dirname, '../screenshots/viewports');
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

async function runViewportAudit() {
  console.log('=== STARTING 10-VIEWPORT RESPONSIVENESS AUDIT ===');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  const results = [];

  for (const vp of VIEWPORTS) {
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });
    await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });

    // Check for unwanted horizontal scroll / body overflow
    const overflowMetrics = await page.evaluate(() => {
      const doc = document.documentElement;
      const body = document.body;
      const scrollWidth = Math.max(doc.scrollWidth, body.scrollWidth);
      const clientWidth = doc.clientWidth;
      const hasHorizontalOverflow = scrollWidth > clientWidth;
      return {
        clientWidth,
        scrollWidth,
        hasHorizontalOverflow,
        overflowPixels: scrollWidth - clientWidth
      };
    });

    const screenshotPath = path.join(OUT_DIR, `login_${vp.width}x${vp.height}_${vp.name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });

    console.log(`[Viewport ${vp.width}x${vp.height}] ${vp.name}: clientWidth=${overflowMetrics.clientWidth}, scrollWidth=${overflowMetrics.scrollWidth}, horizontalOverflow=${overflowMetrics.hasHorizontalOverflow ? 'FAIL (' + overflowMetrics.overflowPixels + 'px)' : 'PASS (0px)'}`);

    results.push({
      viewport: vp,
      ...overflowMetrics,
      screenshot: screenshotPath
    });
  }

  // Also audit Admin / Games view at mobile and desktop
  console.log('\n--- Auditing Admin Viewport Responsiveness ---');
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });

  // Click Admin Login tab
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('.tab-btn'));
    const adminBtn = btns.find(b => b.textContent.includes('Admin Login'));
    if (adminBtn) adminBtn.click();
  });
  await new Promise(r => setTimeout(r, 200));

  await page.type('input[name="username"]', 'admin');
  await page.type('input[name="password"]', 'admin');
  await page.click('button[type="submit"]');
  await page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {});
  await new Promise(r => setTimeout(r, 600));

  for (const vp of [VIEWPORTS[0], VIEWPORTS[5], VIEWPORTS[7], VIEWPORTS[8]]) {
    await page.setViewport({ width: vp.width, height: vp.height });
    await new Promise(r => setTimeout(r, 200));

    const overflowMetrics = await page.evaluate(() => {
      const doc = document.documentElement;
      const body = document.body;
      const scrollWidth = Math.max(doc.scrollWidth, body.scrollWidth);
      const clientWidth = doc.clientWidth;
      return {
        clientWidth,
        scrollWidth,
        hasHorizontalOverflow: scrollWidth > clientWidth,
        overflowPixels: scrollWidth - clientWidth
      };
    });

    const screenshotPath = path.join(OUT_DIR, `admin_${vp.width}x${vp.height}_${vp.name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });

    console.log(`[Admin Viewport ${vp.width}x${vp.height}] ${vp.name}: horizontalOverflow=${overflowMetrics.hasHorizontalOverflow ? 'FAIL (' + overflowMetrics.overflowPixels + 'px)' : 'PASS (0px)'}`);
  }

  await browser.close();
  console.log('=== VIEWPORT AUDIT COMPLETE ===');
}

runViewportAudit().catch(err => {
  console.error('Audit Error:', err);
  process.exit(1);
});
