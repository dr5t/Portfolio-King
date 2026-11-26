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

const clientDistBrowserPath = path.resolve(__dirname, '../portfolio-king/dist/Client/browser');
const clientDistFallbackPath = path.resolve(__dirname, '../portfolio-king/dist/Client');
const clientDistPath = fs.existsSync(path.join(clientDistBrowserPath, 'index.html'))
    ? clientDistBrowserPath
    : clientDistFallbackPath;

var users = [];
var games = [];
var investment_seq = ['govt_bond', 'corporate_bond', 'blue_chip', 'mid_cap', 'speculative_stock', 'international_stock', 'US_dollar', 'gold_ETF'];
var diceTimer;
const ADMIN_NOTIFICATION_ROOM = 'portfolio-king-admin-notifications';
const gameDeletionLocks = new Set();
const teamDeletionLocks = new Set();

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

function getPublicSocketUsers() {
    return users.map(({ token, ...user }) => user);
}

async function getSocketSession(token, socket) {
    try {
        return await auth.getSession(token);
    } catch (error) {
        console.error('Socket session verification failed:', error.message);
        socket.emit('session-verification-error', { message: 'Session verification unavailable.' });
        return false;
    }
}

function belongsToSessionTeam(player, session) {
    return player.teamId
        ? String(player.teamId) === String(session.teamId)
        : player.name === session.teamName;
}

function notifyAdmins(title, description) {
    io.to(ADMIN_NOTIFICATION_ROOM).emit('admin-notification', {
        title,
        description,
        timestamp: new Date().toISOString()
    });
}

function requestError(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
}

async function deleteGameRecord(gameId) {
    const id = String(gameId);
    if (gameDeletionLocks.has(id)) {
        throw requestError(409, 'This game is already being deleted.');
    }
    gameDeletionLocks.add(id);
    try {
        const db = getDb();
        const game = await db.collection('games').findOne({ _id: new ObjectID(id) });
        if (!game) {
            throw requestError(404, 'Game not found.');
        }

        const teams = await db.collection('teams').find({ gameId: id }).toArray();
        const teamObjectIds = teams.map(team => team._id);
        if (teamObjectIds.length > 0) {
            try {
                const detachResult = await db.collection('teams').updateMany(
                    { _id: { $in: teamObjectIds }, gameId: id },
                    { $set: { gameId: null } }
                );
                const detachedCount = detachResult.matchedCount !== undefined
                    ? detachResult.matchedCount
                    : detachResult.result.n;
                if (detachedCount !== teamObjectIds.length) {
                    throw requestError(409, 'Team assignments changed while deleting the game. Refresh and try again.');
                }
            } catch (error) {
                try {
                    await db.collection('teams').updateMany(
                        { _id: { $in: teamObjectIds }, gameId: null },
                        { $set: { gameId: id } }
                    );
                } catch (rollbackError) {
                    console.error('Failed to restore team assignments after game deletion failed.', rollbackError);
                    throw requestError(500, 'Team assignments could not be restored after the deletion failed.');
                }
                throw error;
            }
        }

        let deleteResult;
        try {
            deleteResult = await db.collection('games').deleteOne({ _id: new ObjectID(id) });
        } catch (error) {
            if (teamObjectIds.length > 0) {
                await db.collection('teams').updateMany(
                    { _id: { $in: teamObjectIds }, gameId: null },
                    { $set: { gameId: id } }
                );
            }
            throw error;
        }

        if (deleteResult.deletedCount !== 1) {
            if (teamObjectIds.length > 0) {
                await db.collection('teams').updateMany(
                    { _id: { $in: teamObjectIds }, gameId: null },
                    { $set: { gameId: id } }
                );
            }
            throw requestError(409, 'Game changed while deleting. Refresh and try again.');
        }

        io.to(id).emit('game-deleted', { gameId: id, gameName: game.name || 'Game' });
        const revokedSessions = await auth.revokeSessionsForGame(io, id);
        users.forEach(user => {
            if (String(user.gameId) === id) {
                user.status = 'inactive';
                delete user.gameId;
            }
        });
        games = games.filter(item => String(item._id) !== id);
        notifyAdmins('Game deleted', `"${game.name || 'Game'}" was deleted; ${teams.length} team account(s) were preserved.`);

        return {
            gameId: id,
            gameName: game.name || 'Game',
            deletedCount: 1,
            preservedTeams: teams.length,
            revokedSessions
        };
    } finally {
        gameDeletionLocks.delete(id);
    }
}

async function deleteTeamRecords(teamObjectIds, expectedGameId) {
    const ids = teamObjectIds.map(id => String(id));
    if (ids.some(id => teamDeletionLocks.has(id))) {
        throw requestError(409, 'A selected team is already being deleted.');
    }
    ids.forEach(id => teamDeletionLocks.add(id));
    const lockedKeys = ids.slice();
    const gamePlayersToRestore = new Map();
    try {
        const db = getDb();
        const teams = await db.collection('teams').find({
            _id: { $in: teamObjectIds }
        }).toArray();
        if (teams.length !== teamObjectIds.length) {
            throw requestError(404, 'One or more selected teams no longer exist. Refresh and try again.');
        }
        teams.forEach(team => {
            if (teamDeletionLocks.has(String(team.teamId))) {
                throw requestError(409, 'A selected team is already being deleted.');
            }
            teamDeletionLocks.add(String(team.teamId));
            lockedKeys.push(String(team.teamId));
        });
        if (expectedGameId && teams.some(team => String(team.gameId) !== String(expectedGameId))) {
            throw requestError(400, 'All selected teams must belong to the selected game.');
        }

        const gameGroups = new Map();
        try {
            for (const team of teams) {
                if (!isValidObjectId(String(team.gameId || ''))) {
                    throw requestError(409, `Team "${team.name}" is not assigned to a game and cannot be deleted here.`);
                }
                const gameId = String(team.gameId);
                const game = await db.collection('games').findOne({ _id: new ObjectID(gameId) });
                if (!game) {
                    throw requestError(409, `The game for team "${team.name}" no longer exists.`);
                }
                if (game.game_status === 'active' || game.game_status === 'in_progress') {
                    throw requestError(409, `Team "${team.name}" is in an active game. End the game before deleting the team.`);
                }
                const player = (game.players || []).find(item =>
                    item.teamId === team.teamId || (!item.teamId && item.name === team.name)
                );
                if (player && player.rounds && player.rounds.length > 0) {
                    throw requestError(409, `Team "${team.name}" has historical results and cannot be deleted.`);
                }
                if (player) {
                    if (!gameGroups.has(gameId)) gameGroups.set(gameId, []);
                    gameGroups.get(gameId).push({ teamId: String(team._id), player });
                }
            }

            for (const [gameId, teamPlayers] of gameGroups.entries()) {
                const playerIds = teamPlayers.map(item => item.player._id);
                gamePlayersToRestore.set(gameId, teamPlayers);
                await db.collection('games').updateOne(
                    { _id: new ObjectID(gameId) },
                    { $pull: { players: { _id: { $in: playerIds } } } }
                );
            }
        } catch (error) {
            try {
                for (const [gameId, teamPlayers] of gamePlayersToRestore.entries()) {
                    await db.collection('games').updateOne(
                        { _id: new ObjectID(gameId) },
                        { $addToSet: { players: { $each: teamPlayers.map(item => item.player) } } }
                    );
                }
            } catch (rollbackError) {
                console.error('Failed to restore game players after team deletion failed.', rollbackError);
                throw requestError(500, 'Game records could not be restored after the deletion failed.');
            }
            throw error;
        }

        let deleteError = null;
        try {
            await db.collection('teams').deleteMany({
                _id: { $in: teamObjectIds }
            });
        } catch (error) {
            deleteError = error;
        }

        let remainingTeams;
        try {
            remainingTeams = await db.collection('teams').find({ _id: { $in: teamObjectIds } }).toArray();
        } catch (error) {
            try {
                for (const [gameId, teamPlayers] of gamePlayersToRestore.entries()) {
                    await db.collection('games').updateOne(
                        { _id: new ObjectID(gameId) },
                        { $addToSet: { players: { $each: teamPlayers.map(item => item.player) } } }
                    );
                }
            } catch (rollbackError) {
                console.error('Failed to restore game players after team deletion could not be verified.', rollbackError);
            }
            console.error('Could not verify team deletion state.', deleteError || error);
            throw requestError(500, 'Could not verify the team deletion outcome. Refresh before retrying.');
        }

        const remainingIds = new Set(remainingTeams.map(team => String(team._id)));
        const deletedTeams = teams.filter(team => !remainingIds.has(String(team._id)));
        const failed = deletedTeams.length !== teams.length;
        const partial = deletedTeams.length > 0 && failed;

        if (partial) {
            for (const [gameId, teamPlayers] of gamePlayersToRestore.entries()) {
                const playersToRestore = teamPlayers
                    .filter(item => remainingIds.has(item.teamId))
                    .map(item => item.player);
                if (playersToRestore.length > 0) {
                    await db.collection('games').updateOne(
                        { _id: new ObjectID(gameId) },
                        { $addToSet: { players: { $each: playersToRestore } } }
                    );
                }
            }
        }

        const deletedPlayerIds = new Set();
        for (const teamPlayers of gamePlayersToRestore.values()) {
            teamPlayers.forEach(item => {
                if (!remainingIds.has(item.teamId)) deletedPlayerIds.add(String(item.player._id));
            });
        }
        games.forEach(game => {
            game.players = (game.players || []).filter(player => !deletedPlayerIds.has(String(player._id)));
        });

        let revokedSessions = 0;
        for (const team of deletedTeams) {
            revokedSessions += await auth.revokeSessionsForTeam(io, team.teamId);
        }
        if (deletedTeams.length > 0) {
            notifyAdmins(
                partial ? 'Teams partially deleted' : 'Teams deleted',
                `${deletedTeams.length} of ${teams.length} team account(s) were deleted.`
            );
        }
        return {
            deletedCount: deletedTeams.length,
            deletedTeamIds: deletedTeams.map(team => String(team._id)),
            revokedSessions,
            partial,
            failed
        };
    } finally {
        lockedKeys.forEach(id => teamDeletionLocks.delete(id));
    }
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
            try {
                const token = await auth.createSession({
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
            } catch (error) {
                console.error('Admin session creation failed:', error.message);
                return res.status(503).json({ message: 'Session creation unavailable.' });
            }
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
            if (gameDeletionLocks.has(String(team.gameId)) ||
                teamDeletionLocks.has(String(team._id)) ||
                teamDeletionLocks.has(String(team.teamId))) {
                return res.status(409).json({ message: 'This team account is being removed. Please try again later.' });
            }
            if (team.status === 'disabled') {
                return res.status(403).json({ message: 'Team account disabled.' });
            }
            const verification = await auth.verifyPassword(password, team.passwordHash);
            if (!verification.valid) {
                auth.recordFailedAttempt(ip);
                return res.status(401).json({ message: 'Invalid Team ID or Password.' });
            }

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

            const activeSession = await auth.findSessionByTeamId(team.teamId);
            let replaceDisconnectedTeamSession = false;
            if (activeSession) {
                const isSameSocket = socketId && activeSession.socketId && activeSession.socketId === socketId;
                const isConnected = activeSession.socketId && isSocketConnected(activeSession.socketId);
                if (!isSameSocket && isConnected) {
                    return res.status(409).json({ message: 'Team already connected.' });
                }
                replaceDisconnectedTeamSession = !isSameSocket;
            }

            if (gameDeletionLocks.has(String(team.gameId)) ||
                teamDeletionLocks.has(String(team._id)) ||
                teamDeletionLocks.has(String(team.teamId))) {
                return res.status(409).json({ message: 'This team account is being removed. Please try again later.' });
            }

            auth.resetRateLimit(ip);
            let token;
            try {
                token = await auth.createSession({
                    role: 'player',
                    teamId: team.teamId,
                    teamName: team.name,
                    gameId: team.gameId,
                    socketId
                }, replaceDisconnectedTeamSession);
            } catch (error) {
                if (error.code === 11000) {
                    return res.status(409).json({ message: 'Team already connected.' });
                }
                throw error;
            }
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
        const activeSessions = await auth.findSessionsByTeamIds(teams.map(team => team.teamId));
        const sessionsByTeam = new Map(activeSessions.map(session => [session.teamId, session]));
        const sanitized = teams.map(t => {
            const session = sessionsByTeam.get(t.teamId);
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
    const { gameId, name } = req.body || {};
    if (!isValidObjectId(gameId) || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ message: 'Missing required fields.' });
    }
    const lockId = String(gameId);
    if (gameDeletionLocks.has(lockId)) {
        return res.status(409).json({ message: 'This game is being deleted. Please try again later.' });
    }
    gameDeletionLocks.add(lockId);
    try {
        const db = getDb();
        const game = await db.collection('games').findOne({ _id: new ObjectID(gameId) });
        if (!game) {
            return res.status(404).json({ message: 'Game not found.' });
        }
        const existingCount = await db.collection('teams').countDocuments({ gameId: String(gameId) });
        if (existingCount >= 4) {
            return res.status(400).json({ message: 'Game already has maximum 4 teams.' });
        }
        if (req.body.teamId !== undefined && typeof req.body.teamId !== 'string') {
            return res.status(400).json({ message: 'A valid Team ID is required.' });
        }
        let teamId = req.body.teamId ? req.body.teamId.trim().toUpperCase() : null;
        if (!teamId) {
            teamId = auth.generateTeamId(1, existingCount + 1);
        }
        const dup = await db.collection('teams').findOne({ teamId });
        if (dup) {
            return res.status(400).json({ message: `Team ID ${teamId} already exists.` });
        }
        if (req.body.password !== undefined && typeof req.body.password !== 'string') {
            return res.status(400).json({ message: 'A valid team password is required.' });
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
        const cachedGame = games.find(item => String(item._id) === String(gameId));
        notifyAdmins('Team registered', `${newTeam.name} was registered for "${cachedGame ? cachedGame.name : 'a game session'}".`);
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
    } finally {
        gameDeletionLocks.delete(lockId);
    }
});

app.post('/api/teams/generate-all', auth.authenticateAdmin, async function (req, res) {
    const { gameId } = req.body || {};
    if (!isValidObjectId(gameId)) {
        return res.status(400).json({ message: 'A valid Game ID is required.' });
    }
    const lockId = String(gameId);
    if (gameDeletionLocks.has(lockId)) {
        return res.status(409).json({ message: 'This game is being deleted. Please try again later.' });
    }
    gameDeletionLocks.add(lockId);
    try {
        const db = getDb();
        const allGames = await getAllGames();
        if (!allGames.some(game => String(game._id) === String(gameId))) {
            return res.status(404).json({ message: 'Game not found.' });
        }
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
        if (generated.length > 0) {
            const game = allGames.find(item => String(item._id) === String(gameId));
            notifyAdmins('Teams registered', `${generated.length} team account(s) were registered for "${game ? game.name : 'a game session'}".`);
        }
        res.json({ teams: generated });
    } catch (err) {
        res.status(500).json({ message: 'Server unavailable.' });
    } finally {
        gameDeletionLocks.delete(lockId);
    }
});

app.put('/api/teams/:id', auth.authenticateAdmin, async function (req, res) {
    if (!isValidObjectId(req.params.id)) {
        return res.status(400).json({ message: 'Invalid Team ID.' });
    }
    const lockId = String(req.params.id);
    const disableRequested = req.body && req.body.status === 'disabled';
    if (disableRequested && teamDeletionLocks.has(lockId)) {
        return res.status(409).json({ message: 'This team account is already being changed.' });
    }
    if (disableRequested) teamDeletionLocks.add(lockId);
    try {
        const db = getDb();
        const updates = { updatedAt: new Date() };
        if (req.body.name !== undefined) {
            if (typeof req.body.name !== 'string' || !req.body.name.trim()) {
                return res.status(400).json({ message: 'A valid team name is required.' });
            }
            updates.name = req.body.name.trim();
        }
        if (req.body.status !== undefined) {
            if (!['active', 'disabled'].includes(req.body.status)) {
                return res.status(400).json({ message: 'Team status must be active or disabled.' });
            }
            updates.status = req.body.status;
        }
        const result = await db.collection('teams').findOneAndUpdate(
            { _id: new ObjectID(req.params.id) },
            { $set: updates },
            { returnOriginal: false }
        );
        if (!result.value) {
            return res.status(404).json({ message: 'Team not found.' });
        }
        if (updates.status === 'disabled') {
            await auth.revokeSessionsForTeam(io, result.value.teamId, 'disabled');
        }
        notifyAdmins(
            'Team account updated',
            `${result.value.name} was ${updates.status ? updates.status : 'renamed'}.`
        );
        res.json(result.value);
    } catch (err) {
        res.status(500).json({ message: 'Server unavailable.' });
    } finally {
        if (disableRequested) teamDeletionLocks.delete(lockId);
    }
});

app.post('/api/teams/:id/reset-password', auth.authenticateAdmin, async function (req, res) {
    if (!isValidObjectId(req.params.id)) {
        return res.status(400).json({ message: 'Invalid Team ID.' });
    }
    const lockId = String(req.params.id);
    if (teamDeletionLocks.has(lockId)) {
        return res.status(409).json({ message: 'This team account is already being changed.' });
    }
    teamDeletionLocks.add(lockId);
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
        await auth.revokeSessionsForTeam(io, team.value.teamId, 'password-reset');
        notifyAdmins('Team password reset', `The password for ${team.value.teamId} was reset.`);
        res.json({ teamId: team.value.teamId, rawPassword });
    } catch (err) {
        res.status(500).json({ message: 'Server unavailable.' });
    } finally {
        teamDeletionLocks.delete(lockId);
    }
});

app.delete('/api/teams/:id', auth.authenticateAdmin, async function (req, res) {
    if (!isValidObjectId(req.params.id)) {
        return res.status(400).json({ message: 'Invalid Team ID.' });
    }
    try {
        const result = await deleteTeamRecords([new ObjectID(req.params.id)]);
        const statusCode = result.failed ? (result.deletedCount > 0 ? 207 : 500) : 200;
        res.status(statusCode).json({
            success: !result.failed,
            message: result.partial ? 'Some team records could not be deleted.' :
                result.failed ? 'No team records were deleted.' : 'Team deleted successfully.',
            ...result
        });
    } catch (err) {
        res.status(err.status || 500).json({ message: err.status ? err.message : 'Failed to delete team.' });
    }
});

app.post('/api/teams/bulk-delete', auth.authenticateAdmin, async function (req, res) {
    const body = req.body || {};
    if (!isValidObjectId(body.gameId)) {
        return res.status(400).json({ message: 'A valid gameId is required.' });
    }

    try {
        const db = getDb();
        let teamIds;
        if (body.deleteAll === true) {
            if (body.confirmationText !== 'DELETE ALL TEAMS') {
                return res.status(400).json({ message: 'Type DELETE ALL TEAMS to confirm.' });
            }
            const teams = await db.collection('teams').find({ gameId: String(body.gameId) }).project({ _id: 1 }).toArray();
            teamIds = teams.map(team => team._id);
        } else {
            if (!Array.isArray(body.teamIds) || body.teamIds.length === 0 || body.teamIds.length > 100) {
                return res.status(400).json({ message: 'Select between 1 and 100 teams.' });
            }
            if (body.teamIds.some(id => !isValidObjectId(id))) {
                return res.status(400).json({ message: 'One or more Team IDs are invalid.' });
            }
            teamIds = Array.from(new Set(body.teamIds)).map(id => new ObjectID(id));
        }

        if (teamIds.length === 0) {
            return res.status(400).json({ message: 'There are no teams to delete.' });
        }
        const result = await deleteTeamRecords(teamIds, String(body.gameId));
        const statusCode = result.failed ? (result.deletedCount > 0 ? 207 : 500) : 200;
        res.status(statusCode).json({
            success: !result.failed,
            message: result.partial ? 'Some team records could not be deleted.' :
                result.failed ? 'No team records were deleted.' : undefined,
            ...result
        });
    } catch (err) {
        res.status(err.status || 500).json({ message: err.status ? err.message : 'Failed to delete teams.' });
    }
});

app.post('/logout', async function (req, res) {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
    try {
        const session = token ? await auth.getSession(token) : null;
        const revokedSession = token ? await auth.deleteSession(token) : null;
        const socketId = session ? session.socketId : revokedSession && revokedSession.socketId;
        if (socketId) auth.disconnectSocket(io, socketId);
        if (socketId) users = users.filter(user => user.socketId !== socketId);
    } catch (error) {
        console.error('Session logout failed:', error.message);
        return res.status(503).json({ message: 'Logout unavailable.' });
    }
    res.send({message: 'ok'});
});

app.get('/users', auth.authenticateAdmin, function (req, res) {
    res.send(getPublicSocketUsers());
});
app.get('/games', auth.authenticateAdmin, function (req, res) {
    res.send(games);
});

app.get('/clean', auth.authenticateAdmin, function (req, res) {
    if (users) {
        users = users.filter(user => user.status !== 'inactive');
    }
    res.send(getPublicSocketUsers());
})

app.post('/create-game', auth.authenticateAdmin, function (req, res) {
    const customName = req.body && req.body.name;
    createNewGame(customName)
        .then((result) => {
            const newGame = result.ops[0];
            games.push(newGame);
            notifyAdmins('Game created', `"${newGame.name}" was created.`);
            res.send(result);
        })
        .catch((err) => {
            res.status(500).send(err);
        });
});

app.post('/api/games/rename', auth.authenticateAdmin, async function (req, res) {
    const { gameId, name } = req.body;
    if (!gameId || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ message: 'Game ID and valid name are required.' });
    }
    if (!isValidObjectId(gameId)) {
        return res.status(400).json({ message: 'Invalid Game ID.' });
    }
    try {
        const db = getDb();
        const trimmed = name.trim();
        const updateResult = await db.collection('games').updateOne(
            { _id: new ObjectID(gameId) },
            { $set: { name: trimmed } }
        );
        if (updateResult.matchedCount === 0) {
            return res.status(404).json({ message: 'Game not found.' });
        }
        const game = games.find(g => String(g._id) === String(gameId));
        if (game) {
            game.name = trimmed;
            io.to(gameId).emit('game-updated', game);
        }
        notifyAdmins('Game renamed', `The game was renamed to "${trimmed}".`);
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
        notifyAdmins('Game duplicated', `"${duplicated.name}" was created as a copy.`);
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
        const updateResult = await db.collection('games').updateOne(
            { _id: new ObjectID(gameId) },
            { $set: { game_status: status } }
        );
        if (updateResult.matchedCount === 0) {
            return res.status(404).json({ message: 'Game not found.' });
        }
        const game = games.find(g => String(g._id) === String(gameId));
        if (game) {
            game.game_status = status;
            io.to(gameId).emit('game-state-changed', { gameId, game_state: status });
            io.to(gameId).emit('game-updated', game);
        }
        if (status === 'active' || status === 'completed' || status === 'paused' || status === 'archived') {
            const title = status === 'active' ? 'Game started' : status === 'completed' ? 'Game completed' : `Game ${status}`;
            notifyAdmins(title, `"${game ? game.name : 'Game'}" is now ${status}.`);
        }
        res.json({ success: true, status, game });
    } catch (err) {
        res.status(500).json({ message: 'Failed to update game status.' });
    }
});

app.post('/api/games/delete', auth.authenticateAdmin, async function (req, res) {
    const body = req.body || {};
    const { gameId, confirmName } = body;
    if (!gameId || typeof confirmName !== 'string' || !confirmName.trim()) {
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
        const result = await deleteGameRecord(gameId);
        res.json({ success: true, ...result, message: `Game "${expectedName}" was deleted.` });
    } catch (err) {
        res.status(err.status || 500).json({ message: err.status ? err.message : 'Failed to delete game.' });
    }
});

app.post('/api/games/bulk-delete', auth.authenticateAdmin, async function (req, res) {
    const body = req.body || {};
    let gameIds;
    try {
        const db = getDb();
        if (body.deleteAll === true) {
            if (body.confirmationText !== 'DELETE ALL GAMES') {
                return res.status(400).json({ message: 'Type DELETE ALL GAMES to confirm.' });
            }
            const allGames = await db.collection('games').find({}, { _id: 1 }).toArray();
            gameIds = allGames.map(game => String(game._id));
        } else {
            if (!Array.isArray(body.gameIds) || body.gameIds.length === 0 || body.gameIds.length > 100) {
                return res.status(400).json({ message: 'Select between 1 and 100 games.' });
            }
            if (body.gameIds.some(id => !isValidObjectId(id))) {
                return res.status(400).json({ message: 'One or more Game IDs are invalid.' });
            }
            gameIds = Array.from(new Set(body.gameIds));
        }

        if (gameIds.length === 0) {
            return res.json({ success: true, deletedCount: 0, failedCount: 0, results: [] });
        }

        const foundGames = await db.collection('games').find({
            _id: { $in: gameIds.map(id => new ObjectID(id)) }
        }).toArray();
        if (foundGames.length !== gameIds.length) {
            return res.status(404).json({ message: 'One or more selected games no longer exist. Refresh and try again.' });
        }

        const results = [];
        for (const id of gameIds) {
            try {
                results.push({ success: true, ...(await deleteGameRecord(id)) });
            } catch (err) {
                results.push({ success: false, gameId: id, message: err.status ? err.message : 'Database operation failed.' });
            }
        }
        const deletedCount = results.filter(result => result.success).length;
        const failedCount = results.length - deletedCount;
        res.status(failedCount ? (deletedCount ? 207 : 409) : 200).json({
            success: failedCount === 0,
            deletedCount,
            failedCount,
            results
        });
    } catch (err) {
        res.status(err.status || 500).json({ message: err.status ? err.message : 'Failed to delete games.' });
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

app.get('/get-all-games', auth.authenticateAdmin, function (req, res) {
    res.send(games);
});

app.get('/get-game', auth.authenticateSession, async function (req, res) {
    const id = String(req.query.gameId || '');
    if (!isValidObjectId(id)) {
        return res.status(400).json({ message: 'Invalid Game ID.' });
    }
    if (req.session.role === 'player') {
        if (String(req.session.gameId) !== id) {
            return res.status(403).json({ message: 'This team is not assigned to the requested game.' });
        }
        try {
            const team = await getDb().collection('teams').findOne(
                { teamId: req.session.teamId },
                { projection: { status: 1, gameId: 1 } }
            );
            if (!team || team.status === 'disabled' || String(team.gameId) !== id) {
                return res.status(403).json({ message: 'This team cannot access the requested game.' });
            }
        } catch (error) {
            return res.status(503).json({ message: 'Game access could not be verified.' });
        }
    } else if (req.session.role !== 'admin') {
        return res.status(403).json({ message: 'Game access is not authorized.' });
    }
    const game = games.find(item => String(item._id) === id);
    if (!game) {
        return res.status(404).json({ message: 'Game not found.' });
    }
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
        let connectedUser = {
            socketId: socket.id,
            status: 'active'
        };
        users.push(connectedUser);
    socket.on('authenticate', async data => {
        try {
            const session = data && typeof data.token === 'string'
                ? await auth.getSession(data.token)
                : null;
            if (!session) {
                io.to(socket.id).emit('session-expired', { message: 'Your session has expired. Please sign in again.' });
                return;
            }
            if (session.role === 'player') {
                if (session.socketId && session.socketId !== socket.id && isSocketConnected(session.socketId)) {
                    io.to(socket.id).emit('player-add-error', { error: true, msg: 'Team already connected.' });
                    socket.disconnect(true);
                    return;
                }
                const team = await getDb().collection('teams').findOne(
                    { teamId: session.teamId },
                    { projection: { status: 1 } }
                );
                if (!team || team.status === 'disabled') {
                    await auth.deleteSession(data.token);
                    io.to(socket.id).emit('team-session-revoked', {
                        teamId: session.teamId,
                        reason: team ? 'disabled' : 'deleted'
                    });
                    return;
                }
            }
            connectedUser.token = session.token;
            connectedUser.userType = session.role;
            connectedUser.name = session.userName || session.teamName;
            connectedUser.teamId = session.teamId;
            connectedUser.gameId = session.gameId;
            await auth.updateSessionSocket(session.token, socket.id);
            if (session.role === 'admin') {
                socket.join(ADMIN_NOTIFICATION_ROOM);
            }
            io.to(socket.id).emit('update-user', {
                token: session.token,
                socketId: socket.id,
                userName: session.userName || session.teamName,
                isAdmin: session.role === 'admin' ? 'true' : undefined,
                isPlayer: session.role === 'player' ? 'true' : undefined,
                teamId: session.teamId,
                gameId: session.gameId
            });
        } catch (error) {
            console.error('Socket session authentication failed:', error.message);
            io.to(socket.id).emit('session-verification-error', { message: 'Session verification unavailable.' });
        }
        });
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
            const session = await getSocketSession(token, socket);
            if (session === false) return;
            if (!session) {
                io.to(socket.id).emit("player-add-error", { error: true, msg: "Session expired" });
                notifyAdmins('Player connection error', 'A team attempted to join with an expired session.');
                return;
            }
            if (gameDeletionLocks.has(String(data.gameId)) || teamDeletionLocks.has(String(session.teamId))) {
                io.to(socket.id).emit("player-add-error", { error: true, msg: "This session is closing. Please sign in again." });
                return;
            }

            users.forEach(user => {
                if (user.socketId === data.socketId) {
                    user.gameId = data.gameId;
                }
            });

            if (session.role === 'admin') {
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
                    notifyAdmins('Player connection error', `${session.teamName || 'A team'} tried to join an unassigned game.`);
                    return;
                }

                try {
                    const db = getDb();
                    const teamDoc = await db.collection('teams').findOne({ teamId: session.teamId });
                    if (!teamDoc || teamDoc.status === 'disabled') {
                        io.to(socket.id).emit("player-add-error", { error: true, msg: teamDoc ? "Team account disabled." : "Team account unavailable." });
                        notifyAdmins('Player connection error', `Unavailable team ${session.teamName || session.teamId} attempted to connect.`);
                        return;
                    }
                } catch (err) {
                    io.to(socket.id).emit("player-add-error", { error: true, msg: "Server unavailable." });
                    return;
                }

                let activeSess;
                try {
                    activeSess = await auth.findSessionByTeamId(session.teamId);
                } catch (error) {
                    console.error('Team session lookup failed:', error.message);
                    io.to(socket.id).emit("player-add-error", { error: true, msg: "Server unavailable." });
                    return;
                }
                if (activeSess && activeSess.socketId && activeSess.socketId !== socket.id && isSocketConnected(activeSess.socketId)) {
                    io.to(socket.id).emit("player-add-error", { error: true, msg: "Team already connected." });
                    notifyAdmins('Player connection error', `${session.teamName || session.teamId} tried to connect while already active.`);
                    return;
                }
                try {
                    await auth.updateSessionSocket(session.token, socket.id);
                } catch (error) {
                    console.error('Team socket session update failed:', error.message);
                    io.to(socket.id).emit("player-add-error", { error: true, msg: "Server unavailable." });
                    return;
                }

                let targetGame = null;
                let existingPlayer = null;
                games.forEach(g => {
                    if (JSON.stringify(g._id) === JSON.stringify(data.gameId)) {
                        targetGame = g;
                        g.players.forEach(p => {
                            if (belongsToSessionTeam(p, session)) {
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
                    notifyAdmins('Player connection error', `${session.teamName || session.teamId} could not join a full game.`);
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
                            notifyAdmins('Team joined game', `${player.name} joined "${value.name || 'a game session'}".`);
                        }
                    });
            }
        });
        socket.on('leave-game', async data => {
            const connectedUser = users.find(user => user.socketId === socket.id);
            const session = connectedUser ? await getSocketSession(connectedUser.token, socket) : null;
            if (!session || session.role !== 'player') return;

            const gameId = String(session.gameId || '');
            if (!gameId || (data && data.gameId && String(data.gameId) !== gameId)) return;
            socket.leave(gameId);

            const game = games.find(item => String(item._id) === gameId);
            const player = game && (game.players || []).find(item => item.teamId === session.teamId);
            if (player) {
                player.status = 'inactive';
                try {
                    await updatePlayer(gameId, player._id, 'inactive', 'paused', player.rounds, player.loans);
                    io.to(gameId).emit('game-updated', game);
                    notifyAdmins('Team left game', `${player.name} left "${game.name || 'a game session'}".`);
                } catch (error) {
                    notifyAdmins('Game connection error', `Could not persist the disconnect for ${player.name}.`);
                }
            }
            delete connectedUser.gameId;
        });
        socket.on('player-ready', async (data) => {
            const user = users.find(u => u.socketId === socket.id);
            const session = user ? await getSocketSession(user.token, socket) : null;
            if (!session || session.role !== 'player' || !data ||
                String(session.gameId) !== String(data.gameId)) {
                return;
            }
            if (data && data.userId) {
                games.forEach(game => {
                    if (JSON.stringify(game._id) === JSON.stringify(data.gameId)) {
                        game.players.forEach(player => {
                            if (String(player._id) === String(data.userId) && belongsToSessionTeam(player, session)) {
                                if (player.game_status === 'ready') {
                                    return;
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
                                if (data.round[0].return_value > 0) {
                                    round.total_portfolio_value += (data.round[0].return_value - data.round[0].value);
                                }
                                player.loans = data.prevLoans;
                                if (data.loan && data.loan.status === 'active') {
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
        socket.on('game-start', async (data) => {
            const user = users.find(u => u.socketId === socket.id);
            const session = user ? await getSocketSession(user.token, socket) : null;
            if (!session || session.role !== 'admin') {
                return;
            }
            games.forEach(game => {
                if (JSON.stringify(game._id) === JSON.stringify(data.gameId)) {
                    const wasActive = game.game_status === 'active' || game.game_status === 'in_progress';
                    game.game_status = 'active';
                    updateGame(data.gameId, true, "active", game.players)
                        .then(res => {
                            if (!wasActive) {
                                notifyAdmins('Game started', `"${game.name || 'Game'}" was started.`);
                            }
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
                                updateGame(game._id, false, game.game_status, game.players)
                                    .then(() => {
                                        if (g_status) {
                                            notifyAdmins('Game completed', `"${game.name || 'Game'}" completed all rounds.`);
                                        }
                                    })
                                    .catch(() => {
                                        notifyAdmins('Game update error', `Could not persist the final state for "${game.name || 'Game'}".`);
                                    });
                            }
                        });
                }
            })
        });

        socket.on('round-ready', async (data) => {
            const user = users.find(u => u.socketId === socket.id);
            const session = user ? await getSocketSession(user.token, socket) : null;
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
            const session = user ? await getSocketSession(user.token, socket) : null;
            if (!session || session.role !== 'admin') {
                return;
            }
            const targetGame = games.find(g => String(g._id) === String(data.gameId));
            if (targetGame) {
                const previousStatus = targetGame.game_status;
                try {
                    const db = getDb();
                    const result = await db.collection('games').updateOne(
                        { _id: new ObjectID(data.gameId) },
                        { $set: { game_status: data.state } }
                    );
                    if (result.matchedCount === 0) return;
                } catch (err) {
                    notifyAdmins('Game update error', `Could not change "${targetGame.name || 'Game'}" to ${data.state}.`);
                    return;
                }
                targetGame.game_status = data.state;
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
                if (previousStatus !== data.state) {
                    if (data.state === 'active') {
                        notifyAdmins('Game started', `"${targetGame.name || 'Game'}" was started.`);
                    } else if (data.state === 'completed') {
                        notifyAdmins('Game completed', `"${targetGame.name || 'Game'}" was completed.`);
                    } else {
                        notifyAdmins('Game status changed', `"${targetGame.name || 'Game'}" is now ${data.state}.`);
                    }
                }
            }
        });

        socket.on('dice-rolled', async (data) => {
            const user = users.find(u => u.socketId === socket.id);
            const session = user ? await getSocketSession(user.token, socket) : null;
            if (!session || session.role !== 'player' || !data ||
                String(session.gameId) !== String(data.gameId)) {
                return;
            }
            if (data && data.gameId) {
                const targetGame = games.find(g => String(g._id) === String(data.gameId));
                if (!targetGame || !targetGame.round_seq || targetGame.round_seq.length === 0) {
                    return;
                }
                const currentPlayer = targetGame.players.find(player =>
                    String(player._id) === String(targetGame.round_seq[0].playerId)
                );
                if (!currentPlayer || !belongsToSessionTeam(currentPlayer, session)) {
                    return;
                }
                if (data.player_id && String(targetGame.round_seq[0].playerId) !== String(data.player_id)) {
                    return;
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
                    updateGame(game._id, false, game.game_status, game.players)
                        .then(() => {
                            if (g_status) {
                                notifyAdmins('Game completed', `"${game.name || 'Game'}" completed all rounds.`);
                            }
                        })
                        .catch(() => {
                            notifyAdmins('Game update error', `Could not persist the final state for "${game.name || 'Game'}".`);
                        });
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

app.get('/update-game', auth.authenticateAdmin, function (req, res) {
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

let server;
mongoClient(async () => {
    await auth.initializeSessionStore(getDb());
    try {
        games.push(...await getAllGames());
    } catch (error) {
        console.error('Could not load games at startup:', error.message);
        throw error;
    }
    ioConnection();
    server = http.listen(port, hostname, function () {
        console.log("PORT", port, "hostname", hostname);
        console.log('server listening on ', port);
        console.log('connected to database server');
        console.log("game ready");
    });
}).catch(error => {
    console.error('Server startup failed:', error.message);
    process.exit(1);
});

const gracefulShutdown = (signal) => {
    console.log(`Received ${signal}, shutting down gracefully...`);
    if (!server) {
        process.exit(0);
    }
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