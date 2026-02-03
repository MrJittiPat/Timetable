const fs = require('fs');
const path = require('path');

function loadCSV(fileName) {
    const filePath = path.join(__dirname, 'data', fileName);
    try {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const lines = fileContent.trim().split(/\r?\n/);
        if (lines.length < 2) return [];
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        const data = [];
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            const values = lines[i].split(',');
            let obj = {};
            headers.forEach((header, index) => {
                obj[header] = values[index] ? values[index].trim() : '';
            });
            data.push(obj);
        }
        return data;
    } catch (err) {
        console.error(`Error loading ${fileName}:`, err.message);
        return [];
    }
}

function runScheduling() {
    console.log("Starting Block Scheduling Logic...");
    
    // 1. โหลดข้อมูล
    const register = loadCSV('register.csv');
    const rooms = loadCSV('room.csv');
    const subjects = loadCSV('subject.csv');
    const teach = loadCSV('teach.csv');
    const timeslots = loadCSV('timeslot.csv');

    if (!register.length) return { schedule: [], subjects: {} };

    // 2. เตรียมข้อมูล (Mappings)
    const subjectDetails = {}; // สำหรับ Logic (Duration)
    const subjectInfo = {};    // สำหรับแสดงผลหน้าเว็บ (Name, Credit)

    subjects.forEach(s => {
        // ข้อมูลสำหรับ Logic
        subjectDetails[s.subject_id] = {
            theory: parseInt(s.theory || 0),
            practice: parseInt(s.practice || 0)
        };

        // ข้อมูลสำหรับแสดงผล (ส่งกลับไปที่หน้าเว็บ)
        subjectInfo[s.subject_id] = {
            name: s.subject_name || "",
            theory: parseInt(s.theory || 0),
            practice: parseInt(s.practice || 0),
            credit: parseInt(s.credit || 0)
        };
    });

    const subjectTeachers = {};
    teach.forEach(t => {
        if (!subjectTeachers[t.subject_id]) subjectTeachers[t.subject_id] = [];
        subjectTeachers[t.subject_id].push(t.teacher_id);
    });

    const theoryRooms = rooms.filter(r => r.room_type === 'Theory').map(r => r.room_id);
    const practiceRooms = rooms.filter(r => r.room_type !== 'Theory').map(r => r.room_id);
    
    const slotLookup = {};
    const timeslotDetails = {};
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    
    timeslots.forEach(t => {
        const key = `${t.day}_${t.period}`;
        slotLookup[key] = parseInt(t.timeslot_id);
        timeslotDetails[t.timeslot_id] = { 
            day: t.day, 
            period: parseInt(t.period), 
            start: t.start, 
            end: t.end 
        };
    });

    // 3. สร้างคิววิชาแบบ Block
    let classQueue = [];
    register.forEach(reg => {
        const sub = subjectDetails[reg.subject_id];
        if (!sub) return;
        if (sub.theory > 0) classQueue.push({ group_id: reg.group_id, subject_id: reg.subject_id, type: 'Theory', duration: sub.theory });
        if (sub.practice > 0) classQueue.push({ group_id: reg.group_id, subject_id: reg.subject_id, type: 'Practice', duration: sub.practice });
    });

    classQueue.sort((a, b) => {
        if (b.duration !== a.duration) return b.duration - a.duration;
        if (a.group_id !== b.group_id) return a.group_id.localeCompare(b.group_id);
        return a.subject_id.localeCompare(b.subject_id);
    });

    // 4. เริ่มจัดตาราง
    const scheduleState = { groups: {}, teachers: {}, rooms: {} };

    function checkBlockAvailability(day, startPeriod, duration, group, teacher, room) {
        for (let i = 0; i < duration; i++) {
            const currentPeriod = startPeriod + i;
            if (currentPeriod === 5) return false; 
            const slotKey = `${day}_${currentPeriod}`;
            const timeslotId = slotLookup[slotKey];
            if (!timeslotId) return false;
            if (scheduleState.groups[group]?.has(timeslotId)) return false;
            if (scheduleState.teachers[teacher]?.has(timeslotId)) return false;
            if (scheduleState.rooms[room]?.has(timeslotId)) return false;
        }
        return true;
    }

    function bookBlock(day, startPeriod, duration, group, teacher, room, subjectId) {
        const bookedSlots = [];
        for (let i = 0; i < duration; i++) {
            const currentPeriod = startPeriod + i;
            const slotKey = `${day}_${currentPeriod}`;
            const timeslotId = slotLookup[slotKey];

            if (!scheduleState.groups[group]) scheduleState.groups[group] = new Set();
            if (!scheduleState.teachers[teacher]) scheduleState.teachers[teacher] = new Set();
            if (!scheduleState.rooms[room]) scheduleState.rooms[room] = new Set();

            scheduleState.groups[group].add(timeslotId);
            scheduleState.teachers[teacher].add(timeslotId);
            scheduleState.rooms[room].add(timeslotId);

            bookedSlots.push({
                group_id: group,
                timeslot_id: timeslotId,
                subject_id: subjectId,
                teacher_id: teacher,
                room_id: room,
                day: day,
                period: currentPeriod,
                time: `${timeslotDetails[timeslotId].start}-${timeslotDetails[timeslotId].end}`
            });
        }
        return bookedSlots;
    }

    const finalSchedule = [];
    
    classQueue.forEach((block) => {
        let assigned = false;
        const possibleTeachers = subjectTeachers[block.subject_id];
        if (!possibleTeachers || possibleTeachers.length === 0) return;
        let preferredRooms = block.type === 'Theory' ? [...theoryRooms, ...practiceRooms] : [...practiceRooms, ...theoryRooms];

        for (let teacherId of possibleTeachers) {
            for (let roomId of preferredRooms) {
                for (let day of days) {
                    for (let startP = 1; startP <= 10; startP++) {
                        if (startP + block.duration - 1 > 12) continue;
                        if (checkBlockAvailability(day, startP, block.duration, block.group_id, teacherId, roomId)) {
                            const result = bookBlock(day, startP, block.duration, block.group_id, teacherId, roomId, block.subject_id);
                            finalSchedule.push(...result);
                            assigned = true;
                            break;
                        }
                    }
                    if (assigned) break;
                }
                if (assigned) break;
            }
            if (assigned) break;
        }
    });

    // 5. เขียน CSV
    let csvContent = "group_id,timeslot_id,subject_id,teacher_id,room_id\n";
    finalSchedule.sort((a, b) => a.group_id.localeCompare(b.group_id) || a.timeslot_id - b.timeslot_id);
    finalSchedule.forEach(row => {
        csvContent += `${row.group_id},${row.timeslot_id},${row.subject_id},${row.teacher_id},${row.room_id}\n`;
    });
    
    try {
        fs.writeFileSync(path.join(__dirname, 'output.csv'), csvContent);
        console.log("Scheduling complete.");
    } catch (e) {
        console.error("Error writing CSV:", e);
    }

    // Return ทั้งตารางเรียน และ ข้อมูลวิชา
    return { 
        schedule: finalSchedule, 
        subjects: subjectInfo 
    };
}

module.exports = { runScheduling };