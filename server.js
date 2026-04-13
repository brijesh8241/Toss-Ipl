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

// Prevent duplicate rows for the same fixture (duplicates can make a saved
// prediction look like it "changed" back to Pending if the UI shows the other row).
db.exec(`
CREATE UNIQUE INDEX IF NOT EXISTS idx_matches_unique
ON matches(date, team1, team2);
`);

// If duplicates already exist (from earlier seeds), keep the best one.
// Priority: non-Pending prediction > lowest id.
db.transaction(() => {
    const dups = db.prepare(`
        SELECT date, team1, team2, COUNT(*) as c
        FROM matches
        GROUP BY date, team1, team2
        HAVING c > 1
    `).all();

    const pick = db.prepare(`
        SELECT id, prediction
        FROM matches
        WHERE date = ? AND team1 = ? AND team2 = ?
        ORDER BY (prediction <> 'Pending') DESC, id ASC
        LIMIT 1
    `);
    const ids = db.prepare(`
        SELECT id FROM matches
        WHERE date = ? AND team1 = ? AND team2 = ?
    `);
    const del = db.prepare(`DELETE FROM matches WHERE id = ?`);

    for (const g of dups) {
        const keep = pick.get(g.date, g.team1, g.team2);
        const allIds = ids.all(g.date, g.team1, g.team2);
        for (const row of allIds) {
            if (row.id !== keep.id) del.run(row.id);
        }
    }
})();

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

function isEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function isPhone(value) {
    return /^\+?[0-9]{10,15}$/.test(String(value || '').trim());
}

async function sendOtpEmail(to, otp) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.OTP_FROM_EMAIL;
    if (!apiKey || !from) return { ok: false, reason: 'Email service is not configured' };

    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            from,
            to: [to],
            subject: 'Your IPL Toss Prediction OTP',
            html: `<p>Your OTP is <strong>${otp}</strong>.</p><p>This OTP expires in 5 minutes.</p>`
        })
    });

    if (!response.ok) {
        const raw = await response.text();
        return { ok: false, reason: `Email API error: ${raw.slice(0, 180)}` };
    }
    return { ok: true, method: 'email' };
}

async function sendOtpSms(to, otp) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM_NUMBER;
    if (!sid || !token || !from) return { ok: false, reason: 'SMS service is not configured' };

    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const body = new URLSearchParams({
        To: to,
        From: from,
        Body: `Your IPL Toss Prediction OTP is ${otp}. It expires in 5 minutes.`
    });
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body
    });

    if (!response.ok) {
        const raw = await response.text();
        return { ok: false, reason: `SMS API error: ${raw.slice(0, 180)}` };
    }
    return { ok: true, method: 'sms' };
}

// Request OTP
app.post('/api/request-otp', (req, res) => {
    const { identifier } = req.body;
    const normalized = String(identifier || '').trim();
    if (!normalized) return res.status(400).json({ error: "Missing identifier" });

    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    otpStore[normalized] = {
        otp,
        expires: Date.now() + 5 * 60 * 1000
    };

    // Terminal fallback is always available for local development.
    const terminalLine = `OTP for ${normalized}: ${otp} (valid 5 minutes)`;
    console.log('='.repeat(50));
    console.log(terminalLine);
    console.log('='.repeat(50));

    const respond = (payload = {}) => {
        const out = { success: true, ...payload };
        if (process.env.NODE_ENV !== 'production') out.debugOtp = otp;
        return res.json(out);
    };

    const finalize = async () => {
        try {
            if (isEmail(normalized)) {
                const emailResult = await sendOtpEmail(normalized, otp);
                if (emailResult.ok) return respond({ delivery: 'email' });
                return respond({ delivery: 'terminal', warning: emailResult.reason });
            }
            if (isPhone(normalized)) {
                const smsResult = await sendOtpSms(normalized, otp);
                if (smsResult.ok) return respond({ delivery: 'sms' });
                return respond({ delivery: 'terminal', warning: smsResult.reason });
            }
            return respond({
                delivery: 'terminal',
                warning: 'Enter a valid email or phone number for external delivery.'
            });
        } catch (err) {
            return respond({ delivery: 'terminal', warning: err.message || 'OTP delivery fallback used' });
        }
    };

    finalize();
});

// Verify OTP
app.post('/api/verify-otp', (req, res) => {
    const { identifier, otp } = req.body;
    const normalized = String(identifier || '').trim();
    const data = otpStore[normalized];
    if (!data || data.otp !== otp || Date.now() > data.expires) {
        return res.status(401).json({ error: "Invalid OTP" });
    }

    delete otpStore[normalized];

    db.prepare(`INSERT OR IGNORE INTO users (username) VALUES (?)`)
        .run(normalized);

    const user = db.prepare(`SELECT * FROM users WHERE username = ?`)
        .get(normalized);

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