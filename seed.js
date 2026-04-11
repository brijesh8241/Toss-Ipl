const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./prediction.db');

const sampleMatches = [
    ['2026-04-11', '7:30 PM IST', 'CSK', 'MI', 'Chepauk Stadium', 'Pending'],
    ['2026-04-12', '7:30 PM IST', 'RCB', 'KKR', 'Chinnaswamy Stadium', 'Pending'],
    ['2026-04-13', '3:30 PM IST', 'GT', 'RR', 'Narendra Modi Stadium', 'Pending'],
    ['2026-04-14', '7:30 PM IST', 'DC', 'PBKS', 'Arun Jaitley Stadium', 'Pending'],
    ['2026-04-15', '7:30 PM IST', 'SRH', 'LSG', 'Rajiv Gandhi Stadium', 'Pending']
];

db.serialize(() => {
    const stmt = db.prepare(`INSERT INTO matches (date, time, team1, team2, stadium, prediction) VALUES (?, ?, ?, ?, ?, ?)`);
    sampleMatches.forEach(match => stmt.run(match));
    stmt.finalize();
    console.log('Inserted additional matches for April 11-15');
});

db.close();
