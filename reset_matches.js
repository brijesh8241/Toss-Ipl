const Database = require('better-sqlite3');
const { buildFixtures } = require('./ipl2026-fixtures');

const db = new Database('./prediction.db');

db.exec('DELETE FROM matches');
const stmt = db.prepare(
    `INSERT INTO matches (date, time, team1, team2, stadium, prediction) VALUES (?, ?, ?, ?, ?, ?)`
);
const fixtures = buildFixtures();
const insertMany = db.transaction((list) => {
    for (const f of list) {
        stmt.run(f.date, f.time, f.team1, f.team2, f.stadium, 'Pending');
    }
});
insertMany(fixtures);
db.close();

console.log(`Database reset with ${fixtures.length} IPL 2026 league matches (predictions: Pending).`);
