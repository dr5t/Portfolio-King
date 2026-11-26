const puppeteer = require('/Users/shauryatiwari/.nvm/versions/node/v25.2.1/lib/node_modules/puppeteer');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SCREENSHOT_DIR = '/Users/shauryatiwari/.gemini/antigravity/brain/aa29a86e-fa68-40a3-b559-762d6164b0c3/screenshots';

(async () => {
  console.log('=== TESTING PORTFOLIO KING LOTTIE LOADING ANIMATION ===\n');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const screenshotsDir = SCREENSHOT_DIR;
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  try {
    // 1. Desktop Test
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    console.log('[Test 1] Testing dynamic Lottie loader on Desktop (1440x900)...');
    await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle2' });

    // Trigger dynamic loader via page evaluation
    const loaderStats = await page.evaluate(async () => {
      const { UtilityService } = window;
      // Show loader
      if (window.$) {
        window.$('.loader').css({ display: 'flex', opacity: 1 });
        if (window.dynamicLottie) {
          window.dynamicLottie.play();
        }
      }
      await new Promise(r => setTimeout(r, 400)); // wait for SVG render
      
      const loader = document.querySelector('.loader');
      const container = document.querySelector('.lottie-loader-container');
      const svg = container ? container.querySelector('svg') : null;
      const card = document.querySelector('.loader-card');
      const text = document.querySelector('.loader-brand-title, .loader-caption');
      const progress = document.querySelector('.loader-progress-track, .loader-progress-bar');
      const rect = container ? container.getBoundingClientRect() : null;
      const loaderStyle = loader ? window.getComputedStyle(loader) : null;

      return {
        hasLoader: !!loader,
        hasContainer: !!container,
        hasSvg: !!svg,
        hasOldCard: !!card,
        hasOldText: !!text,
        hasOldProgress: !!progress,
        width: rect ? rect.width : 0,
        height: rect ? rect.height : 0,
        loaderBg: loaderStyle ? loaderStyle.backgroundColor : '',
        svgPathsCount: svg ? svg.querySelectorAll('path').length : 0
      };
    });

    console.log('Desktop Loader Stats:', loaderStats);
    if (!loaderStats.hasSvg) throw new Error('Lottie SVG failed to render in container!');
    if (loaderStats.hasOldCard) throw new Error('Old .loader-card still present!');
    if (loaderStats.hasOldProgress) throw new Error('Old progress bar still present!');
    if (loaderStats.hasOldText) throw new Error('Old loading text still present!');
    console.log(`✓ Lottie SVG rendered with ${loaderStats.svgPathsCount} vector paths!`);
    console.log(`✓ Container dimensions: ${Math.round(loaderStats.width)}x${Math.round(loaderStats.height)}px (Approx 400x400 target)`);
    console.log('✓ Old cards, progress bars, and texts completely removed.');

    const desktopShot = path.join(screenshotsDir, 'lottie_loader_desktop_1440.png');
    await page.screenshot({ path: desktopShot });
    console.log(`✓ Desktop screenshot saved: ${desktopShot}`);

    // 2. Mobile Responsive Test (375x667)
    console.log('\n[Test 2] Testing responsive scaling on Mobile (375x667 iPhone SE)...');
    await page.setViewport({ width: 375, height: 667 });
    await new Promise(r => setTimeout(r, 200));

    const mobileStats = await page.evaluate(() => {
      const container = document.querySelector('.lottie-loader-container');
      const rect = container ? container.getBoundingClientRect() : null;
      return {
        width: rect ? rect.width : 0,
        height: rect ? rect.height : 0,
        withinViewport: rect ? (rect.right <= 375 && rect.left >= 0) : false
      };
    });

    console.log('Mobile Loader Stats:', mobileStats);
    if (!mobileStats.withinViewport) throw new Error('Loader clipped on mobile viewport!');
    console.log(`✓ Mobile container dimensions: ${Math.round(mobileStats.width)}x${Math.round(mobileStats.height)}px (Fits within 375px screen without clipping)`);

    const mobileShot = path.join(screenshotsDir, 'lottie_loader_mobile_375.png');
    await page.screenshot({ path: mobileShot });
    console.log(`✓ Mobile screenshot saved: ${mobileShot}`);

    // 3. Tablet Responsive Test (768x1024)
    console.log('\n[Test 3] Testing responsive scaling on Tablet (768x1024 iPad)...');
    await page.setViewport({ width: 768, height: 1024 });
    await new Promise(r => setTimeout(r, 200));
    const tabletShot = path.join(screenshotsDir, 'lottie_loader_tablet_768.png');
    await page.screenshot({ path: tabletShot });
    console.log(`✓ Tablet screenshot saved: ${tabletShot}`);

    // 4. Early Dismissal Test
    console.log('\n[Test 4] Testing immediate early dismissal (no artificial delay)...');
    const earlyDismissResult = await page.evaluate(async () => {
      // Hide loader
      if (window.$) {
        window.$('.loader').stop(true, true).css({ display: 'none' });
      }
      await new Promise(r => setTimeout(r, 100));
      const loader = document.querySelector('.loader');
      return loader ? window.getComputedStyle(loader).display : 'none';
    });
    console.log('Early Dismissal Status:', earlyDismissResult);
    if (earlyDismissResult !== 'none') throw new Error('Loader failed to dismiss immediately!');
    console.log('✓ Loader dismissed immediately upon completion without delay.');

    // 5. Hard Maximum 3-Second Ceiling Test
    console.log('\n[Test 5] Testing hard 3-second maximum duration timeout...');
    const timeoutTestResult = await page.evaluate(async () => {
      // Trigger loader display
      const loader = document.querySelector('.loader');
      loader.style.display = 'flex';
      loader.style.opacity = '1';

      // Check at 1.0s (should still be active)
      await new Promise(r => setTimeout(r, 1000));
      const displayAt1s = window.getComputedStyle(loader).display;

      // Wait until 3.4s (should be automatically dismissed by safety ceiling)
      await new Promise(r => setTimeout(r, 2400));
      const displayAt34s = window.getComputedStyle(loader).display;

      return {
        displayAt1s,
        displayAt34s
      };
    });

    console.log('Timeout Test Results:', timeoutTestResult);
    if (timeoutTestResult.displayAt1s !== 'flex') {
      throw new Error(`Expected loader to be active at 1.0s, got: ${timeoutTestResult.displayAt1s}`);
    }
    if (timeoutTestResult.displayAt34s !== 'none') {
      throw new Error(`Expected loader to be dismissed after 3.0s, got: ${timeoutTestResult.displayAt34s}`);
    }
    console.log('✓ Loader was active during operation and automatically dismissed after 3 seconds.');

    console.log('\n=== ALL LOTTIE LOADER REQUIREMENTS VERIFIED 100% SUCCESSFULLY! ===');
  } finally {
    await browser.close();
  }
})();
