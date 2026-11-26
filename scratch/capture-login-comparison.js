const puppeteer = require('/Users/shauryatiwari/.nvm/versions/node/v25.2.1/lib/node_modules/puppeteer');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE_URL = 'http://localhost:3000';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function captureLogin() {
  console.log('Capturing login comparison at 1440x900...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

  await page.goto(BASE_URL + '/login', { waitUntil: 'networkidle2' });
  await sleep(600);

  // Trigger invalid team login to show the exact error state from reference
  await page.waitForSelector('input[name="username"]');
  await page.type('input[name="username"]', 'INVALID_TEAM');
  await page.type('input[name="password"]', 'WrongPass!');
  await page.click('button[type="submit"]');
  await sleep(600);

  // Ensure legacy toast is hidden
  await page.evaluate(() => {
    const errorBox = document.querySelector('.show-error');
    if (errorBox) errorBox.style.display = 'none';
  });

  const screenshotDir = path.join(__dirname, '../screenshots');
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  const outPath = path.join(screenshotDir, 'panel1_login_pixel_accurate.png');
  await page.screenshot({ path: outPath });
  console.log('Captured login screenshot:', outPath);

  // Copy to artifacts
  const artifactDir = '/Users/shauryatiwari/.gemini/antigravity/brain/aa29a86e-fa68-40a3-b559-762d6164b0c3/screenshots';
  fs.copyFileSync(outPath, path.join(artifactDir, 'panel1_login_pixel_accurate.png'));
  // Also update panel1_login.png
  fs.copyFileSync(outPath, path.join(artifactDir, 'panel1_login.png'));

  await browser.close();
  console.log('Login capture complete!');
}

captureLogin().catch(err => {
  console.error('Failed to capture login:', err);
  process.exit(1);
});
