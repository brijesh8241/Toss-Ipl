const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = "ipl2026_super_secret_key";

// Middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// ✅ Database (SYNC - better-sqlite3)
const db = new Database('./prediction.db');

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

// Seed users
const userCount = db.prepare(`SELECT COUNT(*) as count FROM users`).get();
if (userCount.count === 0) {
    db.prepare(`INSERT INTO users (username, password) VALUES (?, ?)`)
        .run('admin', 'password123');
}

// Seed matches
const matchCount = db.prepare(`SELECT COUNT(*) as count FROM matches`).get();
if (matchCount.count === 0) {
    const sampleMatches = [
        ['2026-04-11', '3:30 PM IST', 'PBKS', 'SRH', 'Chandigarh Stadium', 'Pending'],
        ['2026-04-11', '7:30 PM IST', 'CSK', 'DC', 'Chennai Stadium', 'Pending'],
        ['2026-04-12', '3:30 PM IST', 'LSG', 'GT', 'Lucknow Stadium', 'Pending'],
        ['2026-04-12', '7:30 PM IST', 'MI', 'RCB', 'Mumbai Stadium', 'Pending']
    ];

    const stmt = db.prepare(`INSERT INTO matches (date, time, team1, team2, stadium, prediction) VALUES (?, ?, ?, ?, ?, ?)`);
    sampleMatches.forEach(m => stmt.run(m));
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

    res.cookie('token', token, { httpOnly: true });

    res.json({ success: true });
});

// Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    const user = db.prepare(`SELECT * FROM users WHERE username = ? AND password = ?`)
        .get(username, password);

    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign({ id: user.id }, SECRET_KEY, { expiresIn: '1d' });

    res.cookie('token', token, { httpOnly: true });

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

// Get matches
app.get('/api/matches', (req, res) => {
    const matches = db.prepare(`SELECT * FROM matches ORDER BY date ASC`).all();
    res.json(matches);
});

// Update match
app.put('/api/matches/:id', authenticate, (req, res) => {
    const { prediction } = req.body;
    const { id } = req.params;

    db.prepare(`UPDATE matches SET prediction = ? WHERE id = ?`)
        .run(prediction, id);

    res.json({ success: true });
});

// Me
app.get('/api/me', authenticate, (req, res) => {
    res.json({ user: req.user });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});