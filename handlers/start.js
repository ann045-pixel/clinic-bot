// ==================== ОБРАБОТЧИК КОМАНДЫ /start ====================
// Отвечает за приветствие пользователя и показ главного меню

const { getPatient } = require('../database.js');
const config = require('../config.js');

// ==================== ГЛАВНЫЙ ОБРАБОТЧИК /start ====================
/**
 * Обрабатывает команду /start
 * @param {Object} bot - экземпляр бота
 * @param {Object} msg - сообщение от пользователя
 */
async function handleStart(bot, msg) {
    const chatId = msg.chat.id;
    const username = msg.from.username || 'друг';
    const firstName = msg.from.first_name || '';
    
    try {
        // Проверяем, есть ли уже такой пользователь в базе пациентов
        const existingPatient = await getPatient(chatId);
        
        // Формируем приветствие
        const welcomeMessage = buildWelcomeMessage(firstName, username, existingPatient);
        
        // Отправляем приветственное сообщение
        await bot.sendMessage(chatId, welcomeMessage, {
            parse_mode: 'HTML'
        });
        
        // Отправляем главное меню с кнопками
        await sendMainMenu(bot, chatId);
        
        console.log(`Пользователь @${username} (${chatId}) запустил бота`);
        
    } catch (error) {
        console.error('Ошибка в start.js:', error);
        await bot.sendMessage(chatId, 'Произошла ошибка. Пожалуйста, попробуйте позже.');
    }
}

// ==================== ФОРМИРОВАНИЕ ПРИВЕТСТВИЯ ====================
/**
 * Формирует приветственное сообщение
 */
function buildWelcomeMessage(firstName, username, existingPatient) {
    // Базовое приветствие для всех
    let message = `
Добро пожаловать в бот записи ${config.CLINIC_NAME}!

Мы помогаем записаться на приём к специалисту быстро и удобно.
    `;
    
    // Если пользователь уже был в клинике
    if (existingPatient) {
        message += `

С возвращением, ${firstName || username}!
Вы уже записывались к нам ранее.
Ваш ID в системе: #${existingPatient.id}
        `;
    } else {
        // Если пользователь новый
        message += `

Похоже, вы здесь впервые!
Во время записи я спрошу ваше имя и телефон.
        `;
    }
    
    // Информация о клинике
    message += `

Режим работы: ${config.WORK_HOURS.start}:00 - ${config.WORK_HOURS.end}:00
Адрес: ${config.CLINIC_ADDRESS || 'не указан'}
Телефон: ${config.CLINIC_PHONE || 'не указан'}

Выберите действие в меню ниже:
    `;
    
    return message;
}

// ==================== ОТПРАВКА ГЛАВНОГО МЕНЮ ====================
/**
 * Отправляет пользователю главное меню с кнопками
 */
async function sendMainMenu(bot, chatId) {
    const mainMenuMessage = 'Главное меню:';
    
    // Используем клавиатуру из конфига
    await bot.sendMessage(chatId, mainMenuMessage, config.MAIN_KEYBOARD);
}

// ==================== ИНФОРМАЦИЯ О КЛИНИКЕ ====================
/**
 * Отправляет информацию о клинике
 */
async function sendClinicInfo(bot, chatId) {
    const clinicInfo = `
О клинике ${config.CLINIC_NAME}

Режим работы:
${config.WORK_HOURS.start}:00 - ${config.WORK_HOURS.end}:00 (пн-пт)
${config.WORK_HOURS.start}:00 - ${config.WORK_HOURS.end - 2}:00 (сб-вс)

Адрес:
${config.CLINIC_ADDRESS || 'г. Москва, ул. Ленина, д. 10'}

Телефон:
${config.CLINIC_PHONE || '+7 (999) 123-45-67'}

Как проехать:
- 5 минут от метро
- Бесплатная парковка для пациентов

Оплата:
- Наличные
- Банковские карты
- Медицинский полис (ДМС)

Если есть вопросы, нажмите "Связаться с менеджером"
    `;
    
    const keyboard = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '📞 Связаться с менеджером', url: 'https://t.me/your_manager' }],
                [{ text: 'Назад', callback_data: 'back_to_main' }]
            ]
        }
    };
    
    await bot.sendMessage(chatId, clinicInfo, {
        parse_mode: 'HTML',
        reply_markup: keyboard.reply_markup
    });
}

// ==================== ЭКСПОРТ ====================
module.exports = {
    handleStart,
    sendClinicInfo
};