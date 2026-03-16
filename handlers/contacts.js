// ==================== МОДУЛЬ СБОРА КОНТАКТОВ ====================
// Отвечает за сбор имени, телефона и комментария у пользователя

const { findOrCreatePatient, getPatient } = require('../database.js');
const { showConfirmation } = require('./confirm.js');
const config = require('../config.js');

// ==================== НАЧАЛО СБОРА КОНТАКТОВ ====================
/**
 * Начинает процесс сбора контактных данных
 * @param {Object} bot - экземпляр бота
 * @param {number} chatId - ID чата
 * @param {Object} userState - состояние пользователя
 * @param {Object} userSession - сессия пользователя
 */
async function startContactCollection(bot, chatId, userState, userSession) {
    try {
        // Проверяем, есть ли уже данные пациента в базе
        const existingPatient = await getPatient(chatId);
        
        if (existingPatient && existingPatient.name && existingPatient.phone) {
            // Если данные уже есть, предлагаем использовать их
            await offerExistingContact(bot, chatId, existingPatient, userState, userSession);
        } else {
            // Если данных нет, начинаем сбор
            await requestName(bot, chatId, userState);
        }
    } catch (error) {
        console.error('❌ Ошибка в startContactCollection:', error);
        await bot.sendMessage(chatId, '❌ Произошла ошибка. Пожалуйста, попробуйте позже.');
    }
}

// ==================== ЗАПРОС ИМЕНИ ====================
/**
 * Запрашивает у пользователя имя
 * @param {Object} bot - экземпляр бота
 * @param {number} chatId - ID чата
 * @param {Object} userState - состояние пользователя
 */
async function requestName(bot, chatId, userState) {
    userState[chatId] = 'awaiting_name';
    
    await bot.sendMessage(chatId, `
📝 <b>Введите ваше имя</b>

Как к вам обращаться?
Например: <i>Анна Петрова</i>
    `, { parse_mode: 'HTML' });
}

// ==================== ЗАПРОС ТЕЛЕФОНА ====================
/**
 * Запрашивает у пользователя номер телефона
 * @param {Object} bot - экземпляр бота
 * @param {number} chatId - ID чата
 * @param {Object} userState - состояние пользователя
 * @param {string} name - введенное имя
 * @param {Object} userSession - сессия пользователя
 */
async function requestPhone(bot, chatId, userState, name, userSession) {
    // Сохраняем имя в сессию
    if (!userSession[chatId]) {
        userSession[chatId] = {};
    }
    userSession[chatId].name = name;
    
    userState[chatId] = 'awaiting_phone';
    
    // Создаем клавиатуру для быстрого ввода телефона
    const keyboard = {
        reply_markup: {
            keyboard: [
                [{ text: '📱 Отправить номер телефона', request_contact: true }],
                [{ text: '✏️ Ввести вручную' }]
            ],
            resize_keyboard: true,
            one_time_keyboard: true
        }
    };
    
    await bot.sendMessage(chatId, `
📞 <b>Введите номер телефона</b>

Нужен для связи и напоминаний.

Вы можете:
• Нажать кнопку ниже, чтобы отправить номер автоматически
• Ввести вручную в формате: <i>+7 999 123-45-67</i>
    `, {
        parse_mode: 'HTML',
        reply_markup: keyboard.reply_markup
    });
}

// ==================== ЗАПРОС КОММЕНТАРИЯ ====================
/**
 * Запрашивает у пользователя комментарий к записи
 * @param {Object} bot - экземпляр бота
 * @param {number} chatId - ID чата
 * @param {Object} userState - состояние пользователя
 * @param {string} phone - введенный телефон
 * @param {Object} userSession - сессия пользователя
 */
async function requestComment(bot, chatId, userState, phone, userSession) {
    // Сохраняем телефон в сессию
    if (!userSession[chatId]) {
        userSession[chatId] = {};
    }
    userSession[chatId].phone = phone;
    
    userState[chatId] = 'awaiting_comment';
    
    const keyboard = {
        reply_markup: {
            keyboard: [
                [{ text: '⏩ Пропустить' }]
            ],
            resize_keyboard: true,
            one_time_keyboard: true
        }
    };
    
    await bot.sendMessage(chatId, `
💬 <b>Добавьте комментарий (необязательно)</b>

Например:
• Аллергия на лекарства
• Желаемое время
• Особые пожелания

Если комментарий не нужен, нажмите "⏩ Пропустить"
    `, {
        parse_mode: 'HTML',
        reply_markup: keyboard.reply_markup
    });
}

// ==================== ПРЕДЛОЖЕНИЕ ИСПОЛЬЗОВАТЬ СУЩЕСТВУЮЩИЕ КОНТАКТЫ ====================
/**
 * Предлагает пользователю использовать сохраненные контакты
 * @param {Object} bot - экземпляр бота
 * @param {number} chatId - ID чата
 * @param {Object} patient - данные пациента из базы
 * @param {Object} userState - состояние пользователя
 * @param {Object} userSession - сессия пользователя
 */
async function offerExistingContact(bot, chatId, patient, userState, userSession) {
    const message = `
👋 <b>С возвращением!</b>

Мы нашли ваши контактные данные:

👤 <b>Имя:</b> ${patient.name}
📞 <b>Телефон:</b> ${patient.phone}

Использовать их для записи?
    `;

    const keyboard = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '✅ Да, использовать', callback_data: 'use_existing_contact' },
                    { text: '✏️ Ввести новые', callback_data: 'new_contact' }
                ]
            ]
        }
    };

    await bot.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        reply_markup: keyboard.reply_markup
    });
}

// ==================== ОБРАБОТКА ВХОДЯЩИХ СООБЩЕНИЙ ====================
/**
 * Обрабатывает сообщения в зависимости от состояния пользователя
 * @param {Object} bot - экземпляр бота
 * @param {Object} msg - сообщение от пользователя
 * @param {Object} userState - состояние пользователя
 * @param {Object} userSession - сессия пользователя
 */
async function handleContactInput(bot, msg, userState, userSession) {
    const chatId = msg.chat.id;
    const text = msg.text;
    const contact = msg.contact;
    
    const state = userState[chatId];
    
    try {
        // Обработка в зависимости от состояния
        if (state === 'awaiting_name') {
            await processName(bot, chatId, text, userState, userSession);
        }
        else if (state === 'awaiting_phone') {
            await processPhone(bot, chatId, text, contact, userState, userSession);
        }
        else if (state === 'awaiting_comment') {
            await processComment(bot, chatId, text, userState, userSession);
        }
    } catch (error) {
        console.error('❌ Ошибка в handleContactInput:', error);
        await bot.sendMessage(chatId, '❌ Произошла ошибка. Пожалуйста, попробуйте позже.');
    }
}

// ==================== ОБРАБОТКА ВВЕДЕННОГО ИМЕНИ ====================
/**
 * Обрабатывает введенное пользователем имя
 */
async function processName(bot, chatId, name, userState, userSession) {
    if (!name || name.trim().length < 2) {
        await bot.sendMessage(chatId, '❌ Пожалуйста, введите корректное имя (минимум 2 символа)');
        return;
    }
    
    // Переходим к запросу телефона
    await requestPhone(bot, chatId, userState, name.trim(), userSession);
}

// ==================== ОБРАБОТКА ВВЕДЕННОГО ТЕЛЕФОНА ====================
/**
 * Обрабатывает введенный пользователем телефон
 */
async function processPhone(bot, chatId, text, contact, userState, userSession) {
    let phone = '';
    
    // Если пользователь отправил контакт через кнопку
    if (contact) {
        phone = contact.phone_number;
    }
    // Если пользователь ввел текст "Ввести вручную"
    else if (text === '✏️ Ввести вручную') {
        await bot.sendMessage(chatId, '📞 Введите номер в формате: +7 999 123-45-67');
        return;
    }
    // Если пользователь ввел номер вручную
    else {
        phone = text.trim();
    }
    
    // Простейшая валидация телефона
    const phoneRegex = /^[\+\d\s\-\(\)]{10,20}$/;
    if (!phoneRegex.test(phone.replace(/\s/g, ''))) {
        await bot.sendMessage(chatId, '❌ Пожалуйста, введите корректный номер телефона');
        return;
    }
    
    // Переходим к запросу комментария
    await requestComment(bot, chatId, userState, phone, userSession);
}

// ==================== ОБРАБОТКА ВВЕДЕННОГО КОММЕНТАРИЯ ====================
/**
 * Обрабатывает введенный пользователем комментарий
 */
async function processComment(bot, chatId, text, userState, userSession) {
    let comment = '';
    
    if (text === '⏩ Пропустить') {
        comment = '';
    } else {
        comment = text.trim();
    }
    
    // Сохраняем комментарий в сессию
    if (!userSession[chatId]) {
        userSession[chatId] = {};
    }
    userSession[chatId].comment = comment;
    
    // Очищаем состояние и возвращаем обычную клавиатуру
    delete userState[chatId];
    
    // Возвращаем главную клавиатуру
    await bot.sendMessage(chatId, '⏳ Загружаем данные...', config.MAIN_KEYBOARD);
    
    // Показываем подтверждение
    await showConfirmation(bot, chatId, userSession[chatId]);
}

// ==================== ИСПОЛЬЗОВАНИЕ СУЩЕСТВУЮЩИХ КОНТАКТОВ ====================
/**
 * Использует сохраненные контакты для записи
 */
async function useExistingContacts(bot, chatId, userSession, messageId) {
    try {
        const patient = await getPatient(chatId);
        
        if (!patient || !patient.name || !patient.phone) {
            await bot.sendMessage(chatId, '❌ Не удалось загрузить ваши контакты. Введите новые.');
            await requestName(bot, chatId, {});
            return;
        }
        
        // Сохраняем данные в сессию
        if (!userSession[chatId]) {
            userSession[chatId] = {};
        }
        userSession[chatId].name = patient.name;
        userSession[chatId].phone = patient.phone;
        userSession[chatId].comment = '';
        
        // Удаляем предыдущее сообщение
        if (messageId) {
            try {
                await bot.deleteMessage(chatId, messageId);
            } catch (e) {
                console.log('⚠️ Не удалось удалить сообщение');
            }
        }
        
        // Показываем подтверждение
        await showConfirmation(bot, chatId, userSession[chatId]);
        
    } catch (error) {
        console.error('❌ Ошибка в useExistingContacts:', error);
        await bot.sendMessage(chatId, '❌ Произошла ошибка. Введите контакты вручную.');
        await requestName(bot, chatId, {});
    }
}

// ==================== ЭКСПОРТ ВСЕХ ФУНКЦИЙ ====================
module.exports = {
    startContactCollection,
    handleContactInput,
    useExistingContacts
};