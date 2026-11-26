# Portfolio King — Professional Financial Strategy Simulation Platform

[![Node.js](https://img.shields.io/badge/Node.js-14%2B%20%2F%2018%2B%20LTS-brightgreen.svg)](https://nodejs.org/)
[![Angular](https://img.shields.io/badge/Angular-8.2.14-red.svg)](https://angular.io/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-Realtime%20Engine-black.svg)](https://socket.io/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas%20Ready-green.svg)](https://www.mongodb.com/)
[![License](https://img.shields.io/badge/License-Proprietary-blue.svg)]()

**Portfolio King** is a high-fidelity, real-time multiplayer financial strategy simulation and educational platform designed for business schools, trading competitions, and finance workshops. Teams compete in an 8-quarter economic cycle, managing asset allocation, risk exposure, credit facilities, and peer fund-of-funds (FOF) co-investments against dynamic macroeconomic conditions.

---

## 1. Visual Identity & Design System

The application implements a fintech-grade visual architecture designed to prioritize financial data clarity, analytical density, and distraction-free usability.

### Color Palette Specification

| Token | Hex Value | Semantic Usage |
|:---|:---|:---|
| **Background** | `#F5F5F3` | Primary application canvas, split login background |
| **Surface** | `#FFFFFF` | Table cards, active modals, form controls, metric cards |
| **Text Primary** | `#171717` | High-contrast headers, financial values, active labels |
| **Text Muted** | `#666666` | Supporting labels, column headers, timestamps, secondary metrics |
| **Borders** | `#DDDDDA` | Subtle hairline dividers, table borders, input strokes |
| **Profit** | `#176B45` | Positive alpha, quarterly gains, running session indicator |
| **Loss** | `#B42318` | Negative returns, debt indicators, error banners, delete actions |
| **Winner / Gold** | `#A18440` | Leaderboard trophies, champion highlights, champagne gold accents |
| **Sidebar / Action**| `#202123` | Charcoal sidebar background, primary submit buttons, active tabs |

### Design Standards & Constraints

- **Restrained Geometric Radius**: Strictly bounded to 3px–6px (`--radius-sm: 4px`, `--radius-md: 5px`, `--radius-lg: 6px`).
- **Financial Typography**: Native `Inter` sans-serif font paired with CSS `font-variant-numeric: tabular-nums` to guarantee vertical number alignment across all dynamic tables and tickers.
- **Zero Decorative Noise**: Strictly eliminates blue/purple gradients, neon glows, glassmorphism, floating blur blobs, and extraneous emoji glyphs in favor of clean inline SVGs.
- **Original Brand Assets**: Official Portfolio King crown with upward market arrow vector preserved across favicon, login hero, header, and loading sequences.

---

## 2. Core Functional Modules

### A. Admin Session & Roster Management
- **Centralized Game Control**: Create, monitor, pause, resume, duplicate, and archive simulation sessions.
- **Automated Credential Engine**: Auto-generate cryptographically secure Team IDs (e.g., `G25-T1-3A65`) and 8-character high-entropy passwords with one-click clipboard export.
- **Team Administration**: Rename active teams, toggle account statuses (active/disabled), reset passwords on the fly, and delete teams safely before gameplay commences.
- **Permanent Session Deletion Guard**: Protected deletion flow requiring exact game name confirmation to prevent accidental loss of tournament data.

### B. Player Authentication & Access Control
- **Mandatory Team Authentication**: Restricts player entry to verified Team ID and Password credentials validated against MongoDB. Unregistered usernames are strictly blocked.
- **Game-Level Isolation**: Enforces game isolation—teams cannot enter games to which they are not explicitly assigned.
- **Session Single-Instance Guard**: Prevents concurrent duplicate logins from separate browsers while allowing legitimate page reloads and network reconnections.
- **Real-Time Error Alerting**: Context-aware alert banners for invalid credentials, disabled teams, full rooms, or server timeouts.

### C. Financial Simulation Engines
- **Asset Classes & Risk Tiers**:
  - *Bank Fixed Deposit*: Guaranteed capital preservation at 6.20% fixed return.
  - *Government Bonds*: Low-volatility sovereign debt yielding 4.00% – 9.00%.
  - *Corporate Bonds*: Investment-grade corporate credit yielding 5.00% – 12.00%.
  - *Large Cap Equities*: Established blue-chip equities yielding 8.00% – 14.00%.
  - *Mid Cap & Small Cap Equities*: Growth-oriented high-beta equities with market-dependent upside.
  - *Gold ETF / Real Estate (REIT)*: Commodity and tangible asset hedges.
- **Credit & Debt Facility**:
  - Up to ₹5,00,000 in credit facilities at 10.00% p.a.
  - Mathematically precise quarterly EMI amortization using standard financial equations:
    $$\text{PMT} = P \cdot \frac{r(1+r)^n}{(1+r)^n - 1}$$
    $$\text{PPMT}_t = \text{PMT} - (B_{t-1} \cdot r)$$
- **Fund of Funds (FOF) Co-Investment**:
  - Syndicate capital into competing teams' strategies with a standard 2.00% management fee deduction.
- **Market Roll Engine**:
  - Quarterly dice rolls model macroeconomic volatility, shifting asset returns based on probabilistic market conditions.

### D. Analytics, Standings & Reporting
- **Live Leaderboard**: Real-time ranking based on net asset value (NAV), total portfolio valuation, and outstanding liabilities.
- **Formula-Sanitized CSV Export**: Downloadable tournament summaries with automatic spreadsheet formula injection protection.

---

## 3. Security Architecture & Hardening

1. **High-Entropy Password Hashing & PBKDF2 Upgrade**:
   - Modern accounts are hashed using asynchronous PBKDF2-HMAC-SHA256 with **600,000 iterations**, a 32-byte cryptographically secure random salt, and 64-byte derived key (`pbkdf2$600000$<saltHex>$<hashHex>`).
   - Constant-time verification using `crypto.timingSafeEqual()` eliminates timing attacks.
   - Transparent zero-downtime auto-migration: legacy password hashes are automatically upgraded to `pbkdf2$600000$` on successful login without requiring credential resets.
2. **Session Lifecycle & Duplicate Protection**:
   - Ephemeral Bearer session tokens with server-side revocation on logout (`/logout`), team disabling, deletion, or password reset.
   - Active WebSocket connections are automatically terminated when an account is disabled or deleted.
   - Concurrent duplicate login prevention returns HTTP 409 `Team already connected.` while allowing seamless reconnection on network drops.
3. **NoSQL Injection Shield & Input Sanitization**:
   - Strict string type guards and MongoDB `ObjectID.isValid()` validation on all dynamic parameters (`req.params.id`, `req.body.gameId`).
4. **CSV Formula Injection Mitigation**:
   - All exported CSV cells starting with formula trigger characters (`=`, `+`, `-`, `@`, `\t`, `\r`) are automatically neutralized with leading single quotes.
5. **Modern HTTP Security Headers**:
   - `Content-Security-Policy`: Restricts scripts, styles, fonts, and connects to sanctioned origins.
   - `Strict-Transport-Security` (HSTS): Enforced when HTTPS is active (`max-age=31536000; includeSubDomains; preload`).
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: SAMEORIGIN`
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - Deprecated `X-XSS-Protection` header removed per modern W3C security standards.
6. **Production Startup Credentials Check**:
   - In `production` mode (`NODE_ENV=production`), the server verifies that `ADMIN_USERNAME` and `ADMIN_PASSWORD` are explicitly defined, not default (`admin`), and meet minimum security length requirements (>= 8 chars), rejecting startup if insecure.
7. **Turn & Identity Enforcement**:
   - Socket handlers (`dice-rolled`, `player-ready`, `game-start`) verify socket user session, current turn order, and game assignment before executing state mutations.
   - Idempotency guards in `player-ready` prevent duplicate capital submissions.
8. **Graceful Server Shutdown**:
   - Handles `SIGTERM` and `SIGINT` signals to close active HTTP connections and database clients cleanly without dropping transactions.

---

## 4. Local Setup & Installation

### Prerequisites
- **Node.js**: v14.x or v18.x LTS
- **npm**: v6.x or v9.x+
- **MongoDB**: Local MongoDB instance (`mongodb://localhost:27017`) or MongoDB Atlas connection string.

### 1. Clone & Install Dependencies
```bash
# Clone the repository
git clone <repository-url>
cd "Portfolio king"

# Install root dependencies
npm install

# Install server dependencies
cd portfolio-king-server && npm install && cd ..

# Install frontend dependencies
cd portfolio-king && npm install && cd ..
```

### 2. Environment Configuration
Create a `.env` file in `portfolio-king-server/` (or set environment variables in your deployment environment):
```ini
PORT=3000
HOST=0.0.0.0
MONGODB_URI=mongodb://localhost:27017/portfolio
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin
```

### 3. Build & Run Locally
```bash
# Compile Angular frontend
npm run build:client

# Start backend server
npm start
```

Access the application at `http://localhost:3000`.

---

## 5. Deployment Guide (Render & Cloud)

### One-Command Full-Stack Deployment
The root `package.json` is configured for seamless deployment on platforms like **Render**, **Railway**, or **Heroku**:

- **Build Command**:
  ```bash
  cd portfolio-king && npm install && NODE_OPTIONS="--openssl-legacy-provider" npm run build && cd ../portfolio-king-server && npm install
  ```
- **Start Command**:
  ```bash
  npm start
  ```

### Render Configuration Steps
1. Create a new **Web Service** on Render.
2. Connect your Git repository.
3. Configure the environment:
   - **Environment**: `Node`
   - **Build Command**: `cd portfolio-king && npm install && NODE_OPTIONS="--openssl-legacy-provider" npm run build && cd ../portfolio-king-server && npm install`
   - **Start Command**: `npm start`
4. Under **Environment Variables**, configure:
   - `MONGODB_URI`: Your MongoDB Atlas connection URI (`mongodb+srv://...`).
   - `ADMIN_USERNAME`: Your custom admin username (min 8 chars in production).
   - `ADMIN_PASSWORD`: Your high-security admin password (min 8 chars in production).
   - `NODE_OPTIONS`: `--openssl-legacy-provider` (for OpenSSL compatibility with Angular 8 CLI).

---

## 6. Testing & Quality Assurance

The application includes automated test suites covering financial calculations, viewport responsiveness, REST authentication, team credential workflows, NoSQL security, and headless browser multiplayer sessions.

```bash
# 1. Run core financial calculation regressions (PMT, PPMT, IPMT, FOF fee, Bank FD, Dice model)
node scratch/test-financial-calculations.js

# 2. Run responsive viewport tests across 10 distinct standard viewports (320px to 1920px)
node scratch/test-viewports-responsiveness.js

# 3. Run backend authentication, PBKDF2 hash migration, and security unit tests
node scratch/test-auth-system.js

# 4. Run full end-to-end 4-team multiplayer browser simulation
node scratch/run-e2e-auth-multiplayer.js
```

All test suites validate 100% test pass rates across invalid credentials, disabled account states, duplicate connection rejections, live gameplay rounds, and final leaderboard standings.
