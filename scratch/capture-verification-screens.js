const puppeteer = require('/Users/shauryatiwari/.nvm/versions/node/v25.2.1/lib/node_modules/puppeteer');
const path = require('path');

const SCREENSHOT_DIR = '/Users/shauryatiwari/.gemini/antigravity/brain/aa29a86e-fa68-40a3-b559-762d6164b0c3/screenshots';
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE_URL = 'http://localhost:3000';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function capture() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,850']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 850 });

    // 1. Panel 1: Login Screen
    await page.goto(BASE_URL + '/login', { waitUntil: 'networkidle2' });
    await sleep(800);
    // Enter invalid credentials to show the inline error alert as in Panel 1 reference
    await page.waitForSelector('input[name="username"]');
    await page.type('input[name="username"]', 'INVALID_TEAM');
    await page.type('input[name="password"]', 'WrongPass!');
    await page.click('button[type="submit"]');
    await sleep(800);
    // Ensure any legacy toast is hidden so the clean inline error alert is clearly visible
    await page.evaluate(() => {
      const err = document.querySelector('.show-error');
      if (err) err.style.display = 'none';
    });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'panel1_login.png') });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'verify_01_login_clean.png') });
    console.log('✓ Captured Panel 1: Login Screen');

    // 2. Panel 2: Admin Games Management
    const buttons = await page.$$('button');
    for (const b of buttons) {
      const text = await page.evaluate(el => el.textContent, b);
      if (text.includes('Admin Login')) {
        await b.click();
        break;
      }
    }
    await sleep(400);
    await page.waitForSelector('input[name="username"]');
    await page.evaluate(() => {
      document.querySelector('input[name="username"]').value = '';
      document.querySelector('input[name="password"]').value = '';
      const err = document.querySelector('.show-error');
      if (err) err.style.display = 'none';
    });
    await page.type('input[name="username"]', 'admin');
    await page.type('input[name="password"]', 'admin@1234');
    await page.click('button[type="submit"]');

    await page.waitForSelector('.start-page-container', { timeout: 10000 });
    await sleep(1200);
    await page.evaluate(() => {
      const err = document.querySelector('.show-error');
      if (err) err.style.display = 'none';
    });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'panel2_admin_games.png') });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'verify_02_admin_dashboard_games.png') });
    console.log('✓ Captured Panel 2: Admin Games Management');

    // 3. Panel 4: Game Results & Leaderboard
    const gameLink = await page.$('.game-item a');
    if (gameLink) {
      await gameLink.click();
      await page.waitForSelector('.game-action-btn-container', { timeout: 10000 });
      await sleep(1500);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'panel4_game_results.png') });
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'verify_03_leaderboard_fintech.png') });
      console.log('✓ Captured Panel 4: Game Results & Leaderboard');
    }

    // Copy auth_10_player_investment_terminal.png to panel3_player_investment.png
    const fs = require('fs');
    const investScreen = path.join(SCREENSHOT_DIR, 'auth_10_player_investment_terminal.png');
    if (fs.existsSync(investScreen)) {
      fs.copyFileSync(investScreen, path.join(SCREENSHOT_DIR, 'panel3_player_investment.png'));
      console.log('✓ Captured Panel 3: Player Investment Workspace');
    }

  } catch (err) {
    console.error('Capture error:', err);
  } finally {
    await browser.close();
  }
}

capture();
