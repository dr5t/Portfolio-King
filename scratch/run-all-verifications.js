const { spawn, execSync } = require('child_process');
const http = require('http');
const path = require('path');
const { MongoClient } = require('../portfolio-king-server/node_modules/mongodb');

const TEST_DB = 'portfolio_e2e_verify';
const MONGO_URI = `mongodb://127.0.0.1:27017/${TEST_DB}`;
const PORT = 3000;

function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function ping() {
      http.get(url, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 400) {
          resolve();
        } else {
          check();
        }
      }).on('error', () => {
        check();
      });
    }

    function check() {
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Timeout waiting for ${url}`));
      } else {
        setTimeout(ping, 400);
      }
    }

    ping();
  });
}

async function run() {
  console.log('================================================================');
  console.log('   PORTFOLIO KING COMPLETE REAL-TIME & ENGINE AUDIT RUNNER');
  console.log('================================================================\n');

  // Step 0: Ensure database is clean
  console.log('[Setup] Connecting to MongoDB and dropping existing test database if present...');
  const client = await MongoClient.connect('mongodb://127.0.0.1:27017', { useUnifiedTopology: true });
  await client.db(TEST_DB).dropDatabase();
  console.log(`[Setup] Database "${TEST_DB}" ready and clean.\n`);

  // Step 1: Start Portfolio King Express + Socket.IO Server
  console.log('[Step 1] Starting Portfolio King server with isolated test database...');
  const serverEnv = {
    ...process.env,
    PORT: String(PORT),
    DB_NAME: TEST_DB,
    MONGODB_URI: MONGO_URI,
    ADMIN_USERNAME: 'admin',
    ADMIN_PASSWORD: 'admin@1234'
  };

  const serverProc = spawn(process.execPath, [path.resolve(__dirname, '../portfolio-king-server/index.js')], {
    env: serverEnv,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  serverProc.stdout.on('data', data => {
    const msg = data.toString().trim();
    if (msg.includes('App is listening') || msg.includes('Connected to MongoDB') || msg.includes('Error')) {
      console.log(`  [Server stdout] ${msg}`);
    }
  });

  serverProc.stderr.on('data', data => {
    console.error(`  [Server stderr] ${data.toString().trim()}`);
  });

  try {
    await waitForServer(`http://127.0.0.1:${PORT}/login`);
    console.log(`✓ Server ready and accepting connections at http://127.0.0.1:${PORT}\n`);

    // Step 2: Financial Engine Calculations Regression
    console.log('[Step 2] Running Financial Calculation Engine Regression Suite...');
    execSync(`node "${path.resolve(__dirname, 'test-financial-calculations.js')}"`, { stdio: 'inherit' });
    console.log('✓ Financial calculations verified.\n');

    // Step 3: Security & Authentication System Tests
    console.log('[Step 3] Running Authentication & Persistent Session Test Suite...');
    execSync(`node "${path.resolve(__dirname, 'test-auth-system.js')}"`, {
      env: { ...serverEnv },
      stdio: 'inherit'
    });
    console.log('✓ Security and persistent session tests passed.\n');

    // Step 4: 5-Context Real-Time Multiplayer Puppeteer E2E
    console.log('[Step 4] Running 5-Context Real-Time Multiplayer Puppeteer E2E (Admin + 4 Teams)...');
    execSync(`node "${path.resolve(__dirname, 'run-e2e-auth-multiplayer.js')}"`, {
      env: { ...serverEnv },
      stdio: 'inherit'
    });
    console.log('✓ 5-Context real-time multiplayer E2E test passed successfully.\n');

    console.log('================================================================');
    console.log('   ALL REAL-TIME INTEGRITY & ENGINE VERIFICATIONS PASSED 100%!');
    console.log('================================================================');
  } catch (err) {
    console.error('\n❌ VERIFICATION RUN FAILED:', err);
    process.exitCode = 1;
  } finally {
    console.log('\n[Teardown] Shutting down test server...');
    serverProc.kill('SIGTERM');
    await new Promise(r => setTimeout(r, 1000));
    try {
      await client.db(TEST_DB).dropDatabase();
      console.log(`[Teardown] Database "${TEST_DB}" dropped successfully.`);
      await client.close();
    } catch (e) {
      // ignore
    }
    console.log('[Teardown] Complete.');
  }
}

run();
