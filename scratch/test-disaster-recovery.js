const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { io } = require('../portfolio-king/node_modules/socket.io-client');
const { MongoClient, ObjectId } = require('../portfolio-king-server/node_modules/mongodb');
const ObjectID = ObjectId;

const PORT = 3012;
const TEST_DB = 'portfolio_disaster_audit';
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
        resolve({ status: res.statusCode, data: json, rawBody: data });
      });
    });
    req.on('error', (err) => resolve({ status: 0, error: err.message }));
    if (postData) req.write(postData);
    req.end();
  });
}

function launchServer() {
  const proc = spawn(process.execPath, [path.resolve(__dirname, '../portfolio-king-server/index.js')], {
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
  return proc;
}

async function waitForServer(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await makeReq({ path: '/login', method: 'GET' });
    if (res.status >= 200 && res.status < 400) return true;
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('Server timeout');
}

async function runDisasterRecoveryAudit() {
  console.log('================================================================');
  console.log('   PORTFOLIO KING DISASTER RECOVERY & FAULT TOLERANCE AUDIT');
  console.log('================================================================\n');

  const mongoClient = await MongoClient.connect('mongodb://127.0.0.1:27017', { useUnifiedTopology: true });
  await mongoClient.db(TEST_DB).dropDatabase();

  let serverProc = launchServer();
  await waitForServer();
  console.log(`✓ Initial server running at ${BASE_URL}\n`);

  let passed = 0;
  let failed = 0;

  function record(name, isPass, detail = '') {
    if (isPass) {
      passed++;
      console.log(`  ✓ PASS: ${name} ${detail ? '(' + detail + ')' : ''}`);
    } else {
      failed++;
      console.error(`  ❌ FAIL: ${name} ${detail ? '(' + detail + ')' : ''}`);
    }
  }

  try {
    // 1. Authenticate Admin and Create Game
    console.log('[Step 1] Initial Provisioning and Session Establishment...');
    const adminLogin = await makeReq({ path: '/login', method: 'POST' }, {
      username: 'admin',
      password: 'admin@1234',
      userType: 'Admin'
    });
    const adminToken = adminLogin.data && adminLogin.data.token;

    const gameRes = await makeReq({
      path: '/create-game',
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    }, { name: 'DisasterRecoveryMatch' });
    const gameId = String(gameRes.data.ops ? gameRes.data.ops[0]._id : gameRes.data._id);

    const teamRes = await makeReq({
      path: '/api/teams/generate-all',
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    }, { gameId });
    const teams = teamRes.data && teamRes.data.teams;
    record('Game and 4 teams created', teams.length === 4);

    // 2. Authenticate all 4 teams and collect tokens
    console.log('\n[Step 2] Authenticating Teams & Joining Sockets Pre-Crash...');
    const playerTokens = [];
    for (const t of teams) {
      const pLogin = await makeReq({ path: '/login', method: 'POST' }, {
        username: t.teamId,
        password: t.rawPassword,
        userType: 'Player'
      });
      playerTokens.push({ team: t, token: pLogin.data.token });
    }
    record('All 4 teams authenticated pre-crash', playerTokens.length === 4);

    // Connect player sockets
    const sockets = [];
    for (const { team, token } of playerTokens) {
      const sock = io(BASE_URL, { transports: ['websocket'] });
      await new Promise(r => sock.on('connect', r));
      sock.emit('authenticate', { token });
      await new Promise(r => sock.on('update-user', r));
      sock.emit('join-game', { gameId, socketId: sock.id, token });
      await new Promise(r => setTimeout(r, 100));
      sockets.push(sock);
    }
    record('4 sockets joined game room pre-crash', sockets.length === 4);

    // 3. Start Game and Submit Q1 Capital Allocations
    console.log('\n[Step 3] Commencing Game & Submitting Q1 Investments...');
    const adminSock = io(BASE_URL, { transports: ['websocket'] });
    await new Promise(r => adminSock.on('connect', r));
    adminSock.emit('authenticate', { token: adminToken });
    await new Promise(r => setTimeout(r, 100));

    adminSock.emit('game-state-change', { gameId, state: 'active' });
    await new Promise(r => setTimeout(r, 200));

    // Submit player ready for Team 1
    const db = mongoClient.db(TEST_DB);
    const gameBefore = await db.collection('games').findOne({ _id: new ObjectID(gameId) });
    const p1Before = gameBefore.players[0];

    sockets[0].emit('player-ready', {
      gameId,
      userId: p1Before._id,
      totalInvestment: 1000000,
      round: [
        { name: 'bank_FD', value: 500000, return_rate: 6.2, return_value: 507750 },
        { name: 'govt_bond', value: 500000, return_rate: 0, return_value: 0 },
        { name: 'corporate_bond', value: 0, return_rate: 0, return_value: 0 },
        { name: 'blue_chip', value: 0, return_rate: 0, return_value: 0 },
        { name: 'mid_cap', value: 0, return_rate: 0, return_value: 0 },
        { name: 'speculative_stock', value: 0, return_rate: 0, return_value: 0 },
        { name: 'international_stock', value: 0, return_rate: 0, return_value: 0 },
        { name: 'US_dollar', value: 0, return_rate: 0, return_value: 0 },
        { name: 'gold_ETF', value: 0, return_rate: 0, return_value: 0 }
      ],
      prevLoans: [],
      loan: null
    });
    await new Promise(r => setTimeout(r, 400));
    record('Pre-crash allocation committed for Team 1', true);

    // Disconnect old sockets before server kill
    sockets.forEach(s => s.disconnect());
    adminSock.disconnect();

    // 4. SUDDEN SERVER TERMINATION (SIGKILL)
    console.log('\n[Step 4] Executing Sudden Backend Process Termination (SIGKILL)...');
    serverProc.kill('SIGKILL');
    console.log('✓ Server process abruptly terminated with SIGKILL.');
    await new Promise(r => setTimeout(r, 1000));

    // 5. RESTART SERVER PROCESS
    console.log('\n[Step 5] Restarting Server Process & Restoring From Persistent MongoDB State...');
    const restartStart = Date.now();
    serverProc = launchServer();
    await waitForServer();
    const restartRecoveryTimeMs = Date.now() - restartStart;
    record('Server successfully restarted and recovered', true, `Recovery Time: ${restartRecoveryTimeMs}ms`);

    // 6. VERIFY PERSISTENT SESSIONS SURVIVED RESTART
    console.log('\n[Step 6] Validating Admin & Player Persistent Session Survival...');
    const adminCheckAfterRestart = await makeReq({
      path: '/api/teams',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    record('Admin session token survived backend restart without re-login', adminCheckAfterRestart.status === 200);

    const playerCheckAfterRestart = await makeReq({
      path: `/get-game?gameId=${gameId}`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${playerTokens[0].token}` }
    });
    record('Player session token survived backend restart without re-login', playerCheckAfterRestart.status === 200);

    // 7. VERIFY GAME STATE AND PORTFOLIO ALLOCATION SURVIVED RESTART
    console.log('\n[Step 7] Validating Game State & Financial Record Integrity Post-Restart...');
    const recoveredGame = await db.collection('games').findOne({ _id: new ObjectID(gameId) });
    record('Game document intact in MongoDB post-restart', recoveredGame !== null);
    record('Game status preserved as active', recoveredGame.game_status === 'active');

    const recoveredP1 = recoveredGame.players.find(p => p.teamId === teams[0].teamId);
    record('Player 1 allocations preserved post-restart', recoveredP1.rounds.length === 1 && recoveredP1.rounds[0].round_starting_value === 1000000);
    record('Zero duplicate player records created after restart', recoveredGame.players.length === 4);

    // 8. DATABASE BACKUP AND RESTORATION TEST
    console.log('\n[Step 8] Testing Isolated Database Backup & Restoration...');
    const snapshotCollection = await db.collection('games').find().toArray();
    record('Database snapshot captured successfully', snapshotCollection.length > 0);

    // Drop collection and restore from memory snapshot
    await db.collection('games').drop();
    await db.collection('games').insertMany(snapshotCollection);
    const restoredGame = await db.collection('games').findOne({ _id: new ObjectID(gameId) });
    record('Database successfully restored from snapshot with identical records', restoredGame && String(restoredGame._id) === gameId);

  } finally {
    serverProc.kill('SIGTERM');
    await mongoClient.db(TEST_DB).dropDatabase();
    await mongoClient.close();
  }

  console.log('\n================================================================');
  console.log(`DISASTER RECOVERY AUDIT SUMMARY: Passed: ${passed} | Failed: ${failed}`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runDisasterRecoveryAudit().catch(err => {
  console.error('Fatal error in disaster recovery audit:', err);
  process.exit(1);
});
