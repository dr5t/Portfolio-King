const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { MongoClient, ObjectID } = require('../portfolio-king-server/node_modules/mongodb');

const PORT = 3011;
const TEST_DB = 'portfolio_sec_audit';
const MONGO_URI = `mongodb://127.0.0.1:27017/${TEST_DB}`;
const BASE_URL = `http://127.0.0.1:${PORT}`;

function makeReq(options, body = null) {
  return new Promise((resolve) => {
    const postData = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const reqHeaders = { ...(options.headers || {}) };
    if (postData) {
      reqHeaders['Content-Length'] = Buffer.byteLength(postData);
      if (!reqHeaders['Content-Type']) reqHeaders['Content-Type'] = 'application/json';
    }
    const finalOpts = { ...options, headers: reqHeaders, hostname: '127.0.0.1', port: PORT };
    const req = http.request(finalOpts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) { json = data; }
        resolve({ status: res.statusCode, data: json, rawBody: data, headers: res.headers });
      });
    });
    req.on('error', (err) => resolve({ status: 0, error: err.message, headers: {} }));
    if (postData) req.write(postData);
    req.end();
  });
}

async function runSecurityAudit() {
  console.log('================================================================');
  console.log('   PORTFOLIO KING ADVANCED OWASP & PENETRATION TEST SUITE');
  console.log('================================================================\n');

  const { spawn } = require('child_process');
  const mongoClient = await MongoClient.connect('mongodb://127.0.0.1:27017', { useUnifiedTopology: true });
  await mongoClient.db(TEST_DB).dropDatabase();

  const serverProc = spawn(process.execPath, [path.resolve(__dirname, '../portfolio-king-server/index.js')], {
    env: {
      ...process.env,
      PORT: String(PORT),
      DB_NAME: TEST_DB,
      MONGODB_URI: MONGO_URI,
      ADMIN_USERNAME: 'admin',
      ADMIN_PASSWORD: 'admin@1234',
      UV_THREADPOOL_SIZE: '64'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  serverProc.stdout.on('data', d => {
    const s = d.toString().trim();
    if (s.includes('App is listening') || s.includes('Connected to MongoDB')) {
      console.log(`  [Server stdout] ${s}`);
    }
  });

  // Wait for server ready
  const start = Date.now();
  while (Date.now() - start < 15000) {
    const res = await makeReq({ path: '/login', method: 'GET' });
    if (res.status >= 200 && res.status < 400) break;
    await new Promise(r => setTimeout(r, 300));
  }
  console.log(`✓ Test server listening at ${BASE_URL}\n`);

  let passed = 0;
  let failed = 0;
  const auditResults = [];

  function record(name, isPass, detail = '') {
    if (isPass) {
      passed++;
      console.log(`  ✓ PASS: ${name} ${detail ? '(' + detail + ')' : ''}`);
    } else {
      failed++;
      console.error(`  ❌ FAIL: ${name} ${detail ? '(' + detail + ')' : ''}`);
    }
    auditResults.push({ name, pass: isPass, detail });
  }

  try {
    // 1. HTTP Security Headers
    console.log('[Check 1] HTTP Security Headers Audit...');
    const headRes = await makeReq({ path: '/login', method: 'GET' });
    const h = headRes.headers;
    record('X-Content-Type-Options: nosniff', h['x-content-type-options'] === 'nosniff');
    record('X-Frame-Options: SAMEORIGIN', h['x-frame-options'] === 'SAMEORIGIN');
    record('Referrer-Policy: strict-origin-when-cross-origin', h['referrer-policy'] === 'strict-origin-when-cross-origin');
    record('Content-Security-Policy Present', typeof h['content-security-policy'] === 'string' && h['content-security-policy'].length > 20);

    // 2. Unauthenticated Access Control (Broken Access Control)
    console.log('\n[Check 2] Unauthenticated Access Control & Endpoint Protection...');
    const adminEndpoints = [
      { path: '/api/teams', method: 'GET' },
      { path: '/create-game', method: 'POST', body: { name: 'SecTest' } },
      { path: '/api/teams/generate-all', method: 'POST', body: { gameId: '507f1f77bcf86cd799439011' } },
      { path: '/api/games/rename', method: 'POST', body: { gameId: '507f1f77bcf86cd799439011', name: 'Hack' } },
      { path: '/api/games/bulk-delete', method: 'POST', body: { gameIds: ['507f1f77bcf86cd799439011'] } },
      { path: '/users', method: 'GET' },
      { path: '/api/teams/bulk-delete', method: 'POST', body: { teamIds: ['507f1f77bcf86cd799439011'] } },
      { path: '/api/games/export/507f1f77bcf86cd799439011', method: 'GET' }
    ];

    for (const ep of adminEndpoints) {
      const res = await makeReq({ path: ep.path, method: ep.method }, ep.body);
      record(`Unauthenticated ${ep.method} ${ep.path} rejected with 401`, res.status === 401);
    }

    // 3. Admin Authentication & Session Security
    console.log('\n[Check 3] Admin Authentication & Session Persistence Security...');
    const adminLoginRes = await makeReq({ path: '/login', method: 'POST' }, {
      username: 'admin',
      password: 'admin@1234',
      userType: 'Admin'
    });
    const adminToken = adminLoginRes.data && adminLoginRes.data.token;
    record('Admin login succeeds with 200 and issues session token', adminLoginRes.status === 200 && typeof adminToken === 'string' && adminToken.length === 64);

    // Verify token is NOT stored as plaintext in MongoDB
    const db = mongoClient.db(TEST_DB);
    const plaintextInDb = await db.collection('sessions').findOne({ token: adminToken });
    record('Raw session token NEVER stored in plaintext in MongoDB', plaintextInDb === null);

    const tokenHash = crypto.createHash('sha256').update(adminToken).digest('hex');
    const hashedInDb = await db.collection('sessions').findOne({ tokenHash });
    record('Session token stored as SHA-256 hash in MongoDB', hashedInDb !== null && hashedInDb.role === 'admin');

    // Verify TTL index exists on sessions collection
    const sessionIndexes = await db.collection('sessions').indexes();
    const ttlIndex = sessionIndexes.find(idx => idx.key && idx.key.expiresAt === 1 && idx.expireAfterSeconds === 0);
    record('MongoDB TTL index configured on sessions collection', ttlIndex !== undefined, `Index: ${ttlIndex ? ttlIndex.name : 'none'}`);

    // 4. Provision Game & Teams
    console.log('\n[Check 4] Game Provisioning & Team Credential Generation...');
    const createGameRes = await makeReq({
      path: '/create-game',
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    }, { name: 'SecGame1' });

    const gameId = String(createGameRes.data.ops ? createGameRes.data.ops[0]._id : createGameRes.data._id);
    record('Admin creates game successfully', createGameRes.status === 200 && gameId.length === 24);

    const genTeamsRes = await makeReq({
      path: '/api/teams/generate-all',
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    }, { gameId });

    const generatedTeams = genTeamsRes.data && genTeamsRes.data.teams;
    record('Admin auto-generates 4 teams for game', Array.isArray(generatedTeams) && generatedTeams.length === 4);

    // 5. Sensitive Information Exposure (Password Hash Leakage Audit)
    console.log('\n[Check 5] Sensitive Data Exposure Audit (Zero Password Hash Exposure)...');
    const teamsListRes = await makeReq({
      path: `/api/teams?gameId=${gameId}`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    let hashFoundInList = false;
    for (const t of (teamsListRes.data || [])) {
      if (t.passwordHash || t.rawPassword || t.password) hashFoundInList = true;
    }
    record('GET /api/teams does not expose passwordHash or password', !hashFoundInList && teamsListRes.status === 200);

    // 6. Player Login & Privilege Escalation Testing
    console.log('\n[Check 6] Player Login & Vertical Privilege Escalation Testing...');
    const t1 = generatedTeams[0];
    const playerLoginRes = await makeReq({ path: '/login', method: 'POST' }, {
      username: t1.teamId,
      password: t1.rawPassword,
      userType: 'Player'
    });
    const playerToken = playerLoginRes.data && playerLoginRes.data.token;
    record('Player authentication succeeds with 200', playerLoginRes.status === 200 && typeof playerToken === 'string');

    // Attempt vertical privilege escalation using player token
    for (const ep of adminEndpoints) {
      const res = await makeReq({
        path: ep.path,
        method: ep.method,
        headers: { 'Authorization': `Bearer ${playerToken}` }
      }, ep.body);
      record(`Player token attempting admin ${ep.method} ${ep.path} rejected with 403`, res.status === 403);
    }

    // 7. Horizontal Privilege Escalation & Cross-Game Isolation (IDOR)
    console.log('\n[Check 7] Cross-Game Isolation & IDOR Testing...');
    const createGame2Res = await makeReq({
      path: '/create-game',
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    }, { name: 'SecGame2' });
    const gameId2 = String(createGame2Res.data.ops ? createGame2Res.data.ops[0]._id : createGame2Res.data._id);

    // Team 1 belongs to Game 1. Attempt to access Game 2 details via API
    const crossGameRes = await makeReq({
      path: `/get-game?gameId=${gameId2}`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${playerToken}` }
    });
    record('Player cannot access unauthorized Game 2 records (rejected with 403)', crossGameRes.status === 403);

    // 8. NoSQL Injection Testing
    console.log('\n[Check 8] NoSQL Injection Prevention Testing...');
    const nosqlPayloads = [
      { username: { "$gt": "" }, password: { "$gt": "" }, userType: 'Admin' },
      { username: { "$ne": null }, password: 'admin@1234', userType: 'Admin' },
      { username: 'admin', password: { "$ne": "wrong" }, userType: 'Admin' },
      { username: { "$regex": ".*" }, password: 'password', userType: 'Player' },
      { teamId: { "$gt": "" }, password: 'bad', userType: 'Player' }
    ];

    for (let i = 0; i < nosqlPayloads.length; i++) {
      const res = await makeReq({ path: '/login', method: 'POST' }, nosqlPayloads[i]);
      record(`NoSQL Injection Payload #${i + 1} safely rejected with 400`, res.status === 400);
    }

    // 9. Rate Limiting Protection (Brute Force Defense)
    console.log('\n[Check 9] Authentication Brute-Force Rate Limiting...');
    let rateLimited = false;
    for (let i = 1; i <= 14; i++) {
      const res = await makeReq({ path: '/login', method: 'POST' }, {
        username: 'admin',
        password: `wrongPassword${i}`,
        userType: 'Admin'
      });
      if (res.status === 429) {
        rateLimited = true;
        break;
      }
      await new Promise(r => setTimeout(r, 40));
    }
    record('Repeated invalid logins trigger 429 Too Many Requests', rateLimited);

    // 10. Session Revocation on Account Status Change
    console.log('\n[Check 10] Session Revocation on Team Disablement & Password Reset...');
    // Re-authenticate Admin to ensure valid rate limit
    const disableRes = await makeReq({
      path: `/api/teams/${t1._id}`,
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    }, { status: 'disabled' });
    record('Admin disables Team 1 account', disableRes.status === 200);

    // Disabled player token should be invalidated/rejected when attempting to access game
    const accessAfterDisable = await makeReq({
      path: `/get-game?gameId=${gameId}`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${playerToken}` }
    });
    record('Session token immediately revoked when team account is disabled', accessAfterDisable.status === 403 || accessAfterDisable.status === 401);

    // 11. CSV Injection Defense
    console.log('\n[Check 11] CSV Export Injection Sanitization...');
    await makeReq({
      path: '/api/games/rename',
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    }, { gameId, name: '=CMD|\' /C calc\'!A0' });

    const csvRes = await makeReq({
      path: `/api/games/export/${gameId}`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const csvContent = csvRes.rawBody || '';
    const formulaEscaped = csvContent.includes("'=CMD") || csvContent.includes('"\'=CMD');
    record('CSV Export formulas sanitized against spreadsheet injection', formulaEscaped && csvRes.status === 200);

    // 12. Token Transmission Security
    console.log('\n[Check 12] URL Query Parameter Token Leakage Check...');
    const queryLeakRes = await makeReq({ path: `/login?token=${adminToken}`, method: 'GET' });
    record('Login endpoint does not reflect or process raw tokens from URL queries', queryLeakRes.status === 200 && !queryLeakRes.rawBody.includes(adminToken));

  } finally {
    serverProc.kill('SIGTERM');
    await mongoClient.db(TEST_DB).dropDatabase();
    await mongoClient.close();
  }

  console.log('\n================================================================');
  console.log(`OWASP & SECURITY AUDIT SUMMARY: Passed: ${passed} | Failed: ${failed}`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runSecurityAudit().catch(err => {
  console.error('Fatal error in security audit:', err);
  process.exit(1);
});
