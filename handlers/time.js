// ==================== МОДУЛЬ ВЫБОРА ВРЕМЕНИ ====================
const { getAvailableSlots } = require('../database.js');  // ← ЭТО ИЗ БАЗЫ!
const { createTimeKeyboard } = require('../utils/calendar.js');  // ← ЭТО ИЗ УТИЛИТ
const { startContactCollection } = require('./contacts.js');
const config = require('../config.js');

// ==================== ФУНКЦИЯ ДЛЯ ФОРМИРОВАНИЯ СООБЩЕНИЯ ====================
function buildTimeSelectionMessage(formattedDate, slotsCount) {
    return `
<b>Дата:</b> ${formattedDate}
<b>Доступно слотов:</b> ${slotsCount}

👇 Выберите удобное время:
    `;
}

// ==================== ПОКАЗАТЬ ДОСТУПНОЕ ВРЕМЯ ====================
async function showAvailableTimes(bot, chatId, userSession, userState) {
    try {
        if (!userSession[chatId] || !userSession[chatId].date) {
            await bot.sendMessage(chatId, '❌ Сначала выберите дату');
            return;
        }

        const selectedDate = userSession[chatId].date;
        const serviceId = userSession[chatId].serviceId;

        const availableSlots = await getAvailableSlots(selectedDate, serviceId);

        if (availableSlots.length === 0) {
            await bot.sendMessage(chatId, '😔 На эту дату нет свободного времени');
            return;
        }

        const timeKeyboard = createTimeKeyboard(availableSlots);
        
        await bot.sendMessage(chatId, '⏰ Выберите время:', {
            reply_markup: timeKeyboard.reply_markup
        });

        userState[chatId] = 'awaiting_time';

    } catch (error) {
        console.error('❌ Ошибка в showAvailableTimes:', error);
        await bot.sendMessage(chatId, '❌ Произошла ошибка');
    }
}

// ==================== ОБРАБОТКА ВЫБОРА ВРЕМЕНИ ====================
async function handleTimeSelected(bot, chatId, selectedTime, userSession, userState, messageId) {
    try {
        console.log('Время выбрано:', selectedTime);
        
        if (!userSession[chatId]) {
            userSession[chatId] = {};
        }
        userSession[chatId].time = selectedTime;
        
        if (messageId) {
            await bot.deleteMessage(chatId, messageId).catch(e => {});
        }
        
        await startContactCollection(bot, chatId, userState, userSession);
        
    } catch (error) {
        console.error('❌ Ошибка в handleTimeSelected:', error);
    }
}

// ==================== ОБРАБОТКА ОТСУТСТВИЯ СЛОТОВ ====================
async function handleNoAvailableSlots(bot, chatId, formattedDate) {
    const message = `
😔 На <b>${formattedDate}</b> нет свободного времени.

Пожалуйста, выберите другую дату:
    `;

    const keyboard = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '📅 Выбрать другую дату', callback_data: 'back_to_date' }],
                [{ text: '🔙 В начало', callback_data: 'back_to_services' }]
            ]
        }
    };

    await bot.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        reply_markup: keyboard.reply_markup
    });
}

// ==================== ФОРМАТИРОВАНИЕ ДАТЫ ====================
function formatDateForDisplay(dateStr) {
    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString('ru-RU', {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
    });
}

// ==================== ЭКСПОРТ ====================
module.exports = {
    showAvailableTimes,
    handleTimeSelected
};