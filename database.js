const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./auth.db');

db.serialize(() => {
    // 1. สร้างตาราง users ถ้ายังไม่มี
    db.run("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT, password TEXT)");

    // 2. เพิ่ม User เริ่มต้น (admin / 1234) ถ้ายังไม่มี
    db.get("SELECT * FROM users WHERE username = 'admin'", (err, row) => {
        if (!row) {
            const stmt = db.prepare("INSERT INTO users (username, password) VALUES (?, ?)");
            stmt.run("admin", "1234"); // ในใช้งานจริงควร Hash password (เช่นใช้ bcrypt)
            stmt.finalize();
            console.log("Default user 'admin' created.");
        }
    });
});

module.exports = db;