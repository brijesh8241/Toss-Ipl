const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = "ipl2026_super_secret_key"; // You should put this in a .env file later

// Middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Database
const db = new sqlite3.Database('./prediction.db', (err) => {
    if (err) {
        console.error('Database opening error: ', err);
    } else {
        console.log('Database connected.');
        // Create Tables if not exist
        db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE,
                password TEXT
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS matches (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT,
                time TEXT,
                team1 TEXT,
                team2 TEXT,
                stadium TEXT,
                prediction TEXT
            )`);

            // Seed initial data if empty
            db.get(`SELECT COUNT(*) as count FROM users`, (err, row) => {
                if (row && row.count === 0) {
                    // Default admin: admin / password123 (In production, use bcrypt to hash the password!)
                    db.run(`INSERT INTO users (username, password) VALUES ('admin', 'password123')`);
                }
            });

            db.get(`SELECT COUNT(*) as count FROM matches`, (err, row) => {
                if (row && row.count === 0) {
                    const sampleMatches = [
                        ['2026-04-11', '3:30 PM IST', 'PBKS', 'SRH', 'New Intl. Cricket Stadium, Chandigarh', 'Pending'],
                        ['2026-04-11', '7:30 PM IST', 'CSK', 'DC', 'MA Chidambaram Stadium, Chennai', 'Pending'],
                        ['2026-04-12', '3:30 PM IST', 'LSG', 'GT', 'Ekana Stadium, Lucknow', 'Pending'],
                        ['2026-04-12', '7:30 PM IST', 'MI', 'RCB', 'Wankhede Stadium, Mumbai', 'Pending'],
                        ['2026-04-13', '7:30 PM IST', 'SRH', 'RR', 'Rajiv Gandhi Stadium, Hyderabad', 'Pending'],
                        ['2026-04-14', '7:30 PM IST', 'CSK', 'KKR', 'MA Chidambaram Stadium, Chennai', 'Pending'],
                        ['2026-04-15', '7:30 PM IST', 'RCB', 'LSG', 'M. Chinnaswamy Stadium, Bengaluru', 'Pending']
                    ];
                    const stmt = db.prepare(`INSERT INTO matches (date, time, team1, team2, stadium, prediction) VALUES (?, ?, ?, ?, ?, ?)`);
                    sampleMatches.forEach(match => stmt.run(match));
                    stmt.finalize();
                }
            });
        });
    }
});

// --- Auth Routes ---
const otpStore = {}; // Memory store { identifier: { otp, expires } }

app.post('/api/request-otp', (req, res) => {
    const { identifier } = req.body;
    if (!identifier) return res.status(400).json({ error: "Missing email or phone" });

    // Generate random 4-digit OTP
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    otpStore[identifier] = {
        otp,
        expires: Date.now() + 5 * 60 * 1000 // 5 minutes expiration
    };

    console.log(`\n\n ---> [SIMULATED OTP] Code for ${identifier}: ${otp} <--- \n\n`);
    res.json({ success: true, message: "OTP sent", otp: otp });
});

app.post('/api/verify-otp', (req, res) => {
    const { identifier, otp } = req.body;
    if (!identifier || !otp) return res.status(400).json({ error: "Missing fields" });

    const storedData = otpStore[identifier];
    if (!storedData || storedData.otp !== otp || Date.now() > storedData.expires) {
        return res.status(401).json({ error: "Invalid or expired OTP" });
    }

    // OTP Verified!
    delete otpStore[identifier];
    
    // Register the user to DB if not exists. Re-use username as identifier column to avoid schema alters
    db.run(`INSERT OR IGNORE INTO users (username, password) VALUES (?, ?)`, [identifier, null], function(err) {
        db.get(`SELECT * FROM users WHERE username = ?`, [identifier], (err, user) => {
            if(err || !user) return res.status(500).json({ error: "Database error" });
            const token = jwt.sign({ id: user.id, username: identifier, role: 'user' }, SECRET_KEY, { expiresIn: '1d' });
            res.cookie('token', token, { httpOnly: true, secure: false });
            res.json({ success: true, message: "Logged in via OTP successfully" });
        });
    });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ? AND password = ?`, [username, password], (err, user) => {
        if (err) return res.status(500).json({ error: "Database error" });
        if (!user) return res.status(401).json({ error: "Invalid credentials" });

        const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY, { expiresIn: '1d' });
        res.cookie('token', token, { httpOnly: true, secure: false }); // secure: true in production with HTTPS
        res.json({ success: true, message: "Logged in successfully" });
    });
});

app.post('/api/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ success: true });
});

// Middleware to protect routes
function authenticate(req, res, next) {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: "Unauthorized" });

    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) return res.status(401).json({ error: "Unauthorized" });
        req.user = decoded;
        next();
    });
}

// --- Match Routes ---

// Get all matches (Publicly viewable)
app.get('/api/matches', (req, res) => {
    db.all(`SELECT * FROM matches ORDER BY date ASC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: "Database error" });
        res.json(rows);
    });
});

// Update a match prediction (Admin only)
app.put('/api/matches/:id', authenticate, (req, res) => {
    const { prediction } = req.body;
    const { id } = req.params;

    db.run(`UPDATE matches SET prediction = ? WHERE id = ?`, [prediction, id], function (err) {
        if (err) return res.status(500).json({ error: "Failed to update" });
        res.json({ success: true, message: "Prediction updated!" });
    });
});

// Verify Auth status (for frontend)
app.get('/api/me', authenticate, (req, res) => {
    res.json({ user: req.user });
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
