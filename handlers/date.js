// ==================== МОДУЛЬ ВЫБОРА ДАТЫ ====================
// Отвечает за отображение календаря и обработку выбора даты

const { generateDates } = require('../utils/calendar.js');
const { getAvailableSlots } = require('../database.js');

// ==================== ПОКАЗАТЬ ДОСТУПНЫЕ ДАТЫ ====================
/**
 * Показывает пользователю календарь с доступными датами
 */
async function showAvailableDates(bot, chatId, userSession) {
    try {
        if (!userSession[chatId] || !userSession[chatId].serviceId) {
            await bot.sendMessage(chatId, 'Сначала выберите услугу');
            return;
        }

        const serviceId = userSession[chatId].serviceId;
        const dates = generateDates(14);
        
        const datesWithSlots = [];
        for (const date of dates) {
            const slots = await getAvailableSlots(date.raw, serviceId);
            datesWithSlots.push({
                raw: date.raw,
                display: date.display,
                hasSlots: slots.length > 0,
                slotsCount: slots.length
            });
        }

        const availableDates = datesWithSlots.filter(d => d.hasSlots);
        
        if (availableDates.length === 0) {
            await bot.sendMessage(chatId, 'На ближайшие 2 недели нет свободных дат');
            return;
        }

        const keyboard = createDatesKeyboard(availableDates);
        
        await bot.sendMessage(chatId, 'Выберите дату:', {
            reply_markup: keyboard.reply_markup
        });

    } catch (error) {
        console.error('Ошибка в showAvailableDates:', error);
        await bot.sendMessage(chatId, 'Произошла ошибка');
    }
}

// ==================== ОБРАБОТКА ВЫБОРА ДАТЫ ====================
/**
 * Обрабатывает выбор пользователем конкретной даты
 */
async function handleDateSelected(bot, chatId, selectedDate, userSession, userState, messageId) {
    try {
        if (!userSession[chatId]) {
            userSession[chatId] = {};
        }
        userSession[chatId].date = selectedDate;

        if (messageId) {
            await bot.deleteMessage(chatId, messageId).catch(e => {});
        }

        const { showAvailableTimes } = require('./time.js');
        await showAvailableTimes(bot, chatId, userSession, userState);

    } catch (error) {
        console.error('Ошибка в handleDateSelected:', error);
        await bot.sendMessage(chatId, 'Произошла ошибка при выборе даты');
    }
}

// ==================== ПОКАЗАТЬ БЛИЖАЙШИЕ ДАТЫ ====================
/**
 * Показывает только ближайшие доступные даты
 */
async function showNearestDates(bot, chatId, userSession) {
    try {
        const serviceId = userSession[chatId]?.serviceId;
        if (!serviceId) {
            await bot.sendMessage(chatId, 'Сначала выберите услугу');
            return;
        }

        const dates = generateDates(7);
        const datesWithSlots = [];
        
        for (const date of dates) {
            const slots = await getAvailableSlots(date.raw, serviceId);
            if (slots.length > 0) {
                datesWithSlots.push({
                    raw: date.raw,
                    display: date.display,
                    slotsCount: slots.length
                });
            }
        }

        if (datesWithSlots.length === 0) {
            await bot.sendMessage(chatId, 'На ближайшую неделю нет свободных дат');
            return;
        }

        let message = 'БЛИЖАЙШИЕ ДОСТУПНЫЕ ДАТЫ\n\n';
        const keyboard = { reply_markup: { inline_keyboard: [] } };

        datesWithSlots.slice(0, 5).forEach((date, index) => {
            message += `${index + 1}. ${date.display} — ${date.slotsCount} слотов\n`;
            keyboard.reply_markup.inline_keyboard.push([
                { text: `${date.display}`, callback_data: `date_${date.raw}` }
            ]);
        });

        await bot.sendMessage(chatId, message, {
            parse_mode: 'HTML',
            reply_markup: keyboard.reply_markup
        });

    } catch (error) {
        console.error('Ошибка в showNearestDates:', error);
    }
}

// ==================== СОЗДАНИЕ КЛАВИАТУРЫ С ДАТАМИ ====================
/**
 * Создает inline-клавиатуру с кнопками дат
 */
function createDatesKeyboard(dates) {
    const keyboard = {
        reply_markup: {
            inline_keyboard: []
        }
    };

    for (let i = 0; i < dates.length; i += 3) {
        const row = [];
        for (let j = 0; j < 3 && i + j < dates.length; j++) {
            const date = dates[i + j];
            row.push({
                text: `${date.display} (${date.slotsCount})`,
                callback_data: `date_${date.raw}`
            });
        }
        keyboard.reply_markup.inline_keyboard.push(row);
    }

    return keyboard;
}

// ==================== ЭКСПОРТ ====================
module.exports = {
    showAvailableDates,
    handleDateSelected,
    showNearestDates
};