// ==================== ПОДКЛЮЧАЕМ SQLite ====================
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./clinic.db');

// ==================== СОЗДАНИЕ ТАБЛИЦ ====================
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS services (
            id INTEGER PRIMARY KEY,
            name TEXT,
            duration INTEGER,
            price INTEGER,
            description TEXT,
            is_active BOOLEAN DEFAULT 1
        )
    `);

    // Таблица записей (главная!)
    db.run(`
        CREATE TABLE IF NOT EXISTS appointments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,                    -- Telegram ID пациента
            service_id INTEGER,                  -- ID услуги
            service_name TEXT,                    -- Название услуги (для истории)
            appointment_date TEXT,                -- Дата в формате YYYY-MM-DD
            appointment_time TEXT,                 -- Время в формате HH:MM
            patient_name TEXT,                     -- Имя пациента
            patient_phone TEXT,                    -- Телефон
            comment TEXT,                          -- Комментарий
            status TEXT DEFAULT 'pending',         -- pending, confirmed, cancelled, completed
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            reminder_sent BOOLEAN DEFAULT 0,       -- Отправлено ли напоминание
            FOREIGN KEY(service_id) REFERENCES services(id)
        )
    `);

    // Таблица пациентов (для постоянных клиентов)
    db.run(`
        CREATE TABLE IF NOT EXISTS patients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER UNIQUE,                -- Telegram ID
            name TEXT,
            phone TEXT,
            email TEXT,
            birth_date TEXT,
            notes TEXT,
            registered_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Таблица для временного хранения слотов
    db.run(`
        CREATE TABLE IF NOT EXISTS schedule (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT UNIQUE,                      -- Дата
            slots TEXT,                             -- JSON со свободными слотами
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    console.log('✅ База данных клиники готова');
});

// Инициализация услуг из конфига (если таблица пуста)
function initServicesFromConfig(configServices) {
    return new Promise((resolve, reject) => {
        // Проверяем, есть ли уже услуги в базе
        db.get("SELECT COUNT(*) as count FROM services", [], (err, row) => {
            if (err) {
                reject(err);
                return;
            }
            
            // Если таблица пуста, заполняем её
            if (row.count === 0) {
                const stmt = db.prepare("INSERT INTO services (id, name, duration, price, description) VALUES (?, ?, ?, ?, ?)");
                
                configServices.forEach(service => {
                    stmt.run(service.id, service.name, service.duration, service.price, service.description);
                });
                
                stmt.finalize((err) => {
                    if (err) reject(err);
                    else {
                        console.log('✅ Услуги добавлены в базу данных');
                        resolve();
                    }
                });
            } else {
                console.log('✅ Услуги уже есть в базе данных');
                resolve();
            }
        });
    });
}

// ==================== ФУНКЦИИ ДЛЯ РАБОТЫ С УСЛУГАМИ ====================

// Получить все активные услуги
function getServices() {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM services WHERE is_active = 1 ORDER BY id", [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

// Получить услугу по ID
function getServiceById(serviceId) {
    return new Promise((resolve, reject) => {
        db.get("SELECT * FROM services WHERE id = ?", [serviceId], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

// Инициализировать услуги из конфига (если таблица пуста)
function initServices(configServices) {
    return new Promise((resolve, reject) => {
        db.get("SELECT COUNT(*) as count FROM services", [], (err, row) => {
            if (err) {
                reject(err);
                return;
            }
            
            if (row.count === 0) {
                const stmt = db.prepare("INSERT INTO services (id, name, duration, price, description) VALUES (?, ?, ?, ?, ?)");
                
                configServices.forEach(service => {
                    stmt.run(service.id, service.name, service.duration, service.price, service.description);
                });
                
                stmt.finalize((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            } else {
                resolve();
            }
        });
    });
}

// ==================== ФУНКЦИИ ДЛЯ РАБОТЫ С ЗАПИСЯМИ ====================

// Создать новую запись
function createAppointment(data) {
    return new Promise((resolve, reject) => {
        const { userId, serviceId, serviceName, date, time, patientName, patientPhone, comment } = data;
        
        db.run(
            `INSERT INTO appointments 
            (user_id, service_id, service_name, appointment_date, appointment_time, patient_name, patient_phone, comment) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, serviceId, serviceName, date, time, patientName, patientPhone, comment],
            function(err) {
                if (err) reject(err);
                else resolve(this.lastID);  // Возвращаем ID созданной записи
            }
        );
    });
}

// Получить записи пользователя
function getUserAppointments(userId) {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT * FROM appointments 
            WHERE user_id = ? 
            ORDER BY appointment_date DESC, appointment_time DESC`,
            [userId],
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            }
        );
    });
}

// Получить предстоящие записи пользователя
function getUserUpcomingAppointments(userId) {
    return new Promise((resolve, reject) => {
        const today = new Date().toISOString().split('T')[0];
        
        db.all(
            `SELECT * FROM appointments 
            WHERE user_id = ? AND appointment_date >= ? AND status IN ('pending', 'confirmed')
            ORDER BY appointment_date ASC, appointment_time ASC`,
            [userId, today],
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            }
        );
    });
}

// Получить запись по ID
function getAppointmentById(id) {
    return new Promise((resolve, reject) => {
        db.get("SELECT * FROM appointments WHERE id = ?", [id], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

// Обновить статус записи
function updateAppointmentStatus(id, status) {
    return new Promise((resolve, reject) => {
        db.run(
            "UPDATE appointments SET status = ? WHERE id = ?",
            [status, id],
            (err) => {
                if (err) reject(err);
                else resolve();
            }
        );
    });
}

// Отменить запись
function cancelAppointment(id) {
    return updateAppointmentStatus(id, 'cancelled');
}

// Отметить, что напоминание отправлено
function markReminderSent(id) {
    return new Promise((resolve, reject) => {
        db.run(
            "UPDATE appointments SET reminder_sent = 1 WHERE id = ?",
            [id],
            (err) => {
                if (err) reject(err);
                else resolve();
            }
        );
    });
}

// Получить записи, которым пора отправить напоминание
function getAppointmentsForReminder() {
    return new Promise((resolve, reject) => {
        const now = new Date();
        const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
        
        const targetDate = oneHourLater.toISOString().split('T')[0];
        const targetTime = `${oneHourLater.getHours().toString().padStart(2, '0')}:${oneHourLater.getMinutes().toString().padStart(2, '0')}`;
        
        db.all(
            `SELECT * FROM appointments 
            WHERE appointment_date = ? 
            AND appointment_time = ? 
            AND reminder_sent = 0 
            AND status IN ('pending', 'confirmed')`,
            [targetDate, targetTime],
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            }
        );
    });
}

// ==================== ФУНКЦИИ ДЛЯ РАБОТЫ С РАСПИСАНИЕМ ====================

// Получить занятые слоты на дату
function getBusySlots(date, serviceId = null) {
    return new Promise((resolve, reject) => {
        let query = "SELECT appointment_time FROM appointments WHERE appointment_date = ? AND status IN ('pending', 'confirmed')";
        let params = [date];
        
        if (serviceId) {
            query += " AND service_id = ?";
            params.push(serviceId);
        }
        
        db.all(query, params, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                const busySlots = rows.map(row => row.appointment_time);
                resolve(busySlots);
            }
        });
    });
}

// Получить доступные слоты на дату
function getAvailableSlots(date, serviceId = null) {
    return new Promise((resolve, reject) => {
        // Сначала получаем занятые слоты
        let query = "SELECT appointment_time FROM appointments WHERE appointment_date = ? AND status IN ('pending', 'confirmed')";
        let params = [date];
        
        if (serviceId) {
            query += " AND service_id = ?";
            params.push(serviceId);
        }
        
        db.all(query, params, (err, rows) => {
            if (err) {
                reject(err);
                return;
            }
            
            const busySlots = rows.map(row => row.appointment_time);
            
            // Генерируем все возможные слоты
            const { WORK_HOURS } = require('./config.js');
            const allSlots = [];
            
            for (let hour = WORK_HOURS.start; hour < WORK_HOURS.end; hour++) {
                for (let minute = 0; minute < 60; minute += WORK_HOURS.interval) {
                    const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
                    
                    // Проверяем, не в прошлом ли это время (для сегодняшней даты)
                    const isInPast = isTimeInPast(date, timeStr);
                    
                    allSlots.push({
                        time: timeStr,
                        display: timeStr,
                        available: !busySlots.includes(timeStr) && !isInPast,
                        busy: busySlots.includes(timeStr),
                        past: isInPast
                    });
                }
            }
            
            // Возвращаем только доступные слоты
            const availableSlots = allSlots.filter(slot => slot.available);
            resolve(availableSlots);
        });
    });
}

// Вспомогательная функция для проверки, не в прошлом ли время
function isTimeInPast(date, time) {
    const now = new Date();
    const targetDate = new Date(date + 'T' + time + ':00');
    return targetDate < now;
}

// Проверить, свободно ли время
function isTimeSlotAvailable(date, time) {
    return new Promise((resolve, reject) => {
        db.get(
            "SELECT * FROM appointments WHERE appointment_date = ? AND appointment_time = ? AND status IN ('pending', 'confirmed')",
            [date, time],
            (err, row) => {
                if (err) reject(err);
                else resolve(!row);  // true если свободно
            }
        );
    });
}

// ==================== ФУНКЦИИ ДЛЯ РАБОТЫ С ПАЦИЕНТАМИ ====================

// Найти или создать пациента
async function findOrCreatePatient(chatId, name, phone) {
    return new Promise((resolve, reject) => {
        db.get("SELECT * FROM patients WHERE user_id = ?", [chatId], (err, patient) => {
            if (err) {
                reject(err);
            } else if (patient) {
                // Обновляем данные, если они изменились
                db.run(
                    "UPDATE patients SET name = ?, phone = ? WHERE user_id = ?",
                    [name, phone, chatId],
                    (err) => {
                        if (err) reject(err);
                        else resolve(patient);
                    }
                );
            } else {
                // Создаём нового пациента
                db.run(
                    "INSERT INTO patients (user_id, name, phone) VALUES (?, ?, ?)",
                    [chatId, name, phone],
                    function(err) {
                        if (err) reject(err);
                        else resolve({ id: this.lastID, user_id: chatId, name, phone });
                    }
                );
            }
        });
    });
}

// Получить данные пациента
function getPatient(chatId) {
    return new Promise((resolve, reject) => {
        db.get("SELECT * FROM patients WHERE user_id = ?", [chatId], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

// Получить всех пациентов
function getAllPatients() {
    return new Promise((resolve, reject) => {
        db.all(`
            SELECT p.*, 
                   (SELECT COUNT(*) FROM appointments WHERE user_id = p.user_id) as appointments_count 
            FROM patients p 
            ORDER BY p.registered_at DESC
        `, [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

// ==================== АДМИН-ФУНКЦИИ ====================

// Получить все записи за период
function getAppointmentsByDateRange(startDate, endDate) {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT * FROM appointments 
            WHERE appointment_date BETWEEN ? AND ? 
            ORDER BY appointment_date ASC, appointment_time ASC`,
            [startDate, endDate],
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            }
        );
    });
}

// Получить статистику по услугам
function getServicesStats() {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT 
                service_name,
                COUNT(*) as total,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
            FROM appointments 
            GROUP BY service_name`,
            [],
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            }
        );
    });
}



function initServicesFromConfig(configServices) {
    return new Promise((resolve, reject) => {
        db.get("SELECT COUNT(*) as count FROM services", [], (err, row) => {
            if (err) {
                reject(err);
                return;
            }
            
            if (row.count === 0) {
                const stmt = db.prepare("INSERT INTO services (id, name, duration, price, description) VALUES (?, ?, ?, ?, ?)");
                
                configServices.forEach(service => {
                    stmt.run(service.id, service.name, service.duration, service.price, service.description);
                });
                
                stmt.finalize((err) => {
                    if (err) reject(err);
                    else {
                        console.log('✅ Услуги добавлены в базу данных');
                        resolve();
                    }
                });
            } else {
                console.log('✅ Услуги уже есть в базе данных');
                resolve();
            }
        });
    });
}

// ==================== ЭКСПОРТ ВСЕХ ФУНКЦИЙ ====================
module.exports = {
    db,
    // Услуги
    getServices,
    getServiceById,
    initServices,
    initServicesFromConfig,
    
    // Записи
    createAppointment,
    getUserAppointments,
    getUserUpcomingAppointments,
    getAppointmentById,
    updateAppointmentStatus,
    cancelAppointment,
    markReminderSent,
    getAppointmentsForReminder,
    
    // Расписание
    getBusySlots,
    isTimeSlotAvailable,
    getAvailableSlots,
    getAppointmentById,
    
    
    // Пациенты
    findOrCreatePatient,
    getPatient,
    getAllPatients,
    
    // Админ
    getAppointmentsByDateRange,
    getServicesStats,


    
};