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
    password TEXT,
    display_name TEXT,
    avatar_data TEXT
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

CREATE TABLE IF NOT EXISTS prediction_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL,
    match_date TEXT,
    team1 TEXT,
    team2 TEXT,
    stadium TEXT,
    old_prediction TEXT,
    new_prediction TEXT,
    changed_by TEXT,
    changed_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (match_id) REFERENCES matches(id)
);
`);

function ensureUserColumns() {
    const columns = db.prepare(`PRAGMA table_info(users)`).all().map((c) => c.name);
    if (!columns.includes('display_name')) {
        db.exec(`ALTER TABLE users ADD COLUMN display_name TEXT`);
    }
    if (!columns.includes('avatar_data')) {
        db.exec(`ALTER TABLE users ADD COLUMN avatar_data TEXT`);
    }
}

ensureUserColumns();

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

// Prevent duplicate rows for the same fixture (after cleanup).
db.exec(`
CREATE UNIQUE INDEX IF NOT EXISTS idx_matches_unique
ON matches(date, team1, team2);
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

function isEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function isPhone(value) {
    return /^\+?[0-9]{10,15}$/.test(String(value || '').trim());
}

function normalizeIdentifier(value) {
    const raw = String(value || '').trim();
    const compactPhone = raw.replace(/[\s\-()]/g, '');
    if (isEmail(raw)) return raw.toLowerCase();
    if (isPhone(compactPhone)) return compactPhone;
    return raw;
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

app.get('/api/otp-status', (_req, res) => {
    res.json({
        emailConfigured: Boolean(process.env.RESEND_API_KEY && process.env.OTP_FROM_EMAIL),
        smsConfigured: Boolean(
            process.env.TWILIO_ACCOUNT_SID &&
            process.env.TWILIO_AUTH_TOKEN &&
            process.env.TWILIO_FROM_NUMBER
        )
    });
});

// Request OTP
app.post('/api/request-otp', async (req, res) => {
    const { identifier, displayName, avatarData } = req.body;
    const normalized = normalizeIdentifier(identifier);
    if (!normalized) return res.status(400).json({ error: "Missing identifier" });
    const normalizedName = String(displayName || '').trim();

    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    otpStore[normalized] = {
        otp,
        expires: Date.now() + 5 * 60 * 1000,
        displayName: normalizedName || null,
        avatarData: String(avatarData || '').slice(0, 2_000_000) || null
    };

    // Terminal fallback is always available for local development.
    const terminalLine = `OTP for ${normalized}: ${otp} (valid 5 minutes)`;
    console.log('='.repeat(50));
    console.log(terminalLine);
    console.log('='.repeat(50));

    const respond = (payload = {}) => {
        const out = { success: true, ...payload };
        // Always return OTP so it can be shown in browser popup
        out.otp = otp;
        return res.json(out);
    };

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
});

// Verify OTP
app.post('/api/verify-otp', (req, res) => {
    const { identifier, otp } = req.body;
    const normalized = normalizeIdentifier(identifier);
    const data = otpStore[normalized];
    if (!data || data.otp !== otp || Date.now() > data.expires) {
        return res.status(401).json({ error: "Invalid OTP" });
    }

    delete otpStore[normalized];

    db.prepare(`
        INSERT OR IGNORE INTO users (username, display_name, avatar_data)
        VALUES (?, ?, ?)
    `).run(normalized, data.displayName || normalized, data.avatarData || null);

    if (data.displayName || data.avatarData) {
        db.prepare(`
            UPDATE users
            SET
                display_name = COALESCE(?, display_name),
                avatar_data = COALESCE(?, avatar_data)
            WHERE username = ?
        `).run(data.displayName || null, data.avatarData || null, normalized);
    }

    const user = db.prepare(`SELECT id, username FROM users WHERE username = ?`)
        .get(normalized);

    const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY, { expiresIn: '1d' });

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

    const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY, { expiresIn: '1d' });

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

        const match = db.prepare(`SELECT * FROM matches WHERE id = ?`).get(id);
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

        const oldPrediction = String(match.prediction || 'Pending').trim();

        // Log prediction change to history (only if the value actually changed)
        if (oldPrediction !== value) {
            db.prepare(`
                INSERT INTO prediction_history (match_id, match_date, team1, team2, stadium, old_prediction, new_prediction, changed_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(id, match.date, match.team1, match.team2, match.stadium || '', oldPrediction, value, req.user.username);
        }

        db.prepare(`UPDATE matches SET prediction = ? WHERE id = ?`).run(value, id);

        res.json({ success: true });
    } catch (err) {
        console.error('PUT /api/matches:', err);
        res.status(500).json({ error: 'Could not save prediction' });
    }
});

// Add new match
app.post('/api/matches', authenticate, (req, res) => {
    try {
        if (req.user.username !== 'admin') {
            return res.status(403).json({ error: 'Only admins can add matches' });
        }
        const { date, time, team1, team2, stadium, prediction } = req.body;
        if (!date || !team1 || !team2) {
            return res.status(400).json({ error: 'Missing required match details' });
        }

        const stmt = db.prepare(`
            INSERT INTO matches (date, time, team1, team2, stadium, prediction) 
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        const result = stmt.run(
            String(date).trim(),
            String(time || '').trim(),
            String(team1).trim(),
            String(team2).trim(),
            String(stadium || '').trim(),
            String(prediction || 'Pending').trim()
        );

        res.json({ success: true, id: result.lastInsertRowid });
    } catch (err) {
        console.error('POST /api/matches:', err);
        res.status(500).json({ error: 'Could not add match' });
    }
});

// Prediction History endpoint (admin-only)
app.get('/api/prediction-history', authenticate, (req, res) => {
    if (req.user.username !== 'admin') {
        return res.status(403).json({ error: 'Admin access only' });
    }
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    try {
        const rows = db.prepare(`
            SELECT * FROM prediction_history
            ORDER BY changed_at DESC
        `).all();
        res.json(rows);
    } catch (err) {
        console.error('GET /api/prediction-history:', err);
        res.status(500).json({ error: 'Failed to load prediction history' });
    }
});

// Prediction History Stats endpoint (admin-only)
app.get('/api/prediction-stats', authenticate, (req, res) => {
    if (req.user.username !== 'admin') {
        return res.status(403).json({ error: 'Admin access only' });
    }
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    try {
        const totalChanges = db.prepare(`SELECT COUNT(*) as count FROM prediction_history`).get().count;
        const uniqueMatches = db.prepare(`SELECT COUNT(DISTINCT match_id) as count FROM prediction_history`).get().count;
        const latestChange = db.prepare(`SELECT changed_at FROM prediction_history ORDER BY changed_at DESC LIMIT 1`).get();
        const mostChanged = db.prepare(`
            SELECT team1, team2, match_date, COUNT(*) as changes
            FROM prediction_history
            GROUP BY match_id
            ORDER BY changes DESC
            LIMIT 1
        `).get();
        res.json({
            totalChanges,
            uniqueMatches,
            lastUpdated: latestChange ? latestChange.changed_at : null,
            mostChanged: mostChanged || null
        });
    } catch (err) {
        console.error('GET /api/prediction-stats:', err);
        res.status(500).json({ error: 'Failed to load stats' });
    }
});

// Me
app.get('/api/me', authenticate, (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    const u = db.prepare(`
        SELECT id, username, display_name, avatar_data
        FROM users
        WHERE id = ?
    `).get(req.user.id);
    if (!u) return res.status(404).json({ error: 'User not found' });
    res.json({
        user: {
            id: u.id,
            username: u.username,
            displayName: u.display_name || u.username,
            avatarData: u.avatar_data || null,
            isAdmin: u.username === 'admin'
        }
    });
});

app.put('/api/profile', authenticate, (req, res) => {
    const displayName = String(req.body?.displayName || '').trim();
    const avatarData = req.body?.avatarData ? String(req.body.avatarData).slice(0, 2_000_000) : null;
    if (!displayName && !avatarData) {
        return res.status(400).json({ error: 'No profile update provided' });
    }
    db.prepare(`
        UPDATE users
        SET
            display_name = CASE WHEN ? <> '' THEN ? ELSE display_name END,
            avatar_data = COALESCE(?, avatar_data)
        WHERE id = ?
    `).run(displayName, displayName, avatarData, req.user.id);
    res.json({ success: true });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});