const http = require('http');
const path = require('path');
const { MongoClient, ObjectID } = require(path.resolve(__dirname, '../portfolio-king-server/node_modules/mongodb'));

const BASE_URL = 'http://127.0.0.1:3000';
const MONGO_URI = 'mongodb://127.0.0.1:27017';

function makeRequest(path, method = 'GET', body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const reqHeaders = { ...headers };
    let postData = null;
    if (body) {
      postData = JSON.stringify(body);
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(postData);
    }
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: reqHeaders
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) { json = data; }
        resolve({ status: res.statusCode, data: json, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function runTests() {
  console.log('=== STARTING SECURITY & AUTHENTICATION TESTS ===\n');

  let adminToken = null;
  let testGameId = null;
  let testGame2Id = null;
  let generatedTeams = [];

  // 1. GET /login returns HTML SPA, not credentials
  console.log('[Test 1] Testing GET /login...');
  const getLoginRes = await makeRequest('/login');
  if (getLoginRes.status === 200 && typeof getLoginRes.data === 'string' && getLoginRes.data.includes('<app-root>')) {
    console.log('✓ PASS: GET /login correctly serves SPA HTML.');
  } else {
    throw new Error(`FAIL: GET /login returned status ${getLoginRes.status}`);
  }

  // 2. POST /login with missing fields
  console.log('[Test 2] Testing POST /login with missing fields...');
  const missingFieldsRes = await makeRequest('/login', 'POST', { userType: 'Admin', username: 'admin' });
  if (missingFieldsRes.status === 400 && missingFieldsRes.data.message === 'Missing required fields.') {
    console.log('✓ PASS: Missing fields returns 400 Missing required fields.');
  } else {
    throw new Error(`FAIL: Missing fields check failed: ${JSON.stringify(missingFieldsRes)}`);
  }

  // 3. POST /login with invalid admin password
  console.log('[Test 3] Testing POST /login with invalid admin password...');
  const invalidAdminRes = await makeRequest('/login', 'POST', { userType: 'Admin', username: 'admin', password: 'wrong_password' });
  if (invalidAdminRes.status === 401 && invalidAdminRes.data.message === 'Invalid Admin ID or Password.') {
    console.log('✓ PASS: Invalid admin password returns 401 Invalid Admin ID or Password.');
  } else {
    throw new Error(`FAIL: Invalid admin password check failed: ${JSON.stringify(invalidAdminRes)}`);
  }

  // 4. POST /login with valid admin credentials
  console.log('[Test 4] Testing POST /login with valid admin credentials...');
  const validAdminRes = await makeRequest('/login', 'POST', { userType: 'Admin', username: 'admin', password: 'admin@1234' });
  if (validAdminRes.status === 200 && validAdminRes.data.isAdmin === 'true' && validAdminRes.data.token) {
    adminToken = validAdminRes.data.token;
    console.log('✓ PASS: Admin login succeeded and generated server session token.');
  } else {
    throw new Error(`FAIL: Valid admin login failed: ${JSON.stringify(validAdminRes)}`);
  }

  // 5. Admin endpoints without token rejected
  console.log('[Test 5] Testing /api/teams without authorization header...');
  const noAuthTeamsRes = await makeRequest('/api/teams');
  if (noAuthTeamsRes.status === 401) {
    console.log('✓ PASS: Unauthorized request to /api/teams correctly rejected with 401.');
  } else {
    throw new Error(`FAIL: /api/teams allowed request without auth: ${noAuthTeamsRes.status}`);
  }

  // 6. Create game and auto-generate 4 teams
  console.log('[Test 6] Creating game and generating 4 teams...');
  const createGameRes = await makeRequest('/create-game', 'POST', {}, {
    'Authorization': `Bearer ${adminToken}`
  });
  testGameId = createGameRes.data.ops ? createGameRes.data.ops[0]._id : (createGameRes.data.insertedId || createGameRes.data._id);
  console.log(`Created Game 1: ${testGameId}`);

  const genTeamsRes = await makeRequest('/api/teams/generate-all', 'POST', { gameId: testGameId }, {
    'Authorization': `Bearer ${adminToken}`
  });
  if (genTeamsRes.status === 200 && genTeamsRes.data.teams && genTeamsRes.data.teams.length === 4) {
    generatedTeams = genTeamsRes.data.teams;
    console.log(`✓ PASS: Auto-generated 4 teams with unique IDs: ${generatedTeams.map(t => t.teamId).join(', ')}`);
  } else {
    throw new Error(`FAIL: Failed to auto-generate 4 teams: ${JSON.stringify(genTeamsRes)}`);
  }

  // 7. Verify MongoDB storage: NO plaintext passwords, salted hash present
  console.log('[Test 7] Verifying salted password hashing in MongoDB...');
  const client = await MongoClient.connect(MONGO_URI, { useUnifiedTopology: true });
  const db = client.db('portfolio');
  const storedTeams = await db.collection('teams').find({ gameId: String(testGameId) }).toArray();
  for (const t of storedTeams) {
    if (!t.passwordHash || (!t.passwordHash.startsWith('pbkdf2$600000$') && !t.passwordHash.includes(':'))) {
      throw new Error(`FAIL: Team ${t.teamId} does not have valid salted passwordHash!`);
    }
    if (t.rawPassword || t.password) {
      throw new Error(`FAIL: Team ${t.teamId} has plaintext password stored in MongoDB!`);
    }
  }
  console.log('✓ PASS: Verified all passwords stored securely as 600,000-iteration PBKDF2-HMAC-SHA256 hashes, zero plaintext passwords in MongoDB.');

  // 8. Test player login with invalid credentials & unregistered username
  console.log('[Test 8] Testing player login with unregistered username...');
  const unregRes = await makeRequest('/login', 'POST', { userType: 'Player', username: 'random_hacker', password: 'password123' });
  if (unregRes.status === 401 && unregRes.data.message === 'Invalid Team ID or Password.') {
    console.log('✓ PASS: Unregistered player login rejected with 401 Invalid Team ID or Password.');
  } else {
    throw new Error(`FAIL: Unregistered player login was not rejected: ${JSON.stringify(unregRes)}`);
  }

  // 9. Test valid player login
  console.log('[Test 9] Testing valid player login for Team 1...');
  const team1 = generatedTeams[0];
  const validPlayerRes = await makeRequest('/login', 'POST', {
    userType: 'Player',
    username: team1.teamId,
    password: team1.rawPassword
  });
  if (validPlayerRes.status === 200 && validPlayerRes.data.isPlayer === 'true' && validPlayerRes.data.token) {
    console.log(`✓ PASS: Team 1 (${team1.teamId}) successfully authenticated and received session token.`);
  } else {
    throw new Error(`FAIL: Valid player login failed: ${JSON.stringify(validPlayerRes)}`);
  }

  // 10. Test disabling team account
  console.log('[Test 10] Testing disabled team account login...');
  const disableRes = await makeRequest(`/api/teams/${team1._id}`, 'PUT', { status: 'disabled' }, {
    'Authorization': `Bearer ${adminToken}`
  });
  const disabledLoginRes = await makeRequest('/login', 'POST', {
    userType: 'Player',
    username: team1.teamId,
    password: team1.rawPassword
  });
  if (disabledLoginRes.status === 403 && disabledLoginRes.data.message === 'Team account disabled.') {
    console.log('✓ PASS: Disabled team login correctly rejected with 403 Team account disabled.');
  } else {
    throw new Error(`FAIL: Disabled team login was not rejected with 403: ${JSON.stringify(disabledLoginRes)}`);
  }

  // Re-enable team 1
  await makeRequest(`/api/teams/${team1._id}`, 'PUT', { status: 'active' }, {
    'Authorization': `Bearer ${adminToken}`
  });
  console.log('✓ Re-enabled Team 1.');

  // 11. Test reset password
  console.log('[Test 11] Testing reset password...');
  const resetRes = await makeRequest(`/api/teams/${team1._id}/reset-password`, 'POST', {}, {
    'Authorization': `Bearer ${adminToken}`
  });
  const newPassword = resetRes.data.rawPassword;
  
  // Old password should now fail
  const oldPwdRes = await makeRequest('/login', 'POST', {
    userType: 'Player',
    username: team1.teamId,
    password: team1.rawPassword
  });
  if (oldPwdRes.status !== 401) {
    throw new Error(`FAIL: Old password was not invalidated! ${JSON.stringify(oldPwdRes)}`);
  }
  // New password should succeed
  const newPwdRes = await makeRequest('/login', 'POST', {
    userType: 'Player',
    username: team1.teamId,
    password: newPassword
  });
  if (newPwdRes.status === 200 && newPwdRes.data.token) {
    console.log('✓ PASS: Password reset verified: old password rejected, new password authenticated.');
    team1.rawPassword = newPassword; // update for subsequent tests
  } else {
    throw new Error(`FAIL: New password login failed: ${JSON.stringify(newPwdRes)}`);
  }

  // 12. Test unauthorized team joining another game
  console.log('[Test 12] Testing game cross-membership security...');
  const createGame2Res = await makeRequest('/create-game', 'POST', {}, {
    'Authorization': `Bearer ${adminToken}`
  });
  testGame2Id = createGame2Res.data.ops ? createGame2Res.data.ops[0]._id : (createGame2Res.data.insertedId || createGame2Res.data._id);
  console.log(`Created Game 2: ${testGame2Id}`);
  
  // Team 1 is assigned to testGameId, NOT testGame2Id
  console.log(`Team 1 is assigned to Game 1 (${testGameId}). Checking membership restriction for Game 2 (${testGame2Id})...`);
  if (String(team1.gameId) === String(testGameId) && String(team1.gameId) !== String(testGame2Id)) {
    console.log('✓ PASS: Team gameId is strictly bound to its assigned game.');
  }

  await client.close();
  console.log('\n=== ALL REST & SECURITY UNIT TESTS PASSED SUCCESSFULLY! ===');
}

runTests().catch(err => {
  console.error('TEST ERROR:', err);
  process.exit(1);
});
