const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path'); // อย่าลืม require path
const db = require('./database');
const scheduler = require('./index'); 

const app = express();


let currentSchedule = []; 
let currentSubjects = {}; 

app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
    secret: 'secret-key-contest',
    resave: false,
    saveUninitialized: true
}));
app.use(express.static(path.join(__dirname, 'public'))); // ให้เข้าถึงโฟลเดอร์ public ได้
app.use('/libs', express.static(path.join(__dirname, 'node_modules'))); // ให้เข้าถึง library ที่ npm install มาได้

const requireLogin = (req, res, next) => {
    if (req.session.userId) next();
    else res.redirect('/login');
};

// Routes
app.get('/login', (req, res) => res.render('login', { error: null }));

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM users WHERE username = ? AND password = ?", [username, password], (err, row) => {
        if (row) {
            req.session.userId = row.id;
            req.session.username = row.username;
            res.redirect('/dashboard');
        } else {
            res.render('login', { error: "ข้อมูลไม่ถูกต้อง" });
        }
    });
});

app.get('/dashboard', requireLogin, (req, res) => {
    res.render('dashboard', { 
        user: req.session.username,
        schedule: currentSchedule,
        subjects: currentSubjects
    });
});

// --- เพิ่ม Route สำหรับดาวน์โหลด CSV ตรงนี้ ---
app.get('/download/csv', requireLogin, (req, res) => {
    const file = path.join(__dirname, 'output.csv');
    res.download(file, 'timetable_output.csv', (err) => {
        if (err) {
            console.error("Error downloading CSV:", err);
            // ถ้าหาไฟล์ไม่เจอ (ยังไม่ได้จัดตาราง) ให้ส่งกลับหน้า Dashboard
            res.redirect('/dashboard'); 
        }
    });
});
// -------------------------------------------

app.post('/generate', requireLogin, (req, res) => {
    try {
        const result = scheduler.runScheduling();
        currentSchedule = result.schedule;
        currentSubjects = result.subjects;
    } catch (e) {
        console.error(e);
    }
    res.redirect('/dashboard');
});

app.post('/clear', requireLogin, (req, res) => {
    currentSchedule = [];
    currentSubjects = {};
    res.redirect('/dashboard');
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

app.get('/', (req, res) => res.redirect('/login'));

app.listen(80, () => console.log('Server started on http://localhost:80'));