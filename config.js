// ==================== ПОДКЛЮЧАЕМ .ENV ====================
require('dotenv').config();

// ==================== ТОКЕН БОТА ====================
const BOT_TOKEN = process.env.BOT_TOKEN || '';

// ==================== НАСТРОЙКИ КЛИНИКИ ====================
const CLINIC_NAME = 'МедЦентр+';
const CLINIC_ADDRESS = 'г. Москва, ул. Ленина, д. 10';
const CLINIC_PHONE = '+7 (999) 123-45-67';

// ==================== РАБОЧЕЕ ВРЕМЯ ====================
const WORK_HOURS = {
    start: 9,      // Начало работы (9:00)
    end: 20,       // Конец работы (20:00)
    interval: 30   // Шаг записи в минутах (30 минут)
};

// ==================== СПИСОК УСЛУГ ====================
const SERVICES = [
    { 
        id: 1, 
        name: 'Первичный приём', 
        duration: 30, 
        price: 2000,
        description: 'Осмотр, сбор анамнеза, назначение обследований'
    },
    { 
        id: 2, 
        name: 'Консультация специалиста', 
        duration: 45, 
        price: 3000,
        description: 'Консультация узкого специалиста'
    },
    { 
        id: 3, 
        name: 'Составление плана лечения', 
        duration: 60, 
        price: 4000,
        description: 'Разработка индивидуального плана лечения'
    }
];

// ==================== ID ВРАЧА ДЛЯ УВЕДОМЛЕНИЙ ====================
// Telegram ID человека, которому приходят уведомления о новых записях
const DOCTOR_ID = 1764249851;

// ==================== НАСТРОЙКИ КНОПОК МЕНЮ ====================
const MAIN_KEYBOARD = {
    reply_markup: {
        keyboard: [
            ['📅 Записаться на приём'],
            ['📋 Мои записи'],
            ['ℹ️ О клинике']
        ],
        resize_keyboard: true,
        persistent: true
    }
};

// ==================== НАСТРОЙКИ ФОРМАТИРОВАНИЯ ====================
const DEFAULT_PARSE_MODE = 'HTML';

// ==================== ЭКСПОРТ ====================
module.exports = {
    BOT_TOKEN,
    CLINIC_NAME,
    CLINIC_ADDRESS,
    CLINIC_PHONE,
    WORK_HOURS,
    SERVICES,
    DOCTOR_ID,
    MAIN_KEYBOARD,
    DEFAULT_PARSE_MODE
};