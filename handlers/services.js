// ==================== МОДУЛЬ ВЫБОРА УСЛУГ ====================
// Отвечает за отображение списка услуг и обработку выбора

const { getServices } = require('../database.js');
const { showAvailableTimes } = require('./time.js');
const config = require('../config.js');

// ==================== ПОКАЗАТЬ СПИСОК УСЛУГ ====================
/**
 * Показывает пользователю список доступных услуг
 */
async function showServices(bot, chatId, userSession) {
    try {
        // Получаем список услуг из базы данных
        const services = await getServices();
        
        if (!services || services.length === 0) {
            await handleNoServices(bot, chatId);
            return;
        }

        // Формируем сообщение с услугами
        const message = buildServicesMessage(services);

        // Создаем клавиатуру с кнопками услуг
        const servicesKeyboard = createServicesKeyboard(services);

        // Отправляем сообщение
        await bot.sendMessage(chatId, message, {
            parse_mode: 'HTML',
            reply_markup: servicesKeyboard.reply_markup
        });

    } catch (error) {
        console.error('❌ Ошибка в showServices:', error);
        await bot.sendMessage(chatId, 'Произошла ошибка при загрузке списка услуг');
    }
}

// ==================== ОБРАБОТКА ВЫБОРА УСЛУГИ ====================
/**
 * Обрабатывает выбор пользователем конкретной услуги
 */
async function handleServiceSelected(bot, chatId, serviceId, userSession, messageId) {
    try {
        console.log('=== Выбор услуги ===');
        console.log('Услуга ID:', serviceId);
        
        // Сохраняем услугу в сессию
        if (!userSession[chatId]) {
            userSession[chatId] = {};
        }
        userSession[chatId].serviceId = parseInt(serviceId);
        
        // Удаляем сообщение с услугами
        if (messageId) {
            await bot.deleteMessage(chatId, messageId).catch(e => {
                console.log('Не удалось удалить сообщение:', e.message);
            });
        }
        
        // Отправляем подтверждение
        await bot.sendMessage(chatId, 'Услуга выбрана. Загружаю доступные даты...');
        
        // ВЫЗЫВАЕМ ПОКАЗ ДАТ!
        const { showAvailableDates } = require('./date.js');
        await showAvailableDates(bot, chatId, userSession);
        
    } catch (error) {
        console.error('❌ Ошибка в handleServiceSelected:', error);
    }
}

// ==================== ФОРМИРОВАНИЕ СООБЩЕНИЯ С УСЛУГАМИ ====================
/**
 * Создает текст сообщения со списком услуг
 */
function buildServicesMessage(services) {
    let message = `ДОСТУПНЫЕ УСЛУГИ

Мы предлагаем следующие виды консультаций:
`;

    services.forEach((service, index) => {
        message += `
━━━━━━━━━━━━━━━━━━
${index + 1}. ${service.name}
Длительность: ${service.duration} мин
Стоимость: ${service.price} ₽
${service.description || ''}
`;
    });

    message += `
━━━━━━━━━━━━━━━━━━
Выберите нужную услугу ниже:
`;

    return message;
}

// ==================== СОЗДАНИЕ КЛАВИАТУРЫ ====================
/**
 * Создает inline-клавиатуру с кнопками услуг
 */
function createServicesKeyboard(services) {
    const keyboard = {
        reply_markup: {
            inline_keyboard: []
        }
    };

    // Добавляем кнопки для каждой услуги
    services.forEach(service => {
        keyboard.reply_markup.inline_keyboard.push([
            { 
                text: `${service.name} — ${service.price}₽`, 
                callback_data: `service_${service.id}` 
            }
        ]);
    });

    // Добавляем кнопку "Назад"
    keyboard.reply_markup.inline_keyboard.push([
        { text: 'Назад', callback_data: 'back_to_main' }
    ]);

    return keyboard;
}

// ==================== ПОДТВЕРЖДЕНИЕ ВЫБОРА ====================
/**
 * Отправляет пользователю подтверждение выбора услуги
 */
async function sendServiceConfirmation(bot, chatId, service) {
    const confirmationMessage = `
Услуга выбрана: ${service.name}

Длительность: ${service.duration} мин
Стоимость: ${service.price} ₽

Теперь выберите удобную дату:
`;

    await bot.sendMessage(chatId, confirmationMessage, {
        parse_mode: 'HTML'
    });
}

// ==================== НЕТ УСЛУГ ====================
/**
 * Обрабатывает случай, когда в базе нет услуг
 */
async function handleNoServices(bot, chatId) {
    const message = `
В данный момент нет доступных услуг.

Пожалуйста, попробуйте позже или свяжитесь с администратором.

Телефон: ${config.CLINIC_PHONE || 'не указан'}
    `;

    const keyboard = {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Назад', callback_data: 'back_to_main' }]
            ]
        }
    };

    await bot.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        reply_markup: keyboard.reply_markup
    });
}

// ==================== ПОЛУЧЕНИЕ ИНФОРМАЦИИ ОБ УСЛУГЕ ====================
/**
 * Возвращает информацию о конкретной услуге по ID
 */
async function getServiceInfo(serviceId) {
    const services = await getServices();
    return services.find(s => s.id === parseInt(serviceId)) || null;
}

// ==================== ФОРМАТИРОВАНИЕ ДЛЯ БАЗЫ ====================
/**
 * Подготавливает данные услуги для сохранения в запись
 */
function formatServiceForAppointment(service) {
    return {
        service_id: service.id,
        service_name: service.name,
        duration: service.duration,
        price: service.price
    };
}

// ==================== ЭКСПОРТ ====================
module.exports = {
    showServices,
    handleServiceSelected,
    getServiceInfo,
    formatServiceForAppointment
};