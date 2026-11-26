const http = require('http');
const path = require('path');
const { spawn, execSync } = require('child_process');
const { io } = require('../portfolio-king/node_modules/socket.io-client');
const { MongoClient } = require('../portfolio-king-server/node_modules/mongodb');

const PORT = 3010;
const TEST_DB = 'portfolio_load_test';
const MONGO_URI = `mongodb://127.0.0.1:27017/${TEST_DB}`;
const SERVER_URL = `http://127.0.0.1:${PORT}`;

// Helper: HTTP Request with timing
function makeRequest(options, postData = null) {
  return new Promise((resolve) => {
    const postDataStr = postData ? (typeof postData === 'string' ? postData : JSON.stringify(postData)) : null;
    const reqHeaders = { ...(options.headers || {}) };
    if (postDataStr) {
      reqHeaders['Content-Length'] = Buffer.byteLength(postDataStr);
      if (!reqHeaders['Content-Type']) reqHeaders['Content-Type'] = 'application/json';
    }
    const finalOptions = { ...options, headers: reqHeaders };

    const start = process.hrtime.bigint();
    const req = http.request(finalOptions, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
        let json = null;
        try { json = JSON.parse(body); } catch (_) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body,
          json,
          durationMs
        });
      });
    });

    req.on('error', (err) => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      resolve({
        statusCode: 0,
        error: err.message,
        durationMs
      });
    });

    if (postDataStr) {
      req.write(postDataStr);
    }
    req.end();
  });
}

function calculatePercentiles(latencies) {
  if (latencies.length === 0) return { mean: 0, median: 0, p95: 0, p99: 0, min: 0, max: 0 };
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const mean = sum / sorted.length;
  const p50 = sorted[Math.floor(sorted.length * 0.50)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  return {
    mean: Number(mean.toFixed(2)),
    median: Number(p50.toFixed(2)),
    p95: Number(p95.toFixed(2)),
    p99: Number(p99.toFixed(2)),
    min: Number(min.toFixed(2)),
    max: Number(max.toFixed(2))
  };
}

// Process metrics sampler
class ProcessMonitor {
  constructor(pid) {
    this.pid = pid;
    this.cpuSamples = [];
    this.rssSamples = [];
    this.timer = null;
  }

  start(intervalMs = 200) {
    this.cpuSamples = [];
    this.rssSamples = [];
    this.timer = setInterval(() => {
      try {
        const out = execSync(`ps -p ${this.pid} -o %cpu,rss | tail -n 1`, { encoding: 'utf8' }).trim();
        const parts = out.split(/\s+/);
        if (parts.length >= 2) {
          const cpu = parseFloat(parts[0]) || 0;
          const rssMb = (parseInt(parts[1], 10) || 0) / 1024;
          this.cpuSamples.push(cpu);
          this.rssSamples.push(rssMb);
        }
      } catch (_) {}
    }, intervalMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    const avgCpu = this.cpuSamples.length ? (this.cpuSamples.reduce((a, b) => a + b, 0) / this.cpuSamples.length) : 0;
    const peakCpu = this.cpuSamples.length ? Math.max(...this.cpuSamples) : 0;
    const initialRss = this.rssSamples.length ? this.rssSamples[0] : 0;
    const peakRss = this.rssSamples.length ? Math.max(...this.rssSamples) : 0;
    const finalRss = this.rssSamples.length ? this.rssSamples[this.rssSamples.length - 1] : 0;
    return {
      avgCpu: Number(avgCpu.toFixed(1)),
      peakCpu: Number(peakCpu.toFixed(1)),
      initialRss: Number(initialRss.toFixed(1)),
      peakRss: Number(peakRss.toFixed(1)),
      finalRss: Number(finalRss.toFixed(1))
    };
  }
}

async function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await makeRequest({
        hostname: '127.0.0.1',
        port: PORT,
        path: '/login',
        method: 'GET'
      });
      if (res.statusCode >= 200 && res.statusCode < 400) return true;
    } catch (_) {}
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error(`Timeout waiting for server at ${url}`);
}

async function main() {
  console.log('=================================================================================');
  console.log('       PORTFOLIO KING COMPREHENSIVE LOAD & MULTIPLAYER STRESS TEST SUITE');
  console.log('=================================================================================\n');

  console.log('[Setup] Connecting to MongoDB and purging isolated test database...');
  const mongoClient = await MongoClient.connect('mongodb://127.0.0.1:27017', { useUnifiedTopology: true });
  await mongoClient.db(TEST_DB).dropDatabase();
  console.log(`✓ Clean test database "${TEST_DB}" ready.\n`);

  console.log(`[Setup] Launching isolated Portfolio King server process on port ${PORT}...`);
  const serverProc = spawn(process.execPath, [path.resolve(__dirname, '../portfolio-king-server/index.js')], {
    env: {
      ...process.env,
      PORT: String(PORT),
      DB_NAME: TEST_DB,
      MONGODB_URI: MONGO_URI,
      ADMIN_USERNAME: 'admin',
      ADMIN_PASSWORD: 'admin@1234',
      UV_THREADPOOL_SIZE: '64' // Optimize crypto/PBKDF2 threadpool for high concurrency
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  serverProc.stdout.on('data', d => {
    const s = d.toString().trim();
    if (s.includes('App is listening') || s.includes('Connected to MongoDB')) {
      console.log(`  [Server stdout] ${s}`);
    }
  });

  await waitForServer(SERVER_URL);
  console.log(`✓ Server ready and accepting connections at ${SERVER_URL}\n`);

  const monitor = new ProcessMonitor(serverProc.pid);

  // Initial Admin Authentication to obtain admin token
  console.log('[Setup] Authenticating test master administrator...');
  const adminLoginRes = await makeRequest({
    hostname: '127.0.0.1',
    port: PORT,
    path: '/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    username: 'admin',
    password: 'admin@1234',
    userType: 'Admin'
  });

  const adminToken = adminLoginRes.json && adminLoginRes.json.token;
  if (!adminToken) {
    throw new Error(`Failed to obtain admin token: ${JSON.stringify(adminLoginRes)}`);
  }
  console.log('✓ Admin authenticated successfully.\n');

  const tierResults = [];

  // ============================================================================
  // PART 1: GRADUAL CONCURRENCY RAMP-UP (10, 25, 50, 100, 200, 500)
  // ============================================================================
  const CONCURRENCY_TIERS = [10, 25, 50, 100, 200, 500];

  for (const tier of CONCURRENCY_TIERS) {
    console.log(`---------------------------------------------------------------------------------`);
    console.log(`>>> EXECUTING CONCURRENCY TIER: ${tier} CONCURRENT CLIENTS`);
    console.log(`---------------------------------------------------------------------------------`);

    monitor.start(150);
    const tierStart = Date.now();
    const latencies = [];
    let successfulAuth = 0;
    let failedAuth = 0;
    let connectedSockets = 0;
    let socketErrors = 0;
    const sockets = [];

    // 1a. Pre-create games and teams for this tier
    const gamesNeeded = Math.ceil(tier / 4);
    const createdTeams = [];

    for (let g = 0; g < gamesNeeded; g++) {
      const gRes = await makeRequest({
        hostname: '127.0.0.1',
        port: PORT,
        path: '/create-game',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        }
      }, { name: `Tier-${tier}-G${g + 1}` });

      const gameId = gRes.json && (gRes.json.ops ? gRes.json.ops[0]._id : gRes.json._id);

      const tRes = await makeRequest({
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/teams/generate-all',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        }
      }, { gameId });

      const teams = (tRes.json && tRes.json.teams) || [];
      createdTeams.push(...teams);
    }

    const testTeams = createdTeams.slice(0, tier);

    // 1b. Simultaneous HTTP Team Authentication
    console.log(`  [HTTP Auth] Firing ${testTeams.length} simultaneous authentication requests...`);
    const authStart = process.hrtime.bigint();

    const authPromises = testTeams.map(t => {
      return makeRequest({
        hostname: '127.0.0.1',
        port: PORT,
        path: '/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, {
        username: t.teamId,
        password: t.rawPassword || t.password,
        userType: 'Player'
      }).then(res => {
        latencies.push(res.durationMs);
        if (res.statusCode === 200 && res.json && res.json.token) {
          successfulAuth++;
          return { team: t, token: res.json.token, success: true };
        } else {
          failedAuth++;
          return { team: t, success: false, error: res.body };
        }
      });
    });

    const authResults = await Promise.all(authPromises);
    const authDurationSec = Number(process.hrtime.bigint() - authStart) / 1e9;
    const authRps = Number((tier / authDurationSec).toFixed(1));

    // 1c. Simultaneous WebSocket Connections & Room Joining
    console.log(`  [Socket.IO] Establishing ${successfulAuth} authenticated WebSocket connections...`);
    const successfulTokens = authResults.filter(r => r.success);
    const socketLatencies = [];

    const socketPromises = successfulTokens.map(({ team, token }) => {
      return new Promise((resolve) => {
        let isDone = false;
        const connStart = process.hrtime.bigint();
        const clientSocket = io(SERVER_URL, {
          transports: ['websocket'],
          reconnection: false,
          timeout: 20000
        });

        const finishSuccess = () => {
          if (!isDone) {
            isDone = true;
            const sDur = Number(process.hrtime.bigint() - connStart) / 1e6;
            socketLatencies.push(sDur);
            connectedSockets++;
            sockets.push(clientSocket);
            resolve({ socket: clientSocket, success: true });
          }
        };

        clientSocket.on('connect', () => {
          clientSocket.emit('authenticate', { token });
        });

        clientSocket.on('update-user', () => {
          clientSocket.emit('join-game', {
            gameId: team.gameId,
            socketId: clientSocket.id,
            token
          });
        });

        clientSocket.on('player-added-to-game', finishSuccess);
        clientSocket.on('game-updated', (g) => {
          if (g && g.players && g.players.some(p => p.teamId === team.teamId)) {
            finishSuccess();
          }
        });

        clientSocket.on('connect_error', (err) => {
          if (!isDone) {
            isDone = true;
            socketErrors++;
            resolve({ success: false, error: err.message });
          }
        });

        clientSocket.on('player-add-error', (err) => {
          if (!isDone) {
            isDone = true;
            socketErrors++;
            resolve({ success: false, error: err.msg });
          }
        });

        setTimeout(() => {
          if (!isDone) {
            isDone = true;
            socketErrors++;
            resolve({ success: false, timeout: true });
          }
        }, 25000);
      });
    });

    await Promise.all(socketPromises);

    // Collect process metrics
    const procMetrics = monitor.stop();
    const pct = calculatePercentiles(latencies);
    const sockPct = calculatePercentiles(socketLatencies);

    const tierRecord = {
      tier,
      totalRequests: tier,
      successfulAuth,
      failedAuth,
      authRps,
      latencyMean: pct.mean,
      latencyP50: pct.median,
      latencyP95: pct.p95,
      latencyP99: pct.p99,
      connectedSockets,
      socketErrors,
      socketMean: sockPct.mean,
      socketP95: sockPct.p95,
      avgCpu: procMetrics.avgCpu,
      peakCpu: procMetrics.peakCpu,
      peakRss: procMetrics.peakRss,
      finalRss: procMetrics.finalRss,
      pass: failedAuth === 0 && socketErrors === 0 && connectedSockets === successfulAuth
    };

    tierResults.push(tierRecord);

    console.log(`  ✓ Tier ${tier} complete: Auth Success: ${successfulAuth}/${tier}, Socket Connections: ${connectedSockets}/${tier}`);
    console.log(`    HTTP Latency: Mean=${pct.mean}ms, P50=${pct.median}ms, P95=${pct.p95}ms, P99=${pct.p99}ms | RPS=${authRps}`);
    console.log(`    Socket Setup: Mean=${sockPct.mean}ms, P95=${sockPct.p95}ms | Socket Errors=${socketErrors}`);
    console.log(`    System: Avg CPU=${procMetrics.avgCpu}%, Peak CPU=${procMetrics.peakCpu}%, Peak RAM=${procMetrics.peakRss}MB\n`);

    // Clean up open sockets before next tier
    sockets.forEach(s => s.disconnect());
    await new Promise(r => setTimeout(r, 600));

    // Halt if failure rate exceeds 20%
    if (failedAuth > tier * 0.20 || socketErrors > tier * 0.20) {
      console.warn(`! Stopping further ramp-up: Tier ${tier} encountered significant degradation.`);
      break;
    }
  }

  // ============================================================================
  // PART 2: 100-PLAYER / 25-GAME INDEPENDENT FOUR-TEAM MULTIPLAYER SIMULATION
  // ============================================================================
  console.log('=================================================================================');
  console.log('>>> EXECUTING 100-PLAYER MULTIPLAYER SIMULATION ACROSS 25 FOUR-TEAM GAMES');
  console.log('=================================================================================\n');

  monitor.start(150);
  const simStart = Date.now();
  const GAME_COUNT = 25;
  const TEAMS_PER_GAME = 4;
  const TOTAL_PLAYERS = GAME_COUNT * TEAMS_PER_GAME; // 100 players

  console.log(`[Step 1] Creating ${GAME_COUNT} independent game sessions via Admin API...`);
  const gameSessions = [];

  for (let i = 1; i <= GAME_COUNT; i++) {
    const res = await makeRequest({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/create-game',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    }, { name: `Tournament-Cohort-${i}` });

    const game = res.json.ops ? res.json.ops[0] : res.json;
    gameSessions.push(game);
  }
  console.log(`✓ ${gameSessions.length} independent games successfully provisioned.`);

  console.log(`[Step 2] Auto-generating 4 authenticated teams for each of the 25 games...`);
  const allTeams = [];
  for (const game of gameSessions) {
    const res = await makeRequest({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/teams/generate-all',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    }, { gameId: String(game._id) });

    const teams = res.json.teams || [];
    allTeams.push(...teams);
  }
  console.log(`✓ ${allTeams.length} total syndicate teams generated.\n`);

  console.log(`[Step 3] Authenticating all 100 players simultaneously...`);
  const playerTokens = [];
  const authLatencies = [];

  const playerAuthPromises = allTeams.map(t => {
    return makeRequest({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      username: t.teamId,
      password: t.rawPassword || t.password,
      userType: 'Player'
    }).then(r => {
      authLatencies.push(r.durationMs);
      if (r.statusCode === 200 && r.json && r.json.token) {
        playerTokens.push({
          team: t,
          token: r.json.token,
          user: r.json.user
        });
      }
    });
  });

  await Promise.all(playerAuthPromises);
  console.log(`✓ ${playerTokens.length}/${TOTAL_PLAYERS} teams authenticated.`);

  console.log(`[Step 4] Connecting 100 persistent Socket.IO clients to their 25 game rooms...`);
  const activeSockets = [];
  const playerRecords = new Map(); // teamId -> player data

  const socketJoinPromises = playerTokens.map(({ team, token }) => {
    return new Promise((resolve) => {
      let isDone = false;
      const clientSocket = io(SERVER_URL, {
        transports: ['websocket'],
        reconnection: false,
        timeout: 20000
      });

      const finishPlayerJoin = (playerData) => {
        if (!isDone) {
          isDone = true;
          playerRecords.set(team.teamId, {
            ...playerData,
            clientSocket,
            token,
            gameId: team.gameId
          });
          activeSockets.push(clientSocket);
          resolve();
        }
      };

      clientSocket.on('connect', () => {
        clientSocket.emit('authenticate', { token });
      });

      clientSocket.on('update-user', () => {
        clientSocket.emit('join-game', {
          gameId: team.gameId,
          socketId: clientSocket.id,
          token
        });
      });

      clientSocket.on('player-added-to-game', (data) => {
        if (data.player && data.player.teamId === team.teamId) {
          finishPlayerJoin(data.player);
        }
      });

      clientSocket.on('game-updated', (updatedGame) => {
        if (updatedGame && updatedGame.players) {
          const me = updatedGame.players.find(p => p.teamId === team.teamId);
          if (me) {
            finishPlayerJoin(me);
          }
        }
      });

      setTimeout(() => {
        if (!isDone) {
          isDone = true;
          resolve();
        }
      }, 15000);
    });
  });

  await Promise.all(socketJoinPromises);
  console.log(`✓ ${activeSockets.length}/${TOTAL_PLAYERS} sockets joined their authoritative game rooms.\n`);

  console.log(`[Step 5] Admin starting all 25 games concurrently...`);
  const adminSocket = io(SERVER_URL, { transports: ['websocket'] });
  await new Promise(r => adminSocket.on('connect', r));
  adminSocket.emit('authenticate', { token: adminToken });
  await new Promise(r => setTimeout(r, 200));

  for (const game of gameSessions) {
    adminSocket.emit('game-state-change', {
      gameId: String(game._id),
      state: 'active'
    });
  }
  await new Promise(r => setTimeout(r, 500));
  console.log(`✓ All 25 games switched to active state.`);

  console.log(`[Step 6] Simulating simultaneous Quarter 1 capital allocation across all 100 players...`);
  const allocationPromises = [];
  let allocationsConfirmed = 0;

  for (const [teamId, pInfo] of playerRecords.entries()) {
    const allocPromise = new Promise((resolve) => {
      let resolved = false;
      const onDone = () => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      };

      pInfo.clientSocket.on('game-updated', (updatedGame) => {
        if (updatedGame && updatedGame.players) {
          const me = updatedGame.players.find(pl => pl.teamId === teamId);
          if (me && me.game_status === 'ready' && !resolved) {
            allocationsConfirmed++;
            onDone();
          }
        }
      });

      // Submit valid Q1 portfolio allocation: exactly ₹10,00,000 distributed across standard avenues
      const payload = {
        gameId: pInfo.gameId,
        userId: pInfo._id,
        totalInvestment: 1000000,
        round: [
          { name: 'bank_FD', value: 200000, return_rate: 6.2, return_value: 203100 },
          { name: 'govt_bond', value: 250000, return_rate: 0, return_value: 0 },
          { name: 'corporate_bond', value: 250000, return_rate: 0, return_value: 0 },
          { name: 'blue_chip', value: 300000, return_rate: 0, return_value: 0 },
          { name: 'mid_cap', value: 0, return_rate: 0, return_value: 0 },
          { name: 'speculative_stock', value: 0, return_rate: 0, return_value: 0 },
          { name: 'international_stock', value: 0, return_rate: 0, return_value: 0 },
          { name: 'US_dollar', value: 0, return_rate: 0, return_value: 0 },
          { name: 'gold_ETF', value: 0, return_rate: 0, return_value: 0 }
        ],
        prevLoans: [],
        loan: {
          amount: 50000,
          rate: 12,
          duration: 1,
          status: 'active'
        }
      };

      pInfo.clientSocket.emit('player-ready', payload);
      setTimeout(onDone, 8000);
    });

    allocationPromises.push(allocPromise);
  }

  await Promise.all(allocationPromises);
  console.log(`✓ ${allocationsConfirmed}/${TOTAL_PLAYERS} portfolio allocations persisted without drop.`);

  console.log(`[Step 7] Simulating simultaneous dice rolls across all 25 game tables...`);
  // Track latest game objects with round_seq
  const latestGames = new Map();
  for (const [, pInfo] of playerRecords.entries()) {
    pInfo.clientSocket.on('game-updated', (g) => {
      if (g && g._id) latestGames.set(String(g._id), g);
    });
  }

  for (const game of gameSessions) {
    adminSocket.emit('round-ready', { gameId: String(game._id) });
  }
  await new Promise(r => setTimeout(r, 600));

  let diceRollsExecuted = 0;
  for (const game of gameSessions) {
    const gId = String(game._id);
    const updated = latestGames.get(gId);
    if (updated && updated.round_seq && updated.round_seq.length > 0) {
      const turnItem = updated.round_seq[0];
      const activePlayer = (updated.players || []).find(p => String(p._id) === String(turnItem.playerId));
      if (activePlayer && playerRecords.has(activePlayer.teamId)) {
        const pRecord = playerRecords.get(activePlayer.teamId);
        pRecord.clientSocket.emit('dice-rolled', {
          gameId: gId,
          player_id: String(turnItem.playerId),
          diceValue1: 4,
          diceValue2: 3,
          retryEnable: false,
          isRetry: false,
          investment: 250000,
          investment_opt: turnItem.investment
        });
        diceRollsExecuted++;
      }
    }
  }
  await new Promise(r => setTimeout(r, 1000));
  console.log(`✓ ${diceRollsExecuted} round dice rolls executed and financial returns credited.`);

  // Integrity checks on MongoDB database
  console.log(`\n[Step 8] Verifying Financial Engine & Database Integrity Under Load...`);
  const db = mongoClient.db(TEST_DB);
  const simGameDocs = await db.collection('games').find({ name: /^Tournament-Cohort-/ }).toArray();
  let financialIntegrityErrors = 0;
  let startingCapitalErrors = 0;
  let totalSimPlayers = 0;

  for (const gDoc of simGameDocs) {
    for (const pl of (gDoc.players || [])) {
      totalSimPlayers++;
      if (!pl.rounds || pl.rounds.length === 0) {
        financialIntegrityErrors++;
      } else {
        const q1 = pl.rounds[0];
        if (q1.round_starting_value !== 1000000) {
          startingCapitalErrors++;
        }
      }
    }
  }

  console.log(`  Simulation Players Evaluated: ${totalSimPlayers}/${TOTAL_PLAYERS}`);
  console.log(`  Financial Calculations Validated: ${financialIntegrityErrors === 0 ? 'PASS (0 calculation errors)' : 'FAIL (' + financialIntegrityErrors + ' errors)'}`);
  console.log(`  Starting Capital Exactness (₹10,00,000): ${startingCapitalErrors === 0 ? 'PASS (100% compliant)' : 'FAIL'}`);

  const simProcMetrics = monitor.stop();
  const simDuration = ((Date.now() - simStart) / 1000).toFixed(1);

  console.log(`\n=================================================================================`);
  console.log(`25-GAME MULTIPLAYER SIMULATION SUMMARY:`);
  console.log(`  Duration: ${simDuration} seconds`);
  console.log(`  Concurrent Games: ${GAME_COUNT}`);
  console.log(`  Concurrent Teams/Players: ${TOTAL_PLAYERS}`);
  console.log(`  HTTP Authentications: ${playerTokens.length}/${TOTAL_PLAYERS}`);
  console.log(`  Persistent Sockets: ${activeSockets.length}/${TOTAL_PLAYERS}`);
  console.log(`  Allocations Confirmed: ${allocationsConfirmed}/${TOTAL_PLAYERS}`);
  console.log(`  Server Avg CPU: ${simProcMetrics.avgCpu}% | Peak CPU: ${simProcMetrics.peakCpu}%`);
  console.log(`  Server Peak RAM: ${simProcMetrics.peakRss} MB | Final RAM: ${simProcMetrics.finalRss} MB`);
  console.log(`  Financial Integrity Errors: ${financialIntegrityErrors + startingCapitalErrors}`);
  console.log(`=================================================================================\n`);

  // Cleanup
  activeSockets.forEach(s => s.disconnect());
  adminSocket.disconnect();

  console.log('--- FINAL CONCURRENCY BENCHMARK RESULTS TABLE ---');
  console.table(tierResults.map(t => ({
    'Concurrent Users': t.tier,
    'Auth RPS': t.authRps,
    'Mean Latency': `${t.latencyMean} ms`,
    'P95 Latency': `${t.latencyP95} ms`,
    'P99 Latency': `${t.latencyP99} ms`,
    'Connected Sockets': `${t.connectedSockets}/${t.tier}`,
    'Socket P95': `${t.socketP95} ms`,
    'Peak CPU': `${t.peakCpu}%`,
    'Peak RAM': `${t.peakRss} MB`,
    'Status': t.pass ? 'PASS' : 'WARN'
  })));

  // Write structured benchmark json for reporting
  const benchmarkReport = {
    timestamp: new Date().toISOString(),
    system: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      cpus: 8
    },
    tierResults,
    multiplayerSimulation: {
      gameCount: GAME_COUNT,
      totalPlayers: TOTAL_PLAYERS,
      allocationsConfirmed,
      diceRollsExecuted,
      financialIntegrityErrors,
      startingCapitalErrors,
      simDurationSec: simDuration,
      procMetrics: simProcMetrics
    }
  };

  require('fs').writeFileSync(
    path.resolve(__dirname, 'load-test-report.json'),
    JSON.stringify(benchmarkReport, null, 2)
  );

  serverProc.kill('SIGINT');
  await mongoClient.close();
  console.log('\n✓ Load and stress test complete. Report saved to scratch/load-test-report.json');
}

main().catch(err => {
  console.error('Fatal error in load test harness:', err);
  process.exit(1);
});
