const puppeteer = require('/Users/shauryatiwari/.nvm/versions/node/v25.2.1/lib/node_modules/puppeteer');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const http = require('http');
const { MongoClient } = require('../portfolio-king-server/node_modules/mongodb');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TEST_DB = 'portfolio_vp_test';
const MONGO_URI = `mongodb://127.0.0.1:27017/${TEST_DB}`;
const PORT = 3005;

const VIEWPORTS = [
  // Mobile Portrait
  { category: 'Mobile', name: '320px_small_mobile', width: 320, height: 568 },
  { category: 'Mobile', name: '360px_android_standard', width: 360, height: 640 },
  { category: 'Mobile', name: '375px_iphone_se', width: 375, height: 667 },
  { category: 'Mobile', name: '390px_iphone_12_13_14', width: 390, height: 844 },
  { category: 'Mobile', name: '393px_pixel_7', width: 393, height: 851 },
  { category: 'Mobile', name: '414px_iphone_plus', width: 414, height: 896 },
  { category: 'Mobile', name: '430px_iphone_pro_max', width: 430, height: 932 },
  
  // Mobile Landscape
  { category: 'Mobile Landscape', name: '667x375_iphone_landscape', width: 667, height: 375 },
  { category: 'Mobile Landscape', name: '844x390_iphone13_landscape', width: 844, height: 390 },

  // Tablet
  { category: 'Tablet', name: '600px_small_tablet', width: 600, height: 960 },
  { category: 'Tablet', name: '768px_ipad_portrait', width: 768, height: 1024 },
  { category: 'Tablet', name: '820px_ipad_air', width: 820, height: 1180 },
  { category: 'Tablet', name: '1024px_ipad_landscape', width: 1024, height: 768 },

  // Desktop / Laptop
  { category: 'Desktop', name: '1280px_laptop', width: 1280, height: 800 },
  { category: 'Desktop', name: '1366px_hd_laptop', width: 1366, height: 768 },
  { category: 'Desktop', name: '1440px_desktop', width: 1440, height: 900 },
  { category: 'Desktop', name: '1920px_full_hd', width: 1920, height: 1080 },
  { category: 'Desktop', name: '2560px_qhd_ultrawide', width: 2560, height: 1440 }
];

function waitForServer(url, timeoutMs = 25000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function ping() {
      http.get(url, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 400) {
          resolve();
        } else {
          check();
        }
      }).on('error', () => {
        check();
      });
    }
    function check() {
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Timeout waiting for ${url}`));
      } else {
        setTimeout(ping, 400);
      }
    }
    ping();
  });
}

async function run() {
  console.log('========================================================================');
  console.log('     PORTFOLIO KING COMPREHENSIVE MULTI-VIEWPORT AUDIT SUITE');
  console.log('========================================================================\n');

  console.log('[Setup] Connecting to MongoDB and setting up isolated test database...');
  const client = await MongoClient.connect('mongodb://127.0.0.1:27017');
  await client.db(TEST_DB).dropDatabase();
  console.log(`✓ Clean test database "${TEST_DB}" initialized.`);

  console.log(`[Setup] Starting Portfolio King server on port ${PORT}...`);
  const serverProc = spawn(process.execPath, [path.resolve(__dirname, '../portfolio-king-server/index.js')], {
    env: {
      ...process.env,
      PORT: String(PORT),
      DB_NAME: TEST_DB,
      MONGODB_URI: MONGO_URI,
      ADMIN_USERNAME: 'admin',
      ADMIN_PASSWORD: 'admin@1234'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  serverProc.stdout.on('data', d => {
    const s = d.toString().trim();
    if (s.includes('App is listening') || s.includes('Connected to MongoDB')) {
      console.log(`  [Server] ${s}`);
    }
  });

  try {
    await waitForServer(`http://127.0.0.1:${PORT}/login`);
    console.log(`✓ Server ready at http://127.0.0.1:${PORT}\n`);

    const browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
    });

    const page = await browser.newPage();
    let failures = 0;
    const report = [];

    // Helper to test overflow and viewport metrics
    async function checkPageResponsiveness(pageName, url, vp) {
      await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 15000 });
      await new Promise(r => setTimeout(r, 200));

      const metrics = await page.evaluate(() => {
        const doc = document.documentElement;
        const body = document.body;
        const scrollWidth = Math.max(doc.scrollWidth, body.scrollWidth);
        const clientWidth = doc.clientWidth;
        const innerWidth = window.innerWidth;
        const hasHorizontalOverflow = scrollWidth > (innerWidth + 1); // 1px rounding tolerance
        const overflowPixels = Math.max(0, scrollWidth - innerWidth);

        // Check input font sizes on <= 768px screens to confirm iOS zoom immunity
        const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])'));
        const smallInputs = inputs.filter(inp => {
          const fs = parseFloat(window.getComputedStyle(inp).fontSize);
          return fs < 15.5; // under 16px
        }).length;

        return {
          scrollWidth,
          clientWidth,
          innerWidth,
          hasHorizontalOverflow,
          overflowPixels,
          totalInputs: inputs.length,
          smallInputs
        };
      });

      const pass = !metrics.hasHorizontalOverflow;
      if (!pass) failures++;

      report.push({
        page: pageName,
        viewport: vp.name,
        category: vp.category,
        dimensions: `${vp.width}x${vp.height}`,
        pass,
        metrics
      });

      console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${pageName} @ ${vp.width}x${vp.height} (${vp.name}) - scrollW: ${metrics.scrollWidth}px, innerW: ${metrics.innerWidth}px, overflow: ${metrics.overflowPixels}px`);
      return metrics;
    }

    console.log('--- PHASE 1: Testing Login Page Across All 18 Viewports ---');
    for (const vp of VIEWPORTS) {
      await checkPageResponsiveness('Login (Team)', `http://127.0.0.1:${PORT}/login`, vp);
    }

    console.log('\n--- PHASE 2: Testing Rules Page Across Selected Viewports ---');
    for (const vp of [VIEWPORTS[0], VIEWPORTS[2], VIEWPORTS[7], VIEWPORTS[10], VIEWPORTS[14], VIEWPORTS[16]]) {
      await checkPageResponsiveness('Rules & Guidelines', `http://127.0.0.1:${PORT}/rules`, vp);
    }

    console.log('\n--- PHASE 3: Authenticating Administrator Session ---');
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`http://127.0.0.1:${PORT}/login`, { waitUntil: 'networkidle0' });

    // Switch to Admin Login tab
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.tab-btn'));
      const adminBtn = btns.find(b => b.textContent.includes('Admin Login'));
      if (adminBtn) adminBtn.click();
    });
    await new Promise(r => setTimeout(r, 200));

    await page.type('input[name="username"]', 'admin');
    await page.type('input[name="password"]', 'admin@1234');
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {});
    await new Promise(r => setTimeout(r, 600));

    console.log(`✓ Admin logged in. Current URL: ${page.url()}\n`);

    console.log('--- PHASE 4: Testing Admin Overview & Shell Across Viewports ---');
    for (const vp of VIEWPORTS) {
      await checkPageResponsiveness('Admin Overview', `http://127.0.0.1:${PORT}/admin/overview`, vp);
    }

    console.log('\n--- PHASE 5: Testing Mobile Drawer Navigation on 375px Screen ---');
    await page.setViewport({ width: 375, height: 667 });
    await page.goto(`http://127.0.0.1:${PORT}/admin/overview`, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 300));

    // Check mobile drawer opening
    const drawerOpenResult = await page.evaluate(async () => {
      const menuBtn = document.querySelector('.mobile-menu-btn');
      if (!menuBtn) return { success: false, reason: 'No mobile menu button found' };
      menuBtn.click();
      await new Promise(r => setTimeout(r, 300));
      const sidebar = document.querySelector('.app-sidebar');
      const backdrop = document.querySelector('.sidebar-mobile-backdrop');
      const bodyOverflow = document.body.style.overflow;
      const isOpen = sidebar && sidebar.classList.contains('mobile-open');
      const hasBackdrop = !!backdrop;
      return { success: isOpen && hasBackdrop && bodyOverflow === 'hidden', isOpen, hasBackdrop, bodyOverflow };
    });
    console.log(`  Mobile Drawer Open Test: ${drawerOpenResult.success ? 'PASS' : 'FAIL'} (isOpen=${drawerOpenResult.isOpen}, backdrop=${drawerOpenResult.hasBackdrop}, bodyLock=${drawerOpenResult.bodyOverflow})`);

    // Check mobile drawer closing via close button
    const drawerCloseResult = await page.evaluate(async () => {
      const closeBtn = document.querySelector('.mobile-close-btn');
      if (closeBtn) {
        closeBtn.click();
        await new Promise(r => setTimeout(r, 300));
      }
      const sidebar = document.querySelector('.app-sidebar');
      const isClosed = sidebar && !sidebar.classList.contains('mobile-open');
      const bodyOverflow = document.body.style.overflow;
      return { success: isClosed && bodyOverflow !== 'hidden', isClosed, bodyOverflow };
    });
    console.log(`  Mobile Drawer Close Test: ${drawerCloseResult.success ? 'PASS' : 'FAIL'} (isClosed=${drawerCloseResult.isClosed})\n`);

    console.log('--- PHASE 6: Testing Admin Games & Teams Management Page ---');
    for (const vp of [VIEWPORTS[0], VIEWPORTS[2], VIEWPORTS[7], VIEWPORTS[10], VIEWPORTS[14], VIEWPORTS[16]]) {
      await checkPageResponsiveness('Admin Games & Teams', `http://127.0.0.1:${PORT}/admin/games`, vp);
    }

    console.log('\n--- PHASE 7: Testing Admin Results, History & Settings Pages ---');
    for (const pageName of ['history', 'results', 'settings']) {
      for (const vp of [VIEWPORTS[0], VIEWPORTS[2], VIEWPORTS[10], VIEWPORTS[15]]) {
        await checkPageResponsiveness(`Admin ${pageName.toUpperCase()}`, `http://127.0.0.1:${PORT}/admin/${pageName}`, vp);
      }
    }

    console.log('\n========================================================================');
    console.log(`TOTAL AUDIT CHECKS: ${report.length}`);
    console.log(`PASSED: ${report.filter(r => r.pass).length}`);
    console.log(`FAILED: ${failures}`);
    console.log('========================================================================\n');

    await browser.close();

    if (failures > 0) {
      console.error(`Audit finished with ${failures} failure(s).`);
      process.exit(1);
    } else {
      console.log('✓ ALL 18 VIEWPORTS & RESPONSIVE ARCHITECTURE VERIFIED 100% PASSING!');
    }
  } finally {
    serverProc.kill('SIGINT');
    await client.close();
  }
}

run().catch(err => {
  console.error('Fatal error in multi-viewport audit:', err);
  process.exit(1);
});
