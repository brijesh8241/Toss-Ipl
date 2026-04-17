const Database = require('better-sqlite3');
const db = new Database('./prediction.db');
const matches = db.prepare('SELECT * FROM matches WHERE prediction != ?').all('Pending');
console.log(JSON.stringify(matches, null, 2));
db.close();
