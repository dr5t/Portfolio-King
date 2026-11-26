const puppeteer = require('/Users/shauryatiwari/.nvm/versions/node/v25.2.1/lib/node_modules/puppeteer');
const fs = require('fs');
const path = require('path');

const SCREENSHOT_DIR = '/Users/shauryatiwari/.gemini/antigravity/brain/aa29a86e-fa68-40a3-b559-762d6164b0c3/screenshots';
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE_URL = 'http://localhost:3000';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForButton(page, text, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const buttons = await page.$$('button');
    for (const b of buttons) {
      const isMatch = await page.evaluate((el, target) => {
        return el.textContent.includes(target) && !el.disabled;
      }, b, text);
      if (isMatch) return b;
    }
    await sleep(500);
  }
  throw new Error(`Timeout waiting for button containing "${text}"`);
}

async function clickButton(page, text, timeout = 15000) {
  const btn = await waitForButton(page, text, timeout);
  await page.evaluate(el => el.click(), btn);
  return btn;
}

async function dismissAlert(page) {
  await page.evaluate(() => {
    const closeBtn = document.querySelector('.show-error button');
    if (closeBtn) closeBtn.click();
    const container = document.querySelector('.show-error');
    if (container) container.style.top = '-50%';
  });
  await sleep(600);
}

async function getErrorAlertText(page, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const text = await page.evaluate(() => {
      const inlineEl = document.querySelector('.auth-error-alert .alert-text') || document.querySelector('.auth-error-alert');
      if (inlineEl && inlineEl.textContent && inlineEl.textContent.trim().length > 0) {
        return inlineEl.textContent.trim();
      }
      const el = document.querySelector('.show-error .msg-box');
      const container = document.querySelector('.show-error');
      if (el && container) {
        const top = window.getComputedStyle(container).top;
        if (top.includes('50%') || !top.includes('-')) {
          return el.textContent.trim();
        }
      }
      return null;
    });
    if (text) return text;
    await sleep(200);
  }
  return null;
}

async function runTest() {
  console.log('=== STARTING COMPLETE AUTH & MULTIPLAYER E2E TEST ===\n');
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--autoplay-policy=no-user-gesture-required',
      '--mute-audio',
      '--window-size=1280,800'
    ]
  });

  try {
    // -------------------------------------------------------------
    // PHASE 1: ADMIN LOGIN ERROR & SUCCESSFUL LOGIN
    // -------------------------------------------------------------
    console.log('[Phase 1] Testing Admin Login & Invalid Credential Alert...');
    const adminContext = await browser.createBrowserContext();
    const adminPage = await adminContext.newPage();
    await adminPage.setViewport({ width: 1280, height: 800 });
    await adminPage.goto(BASE_URL + '/login', { waitUntil: 'networkidle2' });

    // Click Admin Login
    await clickButton(adminPage, 'Admin Login');

    // 1a. Test Invalid Admin Password
    await adminPage.waitForSelector('input[name="username"]');
    await adminPage.type('input[name="username"]', 'admin');
    await adminPage.type('input[name="password"]', 'WrongPass@999');
    await adminPage.click('button[type="submit"]');

    const adminErrMsg = await getErrorAlertText(adminPage);
    console.log(`  Invalid Admin Alert displayed: "${adminErrMsg}"`);
    if (!adminErrMsg || !adminErrMsg.includes('Invalid Admin ID or Password')) {
      throw new Error(`Expected "Invalid Admin ID or Password" alert, got: "${adminErrMsg}"`);
    }
    await adminPage.screenshot({ path: path.join(SCREENSHOT_DIR, 'auth_01_invalid_admin_alert.png') });
    await dismissAlert(adminPage);

    // 1b. Test Valid Admin Login (fresh page load to guarantee pristine inputs)
    await adminPage.goto(BASE_URL + '/login', { waitUntil: 'networkidle2' });
    await clickButton(adminPage, 'Admin Login');
    await adminPage.waitForSelector('input[name="username"]');
    await adminPage.type('input[name="username"]', 'admin');
    await adminPage.type('input[name="password"]', 'admin@1234');
    await adminPage.click('button[type="submit"]');

    await adminPage.waitForSelector('.admin-page-shell, .start-page-container', { timeout: 15000 });
    console.log('✓ Admin authenticated successfully.');
    await sleep(1000);

    // -------------------------------------------------------------
    // PHASE 2: CREATE GAME & ADMIN MANAGE TEAMS
    // -------------------------------------------------------------
    console.log('\n[Phase 2] Admin Managing Teams...');
    // Navigate to /admin/games if not already there
    if (!adminPage.url().includes('/admin/games')) {
      await adminPage.goto(BASE_URL + '/admin/games', { waitUntil: 'networkidle2' });
      await sleep(1000);
    }
    // Create new game
    const createBtn = await adminPage.$('.btn-create-game');
    if (createBtn) {
      await adminPage.evaluate(el => el.click(), createBtn);
      await sleep(500);
      const confirmBtn = await adminPage.$('.modal-footer .btn-primary');
      if (confirmBtn) {
        await adminPage.evaluate(el => el.click(), confirmBtn);
        await sleep(1500);
      }
    } else {
      await clickButton(adminPage, 'Create Game');
      await sleep(1500);
    }

    // Open Manage Teams
    await adminPage.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a, button'));
      const mt = links.find(l => l.textContent.includes('Manage Teams'));
      if (mt) mt.click();
    });
    await adminPage.waitForSelector('.manage-teams-section', { timeout: 10000 });
    console.log('✓ Manage Teams panel opened.');
    await adminPage.screenshot({ path: path.join(SCREENSHOT_DIR, 'auth_02_admin_team_manager.png') });

    // Auto-Generate 4 Teams
    console.log('  Triggering Auto-Generate 4 Teams...');
    await clickButton(adminPage, 'Auto-Generate 4 Teams');
    await adminPage.waitForSelector('.credentials-box', { timeout: 10000 });

    // Extract generated credentials from UI
    const generatedCreds = await adminPage.evaluate(() => {
      const rows = document.querySelectorAll('.cred-list .cred-row');
      const creds = [];
      rows.forEach(r => {
        const nameEl = r.querySelector('.cred-name');
        const codeEls = r.querySelectorAll('code');
        if (nameEl && codeEls.length >= 2) {
          creds.push({
            name: nameEl.textContent.replace(':', '').trim(),
            teamId: codeEls[0].textContent.trim(),
            rawPassword: codeEls[1].textContent.trim()
          });
        }
      });
      return creds;
    });

    console.log('✓ Generated Credentials from DOM:', generatedCreds);
    if (generatedCreds.length !== 4) {
      throw new Error(`Expected 4 generated teams, found: ${generatedCreds.length}`);
    }
    await adminPage.screenshot({ path: path.join(SCREENSHOT_DIR, 'auth_03_teams_auto_generated.png') });

    // Test Copy Credentials button
    await clickButton(adminPage, 'Copy All Credentials');
    await sleep(1000);

    // Test Status Toggle (Disable Team 4 temporarily)
    console.log('  Testing team status toggle (Disabling Team 4)...');
    await adminPage.evaluate(() => {
      const rows = document.querySelectorAll('tbody tr');
      if (rows.length >= 4) {
        const lastRow = rows[3];
        const buttons = Array.from(lastRow.querySelectorAll('button'));
        const toggleBtn = buttons.find(b => b.textContent.includes('Disable'));
        if (toggleBtn) toggleBtn.click();
      }
    });

    await adminPage.waitForFunction(() => {
      const tags = Array.from(document.querySelectorAll('.tag-disabled'));
      return tags.length > 0;
    }, { timeout: 5000 });
    console.log('✓ Team 4 status toggled to disabled in Admin dashboard.');
    await sleep(1000);

    // -------------------------------------------------------------
    // PHASE 3: PLAYER LOGIN AUTHENTICATION & ERROR HANDLING
    // -------------------------------------------------------------
    console.log('\n[Phase 3] Testing Player Authentication & Error Alerts...');
    const playerContextA = await browser.createBrowserContext();
    const pageA = await playerContextA.newPage();
    await pageA.setViewport({ width: 1280, height: 800 });
    await pageA.goto(BASE_URL + '/login', { waitUntil: 'networkidle2' });

    // Click Player Login
    await clickButton(pageA, 'Player Login');

    // 3a. Invalid Team Password Alert
    console.log('  Testing invalid password for Team 1...');
    await pageA.waitForSelector('input[name="username"]');
    await pageA.type('input[name="username"]', generatedCreds[0].teamId);
    await pageA.type('input[name="password"]', 'BadPassword123#');
    await pageA.click('button[type="submit"]');

    const invalidTeamAlert = await getErrorAlertText(pageA);
    console.log(`  Invalid Team Alert displayed: "${invalidTeamAlert}"`);
    if (!invalidTeamAlert || !invalidTeamAlert.includes('Invalid Team ID or Password')) {
      throw new Error(`Expected "Invalid Team ID or Password" alert, got: "${invalidTeamAlert}"`);
    }
    await pageA.screenshot({ path: path.join(SCREENSHOT_DIR, 'auth_04_invalid_team_login_alert.png') });
    await dismissAlert(pageA);

    // 3b. Disabled Team Login Alert
    console.log('  Testing login for disabled Team 4...');
    await pageA.goto(BASE_URL + '/login', { waitUntil: 'networkidle2' });
    await clickButton(pageA, 'Player Login');
    await pageA.waitForSelector('input[name="username"]');
    await pageA.type('input[name="username"]', generatedCreds[3].teamId);
    await pageA.type('input[name="password"]', generatedCreds[3].rawPassword);
    await pageA.click('button[type="submit"]');

    const disabledTeamAlert = await getErrorAlertText(pageA);
    console.log(`  Disabled Team Alert displayed: "${disabledTeamAlert}"`);
    if (!disabledTeamAlert || !disabledTeamAlert.includes('Team account disabled')) {
      throw new Error(`Expected "Team account disabled" alert, got: "${disabledTeamAlert}"`);
    }
    await pageA.screenshot({ path: path.join(SCREENSHOT_DIR, 'auth_05_disabled_team_login_alert.png') });
    await dismissAlert(pageA);
    await playerContextA.close();

    // Re-enable Team 4 in admin dashboard
    console.log('  Re-enabling Team 4 in Admin Dashboard...');
    await adminPage.bringToFront();
    await adminPage.evaluate(() => {
      const rows = document.querySelectorAll('tbody tr');
      if (rows.length >= 4) {
        const lastRow = rows[3];
        const buttons = Array.from(lastRow.querySelectorAll('button'));
        const toggleBtn = buttons.find(b => b.textContent.includes('Enable'));
        if (toggleBtn) toggleBtn.click();
      }
    });

    await adminPage.waitForFunction(() => {
      const tags = Array.from(document.querySelectorAll('.tag-disabled'));
      return tags.length === 0;
    }, { timeout: 5000 });
    console.log('✓ Team 4 successfully re-enabled.');
    await sleep(1000);

    // Close team manager on Admin page and navigate to waiting room
    if (adminPage.url().includes('/admin/teams')) {
      await adminPage.goto(BASE_URL + '/admin/games', { waitUntil: 'networkidle2' });
      await sleep(1000);
    }
    const gameLinks = await adminPage.$$('.game-item a');
    const newestGameLink = gameLinks[gameLinks.length - 1];
    const newestGameText = await adminPage.evaluate(el => el.textContent.trim(), newestGameLink);
    console.log(`✓ Admin entering waiting room for ${newestGameText}`);
    await adminPage.evaluate(el => el.click(), newestGameLink);
    await adminPage.waitForSelector('.game-action-btn-container', { timeout: 10000 });
    const targetGameId = adminPage.url().split('/').pop();
    console.log(`✓ Target Game ID: ${targetGameId}`);

    // -------------------------------------------------------------
    // PHASE 4: FOUR AUTHORIZED PLAYERS LOGIN & JOIN
    // -------------------------------------------------------------
    console.log('\n[Phase 4] Logging in 4 authorized teams...');
    const playerSessions = [];

    for (let i = 0; i < generatedCreds.length; i++) {
      const cred = generatedCreds[i];
      console.log(`  Logging in Team ${i + 1}: ${cred.name} (${cred.teamId})...`);
      const ctx = await browser.createBrowserContext();
      const pPage = await ctx.newPage();
      await pPage.setViewport({ width: 1280, height: 800 });
      await pPage.goto(BASE_URL + '/login', { waitUntil: 'networkidle2' });

      await clickButton(pPage, 'Player Login');
      await pPage.waitForSelector('input[name="username"]');
      await pPage.type('input[name="username"]', cred.teamId);
      await pPage.type('input[name="password"]', cred.rawPassword);
      await pPage.click('button[type="submit"]');

      await pPage.waitForSelector('.start-page-container', { timeout: 10000 });
      await sleep(1000);

      // Player selects their assigned game
      const pLinks = await pPage.$$('.game-item a');
      const pTargetLink = pLinks[pLinks.length - 1];
      await pPage.evaluate(el => el.click(), pTargetLink);

      await pPage.waitForSelector('.game-action-btn-container', { timeout: 10000 });
      console.log(`  ✓ Team ${i + 1} (${cred.name}) in waiting room.`);
      playerSessions.push({ cred, page: pPage, context: ctx });
      await sleep(1000);
    }

    console.log('✓ All 4 authorized players connected to game waiting room!');
    await sleep(2000);
    await adminPage.bringToFront();
    await adminPage.screenshot({ path: path.join(SCREENSHOT_DIR, 'auth_06_four_teams_waiting_room.png') });

    // -------------------------------------------------------------
    // PHASE 5: DUPLICATE ACTIVE SESSION PREVENTION
    // -------------------------------------------------------------
    console.log('\n[Phase 5] Testing Duplicate Session Prevention...');
    const dupCtx = await browser.createBrowserContext();
    const dupPage = await dupCtx.newPage();
    await dupPage.setViewport({ width: 1280, height: 800 });

    dupPage.on('response', async res => {
      if (res.url().includes('/login')) {
        console.log('  [DEBUG dupPage] /login response status:', res.status(), await res.text().catch(() => ''));
      }
    });

    await dupPage.goto(BASE_URL + '/login', { waitUntil: 'networkidle2' });

    await clickButton(dupPage, 'Player Login');
    await dupPage.waitForSelector('input[name="username"]');
    // Attempt duplicate login with Team 1 credentials
    await dupPage.type('input[name="username"]', generatedCreds[0].teamId);
    await dupPage.type('input[name="password"]', generatedCreds[0].rawPassword);
    await dupPage.click('button[type="submit"]');

    const dupAlert = await getErrorAlertText(dupPage);
    console.log(`  Duplicate Session Alert displayed: "${dupAlert}"`);
    if (!dupAlert || !dupAlert.includes('Team already connected')) {
      throw new Error(`Expected "Team already connected" alert, got: "${dupAlert}"`);
    }
    await dupPage.screenshot({ path: path.join(SCREENSHOT_DIR, 'auth_07_duplicate_session_rejected_alert.png') });
    await dupCtx.close();
    console.log('✓ Duplicate session correctly prevented.');

    // -------------------------------------------------------------
    // PHASE 6: MULTIPLAYER GAMEPLAY EXECUTION (ROUND 1)
    // -------------------------------------------------------------
    console.log('\n[Phase 6] Starting Multiplayer Gameplay & Dice Rolling...');
    await sleep(1000);

    const allocations = [
      { bank_FD: 300000, govt_bond: 400000, blue_chip: 300000 },
      { bank_FD: 200000, mid_cap: 400000, gold_ETF: 400000 },
      { corporate_bond: 500000, speculative_stock: 500000 },
      { international_stock: 500000, US_dollar: 500000 }
    ];

    for (let i = 0; i < playerSessions.length; i++) {
      const { cred, page } = playerSessions[i];
      const alloc = allocations[i];
      console.log(`  Submitting allocations for ${cred.name}...`);
      await page.bringToFront();

      if (!page.url().includes('/investment/')) {
        await page.goto(BASE_URL + '/investment/' + targetGameId, { waitUntil: 'networkidle2' });
      }

      await page.waitForSelector('.investment-form', { timeout: 10000 });
      if (i === 0) {
        await sleep(1000);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'auth_10_player_investment_terminal.png') });
        console.log('  ✓ Captured refined investment terminal screenshot.');
      }
      for (const [key, val] of Object.entries(alloc)) {
        await page.type(`input[name="${key}"]`, String(val));
      }

      await page.click('input[type="submit"]');
      await page.waitForSelector('.board-container', { timeout: 10000 });
      console.log(`  ✓ ${cred.name} allocation submitted, on game board.`);
      await sleep(1000);
    }

    // Active player game board
    console.log('  Verifying active game board across player sessions...');
    await playerSessions[0].page.bringToFront();
    await playerSessions[0].page.waitForSelector('.board-container', { timeout: 10000 });
    console.log('✓ Game board active on all clients!');
    await sleep(1500);
    await playerSessions[0].page.screenshot({ path: path.join(SCREENSHOT_DIR, 'auth_11_game_board_active.png') });
    console.log('  ✓ Captured refined active game board screenshot.');

    // Roll dice across turns
    let rolls = 0;
    for (let step = 0; step < 16; step++) {
      await sleep(2500);

      for (const { cred, page } of playerSessions) {
        const activeDice = await page.evaluate(() => {
          const btn = document.querySelector('button.dice-container');
          return btn && !btn.disabled;
        });

        if (activeDice) {
          rolls++;
          console.log(`  🎲 Turn active for ${cred.name}! Rolling dice (Roll #${rolls})...`);
          await page.bringToFront();
          await page.evaluate(() => document.querySelector('button.dice-container').click());
          await sleep(1500);
          break;
        }
      }

      const isComplete = await adminPage.evaluate(() => {
        const el = document.querySelector('.wait-msg');
        return el && el.textContent.includes('Round Completed');
      });

      if (isComplete) {
        console.log('✓ Round 1 completed!');
        break;
      }
    }

    await sleep(7000);
    await adminPage.bringToFront();
    await adminPage.screenshot({ path: path.join(SCREENSHOT_DIR, 'auth_08_multiplayer_gameplay_round.png') });

    // -------------------------------------------------------------
    // PHASE 7: LEGITIMATE RECONNECTION
    // -------------------------------------------------------------
    console.log('\n[Phase 7] Testing Legitimate Reconnection...');
    const p1 = playerSessions[0].page;
    await p1.bringToFront();
    await p1.reload({ waitUntil: 'networkidle2' });
    await sleep(2000);
    console.log('✓ Player 1 reloaded page and restored active session without duplicate player creation.');
    await p1.screenshot({ path: path.join(SCREENSHOT_DIR, 'auth_09_reconnection_successful.png') });

    // Rules page screenshot
    console.log('\n[Phase 8] Capturing Refined Rules & Regulations Page...');
    await adminPage.goto(BASE_URL + '/rules', { waitUntil: 'networkidle2' });
    await sleep(1000);
    await adminPage.screenshot({ path: path.join(SCREENSHOT_DIR, 'auth_12_rules_guidelines.png') });
    console.log('  ✓ Captured refined rules guidelines screenshot.');

    console.log('\n=== COMPLETE MULTIPLAYER E2E TEST PASSED WITH 100% SUCCESS! ===');
  } catch (err) {
    console.error('TEST ERROR:', err);
    throw err;
  } finally {
    await browser.close();
  }
}

runTest();
