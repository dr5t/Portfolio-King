const crypto = require('crypto');

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
    if (!password || !stored || typeof stored !== 'string' || !stored.includes(':')) {
        return false;
    }
    const [salt, key] = stored.split(':');
    const hash = crypto.scryptSync(password, salt, 64);
    const keyBuf = Buffer.from(key, 'hex');
    if (hash.length !== keyBuf.length) {
        return false;
    }
    return crypto.timingSafeEqual(hash, keyBuf);
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
    authenticateAdmin,
    authenticateSession
};
