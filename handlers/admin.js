// ==================== МОДУЛЬ АДМИНИСТРАТОРА ====================
// Панель управления для врача: просмотр записей, подтверждение, статистика

const { 
    getAppointmentsByDateRange, 
    getServicesStats,
    updateAppointmentStatus,
    getAppointmentById,
    getPatient,
    getAllPatients,
    getServices
} = require('../database.js');
const { generateDates, createDatesKeyboard } = require('../utils/calendar.js');
const { notifyPatientConfirmed, notifyPatientRejected } = require('../utils/notifications.js');
const config = require('../config.js');

// ==================== ГЛАВНОЕ МЕНЮ АДМИНА ====================
/**
 * Показывает главное меню администратора
 */
async function handleAdmin(bot, msg) {
    const chatId = msg.chat.id;
    
    if (!isAdmin(chatId)) {
        await bot.sendMessage(chatId, 'У вас нет доступа к панели администратора.');
        return;
    }
    
    const adminMenu = `
ПАНЕЛЬ АДМИНИСТРАТОРА

━━━━━━━━━━━━━━━━━━
УПРАВЛЕНИЕ ЗАПИСЯМИ
/today — записи на сегодня
/tomorrow — записи на завтра
/week — записи на неделю
/pending — ожидающие подтверждения
/all — все записи

СТАТИСТИКА
/stats — статистика по услугам
/patients — список пациентов
/services — управление услугами

НАСТРОЙКИ
/schedule — управление расписанием

ПОМОЩЬ
/help — это сообщение
    `;

    const keyboard = {
        reply_markup: {
            keyboard: [
                ['Сегодня', 'Завтра'],
                ['Ожидают', 'Статистика'],
                ['Пациенты', 'Расписание'],
                ['Главное меню']
            ],
            resize_keyboard: true
        }
    };

    await bot.sendMessage(chatId, adminMenu, {
        parse_mode: 'HTML',
        reply_markup: keyboard.reply_markup
    });
}

// ==================== ПРОВЕРКА АДМИНА ====================
/**
 * Проверяет, является ли пользователь администратором
 */
function isAdmin(chatId) {
    return chatId === config.DOCTOR_ID || (config.ADMINS && config.ADMINS.includes(chatId));
}

// ==================== ЗАПИСИ НА СЕГОДНЯ ====================
/**
 * Показывает записи на сегодня
 */
async function handleToday(bot, msg) {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) return;
    
    const today = new Date().toISOString().split('T')[0];
    await showAppointmentsForDate(bot, chatId, today, 'ЗАПИСИ НА СЕГОДНЯ');
}

// ==================== ЗАПИСИ НА ЗАВТРА ====================
/**
 * Показывает записи на завтра
 */
async function handleTomorrow(bot, msg) {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) return;
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    
    await showAppointmentsForDate(bot, chatId, tomorrowStr, 'ЗАПИСИ НА ЗАВТРА');
}

// ==================== ЗАПИСИ НА НЕДЕЛЮ ====================
/**
 * Показывает записи на ближайшую неделю
 */
async function handleWeek(bot, msg) {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) return;
    
    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const nextWeekStr = nextWeek.toISOString().split('T')[0];
    
    const appointments = await getAppointmentsByDateRange(today, nextWeekStr);
    await sendAppointmentsList(bot, chatId, appointments, 'ЗАПИСИ НА НЕДЕЛЮ');
}

// ==================== ВСЕ ЗАПИСИ ====================
/**
 * Показывает все записи
 */
async function handleAllAppointments(bot, msg) {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) return;
    
    const start = '2000-01-01';
    const end = '2030-12-31';
    
    const appointments = await getAppointmentsByDateRange(start, end);
    await sendAppointmentsList(bot, chatId, appointments, 'ВСЕ ЗАПИСИ');
}

// ==================== ОЖИДАЮЩИЕ ПОДТВЕРЖДЕНИЯ ====================
/**
 * Показывает записи, ожидающие подтверждения
 */
async function handlePending(bot, msg) {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) return;
    
    const today = new Date().toISOString().split('T')[0];
    const appointments = await getAppointmentsByDateRange(today, '2030-12-31');
    const pending = appointments.filter(a => a.status === 'pending');
    
    if (pending.length === 0) {
        await bot.sendMessage(chatId, 'Нет ожидающих записей');
        return;
    }

    await sendPendingList(bot, chatId, pending);
}

// ==================== СТАТИСТИКА ПО УСЛУГАМ ====================
/**
 * Показывает статистику по услугам
 */
async function handleStats(bot, msg) {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) return;
    
    const stats = await getServicesStats();
    const services = await getServices();
    
    let message = 'СТАТИСТИКА ПО УСЛУГАМ\n\n';
    let total = 0;
    let totalRevenue = 0;
    
    for (const stat of stats) {
        const service = services.find(s => s.name === stat.service_name);
        const revenue = (stat.completed || 0) * (service?.price || 0);
        
        message += `━━━━━━━━━━━━━━━━━━\n`;
        message += `${stat.service_name}\n`;
        message += `   Всего записей: ${stat.total || 0}\n`;
        message += `   Подтверждено: ${stat.completed || 0}\n`;
        message += `   Отменено: ${stat.cancelled || 0}\n`;
        message += `   Выручка: ${revenue} ₽\n`;
        
        total += stat.total || 0;
        totalRevenue += revenue;
    }
    
    message += `━━━━━━━━━━━━━━━━━━\n`;
    message += `ИТОГО:\n`;
    message += `   Всего записей: ${total}\n`;
    message += `   Общая выручка: ${totalRevenue} ₽\n`;
    
    await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
}

// ==================== СПИСОК ПАЦИЕНТОВ ====================
/**
 * Показывает список пациентов
 */
async function handlePatients(bot, msg) {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) return;
    
    const patients = await getAllPatients();
    
    if (patients.length === 0) {
        await bot.sendMessage(chatId, 'Нет зарегистрированных пациентов');
        return;
    }
    
    let message = 'СПИСОК ПАЦИЕНТОВ\n\n';
    
    patients.forEach((p, index) => {
        message += `━━━━━━━━━━━━━━━━━━\n`;
        message += `${index + 1}. ${p.name}\n`;
        message += `   ID: ${p.user_id}\n`;
        message += `   Телефон: ${p.phone || 'не указан'}\n`;
        message += `   Записей: ${p.appointments_count || 0}\n`;
    });
    
    await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
}

// ==================== УПРАВЛЕНИЕ РАСПИСАНИЕМ ====================
/**
 * Показывает расписание на ближайшую неделю
 */
async function handleSchedule(bot, msg) {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) return;
    
    const dates = generateDates(7);
    let message = 'РАСПИСАНИЕ НА БЛИЖАЙШУЮ НЕДЕЛЮ\n\n';
    
    for (const date of dates) {
        const appointments = await getAppointmentsByDateRange(date.raw, date.raw);
        
        message += `━━━━━━━━━━━━━━━━━━\n`;
        message += `${date.display}\n`;
        
        if (appointments.length === 0) {
            message += `   Нет записей\n`;
        } else {
            appointments.forEach(apt => {
                const statusEmoji = getStatusEmoji(apt.status);
                message += `   ${statusEmoji} ${apt.appointment_time} — ${apt.patient_name}\n`;
                message += `      #${apt.id} | ${apt.patient_phone}\n`;
            });
        }
    }
    
    message += `━━━━━━━━━━━━━━━━━━\n`;
    message += `Для управления записью используйте:\n`;
    message += `/view [номер] — просмотр\n`;
    message += `/confirm [номер] — подтвердить\n`;
    message += `/cancel [номер] — отменить`;
    
    const keyboard = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🔄 Обновить', callback_data: 'admin_refresh_schedule' }],
                [{ text: 'Назад', callback_data: 'back_to_admin' }]
            ]
        }
    };
    
    await bot.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        reply_markup: keyboard.reply_markup
    });
}

// ==================== УПРАВЛЕНИЕ УСЛУГАМИ ====================
/**
 * Показывает список услуг
 */
async function handleServices(bot, msg) {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) return;
    
    const services = await getServices();
    
    let message = 'УПРАВЛЕНИЕ УСЛУГАМИ\n\n';
    
    services.forEach((service, index) => {
        message += `━━━━━━━━━━━━━━━━━━\n`;
        message += `${index + 1}. ${service.name}\n`;
        message += `   Длительность: ${service.duration} мин\n`;
        message += `   Цена: ${service.price} ₽\n`;
        message += `   ${service.description || 'нет описания'}\n`;
    });
    
    const keyboard = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '➕ Добавить услугу', callback_data: 'admin_add_service' }],
                [{ text: '✏️ Редактировать', callback_data: 'admin_edit_services' }]
            ]
        }
    };
    
    await bot.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        reply_markup: keyboard.reply_markup
    });
}

// ==================== ПОКАЗАТЬ ЗАПИСИ НА ДАТУ ====================
/**
 * Показывает записи на конкретную дату
 */
async function showAppointmentsForDate(bot, chatId, date, title) {
    const appointments = await getAppointmentsByDateRange(date, date);
    await sendAppointmentsList(bot, chatId, appointments, title);
}

// ==================== ОТПРАВКА СПИСКА ЗАПИСЕЙ ====================
/**
 * Отправляет список записей
 */
async function sendAppointmentsList(bot, chatId, appointments, title) {
    if (appointments.length === 0) {
        await bot.sendMessage(chatId, `${title}\n\nНет записей`);
        return;
    }
    
    const grouped = groupAppointmentsByDate(appointments);
    let message = `${title}\n\n`;
    
    for (const [date, dateAppointments] of Object.entries(grouped)) {
        message += `━━━━━━━━━━━━━━━━━━\n`;
        message += `${formatDateForAdmin(date)}\n`;
        
        dateAppointments.forEach(apt => {
            const statusEmoji = getStatusEmoji(apt.status);
            message += `${statusEmoji} ${apt.appointment_time} | ${apt.patient_name} | ${apt.service_name}\n`;
            message += `   #${apt.id} | ${apt.patient_phone}\n`;
        });
    }
    
    const keyboard = createAppointmentsManagementKeyboard(appointments);
    
    await bot.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        reply_markup: keyboard.reply_markup
    });
}

// ==================== ОТПРАВКА СПИСКА ОЖИДАЮЩИХ ====================
/**
 * Отправляет список ожидающих подтверждения записей
 */
async function sendPendingList(bot, chatId, pending) {
    let message = 'ОЖИДАЮТ ПОДТВЕРЖДЕНИЯ\n\n';
    
    for (const apt of pending) {
        message += `━━━━━━━━━━━━━━━━━━\n`;
        message += `Запись #${apt.id}\n`;
        message += `Пациент: ${apt.patient_name}\n`;
        message += `Телефон: ${apt.patient_phone}\n`;
        message += `Услуга: ${apt.service_name}\n`;
        message += `Дата: ${formatDateForAdmin(apt.appointment_date)}\n`;
        message += `Время: ${apt.appointment_time}\n`;
    }

    const keyboard = createPendingActionsKeyboard(pending);
    await bot.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        reply_markup: keyboard.reply_markup
    });
}

// ==================== СОЗДАНИЕ КЛАВИАТУРЫ ДЛЯ ОЖИДАЮЩИХ ====================
function createPendingActionsKeyboard(pending) {
    const keyboard = { reply_markup: { inline_keyboard: [] } };

    pending.forEach(apt => {
        keyboard.reply_markup.inline_keyboard.push([
            { text: `✅ Подтвердить #${apt.id} — ${apt.patient_name}`, callback_data: `admin_confirm_${apt.id}` },
            { text: `❌ Отклонить #${apt.id}`, callback_data: `admin_reject_${apt.id}` }
        ]);
    });

    return keyboard;
}

// ==================== СОЗДАНИЕ КЛАВИАТУРЫ УПРАВЛЕНИЯ ЗАПИСЯМИ ====================
function createAppointmentsManagementKeyboard(appointments) {
    const keyboard = { reply_markup: { inline_keyboard: [] } };

    appointments.slice(0, 5).forEach(apt => {
        keyboard.reply_markup.inline_keyboard.push([
            { text: `📋 Запись #${apt.id} — ${apt.patient_name}`, callback_data: `admin_view_${apt.id}` }
        ]);
    });

    return keyboard;
}

// ==================== ГРУППИРОВКА ЗАПИСЕЙ ПО ДАТАМ ====================
function groupAppointmentsByDate(appointments) {
    const grouped = {};
    appointments.forEach(apt => {
        if (!grouped[apt.appointment_date]) grouped[apt.appointment_date] = [];
        grouped[apt.appointment_date].push(apt);
    });
    return grouped;
}

// ==================== ПОЛУЧИТЬ ЭМОДЗИ СТАТУСА ====================
function getStatusEmoji(status) {
    const emojis = {
        'pending': '⏳',
        'confirmed': '✅',
        'cancelled': '❌',
        'completed': '✔️'
    };
    return emojis[status] || '⏳';
}

// ==================== ФОРМАТИРОВАНИЕ ДАТЫ ДЛЯ АДМИНА ====================
function formatDateForAdmin(dateStr) {
    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
}

// ==================== ЭКСПОРТ ====================
module.exports = {
    handleAdmin,
    handleToday,
    handleTomorrow,
    handleWeek,
    handleAllAppointments,
    handlePending,
    handleStats,
    handlePatients,
    handleSchedule,
    handleServices,
};