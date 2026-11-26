# Portfolio King — 10-System Event Requirements

## 1. Deployment model

The recommended arrangement is **one host computer + up to 10 client computers**.

| Computer | Role | What runs on it |
|---|---|---|
| Host (1) | Central server | MongoDB, Node.js backend, Angular frontend |
| Client 1–10 | Participants/admin | Web browser only |

Do not install or run MongoDB and the Node.js backend separately on each client.

## 2. Hardware requirements

These are practical planning recommendations, not measured capacity guarantees. Test the full application with 10 simultaneous users before the event.

| Component | Minimum recommended | Preferred |
|---|---|---|
| Host CPU | 4-core modern Intel/AMD processor | 6-core or better |
| Host RAM | 8 GB | 16 GB |
| Host storage | 10 GB free SSD space, plus database/backup space | 20 GB+ free SSD space |
| Host network | 100 Mbps Ethernet or reliable Wi-Fi | Gigabit Ethernet |
| Each client CPU | Modern dual-core processor | Modern 4-core processor |
| Each client RAM | 4 GB | 8 GB |
| Each client display | 1366 × 768 | 1920 × 1080 |
| Client browser | Recent Chrome, Edge, or Firefox | Latest stable Chrome or Edge |

For 10 clients, use a reliable router/access point with sufficient capacity. Prefer a wired connection for the host. Avoid a public guest Wi-Fi network or a network that isolates wireless clients from one another.

## 3. Software requirements

### Host computer

- Windows 10/11 64-bit (or a tested equivalent operating system)
- Node.js and npm
- MongoDB Community Server
- Git (recommended)
- Modern browser for local testing
- Project source folders:
  - `portfolio-king`
  - `portfolio-king-server`

The frontend is Angular 8.2.2 and uses an older Webpack toolchain. The current development environment may need:

```powershell
$env:NODE_OPTIONS="--openssl-legacy-provider"
```

Set up and test a compatible Node.js version before event day. Do not perform major framework or dependency upgrades immediately before the event.

### Client computers

- Windows 10/11, macOS, or Linux
- Updated Chrome, Edge, or Firefox
- Network access to the host computer
- No Node.js or MongoDB installation required
- No project source-code installation required

## 4. Network requirements

All 11 computers (one host plus 10 clients) must be on the same LAN/subnet, with client-to-host communication permitted.

Use a reserved/static IP for the host computer. Example only:

| Service | Host address example | TCP port | Client access |
|---|---|---:|---|
| Angular frontend | `http://192.168.1.50:4200` | 4200 | Yes |
| Node.js API + Socket.IO | `http://192.168.1.50:3000` | 3000 | Yes |
| MongoDB | `127.0.0.1:27017` on host | 27017 | No |

Replace `192.168.1.50` with the host's actual LAN IPv4 address.

### Firewall

Allow inbound TCP ports **3000** and **4200** on the host computer, preferably only on the Windows Private network profile.

Do **not** open port 27017 to the client computers or the wider network. MongoDB should remain accessible only to the backend on the host.

### Required server configuration

1. In `portfolio-king-server/index.js`, configure the Node.js HTTP server to listen on `0.0.0.0` at port `3000`, rather than only `127.0.0.1`.
2. In `portfolio-king/src/environments/environment.ts`, set the API endpoint to `http://HOST-LAN-IP:3000`.
3. In `portfolio-king/src/app/services/portfolio/portfolio.service.ts`, set the Socket.IO URL to `http://HOST-LAN-IP:3000`.
4. Start Angular with `--host 0.0.0.0 --port 4200`.

`0.0.0.0` is used only as the server's bind address. Client browsers must use the host's actual LAN IP address.

## 5. Ports and access summary

| Port | Protocol | Purpose | Must clients reach it? |
|---:|---|---|---|
| 3000 | TCP | Node.js API and Socket.IO | Yes |
| 4200 | TCP | Angular frontend | Yes |
| 27017 | TCP | MongoDB | No |

## 6. Event preparation and testing

Complete these tasks at least one day before the event:

- [ ] Install dependencies on the host computer.
- [ ] Start MongoDB and verify the backend connects.
- [ ] Configure the host LAN IP in both frontend URL settings.
- [ ] Configure the backend to listen on `0.0.0.0`.
- [ ] Configure Windows Firewall for TCP 3000 and 4200.
- [ ] Start the backend and frontend.
- [ ] Open the application from a separate client computer.
- [ ] Test the admin login.
- [ ] Test player login from at least two different client computers.
- [ ] Test all event workflows with 10 simultaneous client sessions.
- [ ] Check that game state updates correctly across clients.
- [ ] Check that Socket.IO connections remain active.
- [ ] Take a MongoDB backup and verify that it can be restored.
- [ ] Keep a spare client computer or replacement browser/device available if possible.

## 7. Event-day operating requirements

- Keep the host computer connected to power.
- Disable sleep/hibernation for the duration of the event.
- Do not close the backend or frontend terminal windows.
- Do not restart the host or router during the event.
- Do not change the host's IP address or Wi-Fi network.
- Keep the MongoDB service running.
- Keep a copy of the database backup separate from the host computer.

## 8. Important security note

The existing application is an older development project. Its login route currently sends credentials as URL query parameters and contains a hardcoded Admin credential check. This is not suitable for a public or untrusted network. For the event, use only a trusted private LAN and review/change the authentication implementation before using real credentials. Do not reuse a personal password as an event password.

## 9. Items to confirm before final deployment

- [ ] Actual host LAN IPv4 address: ____________________
- [ ] Router/access point tested with 11 devices: ____________________
- [ ] Admin account tested: ____________________
- [ ] Number of game records prepared: ____________________
- [ ] Database backup location: ____________________
- [ ] Event coordinator / technical support contact: ____________________
