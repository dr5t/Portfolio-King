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

const sessions = new Map();
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function createSession(data) {
    const token = crypto.randomBytes(32).toString('hex');
    const session = {
        ...data,
        token,
        createdAt: Date.now(),
        lastSeen: Date.now()
    };
    sessions.set(token, session);
    return token;
}

function getSession(token) {
    if (!token) return null;
    const session = sessions.get(token);
    if (!session) return null;
    if (Date.now() - session.lastSeen > SESSION_TTL_MS) {
        sessions.delete(token);
        return null;
    }
    session.lastSeen = Date.now();
    return session;
}

function deleteSession(token) {
    if (token) sessions.delete(token);
}

function findSessionByTeamId(teamId) {
    for (const session of sessions.values()) {
        if (session.teamId === teamId && Date.now() - session.lastSeen <= SESSION_TTL_MS) {
            return session;
        }
    }
    return null;
}

function updateSessionSocket(token, socketId) {
    const session = getSession(token);
    if (session) {
        session.socketId = socketId;
    }
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

function invalidateSessionsForGame(gameId) {
    if (!gameId) return;
    for (const [token, session] of sessions.entries()) {
        if (session.gameId && String(session.gameId) === String(gameId)) {
            sessions.delete(token);
        }
    }
}

function authenticateAdmin(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : req.query.token;
    const session = getSession(token);
    if (!session || session.role !== 'admin') {
        return res.status(401).json({ message: 'Unauthorized. Admin session required.' });
    }
    req.session = session;
    next();
}

function authenticateSession(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : req.query.token;
    const session = getSession(token);
    if (!session) {
        return res.status(401).json({ message: 'Session expired' });
    }
    req.session = session;
    next();
}

module.exports = {
    hashPassword,
    verifyPassword,
    generatePassword,
    generateTeamId,
    createSession,
    getSession,
    deleteSession,
    findSessionByTeamId,
    updateSessionSocket,
    checkRateLimit,
    recordFailedAttempt,
    resetRateLimit,
    invalidateSessionsForGame,
    disconnectSocket,
    authenticateAdmin,
    authenticateSession
};
