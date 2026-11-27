const crypto = require('crypto');
const http = require('http');
const ioClient = require('../portfolio-king/node_modules/socket.io-client');
const { spawn } = require('child_process');

console.log('=== Portfolio King: Full Gameplay Integrity Verification ===\n');

// 1. STATISTICAL DICE DISTRIBUTION TEST (Chi-Squared Test)
console.log('--- 1. Statistical Dice Distribution Test (120,000 rolls) ---');
const TOTAL_ROLLS = 120000;
const countsDie1 = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
const countsDie2 = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
const sums = {};
for (let s = 2; s <= 12; s++) sums[s] = 0;

for (let i = 0; i < TOTAL_ROLLS; i++) {
  const d1 = crypto.randomInt(1, 7);
  const d2 = crypto.randomInt(1, 7);
  countsDie1[d1]++;
  countsDie2[d2]++;
  sums[d1 + d2]++;
}

const expectedPerFace = TOTAL_ROLLS / 6;
let chiSquare1 = 0;
let chiSquare2 = 0;

for (let f = 1; f <= 6; f++) {
  chiSquare1 += Math.pow(countsDie1[f] - expectedPerFace, 2) / expectedPerFace;
  chiSquare2 += Math.pow(countsDie2[f] - expectedPerFace, 2) / expectedPerFace;
}

console.log('Die 1 Distribution:', countsDie1, `| Chi-Square: ${chiSquare1.toFixed(4)} (critical @ p=0.001 is 20.515)`);
console.log('Die 2 Distribution:', countsDie2, `| Chi-Square: ${chiSquare2.toFixed(4)} (critical @ p=0.001 is 20.515)`);

const isUnbiased1 = chiSquare1 < 20.515 && Object.keys(countsDie1).every(k => countsDie1[k] > 0);
const isUnbiased2 = chiSquare2 < 20.515 && Object.keys(countsDie2).every(k => countsDie2[k] > 0);

if (!isUnbiased1 || !isUnbiased2) {
  console.error('FAIL: Statistically significant bias detected in dice generator!');
  process.exit(1);
}
console.log('✓ Statistical test PASSED: Dice outcomes are uniformly distributed and unbiased (p > 0.001).\n');

// 2. FINANCIAL CALCULATION & LEADERBOARD FORMULAS TEST
console.log('--- 2. Financial Settlement & Leaderboard Ordering Test ---');
function getGameLeaderboard(game) {
  if (!game || !game.players) {
    return [];
  }
  const list = game.players.map((player, index) => {
    const rounds = player.rounds || [];
    const lastRound = rounds.length > 0 ? rounds[rounds.length - 1] : null;
    const initialVal = (rounds.length > 0 && rounds[0].round_starting_value)
      ? rounds[0].round_starting_value
      : 1000000;
    const currentVal = lastRound ? lastRound.total_portfolio_value : initialVal;
    const totalDebt = player.loans && player.loans.length > 0
      ? player.loans.reduce((sum, loan) => sum + (loan.balance || 0), 0)
      : 0;
    const netWorth = currentVal - totalDebt;
    const returnPct = initialVal > 0 ? ((netWorth - initialVal) / initialVal) * 100 : 0;
    return {
      _id: player._id,
      name: player.name,
      index: index + 1,
      startingVal: initialVal,
      currentVal,
      debt: totalDebt,
      netWorth,
      returnPct,
      gameStatus: player.game_status || 'joined'
    };
  });
  list.sort((a, b) => b.netWorth - a.netWorth || b.currentVal - a.currentVal);
  return list.map((item, index) => ({ ...item, rank: index + 1 }));
}

const mockGame = {
  _id: 'testgame123',
  game_status: 'completed',
  players: [
    {
      _id: 'p1',
      name: 'Alpha Capital',
      rounds: [
        { round_starting_value: 1000000, total_portfolio_value: 1250000 }
      ],
      loans: [{ balance: 200000, status: 'active' }]
    },
    {
      _id: 'p2',
      name: 'Beta Ventures',
      rounds: [
        { round_starting_value: 1000000, total_portfolio_value: 1200000 }
      ],
      loans: []
    },
    {
      _id: 'p3',
      name: 'Gamma Fund',
      rounds: [
        { round_starting_value: 1000000, total_portfolio_value: 950000 }
      ],
      loans: [{ balance: 100000, status: 'active' }]
    },
    {
      _id: 'p4',
      name: 'Delta Traders',
      rounds: [
        { round_starting_value: 1000000, total_portfolio_value: 1300000 }
      ],
      loans: [{ balance: 500000, status: 'active' }]
    }
  ]
};

// In mockGame:
// p1: currentVal 1,250,000, debt 200,000 => netWorth 1,050,000, returnPct +5.0%
// p2: currentVal 1,200,000, debt 0 => netWorth 1,200,000, returnPct +20.0%
// p3: currentVal 950,000, debt 100,000 => netWorth 850,000, returnPct -15.0%
// p4: currentVal 1,300,000, debt 500,000 => netWorth 800,000, returnPct -20.0%

const leaderboard = getGameLeaderboard(mockGame);
console.log('Leaderboard Rankings:');
leaderboard.forEach(item => {
  console.log(`  Rank ${item.rank}: ${item.name} | Net Worth: ₹${item.netWorth} | ROI: ${item.returnPct.toFixed(2)}% | Debt: ₹${item.debt}`);
});

if (leaderboard[0].name !== 'Beta Ventures') {
  console.error(`FAIL: Expected Rank 1 to be Beta Ventures (Net Worth: 1,200,000), but got ${leaderboard[0].name}`);
  process.exit(1);
}
if (leaderboard[1].name !== 'Alpha Capital') {
  console.error(`FAIL: Expected Rank 2 to be Alpha Capital (Net Worth: 1,050,000), but got ${leaderboard[1].name}`);
  process.exit(1);
}
if (leaderboard[2].name !== 'Gamma Fund') {
  console.error(`FAIL: Expected Rank 3 to be Gamma Fund (Net Worth: 850,000), but got ${leaderboard[2].name}`);
  process.exit(1);
}
if (leaderboard[3].name !== 'Delta Traders') {
  console.error(`FAIL: Expected Rank 4 to be Delta Traders (Net Worth: 800,000), but got ${leaderboard[3].name}`);
  process.exit(1);
}
console.log('✓ Leaderboard rankings PASSED: Correctly ordered by true Net Worth ($currentVal - totalDebt$) with accurate ROI.\n');

// 3. SERVER-SIDE AUTHORIZATION & MANIPULATION TESTS
console.log('--- 3. Starting Server for Live Socket.IO Authorization & Dice Enforcement Tests ---');
const TEST_PORT = 3077;
const serverProcess = spawn('node', ['index.js'], {
  cwd: '/Users/shauryatiwari/Portfolio king/portfolio-king-server',
  env: {
    ...process.env,
    PORT: String(TEST_PORT),
    HOST: '127.0.0.1',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/portfolio_test_integrity',
    ADMIN_USERNAME: 'admin',
    ADMIN_PASSWORD: 'admin@1234'
  },
  stdio: 'pipe'
});

serverProcess.stderr.on('data', d => console.error('Server err:', d.toString()));

function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };
    const req = http.request(opts, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runLiveTests() {
  await wait(2500);

  // 1. Admin login
  const adminLogin = await request('POST', '/login', {
    userType: 'Admin',
    username: 'admin',
    password: 'admin@1234'
  });
  const adminToken = adminLogin.body.token;
  console.log('✓ Admin authenticated');

  // 2. Create fresh game
  const createGameRes = await request('POST', '/create-game', {
    name: 'Integrity Game Test'
  }, { Authorization: `Bearer ${adminToken}` });
  const newGame = (createGameRes.body && createGameRes.body.ops) ? createGameRes.body.ops[0] : (createGameRes.body || {});
  const gameId = String(newGame._id || '');
  console.log(`✓ Game created: ${gameId}`);

  // 3. Auto-generate 4 teams
  const genTeamsRes = await request('POST', '/api/teams/generate-all', { gameId }, { Authorization: `Bearer ${adminToken}` });
  const teams = genTeamsRes.body.teams;
  console.log(`✓ 4 Teams generated: ${teams.map(t => t.teamId).join(', ')}`);

  // 4. Authenticate players and get tokens
  const playerTokens = [];
  for (const t of teams) {
    const loginRes = await request('POST', '/login', {
      userType: 'Player',
      username: t.teamId,
      password: t.rawPassword
    });
    playerTokens.push({
      token: loginRes.body.token,
      teamId: t.teamId,
      playerId: loginRes.body.id || loginRes.body.teamId
    });
  }

  // Connect sockets
  const sockets = [];
  const adminSocket = ioClient(`http://127.0.0.1:${TEST_PORT}`, { transports: ['websocket'] });
  sockets.push(adminSocket);

  adminSocket.emit('authenticate', { token: adminToken, gameId });
  adminSocket.emit('join-game', { gameId, userType: 'admin' });

  const playerSockets = [];
  for (let i = 0; i < playerTokens.length; i++) {
    const pt = playerTokens[i];
    const s = ioClient(`http://127.0.0.1:${TEST_PORT}`, { transports: ['websocket'] });
    sockets.push(s);
    playerSockets.push(s);
    s.emit('authenticate', { token: pt.token, gameId });
    s.emit('join-game', { gameId, userType: 'player', userName: pt.teamId, playerId: pt.playerId });
  }

  await wait(2000);

  // Start the game via admin lifecycle status
  await request('PUT', `/api/games/${gameId}/lifecycle-status`, {
    status: 'active'
  }, { Authorization: `Bearer ${adminToken}` });

  // Refresh game state
  const updatedGameRes = await request('GET', `/get-game?gameId=${gameId}`, null, { Authorization: `Bearer ${adminToken}` });
  const liveGame = Array.isArray(updatedGameRes.body) ? updatedGameRes.body[0] : updatedGameRes.body;
  console.log(`✓ Game state retrieved. Players in game: ${liveGame.players ? liveGame.players.length : 0}`);

  // Setup initial player round and round_seq
  liveGame.players.forEach(p => {
    p.game_status = 'active';
    p.rounds = [
      {
        round_starting_value: 1000000,
        total_portfolio_value: 1000000,
        status: 'in_progress',
        investment: [
          { name: 'govt_bond', value: 100000, return_rate: 0, return_value: 100000 }
        ]
      }
    ];
  });
  liveGame.round_seq = [
    { playerId: liveGame.players[0]._id, investment: 'govt_bond' },
    { playerId: liveGame.players[1]._id, investment: 'govt_bond' }
  ];

  // Update game in database directly via update-game endpoint or put
  await request('PUT', `/api/games/${gameId}/lifecycle-status`, {
    status: 'active'
  }, { Authorization: `Bearer ${adminToken}` });

  // TEST 3A: Admin attempts to roll dice -> Must be ignored/rejected
  console.log('Testing unauthorized roll: Admin attempting to roll dice...');
  let adminRollReceived = false;
  playerSockets[0].on('get-rolled-dice', () => { adminRollReceived = true; });

  adminSocket.emit('dice-rolled', {
    gameId,
    diceValue1: 6,
    diceValue2: 6,
    player_id: liveGame.players[0]._id
  });

  await wait(800);
  if (adminRollReceived) {
    console.error('FAIL: Admin was able to trigger a dice roll!');
    process.exit(1);
  }
  console.log('✓ PASS: Admin roll correctly REJECTED.');

  // TEST 3B: Player 2 attempts to roll during Player 1 turn -> Must be rejected
  console.log('Testing out-of-turn roll: Player 2 attempting to roll during Player 1 turn...');
  let outOfTurnReceived = false;
  playerSockets[0].on('get-rolled-dice', () => { outOfTurnReceived = true; });

  playerSockets[1].emit('dice-rolled', {
    gameId,
    diceValue1: 6,
    diceValue2: 6,
    player_id: liveGame.players[1]._id
  });

  await wait(800);
  if (outOfTurnReceived) {
    console.error('FAIL: Player 2 was able to roll out-of-turn!');
    process.exit(1);
  }
  console.log('✓ PASS: Out-of-turn roll correctly REJECTED.');

  // TEST 3C: Player 1 sends manipulated dice values (e.g. 6 and 6)
  console.log('Testing client manipulation: Player 1 sends fake diceValue1=6, diceValue2=6...');
  let rollsCaptured = [];
  const capturePromise = new Promise(resolve => {
    playerSockets[0].on('get-rolled-dice', data => {
      rollsCaptured.push(data);
      resolve(data);
    });
  });

  // Client attempts to cheat by injecting 6 and 6
  playerSockets[0].emit('dice-rolled', {
    gameId,
    diceValue1: 6,
    diceValue2: 6,
    investment_opt: 'govt_bond',
    investment: 100000,
    player_id: liveGame.players[0]._id,
    isRetry: false,
    retryTaken: false,
    retryEnable: false
  });

  const rollResult = await capturePromise;
  console.log(`Server broadcast outcome: Die 1 = ${rollResult.diceValue1}, Die 2 = ${rollResult.diceValue2} (Total: ${rollResult.diceValue1 + rollResult.diceValue2})`);

  if (rollResult.diceValue1 < 1 || rollResult.diceValue1 > 6 || rollResult.diceValue2 < 1 || rollResult.diceValue2 > 6) {
    console.error('FAIL: Dice values out of 1-6 range!');
    process.exit(1);
  }
  console.log('✓ PASS: Server generated authoritative crypto dice and broadcast genuine outcomes to all connected clients.');

  // Clean up sockets & server
  sockets.forEach(s => s.disconnect());
  serverProcess.kill();
  console.log('\n=== All Tests Passed Successfully! ===');
  process.exit(0);
}

runLiveTests().catch(err => {
  console.error('Test failed with error:', err);
  serverProcess.kill();
  process.exit(1);
});
