const crypto = require('crypto');
const util = require('util');
const pbkdf2Async = util.promisify(crypto.pbkdf2);

const PBKDF2_ITERATIONS = 600000;
const PBKDF2_KEYLEN = 32;
const PBKDF2_DIGEST = 'sha256';

/**
 * Asynchronous PBKDF2-HMAC-SHA256 password hashing with 600,000 iterations.
 * Format: pbkdf2$600000$<saltHex>$<derivedKeyHex>
 */
async function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = await pbkdf2Async(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST);
    return `pbkdf2$${PBKDF2_ITERATIONS}$${salt}$${derivedKey.toString('hex')}`;
}

/**
 * Constant-time password verification supporting 600,000-iteration PBKDF2-HMAC-SHA256
 * and backward-compatible migration for legacy scrypt and pbkdf2 hashes.
 * Returns: { valid: boolean, needsRehash: boolean }
 */
async function verifyPassword(password, stored) {
    if (!password || !stored || typeof stored !== 'string') {
        return { valid: false, needsRehash: false };
    }

    // Modern format: pbkdf2$iterations$salt$hash
    if (stored.startsWith('pbkdf2$')) {
        const parts = stored.split('$');
        if (parts.length === 4) {
            const iterations = parseInt(parts[1], 10);
            const salt = parts[2];
            const originalHashHex = parts[3];
            try {
                const derivedKey = await pbkdf2Async(password, salt, iterations, PBKDF2_KEYLEN, PBKDF2_DIGEST);
                const originalKeyBuf = Buffer.from(originalHashHex, 'hex');
                if (derivedKey.length !== originalKeyBuf.length) {
                    return { valid: false, needsRehash: false };
                }
                const match = crypto.timingSafeEqual(derivedKey, originalKeyBuf);
                return { valid: match, needsRehash: iterations < PBKDF2_ITERATIONS };
            } catch (e) {
                return { valid: false, needsRehash: false };
            }
        }
    }

    // Backward-compatible check for legacy salt:key formats
    if (stored.includes(':')) {
        const [salt, key] = stored.split(':');
        // Check legacy scrypt
        try {
            const hash = crypto.scryptSync(password, salt, 64);
            const keyBuf = Buffer.from(key, 'hex');
            if (hash.length === keyBuf.length && crypto.timingSafeEqual(hash, keyBuf)) {
                return { valid: true, needsRehash: true };
            }
        } catch (e) {}

        // Check legacy pbkdf2
        try {
            const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512');
            const keyBuf = Buffer.from(key, 'hex');
            if (hash.length === keyBuf.length && crypto.timingSafeEqual(hash, keyBuf)) {
                return { valid: true, needsRehash: true };
            }
        } catch (e) {}
    }

    return { valid: false, needsRehash: false };
}

function disconnectSocket(ioInstance, socketId) {
    if (!socketId || !ioInstance || !ioInstance.sockets) return;
    try {
        if (ioInstance.sockets.sockets && typeof ioInstance.sockets.sockets.get === 'function') {
            const s = ioInstance.sockets.sockets.get(socketId);
            if (s) s.disconnect(true);
        } else if (ioInstance.sockets.connected && ioInstance.sockets.connected[socketId]) {
            ioInstance.sockets.connected[socketId].disconnect(true);
        }
    } catch (e) {
        console.error('Error disconnecting socket:', e);
    }
}

function generatePassword(length = 8) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*';
    let pwd = '';
    const bytes = crypto.randomBytes(length);
    for (let i = 0; i < length; i++) {
        pwd += chars[bytes[i] % chars.length];
    }
    return pwd;
}

function generateTeamId(gameIndex = 1, teamNum = 1) {
    const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
    return `G${gameIndex}-T${teamNum}-${suffix}`;
}

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
let sessionCollection = null;

async function initializeSessionStore(db) {
    sessionCollection = db.collection('sessions');
    await Promise.all([
        sessionCollection.createIndex(
            { tokenHash: 1 },
            { unique: true, name: 'session_token_hash_unique' }
        ),
        sessionCollection.createIndex(
            { expiresAt: 1 },
            { expireAfterSeconds: 0, name: 'session_expiration_ttl' }
        ),
        sessionCollection.createIndex(
            { role: 1, teamId: 1 },
            {
                unique: true,
                partialFilterExpression: { role: 'player', teamId: { $type: 'string' } },
                name: 'one_session_per_team'
            }
        ),
        sessionCollection.createIndex(
            { gameId: 1, expiresAt: 1 },
            { name: 'sessions_by_game_and_expiration' }
        )
    ]);
}

function getSessionCollection() {
    if (!sessionCollection) {
        throw new Error('Session store is not initialized');
    }
    return sessionCollection;
}

function hashSessionToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function sessionFromDocument(document, token) {
    if (!document) return null;
    delete document.tokenHash;
    document.token = token;
    return document;
}

async function createSession(data, replaceDisconnectedTeamSession = false) {
    const token = crypto.randomBytes(32).toString('hex');
    const now = new Date();
    const document = {
        tokenHash: hashSessionToken(token),
        role: data.role,
        userName: data.userName,
        teamId: data.teamId,
        teamName: data.teamName,
        gameId: data.gameId === undefined ? undefined : String(data.gameId),
        socketId: data.socketId,
        createdAt: now,
        lastSeen: now,
        expiresAt: new Date(now.getTime() + SESSION_TTL_MS)
    };

    Object.keys(document).forEach(key => {
        if (document[key] === undefined) delete document[key];
    });

    const collection = getSessionCollection();
    if (document.role === 'player' && document.teamId) {
        const filter = {
            role: 'player',
            teamId: document.teamId,
            $or: [
                { expiresAt: { $lte: now } },
                ...(document.socketId ? [{ socketId: document.socketId }] : []),
                ...(replaceDisconnectedTeamSession ? [{ expiresAt: { $gt: now } }] : [])
            ]
        };
        await collection.findOneAndUpdate(
            filter,
            { $set: document },
            { upsert: true, returnOriginal: false }
        );
    } else {
        await collection.insertOne(document);
    }
    return token;
}

async function getSession(token) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) return null;
    const now = new Date();
    const result = await getSessionCollection().findOneAndUpdate(
        { tokenHash: hashSessionToken(token), expiresAt: { $gt: now } },
        {
            $set: {
                lastSeen: now,
                expiresAt: new Date(now.getTime() + SESSION_TTL_MS)
            }
        },
        { returnOriginal: false, projection: { tokenHash: 0 } }
    );
    return sessionFromDocument(result.value, token);
}

async function deleteSession(token) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) return null;
    const result = await getSessionCollection().findOneAndDelete({ tokenHash: hashSessionToken(token) });
    if (!result.value) return null;
    delete result.value.tokenHash;
    return result.value;
}

async function findSessionByTeamId(teamId) {
    if (!teamId) return null;
    return getSessionCollection().findOne({
        role: 'player',
        teamId,
        expiresAt: { $gt: new Date() }
    }, { projection: { tokenHash: 0 } });
}

async function findSessionsByTeamIds(teamIds) {
    if (!Array.isArray(teamIds) || teamIds.length === 0) return [];
    return getSessionCollection().find({
        role: 'player',
        teamId: { $in: teamIds },
        expiresAt: { $gt: new Date() }
    }, { projection: { teamId: 1, socketId: 1 } }).toArray();
}

async function updateSessionSocket(token, socketId) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) return false;
    const now = new Date();
    const result = await getSessionCollection().updateOne(
        { tokenHash: hashSessionToken(token), expiresAt: { $gt: now } },
        {
            $set: {
                socketId,
                lastSeen: now,
                expiresAt: new Date(now.getTime() + SESSION_TTL_MS)
            }
        }
    );
    return result.matchedCount > 0;
}

const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function checkRateLimit(ip) {
    const now = Date.now();
    const record = rateLimitMap.get(ip);
    if (!record) return { allowed: true };
    if (now - record.firstAttempt > RATE_LIMIT_WINDOW_MS) {
        rateLimitMap.delete(ip);
        return { allowed: true };
    }
    if (record.count >= MAX_ATTEMPTS) {
        const remainingSeconds = Math.ceil((RATE_LIMIT_WINDOW_MS - (now - record.firstAttempt)) / 1000);
        return { allowed: false, remainingSeconds };
    }
    return { allowed: true };
}

function recordFailedAttempt(ip) {
    const now = Date.now();
    const record = rateLimitMap.get(ip);
    if (!record || now - record.firstAttempt > RATE_LIMIT_WINDOW_MS) {
        rateLimitMap.set(ip, { count: 1, firstAttempt: now });
    } else {
        record.count += 1;
    }
}

function resetRateLimit(ip) {
    rateLimitMap.delete(ip);
}

async function invalidateSessionsForGame(gameId) {
    if (!gameId) return;
    const result = await getSessionCollection().deleteMany({ gameId: String(gameId) });
    return result.deletedCount;
}

async function revokeSessionsForGame(ioInstance, gameId) {
    if (!gameId) return 0;
    const collection = getSessionCollection();
    const sessions = await collection.find(
        { gameId: String(gameId), expiresAt: { $gt: new Date() } },
        { projection: { socketId: 1 } }
    ).toArray();
    const result = await collection.deleteMany({ gameId: String(gameId) });
    sessions.forEach(session => {
        if (session.socketId && ioInstance) {
            ioInstance.to(session.socketId).emit('game-deleted', { gameId: String(gameId) });
            disconnectSocket(ioInstance, session.socketId);
        }
    });
    return result.deletedCount;
}

async function revokeSessionsForTeam(ioInstance, teamId, reason = 'deleted') {
    if (!teamId) return 0;
    const collection = getSessionCollection();
    const sessions = await collection.find(
        { role: 'player', teamId, expiresAt: { $gt: new Date() } },
        { projection: { socketId: 1 } }
    ).toArray();
    const result = await collection.deleteMany({ role: 'player', teamId });
    sessions.forEach(session => {
        if (session.socketId && ioInstance) {
            ioInstance.to(session.socketId).emit('team-session-revoked', { teamId, reason });
            disconnectSocket(ioInstance, session.socketId);
        }
    });
    return result.deletedCount;
}

async function authenticateAdmin(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
    try {
        const session = await getSession(token);
        if (!session) {
            return res.status(401).json({ code: 'SESSION_EXPIRED', message: 'Admin session expired. Please sign in again.' });
        }
        if (session.role !== 'admin') {
            return res.status(403).json({ code: 'ADMIN_REQUIRED', message: 'Administrator access is required.' });
        }
        req.session = session;
        return next();
    } catch (error) {
        console.error('Admin session verification failed:', error.message);
        return res.status(503).json({ message: 'Session verification unavailable.' });
    }
}

async function authenticateSession(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
    try {
        const session = await getSession(token);
        if (!session) {
            return res.status(401).json({ message: 'Session expired' });
        }
        req.session = session;
        return next();
    } catch (error) {
        console.error('Session verification failed:', error.message);
        return res.status(503).json({ message: 'Session verification unavailable.' });
    }
}

module.exports = {
    hashPassword,
    verifyPassword,
    generatePassword,
    generateTeamId,
    initializeSessionStore,
    createSession,
    getSession,
    deleteSession,
    findSessionByTeamId,
    findSessionsByTeamIds,
    updateSessionSocket,
    checkRateLimit,
    recordFailedAttempt,
    resetRateLimit,
    invalidateSessionsForGame,
    revokeSessionsForGame,
    revokeSessionsForTeam,
    disconnectSocket,
    authenticateAdmin,
    authenticateSession
};
