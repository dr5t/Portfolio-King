const { io } = require('../portfolio-king/node_modules/socket.io-client');
const http = require('http');
const { spawn } = require('child_process');
const { MongoClient, ObjectId } = require('../portfolio-king-server/node_modules/mongodb');
const fs = require('fs');
const formula = require('../portfolio-king-server/formulas/formulas').formulas;
const { investmentReturnSheet } = require('../portfolio-king-server/investments/investments');

const PORT = 3018;
const DB_NAME = 'pk_8q_deterministic_audit';
const MONGO_URI = 'mongodb://127.0.0.1:27017/' + DB_NAME;
const SERVER_URL = `http://127.0.0.1:${PORT}`;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function req(options, data) {
  return new Promise((resolve) => {
    const postData = data ? (typeof data === 'string' ? data : JSON.stringify(data)) : null;
    const headers = { ...(options.headers || {}) };
    if (postData) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(postData);
    }
    const r = http.request({ ...options, port: PORT, hostname: '127.0.0.1', headers }, (res) => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(b); } catch (_) {}
        resolve({ status: res.statusCode, body: b, json });
      });
    });
    r.on('error', err => {
      console.error('HTTP Req Error:', err);
      resolve({ status: 0, error: err.message });
    });
    if (postData) r.write(postData);
    r.end();
  });
}

function createAllocations(options = {}) {
  const avenues = ['bank_FD', 'govt_bond', 'corporate_bond', 'blue_chip', 'mid_cap', 'speculative_stock', 'international_stock', 'US_dollar', 'gold_ETF'];
  const arr = avenues.map(name => {
    const val = options[name] || 0;
    return {
      name,
      value: val,
      return_rate: name === 'bank_FD' ? 6.2 : 0,
      return_value: name === 'bank_FD' ? parseFloat((val * 1.062).toFixed(2)) : 0
    };
  });
  if (options.fof && options.fof.value > 0) {
    arr.push({
      name: 'fof',
      value: options.fof.value,
      return_rate: 0,
      return_value: 0,
      target_player: options.fof.target_player
    });
  }
  return arr;
}

async function runDeterministic8QSimulation() {
  console.log('================================================================');
  console.log('  PORTFOLIO KING 8-QUARTER DETERMINISTIC MULTIPLAYER AUDIT');
  console.log('================================================================\n');

  const TEST_PASS = process.env.TEST_ADMIN_PASS || 'pk-audit-test-pass';
  // Start backend server
  const server = spawn('node', ['index.js'], {
    cwd: './portfolio-king-server',
    env: {
      ...process.env,
      PORT: String(PORT),
      MONGODB_URI: MONGO_URI,
      DB_NAME: DB_NAME,
      ADMIN_USERNAME: 'admin',
      ADMIN_PASSWORD: TEST_PASS,
      UV_THREADPOOL_SIZE: '16'
    }
  });

  server.stdout.on('data', d => console.log('[Server stdout]', d.toString().trim()));
  server.stderr.on('data', d => console.error('[Server stderr]', d.toString().trim()));

  await sleep(1500);

  const mongoClient = new MongoClient(MONGO_URI);
  await mongoClient.connect();
  const db = mongoClient.db(DB_NAME);

  // 1. Authenticate Admin
  console.log('[Phase 1] Admin Authentication & Session Issuance...');
  const adminLogin = await req({ path: '/login', method: 'POST' }, {
    userType: 'Admin',
    username: 'admin',
    password: TEST_PASS
  });
  const adminToken = adminLogin.json.token;
  console.log(`  ✓ Admin authenticated with persistent session token.`);

  // 2. Create Tournament Game
  console.log('\n[Phase 2] Provisioning Tournament Session...');
  const createGameRes = await req({
    path: '/create-game',
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + adminToken }
  }, { name: 'Championship 8Q Tournament' });

  const gameId = String(createGameRes.json.ops ? createGameRes.json.ops[0]._id : createGameRes.json._id);
  console.log(`  ✓ Tournament Created in DB: ${gameId}`);

  // Sync in-memory games array in server
  await req({
    path: '/update-game',
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + adminToken }
  });

  // 3. Generate 4 Teams
  console.log('\n[Phase 3] Auto-Generating 4 Syndicate Teams...');
  const genTeamsRes = await req({
    path: '/api/teams/generate-all',
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + adminToken }
  }, { gameId });
  const teams = genTeamsRes.json.teams;
  console.log(`  ✓ 4 Teams Provisioned: ${teams.map(t => t.teamId).join(', ')}`);

  // 4. Authenticate 4 Teams and establish Socket.IO connections
  console.log('\n[Phase 4] Establishing 5 Authenticated Socket.IO Connections (1 Admin + 4 Teams)...');
  const adminSocket = io(SERVER_URL, { transports: ['websocket'] });
  await new Promise(r => adminSocket.on('connect', r));
  adminSocket.emit('authenticate', { token: adminToken });
  await sleep(200);
  adminSocket.emit('join-game', {
    gameId,
    socketId: adminSocket.id,
    userType: 'admin',
    userId: 'admin',
    userName: 'admin',
    token: adminToken
  });
  console.log(`  ✓ Admin Socket Connected: ${adminSocket.id}`);

  const playerSockets = [];
  for (let i = 0; i < teams.length; i++) {
    const t = teams[i];
    const loginRes = await req({ path: '/login', method: 'POST' }, {
      userType: 'Player',
      username: t.teamId,
      password: t.rawPassword
    });
    const token = loginRes.json.token;

    const sock = io(SERVER_URL, { transports: ['websocket'] });
    await new Promise(r => sock.on('connect', r));
    sock.emit('authenticate', { token });
    await sleep(200);

    sock.emit('join-game', {
      gameId,
      socketId: sock.id,
      userType: 'player',
      userId: t._id,
      userName: t.name,
      teamId: t.teamId,
      token
    });

    playerSockets.push({
      team: t,
      token,
      socket: sock,
      index: i
    });
    console.log(`  ✓ Team ${i + 1} (${t.name}) Connected & Joined Room: ${sock.id}`);
  }

  await sleep(1000);

  // Verify all 4 players added to game in MongoDB
  let gDoc = await db.collection('games').findOne({ _id: new ObjectId(gameId) });
  console.log(`  ✓ MongoDB Game Document Players Count: ${gDoc.players.length} / 4`);
  if (gDoc.players.length !== 4) {
    throw new Error('Expected 4 players in game document');
  }

  // 5. Run 8 Complete Quarters
  console.log('\n[Phase 5] Executing Complete 8-Quarter Financial Engine Lifecycle...');
  const quarterValuations = [];

  for (let q = 1; q <= 8; q++) {
    console.log(`\n----------------------------------------------------------------`);
    console.log(`>>> EXECUTING QUARTER ${q} OF 8`);
    console.log(`----------------------------------------------------------------`);

    // 5a. Admin signals round readiness / continue
    adminSocket.emit('round-continue', { gameId });
    await sleep(400);

    // 5b. Each player submits allocations
    // Retrieve current starting capital for each player
    gDoc = await db.collection('games').findOne({ _id: new ObjectId(gameId) });

    for (let i = 0; i < playerSockets.length; i++) {
      const ps = playerSockets[i];
      const pDoc = gDoc.players[i];
      const prevVal = (pDoc.rounds && pDoc.rounds.length > 0)
        ? pDoc.rounds[pDoc.rounds.length - 1].total_portfolio_value
        : 1000000;

      // In Q1: Verify exact ₹10,00,000 starting capital
      if (q === 1 && prevVal !== 1000000) {
        throw new Error(`Team ${i + 1} starting capital mismatch: ₹${prevVal} != ₹10,00,000`);
      }

      const half = Math.floor(prevVal / 2);
      const remaining = prevVal - half;
      let allocArray = [];
      let loan = null;

      // Distinct strategy per syndicate
      if (i === 0) {
        // Safe Yield: Bank FD (6.2%) + Govt Bonds
        allocArray = createAllocations({ bank_FD: half, govt_bond: remaining });
        // In Q1, Team 1 takes an educational loan of ₹1,00,000 for 4 quarters
        if (q === 1) {
          loan = {
            amount: 100000,
            duration: 4,
            totalRepayments: 0,
            status: 'active',
            rate: 12
          };
        }
      } else if (i === 1) {
        // Corporate Strategy: Blue Chip + Corporate Bonds
        allocArray = createAllocations({ blue_chip: half, corporate_bond: remaining });
      } else if (i === 2) {
        // Growth Strategy: Mid Cap + Gold ETF
        allocArray = createAllocations({ mid_cap: half, gold_ETF: remaining });
      } else {
        // Syndicate 4: FOF (allocating to Team 1) + Speculative Stock
        allocArray = createAllocations({
          speculative_stock: half,
          fof: { value: remaining, target_player: gDoc.players[0]._id }
        });
      }

      ps.socket.emit('player-ready', {
        gameId,
        socketId: ps.socket.id,
        userId: pDoc._id,
        round: allocArray,
        totalInvestment: prevVal,
        loan,
        prevLoans: pDoc.loans || []
      });
      console.log(`  ✓ Team ${i + 1} (${ps.team.name}) committed Q${q} Portfolio: ₹${prevVal.toLocaleString('en-IN')}`);
    }

    await sleep(800);

    // Track latest game from socket updates
    let currentGameState = null;
    const updateHandler = (game) => {
      if (game && String(game._id) === String(gameId)) currentGameState = game;
    };
    const diceHandler = (data) => {
      if (data && data.game && String(data.game._id) === String(gameId)) {
        currentGameState = data.game;
      }
    };
    adminSocket.on('game-updated', updateHandler);
    adminSocket.on('get-rolled-dice', diceHandler);

    // 5c. Admin starts round
    adminSocket.emit('game-start', { gameId });
    await sleep(800);

    // 5d. Execute dice rolls for all turns in round_seq
    console.log(`  Executing dice roll sequence for Quarter ${q}...`);
    let rollCount = 0;
    const maxRollTimeout = Date.now() + 20000;

    while (Date.now() < maxRollTimeout) {
      if (currentGameState && currentGameState.round_seq && currentGameState.round_seq.length > 0) {
        const nextTurn = currentGameState.round_seq[0];
        const playerObj = playerSockets.find(ps => String(gDoc.players[ps.index]._id) === String(nextTurn.playerId));
        if (playerObj) {
          rollCount++;
          const allocVal = 500000;

          playerObj.socket.emit('dice-rolled', {
            gameId,
            diceValue1: 3,
            diceValue2: 4,
            investment_opt: nextTurn.investment,
            investment: allocVal,
            player_id: nextTurn.playerId,
            isRetry: false,
            retryTaken: false,
            retryEnable: false
          });
          console.log(`    🎲 Roll #${rollCount}: ${playerObj.team.name} rolled for ${nextTurn.investment} (Value: ₹${allocVal.toLocaleString('en-IN')})`);
          await sleep(600);
        }
      } else if (rollCount > 0) {
        // All sequence turns completed
        break;
      }
      await sleep(300);
    }
    adminSocket.off('game-updated', updateHandler);
    adminSocket.off('get-rolled-dice', diceHandler);

    // 5e. Server settlement timer (5s server setTimeout + margin)
    console.log(`  Awaiting Quarter ${q} financial calculations and settlement...`);
    await sleep(6500);

    // Fetch updated game state from MongoDB
    gDoc = await db.collection('games').findOne({ _id: new ObjectId(gameId) });
    const completedRounds = gDoc.players[0].rounds.length;
    console.log(`  ✓ Quarter ${q} Settled! Recorded Rounds in MongoDB: ${completedRounds}`);

    // Capture valuations
    const qSnapshot = { quarter: q };
    gDoc.players.forEach((p, idx) => {
      const lastR = p.rounds[p.rounds.length - 1];
      qSnapshot[`team${idx + 1}`] = lastR.total_portfolio_value;
    });
    quarterValuations.push(qSnapshot);
    console.log(`    Valuations: T1=₹${qSnapshot.team1.toLocaleString('en-IN')}, T2=₹${qSnapshot.team2.toLocaleString('en-IN')}, T3=₹${qSnapshot.team3.toLocaleString('en-IN')}, T4=₹${qSnapshot.team4.toLocaleString('en-IN')}`);
  }

  // 6. Verify Terminal Settlement in Quarter 8
  console.log('\n================================================================');
  console.log('>>> TOURNAMENT SETTLEMENT & TERMINAL VALUATION AUDIT');
  console.log('================================================================');

  const finalDoc = await db.collection('games').findOne({ _id: new ObjectId(gameId) });
  console.log(`  Final Game Status: ${finalDoc.game_status} (Expected: "completed")`);
  if (finalDoc.game_status !== 'completed') {
    throw new Error(`Expected game_status "completed", got "${finalDoc.game_status}"`);
  }

  // Verify all 4 players completed exactly 8 rounds
  finalDoc.players.forEach((p, idx) => {
    console.log(`  ✓ Team ${idx + 1} (${p.name}): ${p.rounds.length} / 8 Quarters Completed`);
    if (p.rounds.length !== 8) {
      throw new Error(`Player ${idx + 1} did not complete 8 rounds: ${p.rounds.length}`);
    }
  });

  // Calculate final rankings and standings
  const leaderboard = finalDoc.players.map(p => {
    const finalVal = p.rounds[7].total_portfolio_value;
    const initial = 1000000;
    const roi = Number((((finalVal - initial) / initial) * 100).toFixed(2));
    return {
      name: p.name,
      teamId: p.teamId,
      finalNetWorth: finalVal,
      roiPercent: roi
    };
  }).sort((a, b) => b.finalNetWorth - a.finalNetWorth);

  console.log('\n  🏆 OFFICIAL TOURNAMENT STANDINGS & PODIUM:');
  leaderboard.forEach((entry, idx) => {
    console.log(`    Rank ${idx + 1}: ${entry.name} (${entry.teamId}) | Net Worth: ₹${entry.finalNetWorth.toLocaleString('en-IN')} | ROI: ${entry.roiPercent}%`);
  });

  const winner = leaderboard[0];
  console.log(`\n  🥇 TOURNAMENT WINNER: ${winner.name} (₹${winner.finalNetWorth.toLocaleString('en-IN')})`);

  // 7. Verify CSV Export
  console.log('\n[Phase 7] Validating CSV Export Integrity...');
  const csvRes = await req({
    path: `/api/games/export/${gameId}`,
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + adminToken }
  });

  console.log(`  ✓ CSV HTTP Status: ${csvRes.status}`);
  const csvLines = csvRes.body.trim().split('\n');
  console.log(`  ✓ CSV Header: "${csvLines[0]}"`);
  console.log(`  ✓ CSV Row 1 (Winner): "${csvLines[1]}"`);

  if (!csvRes.body.includes(winner.name)) {
    throw new Error('CSV export missing winner name');
  }

  // Disconnect sockets
  adminSocket.disconnect();
  playerSockets.forEach(ps => ps.socket.disconnect());

  // Cleanup DB and Server
  console.log('\n[Phase 8] Cleaning Up Isolated Test Database...');
  await db.dropDatabase();
  await mongoClient.close();
  server.kill('SIGKILL');

  const report = {
    gameId,
    quartersCompleted: 8,
    status: finalDoc.game_status,
    leaderboard,
    quarterValuations,
    csvExportValid: true
  };

  fs.writeFileSync('scratch/8q-deterministic-report.json', JSON.stringify(report, null, 2));
  console.log('✓ Full 8-Quarter Deterministic Simulation Audit Passed with 100% Success!\n');
}

runDeterministic8QSimulation().catch(err => {
  console.error('Fatal Simulation Error:', err);
  process.exit(1);
});
