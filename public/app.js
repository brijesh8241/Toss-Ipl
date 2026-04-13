// Universal fetch configuration
const API_URL = '/api';

function localISODate() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function sortMatchesChronologically(matches) {
    const afternoon = (t) => (/3\s*:\s*30|15\s*:\s*30/i.test(String(t)) ? 0 : 1);
    return [...matches].sort((a, b) => {
        const da = String(a.date || '');
        const db = String(b.date || '');
        if (da !== db) return da.localeCompare(db);
        const ta = afternoon(a.time) - afternoon(b.time);
        if (ta !== 0) return ta;
        return String(a.time || '').localeCompare(String(b.time || ''));
    });
}

function showLoader(id) {
    const loader = document.getElementById(id);
    if (loader) loader.style.display = 'block';
}
function hideLoader(id) {
    const loader = document.getElementById(id);
    if (loader) loader.style.display = 'none';
}

// --- Home Page Logic ---
async function fetchTodayMatches() {
    showLoader('loader');
    try {
        const response = await fetch(`${API_URL}/matches`, { cache: 'no-store' });
        const matches = await response.json();
        
        // Filter for ONLY today's matches
        const todayStr = localISODate();
        const todayMatches = matches.filter(m => m.date === todayStr);
        renderPublicMatches(todayMatches, "There are no matches scheduled for today.");
    } catch (error) {
        console.error("Error fetching matches:", error);
        if(document.getElementById('matches-container')) {
            document.getElementById('matches-container').innerHTML = '<p class="error-text">Failed to load schedule. Try again later.</p>';
        }
    } finally {
        hideLoader('loader');
    }
}

async function fetchScheduleMatches() {
    showLoader('loader');
    try {
        const response = await fetch(`${API_URL}/matches`, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const matches = await response.json();
        if (!Array.isArray(matches)) {
            throw new Error('Invalid response');
        }
        const sorted = sortMatchesChronologically(matches);
        const summary = document.getElementById('schedule-summary');
        if (summary) {
            summary.textContent = `${sorted.length} IPL 2026 league matches — scroll to browse the full list.`;
        }
        renderPublicMatches(
            sorted,
            "No matches scheduled yet.",
            { mapsLink: true }
        );
    } catch (error) {
        console.error("Error fetching matches:", error);
        if(document.getElementById('matches-container')) {
            document.getElementById('matches-container').innerHTML = '<p class="error-text">Failed to load schedule. Try again later.</p>';
        }
    } finally {
        hideLoader('loader');
    }
}

function renderPublicMatches(matches, emptyMessage = "No matches scheduled yet.", opts = {}) {
    const { mapsLink = false } = opts;
    const container = document.getElementById('matches-container');
    if(!container) return;
    container.innerHTML = '';
    
    if (matches.length === 0) {
        container.innerHTML = `<p style="text-align:center; color:var(--text-muted); width: 100%; grid-column: 1 / -1; padding: 2rem; font-size: 1.1rem;">${emptyMessage}</p>`;
        return;
    }

    matches.forEach(match => {
        const dateObj = new Date(match.date + 'T12:00:00');
        const date = isNaN(dateObj.getTime()) ? escapeHtml(match.date) : escapeHtml(dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }));
        const predRaw = String(match.prediction || '').trim();
        const predictionClass = predRaw === 'Pending' ? 'pending' : '';
        const mapsHref =
            match.geo_lat != null && match.geo_lng != null
                ? `https://www.google.com/maps?q=${encodeURIComponent(String(match.geo_lat))},${encodeURIComponent(String(match.geo_lng))}`
                : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(match.stadium)}`;
        const mapsBlock = mapsLink
            ? `<div class="maps-link"><a href="${mapsHref}" target="_blank" rel="noopener noreferrer">Open venue in Google Maps</a></div>`
            : '';
        const t1 = escapeHtml(match.team1);
        const t2 = escapeHtml(match.team2);
        const stadium = escapeHtml(match.stadium);
        const timeStr = escapeHtml(match.time);
        const predDisp = escapeHtml(predRaw);
        
        const card = document.createElement('div');
        card.className = 'match-card';
        card.innerHTML = `
            <div class="match-date">${date} <span style="float: right; color: var(--text-main); font-weight: normal;">🕰️ ${timeStr}</span></div>
            <div class="teams">
                <span>${t1}</span>
                <span class="vs">vs</span>
                <span>${t2}</span>
            </div>
            <div class="stadium">📍 ${stadium}</div>
            ${mapsBlock}
            <div class="prediction-badge">
                <p>Predicted Winner</p>
                <h4 class="${predictionClass}">${predDisp}</h4>
            </div>
        `;
        container.appendChild(card);
    });
}

// --- Login Page Logic ---
async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorText = document.getElementById('login-error');

    try {
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok) {
            window.location.href = 'admin.html';
        } else {
            errorText.textContent = data.error || 'Login failed';
        }
    } catch (err) {
        errorText.textContent = 'Server error. Please try again.';
    }
}

async function handleOtpRequest(e) {
    e.preventDefault();
    const identifier = document.getElementById('identifier').value;
    const errorText = document.getElementById('login-error');
    const requestBtn = e.target.querySelector('button');

    if (!identifier) return;
    errorText.textContent = '';
    requestBtn.textContent = 'Sending...';
    requestBtn.disabled = true;

    try {
        const response = await fetch(`${API_URL}/request-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ identifier })
        });

        const data = await response.json();

        if (response.ok) {
            document.getElementById('otp-request-form').style.display = 'none';
            document.getElementById('otp-verify-form').style.display = 'block';
            setTimeout(() => {
                alert('📱 OTP sent (dev mode). Check the server terminal for your code.');
            }, 600);
        } else {
            errorText.textContent = data.error || 'Failed to send OTP';
        }
    } catch (err) {
        errorText.textContent = 'Server error. Please try again.';
    } finally {
        requestBtn.textContent = 'Send OTP';
        requestBtn.disabled = false;
    }
}

async function handleOtpVerify(e) {
    e.preventDefault();
    const identifier = document.getElementById('identifier').value;
    const otp = document.getElementById('otp-code').value;
    const errorText = document.getElementById('login-error');
    const verifyBtn = e.target.querySelector('button');

    errorText.textContent = '';
    verifyBtn.textContent = 'Verifying...';
    verifyBtn.disabled = true;

    try {
        const response = await fetch(`${API_URL}/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ identifier, otp })
        });

        const data = await response.json();

        if (response.ok) {
            window.location.href = 'index.html';
        } else {
            errorText.textContent = data.error || 'Invalid OTP';
        }
    } catch (err) {
        errorText.textContent = 'Server error. Please try again.';
    } finally {
        verifyBtn.textContent = 'Verify & Login';
        verifyBtn.disabled = false;
    }
}

async function handleLogout() {
    await fetch(`${API_URL}/logout`, { method: 'POST', credentials: 'include' });
    window.location.href = 'index.html';
}

// --- Admin Page Logic ---
let adminMatches = [];

async function checkAdminAuthAndLoad() {
    showLoader('loader');
    try {
        const response = await fetch(`${API_URL}/me`, { credentials: 'include', cache: 'no-store' });
        if (!response.ok) {
            window.location.href = 'login.html';
            return;
        }
        await fetchAdminMatches();
    } catch (err) {
        window.location.href = 'login.html';
    }
}

async function fetchAdminMatches() {
    try {
        const response = await fetch(`${API_URL}/matches`, { credentials: 'include', cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const list = await response.json();
        adminMatches = Array.isArray(list) ? sortMatchesChronologically(list) : [];
        renderAdminMatches(adminMatches);
    } catch (error) {
        console.error("Error fetching matches:", error);
    } finally {
        hideLoader('loader');
    }
}

function renderAdminMatches(matches) {
    const container = document.getElementById('admin-matches-container');
    container.innerHTML = '';

    matches.forEach(match => {
        const d = new Date(match.date + 'T12:00:00');
        const date = isNaN(d.getTime())
            ? escapeHtml(match.date)
            : escapeHtml(d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }));
        const pred = String(match.prediction || '').trim();
        const statusClass = pred !== 'Pending' ? 'predicted' : '';

        const row = document.createElement('div');
        row.className = 'admin-match-row';
        row.innerHTML = `
            <div class="admin-match-info">
                <h4>${escapeHtml(match.team1)} vs ${escapeHtml(match.team2)}</h4>
                <p>${date} | ${escapeHtml(match.time)} | 📍 ${escapeHtml(match.stadium)}</p>
            </div>
            <div class="admin-match-status">
                <span class="${statusClass}">${escapeHtml(pred)}</span>
            </div>
            <button class="edit-btn" onclick="openUpdateModal(${match.id})">Update</button>
        `;
        container.appendChild(row);
    });
}

function openUpdateModal(id) {
    const match = adminMatches.find(m => String(m.id) === String(id));
    if (!match) return;

    document.getElementById('match-id').value = id;
    document.getElementById('modal-match-details').textContent = `${match.team1} vs ${match.team2}`;

    const pred = String(match.prediction || '').trim();
    const t1 = String(match.team1).trim();
    const t2 = String(match.team2).trim();
    const select = document.getElementById('prediction-select');
    select.innerHTML = `
        <option value="Pending" ${pred === 'Pending' ? 'selected' : ''}>Pending</option>
        <option value="${escapeHtml(t1)}" ${pred === t1 ? 'selected' : ''}>${escapeHtml(t1)}</option>
        <option value="${escapeHtml(t2)}" ${pred === t2 ? 'selected' : ''}>${escapeHtml(t2)}</option>
    `;

    document.getElementById('modal-msg').textContent = '';
    document.getElementById('update-modal').classList.add('active');
}

function closeModal() {
    document.getElementById('update-modal').classList.remove('active');
}

if (document.getElementById('update-prediction-form')) {
    document.getElementById('update-prediction-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('match-id').value;
        const prediction = document.getElementById('prediction-select').value;
        const msgEl = document.getElementById('modal-msg');

        try {
            const response = await fetch(`${API_URL}/matches/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                cache: 'no-store',
                body: JSON.stringify({ prediction })
            });
            const raw = await response.text();
            let data = {};
            if (raw) {
                try {
                    data = JSON.parse(raw);
                } catch (_) {
                    data = { error: raw.slice(0, 120) || 'Bad response from server' };
                }
            }

            if (response.ok) {
                msgEl.textContent = 'Updated successfully!';
                msgEl.style.color = '#00e676';
                setTimeout(() => {
                    closeModal();
                    fetchAdminMatches(); // refresh list
                }, 1000);
            } else {
                const hint =
                    response.status === 401
                        ? ' (try logging in again from the same address you used to open this site, e.g. only localhost or only 127.0.0.1)'
                        : '';
                msgEl.textContent = (data.error || `Request failed (${response.status})`) + hint;
                msgEl.style.color = '#ff4d4d';
            }
        } catch (err) {
            msgEl.textContent = err.message || 'Network error — check that the app is open via the Node server (same URL as login).';
            msgEl.style.color = '#ff4d4d';
        }
    });
}
