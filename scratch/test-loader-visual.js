const puppeteer = require('/Users/shauryatiwari/.nvm/versions/node/v25.2.1/lib/node_modules/puppeteer');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function testLoader() {
  console.log('Testing loading screen implementation...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,850']
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });

  // 1. Visit root to inspect initial bootstrap loader or in-app loader
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  
  // Trigger .loader visibility using page.evaluate to simulate loading state
  await page.evaluate(() => {
    const loader = document.querySelector('.loader');
    if (loader) {
      loader.style.display = 'flex';
    }
  });

  // Wait a moment for video / rendering
  await new Promise(r => setTimeout(r, 600));

  const screenshotDir = path.join(__dirname, '../screenshots');
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  const loaderPath = path.join(screenshotDir, 'panel5_loading_screen.png');
  await page.screenshot({ path: loaderPath });
  console.log('Captured loader screenshot:', loaderPath);

  // Check element details in the page
  const loaderInfo = await page.evaluate(() => {
    const loader = document.querySelector('.loader');
    const video = document.querySelector('.loader-video');
    const sourceWebm = video ? video.querySelector('source[type="video/webm"]') : null;
    const sourceMp4 = video ? video.querySelector('source[type="video/mp4"]') : null;
    const fallbackImg = video ? video.querySelector('.loader-fallback-img') : null;
    const title = document.querySelector('.loader-brand-title');
    const caption = document.querySelector('.loader-caption');
    const progressBar = document.querySelector('.loader-progress-bar');
    
    return {
      loaderVisible: loader ? window.getComputedStyle(loader).display : 'none',
      hasVideo: !!video,
      webmSrc: sourceWebm ? sourceWebm.getAttribute('src') : null,
      mp4Src: sourceMp4 ? sourceMp4.getAttribute('src') : null,
      hasFallbackImg: !!fallbackImg,
      titleText: title ? title.textContent.trim() : null,
      captionText: caption ? caption.textContent.trim() : null,
      hasProgressBar: !!progressBar
    };
  });

  console.log('Loader elements info:', JSON.stringify(loaderInfo, null, 2));

  // Also copy to artifacts dir
  const artifactDir = '/Users/shauryatiwari/.gemini/antigravity/brain/aa29a86e-fa68-40a3-b559-762d6164b0c3/screenshots';
  if (!fs.existsSync(artifactDir)) {
    fs.mkdirSync(artifactDir, { recursive: true });
  }
  fs.copyFileSync(loaderPath, path.join(artifactDir, 'panel5_loading_screen.png'));
  console.log('Copied to artifact dir:', path.join(artifactDir, 'panel5_loading_screen.png'));

  await browser.close();
  console.log('Loader verification finished successfully!');
}

testLoader().catch(err => {
  console.error('Loader verification failed:', err);
  process.exit(1);
});
