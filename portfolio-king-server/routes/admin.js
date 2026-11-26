const express = require('express');
const router = express.Router();
const auth = require('../auth');

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

router.post('/login', async function (req, res) {
    const { username, password, userType } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Missing required fields.' });
    }
    if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
        return res.status(500).json({ message: 'Admin credentials not configured on server.' });
    }
    if (userType === 'Admin') {
        if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
            const token = await auth.createSession({
                role: 'admin',
                userName: ADMIN_USERNAME
            });
            return res.json({
                isAdmin: 'true',
                userName: ADMIN_USERNAME,
                token
            });
        } else {
            return res.status(401).json({ message: 'Invalid Admin ID or Password.' });
        }
    }
    return res.status(400).json({ message: 'Invalid user type.' });
});

router.get('/', function (req, res) {
    res.send('Welcome to server');
});

module.exports = router;
