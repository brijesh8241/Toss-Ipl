// Universal fetch configuration
const API_URL = '/api';

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
        const response = await fetch(`${API_URL}/matches`);
        const matches = await response.json();
        
        // Filter for ONLY today's matches
        const todayStr = new Date().toISOString().split('T')[0];
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
        const response = await fetch(`${API_URL}/matches`);
        const matches = await response.json();
        const todayStr = new Date().toISOString().split('T')[0];
        const upcomingMatches = matches.filter(m => m.date !== todayStr);
        renderPublicMatches(upcomingMatches, "No scheduled upcoming matches available right now.");
    } catch (error) {
        console.error("Error fetching matches:", error);
        if(document.getElementById('matches-container')) {
            document.getElementById('matches-container').innerHTML = '<p class="error-text">Failed to load schedule. Try again later.</p>';
        }
    } finally {
        hideLoader('loader');
    }
}

function renderPublicMatches(matches, emptyMessage = "No matches scheduled yet.") {
    const container = document.getElementById('matches-container');
    if(!container) return;
    container.innerHTML = '';
    
    if (matches.length === 0) {
        container.innerHTML = `<p style="text-align:center; color:var(--text-muted); width: 100%; grid-column: 1 / -1; padding: 2rem; font-size: 1.1rem;">${emptyMessage}</p>`;
        return;
    }

    matches.forEach(match => {
        const dateObj = new Date(match.date);
        const date = isNaN(dateObj) ? match.date : dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        const predictionClass = match.prediction === 'Pending' ? 'pending' : '';
        
        const card = document.createElement('div');
        card.className = 'match-card';
        card.innerHTML = `
            <div class="match-date">${date} <span style="float: right; color: var(--text-main); font-weight: normal;">🕰️ ${match.time}</span></div>
            <div class="teams">
                <span>${match.team1}</span>
                <span class="vs">vs</span>
                <span>${match.team2}</span>
            </div>
            <div class="stadium">📍 ${match.stadium}</div>
            <div class="prediction-badge">
                <p>Predicted Winner</p>
                <h4 class="${predictionClass}">${match.prediction}</h4>
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
        const response = await fetch('http://localhost:3000/api/request-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier })
        });

        const data = await response.json();

        if (response.ok) {
            document.getElementById('otp-request-form').style.display = 'none';
            document.getElementById('otp-verify-form').style.display = 'block';
            setTimeout(() => {
                alert(`📱 PING! You received a message.\n\nYour IPL Dashboard code is: ${data.otp}`);
            }, 600); // Small delay to simulate network feeling
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
        const response = await fetch('http://localhost:3000/api/verify-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
    await fetch(`${API_URL}/logout`, { method: 'POST' });
    window.location.href = 'index.html';
}

// --- Admin Page Logic ---
let adminMatches = [];

async function checkAdminAuthAndLoad() {
    showLoader('loader');
    try {
        const response = await fetch(`${API_URL}/me`);
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
        const response = await fetch(`${API_URL}/matches`);
        adminMatches = await response.json();
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
        const date = new Date(match.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        const statusClass = match.prediction !== 'Pending' ? 'predicted' : '';

        const row = document.createElement('div');
        row.className = 'admin-match-row';
        row.innerHTML = `
            <div class="admin-match-info">
                <h4>${match.team1} vs ${match.team2}</h4>
                <p>${date} | ${match.time} | 📍 ${match.stadium}</p>
            </div>
            <div class="admin-match-status">
                <span class="${statusClass}">${match.prediction}</span>
            </div>
            <button class="edit-btn" onclick="openUpdateModal(${match.id})">Update</button>
        `;
        container.appendChild(row);
    });
}

function openUpdateModal(id) {
    const match = adminMatches.find(m => m.id === id);
    if (!match) return;

    document.getElementById('match-id').value = id;
    document.getElementById('modal-match-details').textContent = `${match.team1} vs ${match.team2}`;

    const select = document.getElementById('prediction-select');
    select.innerHTML = `
        <option value="Pending" ${match.prediction === 'Pending' ? 'selected' : ''}>Pending</option>
        <option value="${match.team1}" ${match.prediction === match.team1 ? 'selected' : ''}>${match.team1}</option>
        <option value="${match.team2}" ${match.prediction === match.team2 ? 'selected' : ''}>${match.team2}</option>
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
                body: JSON.stringify({ prediction })
            });
            const data = await response.json();

            if (response.ok) {
                msgEl.textContent = 'Updated successfully!';
                msgEl.style.color = '#00e676';
                setTimeout(() => {
                    closeModal();
                    fetchAdminMatches(); // refresh list
                }, 1000);
            } else {
                msgEl.textContent = data.error || 'Failed to update';
                msgEl.style.color = '#ff4d4d';
            }
        } catch (err) {
            msgEl.textContent = 'Server error.';
            msgEl.style.color = '#ff4d4d';
        }
    });
}
