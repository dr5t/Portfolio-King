require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
const http = require('http').createServer(app);
const adminRoutes = require('./routes/admin');
const bodyParser = require('body-parser');
const mongoClient = require('./db/portfolio_db').mongoConnect;
const getDb = require('./db/portfolio_db').getDb;
const ObjectID = require('./db/portfolio_db').ObjectID;
const io = require('./socket').init(http);
const auth = require('./auth');
const formula = require('./formulas/formulas').formulas;
const investmentReturnSheet = require('./investments/investments').investmentReturnSheet;

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (process.env.NODE_ENV === 'production') {
    if (!ADMIN_USERNAME || !ADMIN_PASSWORD || ADMIN_PASSWORD === 'admin' || ADMIN_PASSWORD.length < 8) {
        console.error('FATAL: In production, ADMIN_USERNAME and a strong ADMIN_PASSWORD (min 8 chars, not "admin") must be configured.');
        process.exit(1);
    }
}

const clientDistPath = path.resolve(__dirname, '../portfolio-king/dist/Client');

var users = [];
var games = [];
var investment_seq = ['govt_bond', 'corporate_bond', 'blue_chip', 'mid_cap', 'speculative_stock', 'international_stock', 'US_dollar', 'gold_ETF'];
var diceTimer;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self' ws: wss: http: https:;");
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
        res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

function isValidObjectId(id) {
    return id && typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id);
}

function isSocketConnected(socketId) {
    if (!socketId || !io || !io.sockets) return false;
    if (io.sockets.sockets && typeof io.sockets.sockets.get === 'function') {
        const s = io.sockets.sockets.get(socketId);
        return !!(s && s.connected);
    }
    if (io.sockets.connected && io.sockets.connected[socketId]) {
        return !!io.sockets.connected[socketId].connected;
    }
    return false;
}

function sanitizeCsvValue(val) {
    if (val === null || val === undefined) return '';
    let str = String(val);
    if (/^[=+\-@\t\r]/.test(str)) {
        str = "'" + str;
    }
    return `"${str.replace(/"/g, '""')}"`;
}

app.get('/login', function (req, res) {
    if (fs.existsSync(clientDistPath)) {
        return res.sendFile(path.join(clientDistPath, 'index.html'));
    }
    res.status(404).send('Not Found');
});

app.post('/login', async function (req, res) {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
    const rateCheck = auth.checkRateLimit(ip);
    if (!rateCheck.allowed) {
        return res.status(429).json({ message: 'Too many login attempts. Please try again later.' });
    }

    const { userType, username, password, socketId } = req.body;
    if (userType === 'Admin') {
        if (!username || !password) {
            return res.status(400).json({ message: 'Missing required fields.' });
        }
        if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
            return res.status(500).json({ message: 'Admin credentials not configured on server.' });
        }
        if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
            auth.resetRateLimit(ip);
            const token = auth.createSession({
                role: 'admin',
                userName: ADMIN_USERNAME,
                socketId
            });
            users.forEach(user => {
                if (user.socketId === socketId) {
                    user.type = 'admin';
                    user.name = ADMIN_USERNAME;
                    user.token = token;
                }
            });
            return res.json({
                isAdmin: 'true',
                userName: ADMIN_USERNAME,
                token,
                socketId
            });
        } else {
            auth.recordFailedAttempt(ip);
            return res.status(401).json({ message: 'Invalid Admin ID or Password.' });
        }
    } else if (userType === 'Player') {
        const teamId = (req.body.teamId || username || '').trim();
        if (!teamId || !password) {
            return res.status(400).json({ message: 'Missing required fields.' });
        }
        try {
            const db = getDb();
            const escapedTeamId = teamId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const team = await db.collection('teams').findOne({
                teamId: { $regex: new RegExp('^' + escapedTeamId + '$', 'i') }
            });
            if (!team) {
                auth.recordFailedAttempt(ip);
                return res.status(401).json({ message: 'Invalid Team ID or Password.' });
            }
            if (team.status === 'disabled') {
                return res.status(403).json({ message: 'Team account disabled.' });
            }
            const verification = await auth.verifyPassword(password, team.passwordHash);
            if (!verification.valid) {
                auth.recordFailedAttempt(ip);
                return res.status(401).json({ message: 'Invalid Team ID or Password.' });
            }

            // Auto-rehash if using legacy or outdated algorithm
            if (verification.needsRehash) {
                try {
                    const upgradedHash = await auth.hashPassword(password);
                    await db.collection('teams').updateOne(
                        { _id: team._id },
                        { $set: { passwordHash: upgradedHash, updatedAt: new Date() } }
                    );
                } catch (rehashErr) {
                    console.error('Error auto-migrating password hash:', rehashErr);
                }
            }

            const activeSession = auth.findSessionByTeamId(team.teamId);
            if (activeSession) {
                const isSameSocket = socketId && activeSession.socketId && activeSession.socketId === socketId;
                if (!isSameSocket) {
                    return res.status(409).json({ message: 'Team already connected.' });
                }
            }

            auth.resetRateLimit(ip);
            const token = auth.createSession({
                role: 'player',
                teamId: team.teamId,
                teamName: team.name,
                gameId: team.gameId,
                socketId
            });
            users.forEach(user => {
                if (user.socketId === socketId) {
                    user.type = 'player';
                    user.name = team.name;
                    user.teamId = team.teamId;
                    user.gameId = team.gameId;
                    user.token = token;
                }
            });
            return res.json({
                isPlayer: 'true',
                userName: team.name,
                teamId: team.teamId,
                gameId: team.gameId,
                token,
                socketId
            });
        } catch (err) {
            return res.status(500).json({ message: 'Server unavailable.' });
        }
    } else {
        return res.status(400).json({ message: 'Missing required fields.' });
    }
});

app.get('/api/teams', auth.authenticateAdmin, async function (req, res) {
    try {
        const db = getDb();
        const query = {};
        if (req.query.gameId) {
            query.gameId = String(req.query.gameId);
        }
        const teams = await db.collection('teams').find(query).toArray();
        const sanitized = teams.map(t => {
            const session = auth.findSessionByTeamId(t.teamId);
            const isConnected = !!(session && session.socketId && isSocketConnected(session.socketId));
            return {
                _id: t._id,
                teamId: t.teamId,
                name: t.name,
                gameId: t.gameId,
                status: t.status || 'active',
                isConnected,
                createdAt: t.createdAt
            };
        });
        res.json(sanitized);
    } catch (err) {
        res.status(500).json({ message: 'Server unavailable.' });
    }
});

app.post('/api/teams', auth.authenticateAdmin, async function (req, res) {
    try {
        const { gameId, name } = req.body;
        if (!gameId || !name) {
            return res.status(400).json({ message: 'Missing required fields.' });
        }
        const db = getDb();
        const existingCount = await db.collection('teams').countDocuments({ gameId: String(gameId) });
        if (existingCount >= 4) {
            return res.status(400).json({ message: 'Game already has maximum 4 teams.' });
        }
        let teamId = req.body.teamId ? req.body.teamId.trim().toUpperCase() : null;
        if (!teamId) {
            teamId = auth.generateTeamId(1, existingCount + 1);
        }
        const dup = await db.collection('teams').findOne({ teamId });
        if (dup) {
            return res.status(400).json({ message: `Team ID ${teamId} already exists.` });
        }
        const rawPassword = req.body.password && req.body.password.trim() ? req.body.password.trim() : auth.generatePassword();
        const passwordHash = await auth.hashPassword(rawPassword);
        const newTeam = {
            teamId,
            name: name.trim(),
            passwordHash,
            gameId: String(gameId),
            status: 'active',
            createdAt: new Date(),
            updatedAt: new Date()
        };
        const insertResult = await db.collection('teams').insertOne(newTeam);
        res.json({
            team: {
                _id: insertResult.insertedId,
                teamId: newTeam.teamId,
                name: newTeam.name,
                gameId: newTeam.gameId,
                status: newTeam.status
            },
            rawPassword
        });
    } catch (err) {
        res.status(500).json({ message: 'Server unavailable.' });
    }
});

app.post('/api/teams/generate-all', auth.authenticateAdmin, async function (req, res) {
    try {
        const { gameId } = req.body;
        if (!gameId) {
            return res.status(400).json({ message: 'Missing required fields.' });
        }
        const db = getDb();
        const allGames = await getAllGames();
        let gameIndex = 1;
        allGames.forEach((g, idx) => {
            if (String(g._id) === String(gameId)) gameIndex = idx + 1;
        });

        const existingTeams = await db.collection('teams').find({ gameId: String(gameId) }).toArray();
        const currentCount = existingTeams.length;
        if (currentCount >= 4) {
            return res.status(400).json({ message: 'Game already has 4 teams.' });
        }

        const generated = [];
        for (let i = currentCount + 1; i <= 4; i++) {
            const teamId = auth.generateTeamId(gameIndex, i);
            const name = `Team ${i}`;
            const rawPassword = auth.generatePassword();
            const passwordHash = await auth.hashPassword(rawPassword);
            const teamDoc = {
                teamId,
                name,
                passwordHash,
                gameId: String(gameId),
                status: 'active',
                createdAt: new Date(),
                updatedAt: new Date()
            };
            const result = await db.collection('teams').insertOne(teamDoc);
            generated.push({
                _id: result.insertedId,
                teamId,
                name,
                gameId: String(gameId),
                status: 'active',
                rawPassword
            });
        }
        res.json({ teams: generated });
    } catch (err) {
        res.status(500).json({ message: 'Server unavailable.' });
    }
});

app.put('/api/teams/:id', auth.authenticateAdmin, async function (req, res) {
    if (!isValidObjectId(req.params.id)) {
        return res.status(400).json({ message: 'Invalid Team ID.' });
    }
    try {
        const db = getDb();
        const updates = { updatedAt: new Date() };
        if (req.body.name) updates.name = req.body.name.trim();
        if (req.body.status) updates.status = req.body.status;
        const result = await db.collection('teams').findOneAndUpdate(
            { _id: new ObjectID(req.params.id) },
            { $set: updates },
            { returnOriginal: false }
        );
        if (!result.value) {
            return res.status(404).json({ message: 'Team not found.' });
        }
        if (updates.status === 'disabled') {
            const session = auth.findSessionByTeamId(result.value.teamId);
            if (session) {
                auth.deleteSession(session.token);
                auth.disconnectSocket(io, session.socketId);
            }
        }
        res.json(result.value);
    } catch (err) {
        res.status(500).json({ message: 'Server unavailable.' });
    }
});

app.post('/api/teams/:id/reset-password', auth.authenticateAdmin, async function (req, res) {
    if (!isValidObjectId(req.params.id)) {
        return res.status(400).json({ message: 'Invalid Team ID.' });
    }
    try {
        const db = getDb();
        const rawPassword = req.body.password && req.body.password.trim() ? req.body.password.trim() : auth.generatePassword();
        const passwordHash = await auth.hashPassword(rawPassword);
        const team = await db.collection('teams').findOneAndUpdate(
            { _id: new ObjectID(req.params.id) },
            { $set: { passwordHash, updatedAt: new Date() } },
            { returnOriginal: false }
        );
        if (!team.value) {
            return res.status(404).json({ message: 'Team not found.' });
        }
        const session = auth.findSessionByTeamId(team.value.teamId);
        if (session) {
            auth.deleteSession(session.token);
            auth.disconnectSocket(io, session.socketId);
        }
        res.json({ teamId: team.value.teamId, rawPassword });
    } catch (err) {
        res.status(500).json({ message: 'Server unavailable.' });
    }
});

app.delete('/api/teams/:id', auth.authenticateAdmin, async function (req, res) {
    if (!isValidObjectId(req.params.id)) {
        return res.status(400).json({ message: 'Invalid Team ID.' });
    }
    try {
        const db = getDb();
        const team = await db.collection('teams').findOne({ _id: new ObjectID(req.params.id) });
        if (!team) {
            return res.status(404).json({ message: 'Team not found.' });
        }
        const game = await db.collection('games').findOne({ _id: new ObjectID(team.gameId) });
        if (game && game.players) {
            const player = game.players.find(p => p.teamId === team.teamId || p.name === team.name);
            if (player && player.rounds && player.rounds.length > 0) {
                return res.status(400).json({ message: 'Cannot delete team with existing game history.' });
            }
            await db.collection('games').updateOne(
                { _id: new ObjectID(team.gameId) },
                { $pull: { players: { $or: [{ teamId: team.teamId }, { name: team.name }] } } }
            );
            games.forEach(g => {
                if (String(g._id) === String(team.gameId)) {
                    g.players = g.players.filter(p => p.teamId !== team.teamId && p.name !== team.name);
                }
            });
        }
        await db.collection('teams').deleteOne({ _id: new ObjectID(req.params.id) });
        const session = auth.findSessionByTeamId(team.teamId);
        if (session) {
            auth.deleteSession(session.token);
            auth.disconnectSocket(io, session.socketId);
        }
        res.json({ message: 'Team deleted successfully.' });
    } catch (err) {
        res.status(500).json({ message: 'Server unavailable.' });
    }
});

app.post('/logout', function (req, res) {
    const token = req.headers.authorization ? req.headers.authorization.replace('Bearer ', '') : (req.body && req.body.token);
    const session = token ? auth.getSession(token) : null;
    if (session) {
        auth.deleteSession(token);
        if (session.socketId) {
            auth.disconnectSocket(io, session.socketId);
        }
    }
    if (req.body && req.body.socketId) {
        auth.disconnectSocket(io, req.body.socketId);
        users = users.filter(user => user.socketId !== req.body.socketId);
    }
    res.send({message: 'ok'});
});

app.get('/users', function (req, res) {
    res.send(users);
});
app.get('/games', function (req, res) {
    res.send(games);
});

app.get('/clean', function (req, res) {
    if (users) {
        users = users.filter(user => user.status !== 'inactive');
    }
    res.send(users);
})

app.post('/create-game', auth.authenticateAdmin, function (req, res) {
    const customName = req.body && req.body.name;
    createNewGame(customName)
        .then((result) => {
            const newGame = result.ops[0];
            games.push(newGame);
            res.send(result);
        })
        .catch((err) => {
            res.status(500).send(err);
        });
});

app.post('/api/games/rename', auth.authenticateAdmin, async function (req, res) {
    const { gameId, name } = req.body;
    if (!gameId || !name || !name.trim()) {
        return res.status(400).json({ message: 'Game ID and valid name are required.' });
    }
    if (!isValidObjectId(gameId)) {
        return res.status(400).json({ message: 'Invalid Game ID.' });
    }
    try {
        const db = getDb();
        const trimmed = name.trim();
        await db.collection('games').updateOne(
            { _id: new ObjectID(gameId) },
            { $set: { name: trimmed } }
        );
        const game = games.find(g => String(g._id) === String(gameId));
        if (game) game.name = trimmed;
        io.to(gameId).emit('game-updated', game);
        res.json({ success: true, name: trimmed, game });
    } catch (err) {
        res.status(500).json({ message: 'Failed to rename game.' });
    }
});

app.post('/api/games/duplicate', auth.authenticateAdmin, async function (req, res) {
    const { gameId } = req.body;
    if (!gameId) {
        return res.status(400).json({ message: 'Game ID is required.' });
    }
    if (!isValidObjectId(gameId)) {
        return res.status(400).json({ message: 'Invalid Game ID.' });
    }
    try {
        const db = getDb();
        const existing = await db.collection('games').findOne({ _id: new ObjectID(gameId) });
        if (!existing) {
            return res.status(404).json({ message: 'Game not found.' });
        }
        const newName = (existing.name || 'Game') + ' (Copy)';
        const result = await db.collection('games').insertOne({
            name: newName,
            game_status: 'waiting',
            roundReady: false,
            timestamp: new Date(),
            players: []
        });
        const duplicated = result.ops[0];
        games.push(duplicated);
        res.json({ success: true, game: duplicated });
    } catch (err) {
        res.status(500).json({ message: 'Failed to duplicate game.' });
    }
});

app.post('/api/games/status', auth.authenticateAdmin, async function (req, res) {
    const { gameId, status } = req.body;
    const validStatuses = ['waiting', 'ready', 'active', 'paused', 'completed', 'archived'];
    if (!gameId || !status || !validStatuses.includes(status)) {
        return res.status(400).json({ message: 'Valid gameId and status required.' });
    }
    if (!isValidObjectId(gameId)) {
        return res.status(400).json({ message: 'Invalid Game ID.' });
    }
    try {
        const db = getDb();
        await db.collection('games').updateOne(
            { _id: new ObjectID(gameId) },
            { $set: { game_status: status } }
        );
        const game = games.find(g => String(g._id) === String(gameId));
        if (game) {
            game.game_status = status;
            io.to(gameId).emit('game-state-changed', { gameId, game_state: status });
            io.to(gameId).emit('game-updated', game);
        }
        res.json({ success: true, status, game });
    } catch (err) {
        res.status(500).json({ message: 'Failed to update game status.' });
    }
});

app.post('/api/games/delete', auth.authenticateAdmin, async function (req, res) {
    const { gameId, confirmName } = req.body;
    if (!gameId || !confirmName) {
        return res.status(400).json({ message: 'Game ID and confirmation name required.' });
    }
    if (!isValidObjectId(gameId)) {
        return res.status(400).json({ message: 'Invalid Game ID.' });
    }
    try {
        const db = getDb();
        const game = await db.collection('games').findOne({ _id: new ObjectID(gameId) });
        if (!game) {
            return res.status(404).json({ message: 'Game not found.' });
        }
        const expectedName = (game.name || '').trim();
        if (confirmName.trim().toLowerCase() !== expectedName.toLowerCase()) {
            return res.status(400).json({ message: `Confirmation name does not match "${expectedName}".` });
        }
        if (game.game_status === 'active' || game.game_status === 'in_progress') {
            return res.status(400).json({ message: 'Active game cannot be deleted. End or pause the game before deletion.' });
        }

        // Delete all associated teams
        await db.collection('teams').deleteMany({ gameId: String(gameId) });
        // Invalidate all sessions for this game
        auth.invalidateSessionsForGame(gameId);
        // Delete the game document
        await db.collection('games').deleteOne({ _id: new ObjectID(gameId) });
        // Remove from in-memory array
        games = games.filter(g => String(g._id) !== String(gameId));
        // Notify socket clients
        io.to(gameId).emit('game-deleted', { gameId });
        res.json({ success: true, message: `Game "${expectedName}" and associated credentials successfully deleted.` });
    } catch (err) {
        res.status(500).json({ message: 'Failed to delete game.' });
    }
});

app.get('/api/games/export/:id', auth.authenticateAdmin, async function (req, res) {
    if (!isValidObjectId(req.params.id)) {
        return res.status(400).send('Invalid Game ID.');
    }
    try {
        const db = getDb();
        const game = await db.collection('games').findOne({ _id: new ObjectID(req.params.id) });
        if (!game) {
            return res.status(404).send('Game not found.');
        }
        const teams = await db.collection('teams').find({ gameId: String(req.params.id) }).toArray();
        const teamMap = new Map();
        teams.forEach(t => teamMap.set(t.name, t.teamId));

        let csv = 'Game Name,Game ID,Status,Team Rank,Team Name,Team ID,Starting Capital,Current Valuation,Net Profit Loss,Total Return %,Outstanding Debt,Rounds Completed,Exported At\n';
        const gameName = sanitizeCsvValue(game.name || 'Game');
        const gameId = sanitizeCsvValue(String(game._id));
        const gameStatus = sanitizeCsvValue(game.game_status || 'waiting');
        const exportedAt = sanitizeCsvValue(new Date().toISOString());

        if (game.players && game.players.length > 0) {
            const sorted = [...game.players].sort((a, b) => {
                const valA = (a.rounds && a.rounds.length > 0) ? a.rounds[a.rounds.length - 1].total_portfolio_value : 1000000;
                const valB = (b.rounds && b.rounds.length > 0) ? b.rounds[b.rounds.length - 1].total_portfolio_value : 1000000;
                return valB - valA;
            });

            sorted.forEach((p, idx) => {
                const rank = idx + 1;
                const teamName = sanitizeCsvValue(p.name || '');
                const teamId = sanitizeCsvValue(teamMap.get(p.name) || p.teamId || 'N/A');
                const startingVal = p.starting_portfolio_value || 1000000;
                const lastRound = (p.rounds && p.rounds.length > 0) ? p.rounds[p.rounds.length - 1] : null;
                const currentVal = lastRound ? lastRound.total_portfolio_value : startingVal;
                const netProfitLoss = currentVal - startingVal;
                const totalReturn = (((currentVal - startingVal) / startingVal) * 100).toFixed(2);
                let outstandingDebt = 0;
                if (p.loans) {
                    p.loans.forEach(l => {
                        if (l.status === 'active') outstandingDebt += (l.balance || l.amount || 0);
                    });
                }
                const roundsCompleted = p.rounds ? p.rounds.length : 0;

                csv += `${gameName},${gameId},${gameStatus},${rank},${teamName},${teamId},${startingVal},${currentVal},${netProfitLoss},${totalReturn}%,${outstandingDebt},${roundsCompleted},${exportedAt}\n`;
            });
        } else {
            csv += `${gameName},${gameId},${gameStatus},N/A,No Teams Joined,N/A,0,0,0,0%,0,0,${exportedAt}\n`;
        }

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="portfolio-king-${req.params.id}-results.csv"`);
        res.send(csv);
    } catch (err) {
        res.status(500).send('Failed to generate export.');
    }
});

app.get('/get-all-games', function (req, res) {
    res.send(games);
});

app.get('/get-game', function (req, res) {
    let game;
    let id = req.query.gameId;
    games.forEach((g) => {
        if (g._id == id) {
            game = g;
        }
    });
    res.send(game);
});

const getAllGames = () => {
    const db = getDb();
    return db.collection('games')
        .find()
        .toArray();
}

const ioConnection = () => {
    io.on('connection', function (socket) {
        console.log('a user connected');
        let socketUser = socket.handshake.query.user;
        let connectedUser = {
            socketId: socket.id,
            status: 'active'
        };
        if (socketUser) {
            socketUser = JSON.parse(socketUser);
            users = users.filter(user => user.socketId !== socketUser.socketId);
            connectedUser.name = socketUser.userName;
            if (socketUser.isAdmin === 'true') {
                connectedUser.userType = 'admin';
            } else if (socketUser.isAdmin !== 'true') {
                connectedUser.userType = 'player';
                if (socketUser.gameId && socketUser.id) {
                    users.forEach(user => {
                        if (user.socketId === socketUser.socketId) {
                            socket.join(user.gameId);
                            if (connectedUser.userType === 'player') {
                                games.forEach(game => {
                                    if (JSON.stringify(game._id) === JSON.stringify(user.gameId)) {
                                        game.players.forEach(player => {
                                            if (JSON.stringify(player._id) === JSON.stringify(socketUser.id)) {
                                                player.status = 'active';
                                                socket.broadcast.to(JSON.stringify(game._id)).emit("game-updated", game);
                                                updatePlayer(user.gameId, player._id, 'active', 'paused', player.rounds);
                                            }
                                        })
                                    }
                                })
                            }

                        }
                    });
                }
            }
            socketUser.socketId = socket.id;
            if (socketUser.token) {
                auth.updateSessionSocket(socketUser.token, socket.id);
            }
            io.to(socket.id).emit("update-user", socketUser);
        }
        users.push(connectedUser);
        socket.on('disconnect', () => {
            users.forEach(user => {
                if (user.socketId === socket.id) {
                    user.status = 'inactive'
                }
            });
        });
        socket.on('join-game', async (data) => {
            let token = data && data.token;
            if (!token) {
                const found = users.find(u => u.socketId === socket.id);
                if (found && found.token) token = found.token;
            }
            const session = auth.getSession(token);
            if (!session) {
                io.to(socket.id).emit("player-add-error", { error: true, msg: "Session expired" });
                return;
            }

            users.forEach(user => {
                if (user.socketId === data.socketId) {
                    user.gameId = data.gameId;
                }
            });

            if (session.role === 'admin' || data.userType === 'spectator') {
                socket.join(data.gameId);
                const targetGame = games.find(g => String(g._id) === String(data.gameId));
                if (targetGame) {
                    io.to(socket.id).emit("game-updated", targetGame);
                }
                return;
            }

            if (session.role === 'player') {
                if (String(session.gameId) !== String(data.gameId)) {
                    io.to(socket.id).emit("player-add-error", { error: true, msg: "Unauthorized: Team not assigned to this game." });
                    return;
                }

                try {
                    const db = getDb();
                    const teamDoc = await db.collection('teams').findOne({ teamId: session.teamId });
                    if (teamDoc && teamDoc.status === 'disabled') {
                        io.to(socket.id).emit("player-add-error", { error: true, msg: "Team account disabled." });
                        return;
                    }
                } catch (err) {
                    io.to(socket.id).emit("player-add-error", { error: true, msg: "Server unavailable." });
                    return;
                }

                const activeSess = auth.findSessionByTeamId(session.teamId);
                if (activeSess && activeSess.socketId && activeSess.socketId !== socket.id && isSocketConnected(activeSess.socketId)) {
                    io.to(socket.id).emit("player-add-error", { error: true, msg: "Team already connected." });
                    return;
                }
                auth.updateSessionSocket(session.token, socket.id);

                let targetGame = null;
                let existingPlayer = null;
                games.forEach(g => {
                    if (JSON.stringify(g._id) === JSON.stringify(data.gameId)) {
                        targetGame = g;
                        g.players.forEach(p => {
                            if (p.teamId === session.teamId || p.name === session.teamName || (data.userId && JSON.stringify(p._id) === JSON.stringify(data.userId))) {
                                existingPlayer = p;
                            }
                        });
                    }
                });

                if (existingPlayer) {
                    existingPlayer.socketId = socket.id;
                    existingPlayer.status = 'active';
                    socket.join(data.gameId);
                    updatePlayer(data.gameId, existingPlayer._id, 'active', existingPlayer.game_status, existingPlayer.rounds, existingPlayer.loans)
                        .then(() => {
                            socket.broadcast.to(data.gameId).emit("game-updated", targetGame);
                            io.to(socket.id).emit("game-updated", targetGame);
                        });
                    return;
                }

                if (targetGame && targetGame.players.length >= 4) {
                    io.to(socket.id).emit("player-add-error", { error: true, msg: "Game full." });
                    return;
                }

                addPlayerToGame(data.gameId, socket.id, session.teamName, session.teamId)
                    .then(({value, ok}) => {
                        let player = value.players[value.players.length - 1];
                        if (ok === 1) {
                            games.forEach(game => {
                                if (JSON.stringify(game._id) === JSON.stringify(value._id)) {
                                    game.players = value.players;
                                }
                            });
                            socket.join(data.gameId);
                            socket.broadcast.to(data.gameId).emit("player-added-to-game", {
                                player: player,
                                gameId: data.gameId
                            });
                            io.to(socket.id).emit("player-added-to-game", {player: player, gameId: data.gameId});
                        }
                    });
            }
        });
        socket.on('leave-game', (data) => {
            users.forEach(user => {
                if (user.socketId === data.socketId) {
                    let userGameId = user.gameId;
                    socket.leave(user.gameId);
                    delete user.gameId;
                    if (data.userType === 'Player') {
                        games.forEach(game => {
                            if (JSON.stringify(game._id) === JSON.stringify(userGameId)) {
                                game.players.forEach(player => {
                                    if (JSON.stringify(player._id) === JSON.stringify(data.userId)) {
                                        player.status = 'inactive';
                                        socket.broadcast.to(JSON.stringify(game._id)).emit("game-updated", game);
                                        updatePlayer(userGameId, player._id, 'inactive', 'paused', player.rounds, player.loans);
                                    }
                                })
                            }
                        })
                    }

                }
            });
        });
        socket.on('player-ready', (data) => {
            const user = users.find(u => u.socketId === socket.id);
            const session = user ? auth.getSession(user.token) : null;
            if (session && session.role === 'player' && data && String(session.gameId) !== String(data.gameId)) {
                return;
            }
            if (data && data.userId) {
                games.forEach(game => {
                    if (JSON.stringify(game._id) === JSON.stringify(data.gameId)) {
                        game.players.forEach(player => {
                            if (JSON.stringify(player._id) === JSON.stringify(data.userId)) {
                                if (player.game_status === 'ready') {
                                    return; // Idempotency check: prevent duplicate submission
                                }
                                player.game_status = 'ready';
                                let round = {};
                                round.total_invested_value = data.totalInvestment;
                                if (player.rounds.length === 0) {
                                    round.round_starting_value = 1000000;
                                    round.total_portfolio_value = 1000000;
                                } else {
                                    round.round_starting_value = data.totalInvestment;
                                    round.total_portfolio_value = data.totalInvestment;
                                }
                                // Bank FD
                                if (data.round[0].return_value > 0) {
                                    round.total_portfolio_value += (data.round[0].return_value - data.round[0].value);
                                }
                                // Loan
                                player.loans = data.prevLoans;
                                if (data.loan && data.loan.status === 'active') {
                                    // round.total_portfolio_value += data.loan.amount;
                                    // round.round_starting_value += data.loan.amount;
                                    data.loan.pmt = parseFloat(formula.PMT(data.loan.rate / (4 * 100), data.loan.duration * 4, data.loan.amount, 0, 0).toFixed(2));
                                    data.loan.balance = data.loan.amount;
                                    player.loans.push(data.loan);
                                }
                                round.investment = data.round;
                                round.status = 'ongoing';
                                player.rounds.push(round);
                                updatePlayer(data.gameId, player._id, player.status, 'ready', round, player.loans)
                                    .then(() => {
                                        socket.broadcast.to(data.gameId).emit("game-updated", game);
                                        io.to(socket.id).emit("game-updated", game);
                                    });
                            }
                        })
                    }
                })
            }
        });
        socket.on('game-start', (data) => {
            const user = users.find(u => u.socketId === socket.id);
            const session = user ? auth.getSession(user.token) : null;
            if (!session || session.role !== 'admin') {
                return;
            }
            games.forEach(game => {
                if (JSON.stringify(game._id) === JSON.stringify(data.gameId)) {
                    game.game_status = 'active';
                    updateGame(data.gameId, true, "active", game.players)
                        .then(res => {
                            game.round_seq = getGameSequence(game._id);
                            socket.broadcast.to(data.gameId).emit("game-updated", game);
                            io.to(socket.id).emit("game-updated", game);
                            if (game.round_seq.length === 0) {
                                let g_status = false;
                                game.players.forEach(player => {
                                    player.rounds[player.rounds.length - 1].status = 'complete';
                                    if (player.rounds.length === 12) {
                                        g_status = true;
                                    }
                                    player.rounds[player.rounds.length - 1].returnAvg = 6.2;
                                    player.game_status = "paused";
                                    if (player.rounds.length >= 12) {
                                        player.loans.forEach(loan => {
                                            if (loan.status === 'active') {
                                                loan.totalRepayments += 1;
                                                player.rounds[player.rounds.length - 1].total_portfolio_value += (loan.balance * 0.1 + loan.balance);
                                                loan.balance = 0;
                                                loan.status = 'paid';
                                            }
                                        });
                                    } else {
                                        player.loans.forEach(loan => {
                                            if (loan.status === 'active') {
                                                let installmentPerYear = 4;
                                                loan.totalRepayments += 1;
                                                player.rounds[player.rounds.length - 1].total_portfolio_value += loan.pmt;
                                                loan.balance += parseFloat(formula.PPMT(loan.rate / (installmentPerYear * 100), loan.totalRepayments, loan.duration * installmentPerYear, loan.amount, 0, 0).toFixed(2));
                                                if (loan.balance <= 0) {
                                                    loan.status = 'paid';
                                                }
                                            }
                                        });
                                    }
                                    player.rounds[player.rounds.length - 1].total_portfolio_value = Math.ceil(player.rounds[player.rounds.length - 1].total_portfolio_value);
                                });
                                if (g_status) {
                                    game.game_status = 'completed';
                                }
                                game.roundReady = false;
                                updateGame(game._id, false, game.game_status, game.players);
                            }
                        });
                }
            })
        });

        socket.on('round-ready', (data) => {
            const user = users.find(u => u.socketId === socket.id);
            const session = user ? auth.getSession(user.token) : null;
            if (!session || session.role !== 'admin') {
                return;
            }
            games.forEach(game => {
                if (JSON.stringify(game._id) === JSON.stringify(data.gameId)) {
                    game.roundReady = true;
                    updateGame(data.gameId, true, "active", game.players)
                        .then(res => {
                            game.round_seq = getGameSequence(game._id);
                            socket.broadcast.to(data.gameId).emit("game-updated", game);
                            io.to(socket.id).emit("game-updated", game);
                        });
                }
            })
        });

        socket.on('game-state-change', async (data) => {
            const user = users.find(u => u.socketId === socket.id);
            const session = user ? auth.getSession(user.token) : null;
            if (!session || session.role !== 'admin') {
                return;
            }
            const targetGame = games.find(g => String(g._id) === String(data.gameId));
            if (targetGame) {
                targetGame.game_status = data.state;
                try {
                    const db = getDb();
                    await db.collection('games').updateOne(
                        { _id: new ObjectID(data.gameId) },
                        { $set: { game_status: data.state } }
                    );
                } catch (err) {
                    console.error('Error updating game state in DB:', err);
                }
                socket.broadcast.to(data.gameId).emit("game-state-changed", {
                    gameId: data.gameId,
                    game_state: data.state
                });
                io.to(socket.id).emit("game-state-changed", {
                    gameId: data.gameId,
                    game_state: data.state
                });
                socket.broadcast.to(data.gameId).emit("game-updated", targetGame);
                io.to(socket.id).emit("game-updated", targetGame);
            }
        });

        socket.on('dice-rolled', (data) => {
            const user = users.find(u => u.socketId === socket.id);
            const session = user ? auth.getSession(user.token) : null;
            if (session && session.role === 'player' && data && String(session.gameId) !== String(data.gameId)) {
                return;
            }
            if (data && data.gameId) {
                const targetGame = games.find(g => String(g._id) === String(data.gameId));
                if (!targetGame || !targetGame.round_seq || targetGame.round_seq.length === 0) {
                    return;
                }
                if (data.player_id && String(targetGame.round_seq[0].playerId) !== String(data.player_id)) {
                    return; // Unauthorized roll: not player's turn
                }
            }
            clearTimeout(diceTimer);
            diceTimer = setTimeout(() => {
                onDiceRolled(false, data, socket);
            }, 60000);
            onDiceRolled(true, data, socket);
        })
    });
};

const onDiceRolled = (rollStatus, data, socket) => {
    games.forEach(game => {
        if (JSON.stringify(game._id) === JSON.stringify(data.gameId)) {
            let errorMsg = '';
            let playerId = data.player_id;
            let diceValue = data.diceValue1 + data.diceValue2;
            let investment = data.investment;
            let investment_opt = data.investment_opt;
            let returnVal = {
                return_rate: 0,
                return_value: 0
            };
            console.log('dice values : ', diceValue, data.diceValue1, data.diceValue2, data.enableRetry);
            if (data.isRetry || !data.retryEnable) {
                let g = game.round_seq.splice(0, 1);
            } else {
                game.round_seq[0].retry = true;
            }
            if (rollStatus) {
                if (investment > 5000 && data.isRetry && data.retryTaken) {
                    returnVal = getInvestmentReturn(investment_opt, investment - 5000, diceValue);
                } else {
                    returnVal = getInvestmentReturn(investment_opt, investment, diceValue);
                }
            } else {
                playerId = game.round_seq[0].playerId;
                investment_opt = game.round_seq[0].investment;
            }
            game.players.forEach(player => {
                if (JSON.stringify(player._id) === JSON.stringify(playerId)) {
                    console.log("PlayerId", playerId)
                    player.rounds[player.rounds.length - 1].investment.forEach(insvt => {
                        if (insvt.name === investment_opt) {
                            insvt.return_rate = returnVal.return_rate;
                            if ((data.isRetry && data.retryTaken) || !data.isRetry) {
                                if (insvt.value > 5000 && data.isRetry && data.retryTaken) {
                                    insvt.value -= 5000;
                                    player.rounds[player.rounds.length - 1].total_portfolio_value -= parseFloat((insvt.return_value - insvt.value).toFixed(2));
                                } else {
                                    errorMsg = 'Not enough portfolio value for this investment option';
                                }
                                insvt.return_value = parseFloat(returnVal.return_value.toFixed(2));
                                player.rounds[player.rounds.length - 1].total_portfolio_value += parseFloat((insvt.return_value - insvt.value).toFixed(2));
                            }
                        }
                    })
                }
            });

            let gameEnd = false;
            if (game.round_seq.length === 0) {
                gameEnd = true;
                let g_status = false;
                game.players.forEach(player => {
                    player.rounds[player.rounds.length - 1].status = 'complete';
                    let totalVal = 0, totalReturn = 0;
                    // round end check
                    if (player.rounds.length === 8) {
                        g_status = true;
                    }
                    player.rounds[player.rounds.length - 1].investment.forEach(invst => {
                        if ((investment_seq.indexOf(invst.name) > -1 || invst.name === 'bank_FD') &&
                            invst.value > 0) {
                            totalVal += invst.value;
                            totalReturn += (invst.return_value - invst.value);
                        }
                    });
                    player.loans.forEach(loan => {
                        if (loan.status === 'active') {
                            totalReturn += loan.pmt;
                        }
                    });
                    player.rounds[player.rounds.length - 1].returnAvg = parseFloat(((totalReturn / totalVal) * 100).toFixed(2));
                    player.game_status = "paused";
                });
                if (g_status) {
                    game.game_status = 'completed';
                }

                clearTimeout(diceTimer);
                game.game_status = "paused";
                setTimeout(() => {
                    game.players.forEach(player => {
                        let g_status = false;
                        player.rounds[player.rounds.length - 1].investment.forEach(insvt => {
                            if (insvt.name === 'fof') {
                                insvt.return_rate = currentFofReturn(game, insvt.target_player, insvt.value);
                                let returnVal = parseFloat(((insvt.value * 0.98) * (insvt.return_rate / 100 + 1)).toFixed(2));
                                insvt.return_value = returnVal;
                                player.rounds[player.rounds.length - 1].total_portfolio_value += returnVal - insvt.value;
                            }
                        });
                        // years can be changed from here
                        if (player.rounds.length >= 8) {
                            player.loans.forEach(loan => {
                                if (loan.status === 'active') {
                                    loan.totalRepayments += 1;
                                    player.rounds[player.rounds.length - 1].total_portfolio_value -= (loan.balance * 0.1 + loan.balance);
                                    loan.balance = 0;
                                    loan.status = 'paid';
                                }
                            });
                            g_status = true;
                        } else {
                            player.loans.forEach(loan => {
                                if (loan.status === 'active') {
                                    let installmentPerYear = 4;
                                    loan.totalRepayments += 1;
                                    player.rounds[player.rounds.length - 1].total_portfolio_value += loan.pmt;
                                    loan.balance += parseFloat(formula.PPMT(loan.rate / (installmentPerYear * 100), loan.totalRepayments, loan.duration * installmentPerYear, loan.amount, 0, 0).toFixed(2));
                                    if (loan.balance <= 0) {
                                        loan.status = 'paid';
                                    }
                                }
                            });
                        }
                    });
                    game.players.forEach(player => {
                        player.rounds[player.rounds.length - 1].total_portfolio_value = Math.ceil(player.rounds[player.rounds.length - 1].total_portfolio_value);
                    });
                    if (g_status) {
                        game.game_status = 'completed';
                    }
                    game.roundReady = false;
                    updateGame(game._id, false, game.game_status, game.players);
                }, 5000);
            }
            socket.broadcast.to(data.gameId).emit("get-rolled-dice", {
                game: game,
                diceValue1: data.diceValue1,
                diceValue2: data.diceValue2,
                prevPlayer: playerId,
                gameEnd: gameEnd,
                isRetry: data.isRetry,
                errorMsg: errorMsg,
                retryTaken: data.retryTaken
            });
            io.to(socket.id).emit("get-rolled-dice", {
                game: game,
                diceValue1: data.diceValue1,
                diceValue2: data.diceValue2,
                prevPlayer: playerId,
                gameEnd: gameEnd,
                errorMsg: errorMsg,
                isRetry: data.isRetry,
                retryTaken: data.retryTaken
            });
        }
    })
};

const currentFofReturn = (game, target_player, value) => {
    let return_val = 0;
    game.players.forEach(player => {
        if (JSON.stringify(player._id) === JSON.stringify(target_player)) {
            return_val = player.rounds[player.rounds.length - 1].returnAvg;
            if (player.rounds[player.rounds.length - 1].investment[player.rounds[player.rounds.length - 1].investment.length - 1].name === 'fof_return') {
                player.rounds[player.rounds.length - 1].investment[player.rounds[player.rounds.length - 1].investment.length - 1].return_value += value * 0.02;
            } else {
                player.rounds[player.rounds.length - 1].investment.push({
                    name: 'fof_return',
                    value: 0,
                    return_rate: 0,
                    return_value: value * 0.02
                });
            }
            player.rounds[player.rounds.length - 1].total_portfolio_value += value * 0.02;
        }
    });
    console.log(return_val);
    return return_val;
};

const getGameSequence = (gameId) => {
    let game = games.filter(game => JSON.stringify(game._id) === JSON.stringify(gameId))[0];
    let seq = [];
    for (let [key, value] of investment_seq.entries()) {
        for (let player of game.players) {
            if (player.rounds[player.rounds.length - 1] && player.rounds[player.rounds.length - 1].investment[key + 1].value > 0) {
                seq.push({playerId: player._id, investment: value, retry: false});
            }
        }
    }
    console.log('sequence', seq);
    return seq;
};

const createNewGame = (customName) => {
    const db = getDb();
    const count = games.length + 1;
    return db.collection('games')
        .insertOne({
            name: customName || `Game ${count}`,
            game_status: 'waiting',
            roundReady: false,
            timestamp: new Date(),
            players: []
        });
};

const addPlayerToGame = (gameId, socketId, name, teamId) => {
    const db = getDb();
    return db.collection('games')
        .findOneAndUpdate(
            {_id: new ObjectID(gameId)},
            {
                $addToSet: {
                    players: {
                        _id: new ObjectID(),
                        socketId: socketId,
                        name: name,
                        teamId: teamId || name,
                        status: 'active',
                        game_status: 'paused',
                        starting_portfolio_value: 1000000,
                        rounds: [],
                        loans: []
                    }
                }
            },
            {returnOriginal: false}
        )
};

const getInvestmentReturn = (investment_option, investemnt, dice_value) => {
    let returnVal = investmentReturnSheet(investment_option, dice_value);
    let insvt = {
        return_rate: 0,
        return_value: 0
    }
    insvt.return_rate = returnVal;
    console.log(investemnt);
    insvt.return_value = investemnt * (returnVal / 100 + 1);
    console.log('invst return', investemnt, dice_value, insvt);
    return insvt;
};

const updatePlayer = (gameId, player_id, status, game_status, round, loans) => {
    const db = getDb();
    const updateDoc = {
        $set: {
            "players.$.status": status,
            "players.$.game_status": game_status
        }
    };
    if (loans !== undefined) {
        updateDoc.$set["players.$.loans"] = loans;
    }
    if (Array.isArray(round)) {
        updateDoc.$set["players.$.rounds"] = round;
    } else if (round) {
        updateDoc.$push = {
            "players.$.rounds": round
        };
    }
    return db.collection('games')
        .findOneAndUpdate(
            {_id: new ObjectID(gameId), 'players._id': new ObjectID(player_id)},
            updateDoc,
            {returnOriginal: false}
        );
};

const updateGame = (gameId, round_ready, game_status, players) => {
    const db = getDb();
    return db.collection('games')
        .findOneAndUpdate(
            {_id: new ObjectID(gameId)},
            {
                $set: {
                    "game_status": game_status,
                    "roundReady": round_ready,
                    "players": players
                }
            },
            {returnOriginal: false}
        )
};

app.get('/update-game', function (req, res) {
    getAllGames()
        .then((result) => {
            games = result;
            res.send(games);
        });
});

if (fs.existsSync(clientDistPath)) {
    app.use(express.static(clientDistPath));
    app.get('*', function (req, res) {
        res.sendFile(path.join(clientDistPath, 'index.html'));
    });
}

const port = process.env.PORT || 3000;
const hostname = process.env.HOST || process.env.HOST_TEST || '0.0.0.0';

const server = http.listen(port, hostname, function () {
    console.log("PORT", port, "hostname", hostname);
    console.log('server listening on ', port);
    mongoClient(() => {
        console.log('connected to database server');
        getAllGames()
            .then((result) => {
                games.push(...result);
                ioConnection();
                console.log("game ready");
            });
    });
});

const gracefulShutdown = (signal) => {
    console.log(`Received ${signal}, shutting down gracefully...`);
    server.close(() => {
        console.log('HTTP server closed.');
        process.exit(0);
    });
    setTimeout(() => {
        console.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));