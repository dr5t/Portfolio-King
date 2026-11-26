# Portfolio King — Event Setup Guide

Portfolio King is a browser-based multiplayer event application with an Angular 8 client and a Node.js/Express + Socket.IO server. MongoDB stores game data.

This guide describes how to run the application on **one host computer and up to 10 client computers on the same local network (LAN)**.

> **Important:** The host computer runs the backend and MongoDB. The 10 client computers open the frontend in a browser. Do not run a separate backend or MongoDB instance on every client.

## 1. Project structure

```text
Portfolio King/
├── portfolio-king/          # Angular frontend
└── portfolio-king-server/   # Node.js / Express / Socket.IO backend
```

## 2. Network arrangement

- **Host computer:** Runs MongoDB, the Node.js backend, and the Angular frontend.
- **Client computers (up to 10):** Connect to the host computer using its LAN IPv4 address.
- All computers must be connected to the same Wi-Fi network or wired LAN.
- The host computer should preferably use Ethernet and have a reserved/static LAN IP for the event.

Example only — replace `192.168.1.50` with the host computer's actual IPv4 address:

| Service | Host address | Port |
|---|---|---:|
| Angular frontend | `http://192.168.1.50:4200` | 4200 |
| Node.js API and Socket.IO | `http://192.168.1.50:3000` | 3000 |
| MongoDB | Host computer only (`127.0.0.1`) | 27017 |

**Never configure client browsers to connect directly to MongoDB.** Only the backend should access the database.

## 3. Host computer requirements

Install the following on the host computer:

- Windows 10/11 (or another OS capable of running the project)
- Node.js and npm
- MongoDB Community Server, with the MongoDB service running
- The project source code and its npm dependencies
- A modern browser for testing

The project uses an older Angular 8 / Webpack 4 toolchain. On the currently tested Node.js 26 setup, the frontend may require the OpenSSL compatibility option shown below. For a stable event setup, test the exact Node.js version and dependencies in advance; do not upgrade Angular or major dependencies immediately before the event.

## 4. One-time host configuration

### 4.1 Find the host computer's LAN IP address

On the host computer, open PowerShell:

```powershell
ipconfig
```

Find the active Wi-Fi or Ethernet adapter and note its **IPv4 Address**, for example `192.168.1.50`. Do not use `127.0.0.1` or `localhost` in the client-facing URLs.

### 4.2 Configure the frontend API and Socket.IO address

In the Angular project, update both locations:

1. `portfolio-king/src/environments/environment.ts`
2. `portfolio-king/src/app/services/portfolio/portfolio.service.ts`

Set the API endpoint and the Socket.IO service URL to the host computer's LAN IP:

```ts
http://192.168.1.50:3000
```

Replace the example IP with the actual host IPv4 address. In `environment.ts`, update the `endpoint` value. In `portfolio.service.ts`, update the `private url` value used by Socket.IO.

Do not use `localhost` in these two frontend settings for multi-computer access: on a client computer, `localhost` means that client computer itself.

### 4.3 Allow the backend to accept LAN connections

The Node.js server must listen on all network interfaces, not only `127.0.0.1`.

Find the server's listen configuration in `portfolio-king-server/index.js`. If it currently binds to `127.0.0.1` or `localhost`, change the bind host to `0.0.0.0`. For example:

```js
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
});
```

Use the equivalent change if the project calls `app.listen(...)` instead of `server.listen(...)`. Keep the port as `3000` unless you also update the frontend URLs.

`0.0.0.0` is the server bind address. Clients must still use the host computer's actual LAN IPv4 address.

### 4.4 Allow the Angular development server to accept LAN connections

The Angular server must bind to all interfaces. From the frontend folder, run it with:

```powershell
ng serve --host 0.0.0.0 --port 4200 --disable-host-check
```

This is suitable for a controlled local event network. It is a development server, not a hardened production deployment. Do not expose it to the public internet.

### 4.5 Configure Windows Firewall

On the host computer, allow inbound TCP connections on:

- TCP 3000 — Node.js API and Socket.IO
- TCP 4200 — Angular frontend

Use Windows Defender Firewall to create inbound rules restricted to the **Private** network profile where possible. Do not open MongoDB port 27017 to client computers.

## 5. Install dependencies

Open PowerShell in the project root.

Backend:

```powershell
cd "G:\Portfolio King\portfolio-king-server"
npm install
```

Frontend:

```powershell
cd "G:\Portfolio King\portfolio-king"
npm install
```

Run `npm install` before the event, not while participants are waiting. Preserve the project's lockfiles if present.

## 6. Start the application on event day

Start MongoDB first and confirm its Windows service is running.

### Terminal 1 — Backend

```powershell
cd "G:\Portfolio King\portfolio-king-server"
node index.js
```

Keep this terminal open. The backend should report that it is listening on port 3000 and connected to MongoDB.

### Terminal 2 — Frontend

```powershell
cd "G:\Portfolio King\portfolio-king"
$env:NODE_OPTIONS="--openssl-legacy-provider"
npm start -- --host 0.0.0.0 --port 4200 --disable-host-check
```

Keep this terminal open. The OpenSSL option is a workaround for the legacy Angular/Webpack build on Node.js versions that produce the OpenSSL error. If the project start script already supplies host/port options, avoid duplicating them.

### On each client computer

Connect to the same LAN, open Chrome/Edge/Firefox, and visit:

```text
http://HOST-LAN-IP:4200
```

For example:

```text
http://192.168.1.50:4200
```

Use the same host IP on all 10 client computers.

## 7. Pre-event connectivity checks

From a client computer, test the frontend URL in a browser:

```text
http://HOST-LAN-IP:4200
```

Then test the backend API in a browser or PowerShell:

```text
http://HOST-LAN-IP:3000/games
```

A response from the backend confirms that the client can reach the API. If either address cannot be reached:

1. Confirm both computers are on the same network.
2. Check that the backend and frontend terminals are still running.
3. Verify that the frontend URLs use the host LAN IP, not `localhost`.
4. Verify the backend is listening on `0.0.0.0`.
5. Check the host firewall rules for TCP 3000 and 4200.
6. Check that the host IP has not changed.

## 8. Database and event data

- MongoDB database name: `portfolio`
- MongoDB connection used by the backend: `mongodb://127.0.0.1:27017/portfolio`
- Game documents are stored in the `games` collection.
- The backend's create-game route is a POST endpoint (`/create-game`).
- The games list endpoint is `/games`; the project also defines `/get-all-games`.

Create and test the required game records before participants arrive. The repository did not include a verified production database backup or complete seed-data file at the time this guide was prepared. Do not assume that a fresh MongoDB installation contains the event's game data.

Back up the `portfolio` database before the event and after the event. Do not delete or reset the database during the event.

## 9. Event-day checklist

- [ ] Host computer is connected to power and the event LAN.
- [ ] Host computer's LAN IP is recorded and remains unchanged.
- [ ] MongoDB service is running.
- [ ] Backend is running and connected to MongoDB.
- [ ] Backend is reachable from a client on port 3000.
- [ ] Frontend is running and reachable from a client on port 4200.
- [ ] Both frontend API and Socket.IO URLs use the host LAN IP.
- [ ] Windows Firewall allows TCP 3000 and 4200 on the private network.
- [ ] All 10 client computers can open the application.
- [ ] Admin login has been tested.
- [ ] Player login has been tested on more than one client simultaneously.
- [ ] Game creation, joining, and the complete event workflow have been tested.
- [ ] Database backup has been taken.
- [ ] Host computer will not sleep, restart, or change networks during the event.

## 10. Important limitations and security notes

- This setup is intended for a trusted, isolated event LAN, not public internet deployment.
- The current project uses legacy Angular 8 and older dependencies. Avoid untested dependency upgrades before the event.
- The existing login implementation should be reviewed before use with real credentials. In particular, credentials sent in URL query parameters can appear in browser history and server logs. Replace this with secure authentication before production/public deployment.
- Do not share MongoDB port 27017 with client computers.
- Keep the host computer running for the full event. If it shuts down, all clients lose access.
- The Angular development server is convenient for testing. For a longer-term or public deployment, build and serve the frontend through a properly configured production web server with HTTPS and hardened authentication.
