const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./prediction.db');

const sampleMatches = [
    ['2026-04-11', '3:30 PM IST', 'PBKS', 'SRH', 'New Intl. Cricket Stadium, Chandigarh', 'Pending'],
    ['2026-04-11', '7:30 PM IST', 'CSK', 'DC', 'MA Chidambaram Stadium, Chennai', 'Pending'],
    ['2026-04-12', '3:30 PM IST', 'LSG', 'GT', 'Ekana Stadium, Lucknow', 'Pending'],
    ['2026-04-12', '7:30 PM IST', 'MI', 'RCB', 'Wankhede Stadium, Mumbai', 'Pending'],
    ['2026-04-13', '7:30 PM IST', 'SRH', 'RR', 'Rajiv Gandhi Stadium, Hyderabad', 'Pending'],
    ['2026-04-14', '7:30 PM IST', 'CSK', 'KKR', 'MA Chidambaram Stadium, Chennai', 'Pending'],
    ['2026-04-15', '7:30 PM IST', 'RCB', 'LSG', 'M. Chinnaswamy Stadium, Bengaluru', 'Pending']
];

db.serialize(() => {
    db.run("DELETE FROM matches");
    const stmt = db.prepare(`INSERT INTO matches (date, time, team1, team2, stadium, prediction) VALUES (?, ?, ?, ?, ?, ?)`);
    sampleMatches.forEach(match => stmt.run(match));
    stmt.finalize(() => {
        console.log("Database reset with 11-15 April matches.");
        db.close();
    });
});
