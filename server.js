const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { ensureFixturesSynced } = require('./ipl2026-fixtures');
const { refreshVenueGeocodesIfConfigured, attachGeocodes } = require('./venueGeocode');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = "ipl2026_super_secret_key";

// Middleware — never use Access-Control-Allow-Origin: * with credentials (breaks admin PUT in many browsers)
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// ✅ Database (SYNC - better-sqlite3)
const db = new Database('./prediction.db');
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
);

CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    time TEXT,
    team1 TEXT,
    team2 TEXT,
    stadium TEXT,
    prediction TEXT
);
`);

ensureFixturesSynced(db);

setImmediate(() => {
    refreshVenueGeocodesIfConfigured(db).catch((err) => {
        console.warn('Google Geocoding (optional):', err.message || err);
    });
});

// Seed users
const userCount = db.prepare(`SELECT COUNT(*) as count FROM users`).get();
if (userCount.count === 0) {
    db.prepare(`INSERT INTO users (username, password) VALUES (?, ?)`)
        .run('admin', 'password123');
}

// OTP store
const otpStore = {};

// Request OTP
app.post('/api/request-otp', (req, res) => {
    const { identifier } = req.body;
    if (!identifier) return res.status(400).json({ error: "Missing identifier" });

    const otp = Math.floor(1000 + Math.random() * 9000).toString();

    otpStore[identifier] = {
        otp,
        expires: Date.now() + 5 * 60 * 1000
    };

    console.log(`OTP for ${identifier}: ${otp}`);

    res.json({ success: true });
});

// Verify OTP
app.post('/api/verify-otp', (req, res) => {
    const { identifier, otp } = req.body;

    const data = otpStore[identifier];
    if (!data || data.otp !== otp || Date.now() > data.expires) {
        return res.status(401).json({ error: "Invalid OTP" });
    }

    delete otpStore[identifier];

    db.prepare(`INSERT OR IGNORE INTO users (username) VALUES (?)`)
        .run(identifier);

    const user = db.prepare(`SELECT * FROM users WHERE username = ?`)
        .get(identifier);

    const token = jwt.sign({ id: user.id }, SECRET_KEY, { expiresIn: '1d' });

    res.cookie('token', token, { httpOnly: true, sameSite: 'lax', path: '/' });

    res.json({ success: true });
});

app.post('/api/logout', (req, res) => {
    res.clearCookie('token', { httpOnly: true, sameSite: 'lax', path: '/' });
    res.json({ success: true });
});

// Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    const user = db.prepare(`SELECT * FROM users WHERE username = ? AND password = ?`)
        .get(username, password);

    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign({ id: user.id }, SECRET_KEY, { expiresIn: '1d' });

    res.cookie('token', token, { httpOnly: true, sameSite: 'lax', path: '/' });

    res.json({ success: true });
});

// Auth middleware
function authenticate(req, res, next) {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: "Unauthorized" });

    try {
        req.user = jwt.verify(token, SECRET_KEY);
        next();
    } catch {
        res.status(401).json({ error: "Unauthorized" });
    }
}

// Get matches (re-sync official fixtures first so the schedule always stays complete)
app.get('/api/matches', (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    try {
        ensureFixturesSynced(db);
        const matches = db.prepare(
            `SELECT * FROM matches ORDER BY date ASC, time ASC, id ASC`
        ).all();
        res.json(attachGeocodes(matches));
    } catch (err) {
        console.error('GET /api/matches:', err);
        res.status(500).json({ error: 'Failed to load matches' });
    }
});

// Update match
app.put('/api/matches/:id', authenticate, (req, res) => {
    try {
        const { prediction } = req.body || {};
        const id = parseInt(req.params.id, 10);
        if (!Number.isFinite(id)) {
            return res.status(400).json({ error: 'Invalid match id' });
        }
        if (prediction === undefined || prediction === null || String(prediction).trim() === '') {
            return res.status(400).json({ error: 'Missing prediction' });
        }

        const match = db.prepare(`SELECT team1, team2 FROM matches WHERE id = ?`).get(id);
        if (!match) {
            return res.status(404).json({ error: 'Match not found' });
        }

        const value = String(prediction).trim();
        const t1 = String(match.team1).trim();
        const t2 = String(match.team2).trim();
        const allowed = new Set(['Pending', t1, t2]);
        if (!allowed.has(value)) {
            return res.status(400).json({ error: 'Invalid prediction value' });
        }

        db.prepare(`UPDATE matches SET prediction = ? WHERE id = ?`).run(value, id);

        res.json({ success: true });
    } catch (err) {
        console.error('PUT /api/matches:', err);
        res.status(500).json({ error: 'Could not save prediction' });
    }
});

// Me
app.get('/api/me', authenticate, (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json({ user: req.user });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});