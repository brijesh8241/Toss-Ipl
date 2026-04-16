// Universal fetch configuration
const API_URL = '/api';
const MATCHES_CACHE_KEY = 'ipl_matches_cache_v1';
const USER_PROFILE_CACHE_KEY = 'ipl_user_profile_v1';

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

function saveMatchesCache(matches) {
    try {
        localStorage.setItem(MATCHES_CACHE_KEY, JSON.stringify(matches || []));
    } catch (_) {
        // ignore storage errors
    }
}

function loadMatchesCache() {
    try {
        const raw = localStorage.getItem(MATCHES_CACHE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        return [];
    }
}

function saveUserProfileCache(user) {
    try {
        if (!user) return;
        localStorage.setItem(USER_PROFILE_CACHE_KEY, JSON.stringify(user));
    } catch (_) {}
}

function loadUserProfileCache() {
    try {
        const raw = localStorage.getItem(USER_PROFILE_CACHE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (_) {
        return null;
    }
}

function clearUserProfileCache() {
    try {
        localStorage.removeItem(USER_PROFILE_CACHE_KEY);
    } catch (_) {}
}

function getInitials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'U';
    return parts.slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

function readImageAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Image read failed'));
        reader.readAsDataURL(file);
    });
}

function renderNavbarProfile(user) {
    const target = document.getElementById('nav-user-slot');
    if (!target) return;
    if (!user) {
        target.innerHTML = `<a href="login.html" class="login-btn">Login</a>`;
        return;
    }
    const name = escapeHtml(user.displayName || user.username || 'User');
    const avatar = user.avatarData
        ? `<img src="${user.avatarData}" alt="${name}" class="nav-avatar-img">`
        : `<div class="nav-avatar-fallback">${escapeHtml(getInitials(name))}</div>`;
    const adminBadge = user.isAdmin ? '<span class="nav-admin-badge">Admin</span>' : '';
    
    const updatePredictionBtn = user.isAdmin 
        ? `<a href="admin.html" class="cta-btn" style="padding: 0.5rem 1.2rem; font-size: 0.9rem; margin-right: 1rem; border-radius: 20px; text-decoration: none;">Update Prediction</a>` 
        : '';

    target.innerHTML = `
        ${updatePredictionBtn}
        <div class="nav-user-dropdown">
            <div class="nav-user-chip" onclick="toggleUserDropdown(event)">
                ${avatar}
                <span class="nav-user-name">${name}</span>
                ${adminBadge}
                <svg class="dropdown-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            </div>
            <div class="nav-dropdown-menu" id="nav-dropdown-menu">
                <div class="dropdown-header">
                    ${avatar}
                    <div class="dropdown-user-info">
                        <span class="dropdown-user-name">${name}</span>
                        ${user.isAdmin ? '<span class="nav-admin-badge">Admin</span>' : ''}
                    </div>
                </div>
                <div class="dropdown-divider"></div>
                <button class="dropdown-item" onclick="openProfileModal(); closeUserDropdown();">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                    Edit Profile
                </button>
                <div class="dropdown-divider"></div>
                <button class="dropdown-item dropdown-logout" onclick="handleLogout()">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                        <polyline points="16 17 21 12 16 7"></polyline>
                        <line x1="21" y1="12" x2="9" y2="12"></line>
                    </svg>
                    Logout
                </button>
            </div>
        </div>
    `;
}

function toggleUserDropdown(event) {
    event.stopPropagation();
    const menu = document.getElementById('nav-dropdown-menu');
    if (!menu) return;
    menu.classList.toggle('show');
}

function closeUserDropdown() {
    const menu = document.getElementById('nav-dropdown-menu');
    if (menu) menu.classList.remove('show');
}

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    const dropdown = document.querySelector('.nav-user-dropdown');
    if (dropdown && !dropdown.contains(e.target)) {
        closeUserDropdown();
    }
});

async function hydrateNavbarProfile() {
    const cached = loadUserProfileCache();
    if (cached) renderNavbarProfile(cached);
    try {
        const response = await fetch(`${API_URL}/me`, { credentials: 'include', cache: 'no-store' });
        if (!response.ok) {
            clearUserProfileCache();
            renderNavbarProfile(null);
            return;
        }
        const data = await response.json();
        const user = data.user || null;
        saveUserProfileCache(user);
        renderNavbarProfile(user);
    } catch (_) {
        renderNavbarProfile(cached || null);
    }
}

function openProfileModal() {
    const modal = document.getElementById('profile-modal');
    if (!modal) return;
    const user = loadUserProfileCache();
    if (!user) return;
    const nameInput = document.getElementById('profile-display-name');
    if (nameInput) nameInput.value = user.displayName || user.username || '';
    modal.classList.add('active');
}

function closeProfileModal() {
    const modal = document.getElementById('profile-modal');
    if (modal) modal.classList.remove('active');
}

async function saveProfile(e) {
    e.preventDefault();
    const msg = document.getElementById('profile-msg');
    const nameInput = document.getElementById('profile-display-name');
    const avatarInput = document.getElementById('profile-avatar');
    
    // Always include display name from input
    const displayName = String(nameInput?.value || '').trim();
    const payload = { displayName: displayName };
    
    // Handle avatar upload
    if (avatarInput?.files?.[0]) {
        try {
            payload.avatarData = await readImageAsDataURL(avatarInput.files[0]);
        } catch (err) {
            if (msg) {
                msg.style.color = '#ff4d4d';
                msg.textContent = 'Failed to process image';
            }
            return;
        }
    }
    
    const response = await fetch(`${API_URL}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
        if (msg) {
            msg.style.color = '#ff4d4d';
            msg.textContent = data.error || 'Profile update failed';
        }
        return;
    }
    if (msg) {
        msg.style.color = '#00e676';
        msg.textContent = 'Profile updated successfully';
    }
    // Refresh the navbar to show updated profile
    await hydrateNavbarProfile();
    // Close modal after short delay
    setTimeout(() => {
        closeProfileModal();
        if (msg) msg.textContent = '';
    }, 1500);
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
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const matches = await response.json();
        if (!Array.isArray(matches)) throw new Error('Invalid response');
        saveMatchesCache(matches);
        
        // Filter for ONLY today's matches
        const todayStr = localISODate();
        const todayMatches = matches.filter(m => m.date === todayStr);
        renderPublicMatches(todayMatches, "There are no matches scheduled for today.");
    } catch (error) {
        console.error("Error fetching matches:", error);
        const cached = loadMatchesCache();
        const todayStr = localISODate();
        const todayMatches = cached.filter(m => m.date === todayStr);
        renderPublicMatches(
            todayMatches,
            "No cached matches available right now."
        );
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
        saveMatchesCache(matches);
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
        const cached = sortMatchesChronologically(loadMatchesCache());
        const summary = document.getElementById('schedule-summary');
        if (summary) {
            summary.textContent = `${cached.length} cached matches loaded (server currently unavailable).`;
        }
        renderPublicMatches(cached, "No cached matches available right now.", { mapsLink: true });
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
            // Redirect everyone to the home page; navbar will update dynamically based on role
            window.location.replace('index.html');
        } else {
            errorText.textContent = data.error || 'Login failed';
        }
    } catch (err) {
        errorText.textContent = 'Server error. Please try again.';
    }
}

async function checkOtpDeliveryStatus() {
    const el = document.getElementById('otp-config-status');
    if (!el) return;
    try {
        const res = await fetch(`${API_URL}/otp-status`, { cache: 'no-store' });
        if (!res.ok) throw new Error('status not available');
        const data = await res.json();
        const email = data.emailConfigured ? 'Email OTP: configured' : 'Email OTP: not configured';
        const sms = data.smsConfigured ? 'SMS OTP: configured' : 'SMS OTP: not configured';
        el.textContent = `${email} | ${sms}`;
    } catch {
        el.textContent = 'OTP delivery status unavailable.';
    }
}

async function handleOtpRequest(e) {
    e.preventDefault();
    const identifier = document.getElementById('identifier').value;
    const displayName = document.getElementById('user-display-name')?.value || '';
    const avatarFile = document.getElementById('user-avatar')?.files?.[0] || null;
    const errorText = document.getElementById('login-error');
    const requestBtn = e.target.querySelector('button');

    if (!identifier) return;
    errorText.textContent = '';
    requestBtn.textContent = 'Sending...';
    requestBtn.disabled = true;

    try {
        let avatarData = null;
        if (avatarFile) avatarData = await readImageAsDataURL(avatarFile);
        const response = await fetch(`${API_URL}/request-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ identifier, displayName, avatarData })
        });

        const data = await response.json();

        if (response.ok) {
            document.getElementById('otp-request-form').style.display = 'none';
            document.getElementById('otp-verify-form').style.display = 'block';
            
            // Show OTP in a browser popup modal instead of terminal
            if (data.otp) {
                showOtpPopup(data.otp);
            }
            
            const lines = [];
            if (data.delivery === 'email') {
                lines.push('OTP sent to your email.');
            } else if (data.delivery === 'sms') {
                lines.push('OTP sent to your mobile number.');
            } else {
                lines.push('OTP generated in browser popup below.');
            }
            if (data.warning) lines.push(`Note: ${data.warning}`);
            errorText.style.color = '#00e676';
            errorText.textContent = lines.join(' ');
        } else {
            errorText.style.color = '#ff4d4d';
            errorText.textContent = data.error || 'Failed to send OTP';
        }
    } catch (err) {
        errorText.style.color = '#ff4d4d';
        errorText.textContent = 'Server error. Please try again.';
    } finally {
        requestBtn.textContent = 'Send OTP';
        requestBtn.disabled = false;
    }
}

// Show OTP in a browser popup modal
function showOtpPopup(otp) {
    // Create OTP popup modal if it doesn't exist
    let popup = document.getElementById('otp-popup-modal');
    if (!popup) {
        popup = document.createElement('div');
        popup.id = 'otp-popup-modal';
        popup.className = 'modal active';
        popup.innerHTML = `
            <div class="modal-content glass-panel" style="max-width: 350px; text-align: center;">
                <h3 style="color: #00e676; margin-bottom: 1rem;">Your OTP</h3>
                <div style="font-size: 2.5rem; font-weight: 800; letter-spacing: 8px; color: var(--primary); margin: 1.5rem 0; font-family: monospace;" id="otp-display-value"></div>
                <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 1.5rem;">Enter this OTP to complete login. It expires in 5 minutes.</p>
                <button class="cta-btn" onclick="closeOtpPopup()" style="width: 100%;">Got it</button>
            </div>
        `;
        document.body.appendChild(popup);
    }
    
    // Set the OTP value and show the popup
    const otpDisplay = popup.querySelector('#otp-display-value');
    if (otpDisplay) {
        otpDisplay.textContent = otp;
    }
    popup.classList.add('active');
    popup.style.display = 'flex';
}

function closeOtpPopup() {
    const popup = document.getElementById('otp-popup-modal');
    if (popup) {
        popup.classList.remove('active');
        popup.style.display = 'none';
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
            await hydrateNavbarProfile();
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
    clearUserProfileCache();
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

// --- User Page Logic ---
let userMatches = [];

async function checkUserAuthAndLoad() {
    showLoader('loader');
    try {
        const response = await fetch(`${API_URL}/me`, { credentials: 'include', cache: 'no-store' });
        if (!response.ok) {
            window.location.href = 'login.html';
            return;
        }
        await fetchUserMatches();
    } catch (err) {
        window.location.href = 'login.html';
    }
}

async function fetchUserMatches() {
    try {
        const response = await fetch(`${API_URL}/matches`, { credentials: 'include', cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const list = await response.json();
        userMatches = Array.isArray(list) ? sortMatchesChronologically(list) : [];
        saveMatchesCache(userMatches);
        renderUserMatches(userMatches);
    } catch (error) {
        console.error("Error fetching matches:", error);
        const cached = sortMatchesChronologically(loadMatchesCache());
        userMatches = cached;
        renderUserMatches(userMatches);
    } finally {
        hideLoader('loader');
    }
}

function renderUserMatches(matches) {
    const container = document.getElementById('user-matches-container');
    container.innerHTML = '';

    // Filter for today's matches only
    const todayStr = localISODate();
    const todayMatches = matches.filter(m => m.date === todayStr);

    if (todayMatches.length === 0) {
        container.innerHTML = `
            <div class="user-no-matches">
                <h3>No matches scheduled for today</h3>
                <p>Check the full schedule for upcoming matches.</p>
                <a href="schedule.html" class="cta-btn">View Full Schedule</a>
            </div>
        `;
        return;
    }

    const header = document.createElement('div');
    header.className = 'user-today-header';
    header.innerHTML = `
        <h3>Today's Matches</h3>
        <p>Here are the toss predictions for today's matches</p>
    `;
    container.appendChild(header);

    todayMatches.forEach(match => {
        const d = new Date(match.date + 'T12:00:00');
        const date = isNaN(d.getTime())
            ? escapeHtml(match.date)
            : escapeHtml(d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }));
        const pred = String(match.prediction || '').trim();
        const statusClass = pred !== 'Pending' ? 'predicted' : '';

        const card = document.createElement('div');
        card.className = 'user-match-card';
        card.innerHTML = `
            <div class="user-match-date">${date} | ${escapeHtml(match.time)}</div>
            <div class="user-teams">
                <span class="user-team1">${escapeHtml(match.team1)}</span>
                <span class="vs">vs</span>
                <span class="user-team2">${escapeHtml(match.team2)}</span>
            </div>
            <div class="user-stadium">📍 ${escapeHtml(match.stadium)}</div>
            <div class="user-prediction">
                <span class="user-label">Predicted Winner:</span>
                <span class="user-prediction-value ${statusClass}">${escapeHtml(pred)}</span>
            </div>
        `;
        container.appendChild(card);
    });
}

async function fetchAdminMatches() {
    try {
        const response = await fetch(`${API_URL}/matches`, { credentials: 'include', cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const list = await response.json();
        adminMatches = Array.isArray(list) ? sortMatchesChronologically(list) : [];
        saveMatchesCache(adminMatches);
        renderAdminMatches(adminMatches);
    } catch (error) {
        console.error("Error fetching matches:", error);
        const cached = sortMatchesChronologically(loadMatchesCache());
        adminMatches = cached;
        renderAdminMatches(adminMatches);
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

        const options = ['Pending', match.team1, match.team2];
        const selectOptions = options.map(opt => `<option value="${escapeHtml(opt)}" ${pred === opt ? 'selected' : ''}>${escapeHtml(opt)}</option>`).join('');

        const row = document.createElement('div');
        row.className = 'admin-match-row';
        row.innerHTML = `
            <div class="admin-match-info">
                <h4>${escapeHtml(match.team1)} vs ${escapeHtml(match.team2)}</h4>
                <p>${date} | ${escapeHtml(match.time)} | 📍 ${escapeHtml(match.stadium)}</p>
            </div>
            <div class="admin-match-status" style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; justify-content: center; position: relative;">
                <select id="pred-select-${match.id}" style="padding: 0.4rem; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(0, 0, 0, 0.4); color: white; margin-bottom: 0.3rem;">
                    ${selectOptions}
                </select>
                <div id="msg-${match.id}" class="success-text" style="font-size: 0.75rem; margin-top: 0; min-height: 15px;"></div>
            </div>
            <button class="edit-btn" onclick="saveInlinePrediction(${match.id})" style="margin-left: 1rem;">Save</button>
        `;
        container.appendChild(row);
    });
}

async function saveInlinePrediction(id) {
    const select = document.getElementById(`pred-select-${id}`);
    const prediction = select.value;
    const msgEl = document.getElementById(`msg-${id}`);
    
    // Optimistic local update: saves locally immediately so it's not lost if server is down
    adminMatches = adminMatches.map(m => String(m.id) === String(id) ? { ...m, prediction } : m);
    saveMatchesCache(adminMatches);

    // reset message
    msgEl.textContent = 'Saving...';
    msgEl.style.color = 'var(--text-muted)';

    try {
        const response = await fetch(`${API_URL}/matches/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            cache: 'no-store',
            body: JSON.stringify({ prediction })
        });
        
        let data = {};
        const raw = await response.text();
        if (raw) {
            try { data = JSON.parse(raw); } catch(_) { data = { error: 'Bad response from server' }; }
        }

        if (response.ok) {
            msgEl.textContent = 'Updated!';
            msgEl.style.color = '#00e676';
            setTimeout(() => { msgEl.textContent = ''; }, 2000);
        } else {
            // Revert on explicit failure? No, user requested persistence even on failure/down
            msgEl.textContent = 'Saved Locally (Server ' + response.status + ')';
            msgEl.style.color = '#ffd700'; // yellow for offline sync notice
            setTimeout(() => { msgEl.textContent = ''; }, 3000);
        }
    } catch (err) {
        msgEl.textContent = 'Saved Locally (Server Offline)';
        msgEl.style.color = '#ffd700';
        setTimeout(() => { msgEl.textContent = ''; }, 3000);
    }
}

// Keep the form listener around just in case the modal is open somewhere, but it's largely deprecated
function openUpdateModal(id) {
    // Deprecated. Inline editing is now used.
}
function closeModal() {
    // Deprecated. Inline editing is now used.
}

if (document.getElementById('update-prediction-form')) {
    document.getElementById('update-prediction-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('match-id').value;
        const prediction = document.getElementById('prediction-select').value;
        const msgEl = document.getElementById('modal-msg');
        const saveBtn = e.target.querySelector('button[type="submit"]');
        saveBtn.disabled = true;
        const oldBtnText = saveBtn.textContent;
        saveBtn.textContent = 'Saving...';

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
                // Apply immediately to local list/cache so it never appears reset in UI.
                adminMatches = adminMatches.map((m) =>
                    String(m.id) === String(id) ? { ...m, prediction } : m
                );
                saveMatchesCache(adminMatches);
                renderAdminMatches(adminMatches);
                msgEl.textContent = 'Updated successfully!';
                msgEl.style.color = '#00e676';
                setTimeout(() => {
                    closeModal();
                    // Use local data instead of re-fetching to preserve prediction state
                    renderAdminMatches(adminMatches);
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
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = oldBtnText;
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    hydrateNavbarProfile();
    const profileForm = document.getElementById('profile-form');
    if (profileForm) {
        profileForm.addEventListener('submit', saveProfile);
    }
});
