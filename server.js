require('dotenv').config();
const express = require('express');
const path = require('path');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const db = require('./db');
const { ensureFixturesSynced } = require('./ipl2026-fixtures');
const { refreshVenueGeocodesIfConfigured, attachGeocodes } = require('./venueGeocode');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.SECRET_KEY || "ipl2026_super_secret_key";

// Middleware
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

// Initialize fixtures sync
ensureFixturesSynced(db);

setImmediate(() => {
    // Venue geocoding logic (unchanged architecture)
    refreshVenueGeocodesIfConfigured(db).catch((err) => {
        console.warn('Google Geocoding (optional):', err.message || err);
    });
});

// OTP store (in-memory is fine for now, or could move to Supabase)
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

// ... sendOtpEmail / sendOtpSms logic remains same (uses fetch) ...
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

    console.log('='.repeat(50));
    console.log(`OTP for ${normalized}: ${otp} (valid 5 minutes)`);
    console.log('='.repeat(50));

    const respond = (payload = {}) => {
        const out = { success: true, ...payload };
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
app.post('/api/verify-otp', async (req, res) => {
    const { identifier, otp } = req.body;
    const normalized = normalizeIdentifier(identifier);
    const data = otpStore[normalized];
    if (!data || data.otp !== otp || Date.now() > data.expires) {
        return res.status(401).json({ error: "Invalid OTP" });
    }

    delete otpStore[normalized];

    // Upsert user in Supabase
    const { data: user, error } = await db
        .from('users')
        .upsert({ 
            username: normalized, 
            display_name: data.displayName || normalized, 
            avatar_data: data.avatarData || null 
        }, { onConflict: 'username' })
        .select()
        .single();

    if (error) {
        console.error('Verify OTP error:', error);
        return res.status(500).json({ error: 'Failed to create/update user' });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY, { expiresIn: '1d' });
    res.cookie('token', token, { httpOnly: true, sameSite: 'lax', path: '/' });
    res.json({ success: true });
});

app.post('/api/logout', (req, res) => {
    res.clearCookie('token', { httpOnly: true, sameSite: 'lax', path: '/' });
    res.json({ success: true });
});

// Login (Password-based for Admin)
app.post('/api/login', async (req, res) => {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '').trim();

    if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
    }

    const { data: user, error } = await db
        .from('users')
        .select('*')
        .eq('username', username)
        .eq('password', password)
        .single();

    if (error || !user) {
        console.warn(`❌ Failed login attempt for username: ${username}`);
        return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY, { expiresIn: '1d' });
    res.cookie('token', token, { httpOnly: true, sameSite: 'lax', path: '/' });
    res.json({ success: true });
});

// Auth middleware
async function authenticate(req, res, next) {
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
app.get('/api/matches', async (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    try {
        await ensureFixturesSynced(db);
        const { data: matches, error } = await db
            .from('matches')
            .select('*')
            .order('date', { ascending: true })
            .order('time', { ascending: true });

        if (error) throw error;
        res.json(attachGeocodes(matches));
    } catch (err) {
        console.error('GET /api/matches:', err);
        res.status(500).json({ error: 'Failed to load matches' });
    }
});

// Update match
app.put('/api/matches/:id', authenticate, async (req, res) => {
    try {
        const { prediction } = req.body || {};
        const id = parseInt(req.params.id, 10);
        if (prediction === undefined || prediction === null || String(prediction).trim() === '') {
            return res.status(400).json({ error: 'Missing prediction' });
        }

        const { data: match, error: fetchErr } = await db
            .from('matches')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchErr || !match) return res.status(404).json({ error: 'Match not found' });

        const value = String(prediction).trim();
        const oldPrediction = String(match.prediction || 'Pending').trim();

        if (oldPrediction !== value) {
            // Log history
            await db.from('prediction_history').insert({
                match_id: id,
                match_date: match.date,
                team1: match.team1,
                team2: match.team2,
                stadium: match.stadium || '',
                old_prediction: oldPrediction,
                new_prediction: value,
                changed_by: req.user.username
            });

            // Update match
            await db.from('matches').update({ prediction: value }).eq('id', id);
        }

        res.json({ success: true });
    } catch (err) {
        console.error('PUT /api/matches:', err);
        res.status(500).json({ error: 'Could not save prediction' });
    }
});

// Add new match
app.post('/api/matches', authenticate, async (req, res) => {
    try {
        if (req.user.username !== 'admin') {
            return res.status(403).json({ error: 'Only admins can add matches' });
        }
        const { date, time, team1, team2, stadium, prediction } = req.body;
        if (!date || !team1 || !team2) {
            return res.status(400).json({ error: 'Missing required match details' });
        }

        const { data, error } = await db
            .from('matches')
            .insert({
                date: String(date).trim(),
                time: String(time || '').trim(),
                team1: String(team1).trim(),
                team2: String(team2).trim(),
                stadium: String(stadium || '').trim(),
                prediction: String(prediction || 'Pending').trim()
            })
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, id: data.id });
    } catch (err) {
        console.error('POST /api/matches:', err);
        res.status(500).json({ error: 'Could not add match' });
    }
});

// History endpoint
app.get('/api/prediction-history', authenticate, async (req, res) => {
    if (req.user.username !== 'admin') return res.status(403).json({ error: 'Admin access only' });
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    try {
        const { data, error } = await db
            .from('prediction_history')
            .select('*')
            .order('changed_at', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (err) {
        console.error('GET /api/prediction-history:', err);
        res.status(500).json({ error: 'Failed to load history' });
    }
});

// Stats endpoint
app.get('/api/prediction-stats', authenticate, async (req, res) => {
    if (req.user.username !== 'admin') return res.status(403).json({ error: 'Admin access only' });
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    try {
        // We do separate queries for stats as Supabase doesn't support complex aggregations in a single simple call easily
        const { count: totalChanges } = await db.from('prediction_history').select('*', { count: 'exact', head: true });
        const { data: uniqueMatchesRaw } = await db.from('prediction_history').select('match_id');
        const uniqueMatches = new Set(uniqueMatchesRaw.map(m => m.match_id)).size;
        
        const { data: latestRaw } = await db.from('prediction_history').select('changed_at').order('changed_at', { ascending: false }).limit(1).single();
        
        const { data: history } = await db.from('prediction_history').select('match_id, team1, team2, match_date');
        const counts = {};
        let mostChanged = null;
        let maxCount = 0;
        
        history.forEach(h => {
            const key = h.match_id;
            counts[key] = (counts[key] || 0) + 1;
            if (counts[key] > maxCount) {
                maxCount = counts[key];
                mostChanged = { team1: h.team1, team2: h.team2, match_date: h.match_date };
            }
        });

        res.json({
            totalChanges: totalChanges || 0,
            uniqueMatches: uniqueMatches || 0,
            lastUpdated: latestRaw ? latestRaw.changed_at : null,
            mostChanged: mostChanged || null
        });
    } catch (err) {
        console.error('GET /api/prediction-stats:', err);
        res.status(500).json({ error: 'Failed to load stats' });
    }
});

// Me
app.get('/api/me', authenticate, async (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    const { data: u, error } = await db
        .from('users')
        .select('id, username, display_name, avatar_data')
        .eq('id', req.user.id)
        .single();

    if (error || !u) return res.status(404).json({ error: 'User not found' });
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

// Update Profile
app.put('/api/profile', authenticate, async (req, res) => {
    const displayName = String(req.body?.displayName || '').trim();
    const avatarData = req.body?.avatarData ? String(req.body.avatarData).slice(0, 2_000_000) : null;
    
    const updateData = {};
    if (displayName) updateData.display_name = displayName;
    if (avatarData) updateData.avatar_data = avatarData;

    if (Object.keys(updateData).length === 0) return res.status(400).json({ error: 'No profile update provided' });

    const { error } = await db
        .from('users')
        .update(updateData)
        .eq('id', req.user.id);

    if (error) return res.status(500).json({ error: 'Profile update failed' });
    res.json({ success: true });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});