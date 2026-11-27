const puppeteer = require('/Users/shauryatiwari/.nvm/versions/node/v25.2.1/lib/node_modules/puppeteer');
const http = require('http');
const { spawn } = require('child_process');

const PORT = 3009;
const BASE_URL = `http://127.0.0.1:${PORT}`;

function makeReq(path, method = 'GET', body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const reqHeaders = { ...headers };
    let postData = body ? JSON.stringify(body) : null;
    if (postData) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(postData);
    }
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: reqHeaders
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  console.log('=== Portfolio King Comprehensive Socket.IO & Real-Time Counter Suite ===');

  const env = { ...process.env, PORT: String(PORT), ADMIN_PASSWORD: 'DemoPass@2026' };
  const server = spawn('node', ['portfolio-king-server/index.js'], { env, cwd: '/Users/shauryatiwari/Portfolio king' });
  await delay(1500);

  let browser;
  try {
    const adminRes = await makeReq('/login', 'POST', {
      userType: 'Admin',
      username: 'admin',
      password: 'DemoPass@2026'
    });
    if (adminRes.status !== 200) throw new Error('Admin login failed');
    const adminToken = adminRes.data.token;
    console.log('✓ Admin authenticated');

    const gameRes = await makeReq('/create-game', 'POST', { name: 'Full Lifecycle Arena' }, {
      Authorization: `Bearer ${adminToken}`
    });
    const gameId = String(gameRes.data.ops[0]._id);
    console.log(`✓ Game created: ${gameId}`);

    const genRes = await makeReq('/api/teams/generate-all', 'POST', { gameId }, {
      Authorization: `Bearer ${adminToken}`
    });
    const teams = genRes.data.teams;
    console.log(`✓ 4 Teams generated: ${teams.map(t => t.teamId).join(', ')}`);

    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const adminContext = await browser.createBrowserContext();
    const adminPage = await adminContext.newPage();
    await adminPage.goto(`${BASE_URL}/login`);
    await adminPage.evaluate((tok, gId) => {
      localStorage.setItem('login_obj', JSON.stringify({
        isAdmin: 'true',
        userName: 'admin',
        token: tok
      }));
    }, adminToken, gameId);
    await adminPage.goto(`${BASE_URL}/game-status/${gameId}`);
    await delay(1000);

    async function getStatusText(page) {
      return await page.evaluate(() => {
        const tag = document.querySelector('.session-val') ||
                    document.querySelector('.session-status-tag .session-val') ||
                    document.querySelector('.wait-title');
        return tag ? tag.textContent.trim().replace(/\s+/g, ' ') : '';
      });
    }

    async function isContinueEnabled(page) {
      return await page.evaluate(() => {
        const btn = document.querySelector('button.btn-primary');
        return btn ? !btn.disabled : false;
      });
    }

    let adminText = await getStatusText(adminPage);
    console.log(`✓ Step 0/4 Admin initial display: "${adminText}"`);
    if (!adminText.includes('(0/4 joined)')) throw new Error(`Expected 0/4 on admin screen, got: ${adminText}`);

    const playerContexts = [];
    const playerPages = [];

    for (let i = 0; i < teams.length; i++) {
      const t = teams[i];
      const pContext = await browser.createBrowserContext();
      playerContexts.push(pContext);
      const pPage = await pContext.newPage();
      playerPages.push(pPage);

      const pLogin = await makeReq('/login', 'POST', {
        userType: 'Player',
        teamId: t.teamId,
        password: t.rawPassword
      });
      const pToken = pLogin.data.token;

      await pPage.goto(`${BASE_URL}/login`);
      await pPage.evaluate((tok, gId, tId, name) => {
        localStorage.setItem('login_obj', JSON.stringify({
          isPlayer: 'true',
          userName: name,
          teamId: tId,
          gameId: gId,
          token: tok
        }));
      }, pToken, gameId, t.teamId, t.name);

      await pPage.goto(`${BASE_URL}/game-status/${gameId}`);
      await delay(1200);

      const expectedCount = i + 1;
      adminText = await getStatusText(adminPage);
      const playerText = await getStatusText(pPage);

      console.log(`✓ Step ${expectedCount}/4: Admin sees "${adminText}" | Player ${expectedCount} sees "${playerText}"`);

      if (expectedCount < 4) {
        if (!adminText.includes(`(${expectedCount}/4 joined)`)) {
          throw new Error(`Admin expected ${expectedCount}/4, got: ${adminText}`);
        }
      } else {
        if (!adminText.includes('All participants joined (4/4)')) {
          throw new Error(`Admin expected "All participants joined (4/4)", got: ${adminText}`);
        }
        if (!playerText.includes('All participants joined (4/4)')) {
          throw new Error(`Player 4 expected "All participants joined (4/4)", got: ${playerText}`);
        }
      }
    }

    const continueEnabled = await isContinueEnabled(adminPage);
    console.log(`✓ Admin "Continue the game" button enabled at 4/4: ${continueEnabled}`);
    if (!continueEnabled) throw new Error('Expected admin button to be enabled at 4/4');

    console.log('--- Testing Disconnect of Team 4 ---');
    await playerPages[3].close();
    await delay(1500);

    adminText = await getStatusText(adminPage);
    const p1Text = await getStatusText(playerPages[0]);
    console.log(`✓ After disconnect: Admin sees "${adminText}" | Player 1 sees "${p1Text}"`);
    if (!adminText.includes('(3/4 joined)')) throw new Error(`Expected 3/4 after disconnect, got: ${adminText}`);

    const continueDisabled = await isContinueEnabled(adminPage);
    console.log(`✓ Admin "Continue the game" button disabled at 3/4: ${!continueDisabled}`);
    if (continueDisabled) throw new Error('Expected admin button to be disabled at 3/4');

    console.log('--- Testing Reconnect of Team 4 ---');
    const newP4Page = await playerContexts[3].newPage();
    playerPages[3] = newP4Page;
    await newP4Page.goto(`${BASE_URL}/game-status/${gameId}`);
    await delay(1500);

    adminText = await getStatusText(adminPage);
    const p4Text = await getStatusText(newP4Page);
    console.log(`✓ After reconnect: Admin sees "${adminText}" | Player 4 sees "${p4Text}"`);
    if (!adminText.includes('All participants joined (4/4)')) throw new Error(`Expected 4/4 after reconnect, got: ${adminText}`);

    console.log('--- Testing Page Refresh on Team 3 (preserves room membership & count) ---');
    await playerPages[2].reload();
    await delay(1500);
    adminText = await getStatusText(adminPage);
    const p3Text = await getStatusText(playerPages[2]);
    console.log(`✓ After page refresh: Admin sees "${adminText}" | Player 3 sees "${p3Text}"`);
    if (!adminText.includes('All participants joined (4/4)')) throw new Error(`Expected 4/4 after refresh, got: ${adminText}`);

    console.log('--- Testing Duplicate Login Rejection at /login ---');
    const dupLoginRes = await makeReq('/login', 'POST', {
      userType: 'Player',
      teamId: teams[0].teamId,
      password: teams[0].rawPassword
    });
    console.log(`✓ Duplicate login attempt response status: ${dupLoginRes.status} (message: "${dupLoginRes.data && dupLoginRes.data.message}")`);
    if (dupLoginRes.status !== 409) throw new Error(`Expected 409 on duplicate login, got: ${dupLoginRes.status}`);

    console.log('--- Testing Isolation from Other Games ---');
    const otherGameRes = await makeReq('/create-game', 'POST', { name: 'Separate Arena' }, {
      Authorization: `Bearer ${adminToken}`
    });
    const otherGameId = String(otherGameRes.data.ops[0]._id);
    const otherGen = await makeReq('/api/teams/generate-all', 'POST', { gameId: otherGameId }, {
      Authorization: `Bearer ${adminToken}`
    });
    const otherTeam = otherGen.data.teams[0];
    const otherLogin = await makeReq('/login', 'POST', {
      userType: 'Player',
      teamId: otherTeam.teamId,
      password: otherTeam.rawPassword
    });
    const otherContext = await browser.createBrowserContext();
    const otherPage = await otherContext.newPage();
    await otherPage.goto(`${BASE_URL}/login`);
    await otherPage.evaluate((tok, gId, tId, name) => {
      localStorage.setItem('login_obj', JSON.stringify({
        isPlayer: 'true',
        userName: name,
        teamId: tId,
        gameId: gId,
        token: tok
      }));
    }, otherLogin.data.token, otherGameId, otherTeam.teamId, otherTeam.name);
    await otherPage.goto(`${BASE_URL}/game-status/${otherGameId}`);
    await delay(1200);

    adminText = await getStatusText(adminPage);
    console.log(`✓ Main tournament count remains isolated at 4/4: "${adminText}"`);
    if (!adminText.includes('All participants joined (4/4)')) throw new Error('Main arena affected by other game');

    console.log('--- Testing Actual Gameplay Progression ---');
    await adminPage.evaluate(() => {
      const btn = document.querySelector('button.btn-primary');
      if (btn) btn.click();
    });
    await delay(1200);

    const getGameCheck = await makeReq(`/get-game?gameId=${gameId}`, 'GET', null, {
      Authorization: `Bearer ${adminToken}`
    });
    console.log(`✓ Game roundReady state: ${getGameCheck.data.roundReady}`);
    if (!getGameCheck.data.roundReady) throw new Error('Expected game roundReady to be true');

    console.log('\n======================================================');
    console.log('🎉 ALL TESTS PASSED SUCCESSFULLY WITH ZERO MOCKS! 🎉');
    console.log('======================================================');
  } finally {
    if (browser) await browser.close();
    server.kill('SIGTERM');
  }
}

run().catch(err => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
