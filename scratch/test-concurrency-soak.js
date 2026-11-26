const http = require('http');
const { spawn } = require('child_process');
const { monitorEventLoopDelay } = require('perf_hooks');
const { MongoClient } = require('../portfolio-king-server/node_modules/mongodb');
const { io } = require('../portfolio-king/node_modules/socket.io-client');

const PORT = 3015;
const DB_NAME = 'portfolio_soak_test';
const MONGO_URI = 'mongodb://127.0.0.1:27017/' + DB_NAME;

function req(options, data) {
  return new Promise((resolve) => {
    const start = process.hrtime.bigint();
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
        const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
        let json = null;
        try { json = JSON.parse(b); } catch (_) {}
        resolve({ status: res.statusCode, body: b, json, durationMs });
      });
    });
    r.on('error', err => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      resolve({ status: 0, error: err.message, durationMs });
    });
    if (postData) r.write(postData);
    r.end();
  });
}

function calculatePercentiles(values) {
  if (!values.length) return { mean: 0, median: 0, p95: 0, p99: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const p = (pct) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * pct))];
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    mean: Number((sum / sorted.length).toFixed(1)),
    median: Number(p(0.50).toFixed(1)),
    p95: Number(p(0.95).toFixed(1)),
    p99: Number(p(0.99).toFixed(1))
  };
}

async function run() {
  console.log('================================================================');
  console.log('   PORTFOLIO KING ADVANCED CONCURRENCY & SOAK TEST SUITE');
  console.log('================================================================\n');

  const elDelay = monitorEventLoopDelay({ resolution: 20 });
  elDelay.enable();

  const TEST_PASS = process.env.TEST_ADMIN_PASS || 'pk-audit-test-pass';
  // Start isolated backend with expanded libuv thread pool
  const server = spawn('node', ['index.js'], {
    cwd: './portfolio-king-server',
    env: {
      ...process.env,
      PORT: String(PORT),
      MONGO_URL: MONGO_URI,
      ADMIN_USERNAME: 'admin',
      ADMIN_PASSWORD: TEST_PASS,
      UV_THREADPOOL_SIZE: '16'
    }
  });

  server.stdout.on('data', d => {
    const s = d.toString();
    if (s.includes('Error') || s.includes('Exception')) console.error('[Server Error]', s.trim());
  });

  await new Promise(r => setTimeout(r, 1500));

  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  // Authenticate Admin
  const adminLogin = await req({ path: '/login', method: 'POST' }, {
    userType: 'Admin',
    username: 'admin',
    password: TEST_PASS
  });
  const adminToken = adminLogin.json.token;

  console.log('[Phase 1] 200-User Concurrency Investigation & Verification...');
  console.log('  Generating 50 tournament games and 200 unique teams...');
  const teams = [];
  for (let g = 0; g < 50; g++) {
    const gRes = await req({
      path: '/create-game',
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + adminToken }
    }, { name: 'Tier200-G' + (g + 1) });
    const gId = gRes.json.ops ? gRes.json.ops[0]._id : gRes.json._id;
    const tRes = await req({
      path: '/api/teams/generate-all',
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + adminToken }
    }, { gameId: gId });
    if (tRes.json && tRes.json.teams) {
      tRes.json.teams.forEach(t => teams.push({ teamId: t.teamId, password: t.rawPassword, gameId: gId }));
    }
  }

  console.log(`  ✓ Successfully generated ${teams.length} teams.`);
  console.log('  Firing 200 simultaneous authenticated login requests...');

  const authStart = Date.now();
  const authPromises = teams.map(t => {
    return req({ path: '/login', method: 'POST' }, {
      userType: 'Player',
      username: t.teamId,
      password: t.password
    }).then(res => ({ ...res, team: t }));
  });

  const authResults = await Promise.all(authPromises);
  const authDurationMs = Date.now() - authStart;
  const authDurSec = authDurationMs / 1000;
  const authRps = Number((teams.length / authDurSec).toFixed(1));

  let successfulAuth = 0;
  let failedAuth = 0;
  const failureBreakdown = {};
  const latencies = [];

  authResults.forEach(r => {
    latencies.push(r.durationMs);
    if (r.status === 200 && r.json && r.json.token) {
      successfulAuth++;
    } else {
      failedAuth++;
      const reason = `${r.status}: ${r.body || r.error}`;
      failureBreakdown[reason] = (failureBreakdown[reason] || 0) + 1;
    }
  });

  const pcts = calculatePercentiles(latencies);
  console.log(`\n  --- 200-User Results ---`);
  console.log(`  Total Requests: ${teams.length}`);
  console.log(`  Successful (HTTP 200): ${successfulAuth} (${((successfulAuth / teams.length) * 100).toFixed(1)}%)`);
  console.log(`  Failed: ${failedAuth}`);
  if (failedAuth > 0) {
    console.log('  Failure Reasons:', JSON.stringify(failureBreakdown, null, 2));
  }
  console.log(`  Throughput: ${authRps} req/sec`);
  console.log(`  Latency: Mean=${pcts.mean}ms, P50=${pcts.median}ms, P95=${pcts.p95}ms, P99=${pcts.p99}ms`);

  // [Phase 2] Spike Test (0 -> 50 -> 150 -> 300 -> 50)
  console.log('\n[Phase 2] Controlled Spike Testing (Dynamic Load Transients)...');
  const spikeBatches = [50, 150, 300, 50];
  for (const spikeSize of spikeBatches) {
    console.log(`  Spiking with ${spikeSize} concurrent requests...`);
    const spikeSubset = [];
    for (let i = 0; i < spikeSize; i++) {
      spikeSubset.push(teams[i % teams.length]);
    }
    const spStart = Date.now();
    const spikeRes = await Promise.all(spikeSubset.map(t => {
      return req({ path: '/login', method: 'POST' }, {
        userType: 'Player',
        username: t.teamId,
        password: t.password
      });
    }));
    const spDur = (Date.now() - spStart) / 1000;
    const okCount = spikeRes.filter(r => r.status === 200).length;
    console.log(`    Batch ${spikeSize}: ${okCount}/${spikeSize} passed in ${spDur.toFixed(2)}s (${(spikeSize / spDur).toFixed(1)} RPS)`);
    await new Promise(r => setTimeout(r, 400));
  }

  // [Phase 3] Sustained Soak Test (Continuous active cycles to audit memory, event loop, and handle leaks)
  console.log('\n[Phase 3] Sustained Soak Testing & Resource Leak Audit...');
  const initialMem = process.memoryUsage();
  console.log(`  Initial Client Memory: RSS=${(initialMem.rss / 1048576).toFixed(1)}MB, Heap=${(initialMem.heapUsed / 1048576).toFixed(1)}MB`);

  const soakCycles = 60;
  console.log(`  Running ${soakCycles} sustained operational cycles under continuous load...`);

  let soakErrors = 0;
  for (let c = 1; c <= soakCycles; c++) {
    // Pick 10 teams and perform session operations + database queries
    const activeBatch = teams.slice(0, 10);
    const cycleRes = await Promise.all(activeBatch.map(t => {
      return req({ path: '/login', method: 'POST' }, {
        userType: 'Player',
        username: t.teamId,
        password: t.password
      });
    }));

    const cycleFailed = cycleRes.filter(r => r.status !== 200).length;
    if (cycleFailed > 0) soakErrors += cycleFailed;

    if (c % 15 === 0 || c === soakCycles) {
      const activeSessionsCount = await db.collection('sessions').countDocuments({});
      const dbTeamsCount = await db.collection('teams').countDocuments({});
      console.log(`    Cycle ${c}/${soakCycles}: Sessions in DB=${activeSessionsCount}, Teams in DB=${dbTeamsCount}`);
    }
    await new Promise(r => setTimeout(r, 100));
  }

  const finalMem = process.memoryUsage();
  elDelay.disable();
  const elMeanMs = (elDelay.mean / 1e6).toFixed(2);
  const elMaxMs = (elDelay.max / 1e6).toFixed(2);
  const elP95Ms = (elDelay.percentile(95) / 1e6).toFixed(2);

  console.log(`\n  --- Soak & Health Audit Summary ---`);
  console.log(`  Soak Cycles Completed: ${soakCycles} with ${soakErrors} failures`);
  console.log(`  Client RSS Growth: ${((finalMem.rss - initialMem.rss) / 1048576).toFixed(2)} MB`);
  console.log(`  Client Heap Growth: ${((finalMem.heapUsed - initialMem.heapUsed) / 1048576).toFixed(2)} MB`);
  console.log(`  Event Loop Delay: Mean=${elMeanMs}ms, P95=${elP95Ms}ms, Max=${elMaxMs}ms`);

  // Cleanup
  console.log('\n[Phase 4] Cleaning Up Isolated Test Resources...');
  await client.db(DB_NAME).dropDatabase();
  await client.close();
  server.kill('SIGKILL');
  console.log('✓ Concurrency and Soak Test Complete.\n');

  const summary = {
    tier200: {
      total: teams.length,
      success: successfulAuth,
      failed: failedAuth,
      rps: authRps,
      latency: pcts
    },
    soak: {
      cycles: soakCycles,
      errors: soakErrors,
      eventLoopMeanMs: parseFloat(elMeanMs),
      eventLoopP95Ms: parseFloat(elP95Ms)
    }
  };
  require('fs').writeFileSync('scratch/concurrency-soak-summary.json', JSON.stringify(summary, null, 2));
}

run().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
