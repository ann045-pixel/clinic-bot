// ==================== МОДУЛЬ ПОДТВЕРЖДЕНИЯ ЗАПИСИ ====================
// Показывает сводку и подтверждение записи пользователем

const { createAppointment, findOrCreatePatient, getServiceById } = require('../database.js');
const { notifyDoctor } = require('../utils/notifications.js'); 
const config = require('../config.js');

// ==================== ПОКАЗАТЬ ПОДТВЕРЖДЕНИЕ ====================
/**
 * Показывает пользователю сводку данных и просит подтвердить запись
 */
async function showConfirmation(bot, chatId, sessionData) {
    try {
        if (!sessionData || !sessionData.serviceId || !sessionData.date || !sessionData.time || !sessionData.name || !sessionData.phone) {
            await bot.sendMessage(chatId, 'Не хватает данных для записи. Пожалуйста, начните заново.');
            return;
        }

        const service = await getServiceById(sessionData.serviceId);
        
        if (!service) {
            await bot.sendMessage(chatId, 'Услуга не найдена. Пожалуйста, выберите другую.');
            return;
        }

        const formattedDate = formatDateForDisplay(sessionData.date);
        const formattedPrice = formatPrice(service.price);
        const formattedPhone = formatPhone(sessionData.phone);
        
        const confirmMessage = buildConfirmationMessage(
            service, 
            formattedDate, 
            sessionData.time, 
            sessionData.name, 
            formattedPhone, 
            sessionData.comment
        );

        const keyboard = createConfirmationKeyboard();

        await bot.sendMessage(chatId, confirmMessage, {
            parse_mode: 'HTML',
            reply_markup: keyboard.reply_markup
        });

    } catch (error) {
        console.error('Ошибка в showConfirmation:', error);
        await bot.sendMessage(chatId, 'Произошла ошибка. Пожалуйста, попробуйте позже.');
    }
}

// ==================== ФОРМИРОВАНИЕ СООБЩЕНИЯ ПОДТВЕРЖДЕНИЯ ====================
/**
 * Создает текст сообщения с подтверждением
 */
function buildConfirmationMessage(service, date, time, name, phone, comment) {
    let message = `
ПРОВЕРЬТЕ ДАННЫЕ ЗАПИСИ

━━━━━━━━━━━━━━━━━━
Услуга: ${service.name}
Длительность: ${service.duration} мин
Стоимость: ${service.price} ₽

Дата: ${date}
Время: ${time}

Пациент: ${name}
Телефон: ${phone}
    `;

    if (comment && comment.trim() !== '') {
        message += `
Комментарий: ${comment}
        `;
    }

    message += `
━━━━━━━━━━━━━━━━━━
${config.CLINIC_NAME}
${config.CLINIC_ADDRESS || 'адрес не указан'}
${config.CLINIC_PHONE || 'телефон не указан'}

Всё верно?
    `;

    return message;
}

// ==================== СОЗДАНИЕ КЛАВИАТУРЫ ПОДТВЕРЖДЕНИЯ ====================
/**
 * Создает клавиатуру с кнопками подтверждения/отмены
 */
function createConfirmationKeyboard() {
    return {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '✅ Подтвердить', callback_data: 'confirm_yes' },
                    { text: '❌ Отмена', callback_data: 'confirm_no' }
                ],
                [
                    { text: 'Назад к дате', callback_data: 'back_to_date' },
                    { text: 'К услугам', callback_data: 'back_to_services' }
                ]
            ]
        }
    };
}

// ==================== ОБРАБОТКА ПОДТВЕРЖДЕНИЯ ====================
/**
 * Обрабатывает подтверждение записи
 */
async function handleConfirmYes(bot, chatId, sessionData, userSession, userState, messageId) {
    try {
        const service = await getServiceById(sessionData.serviceId);
        
        if (!service) {
            await bot.sendMessage(chatId, 'Ошибка: услуга не найдена');
            return;
        }

        await findOrCreatePatient(chatId, sessionData.name, sessionData.phone);
        
        const appointmentId = await createAppointment({
            userId: chatId,
            serviceId: service.id,
            serviceName: service.name,
            date: sessionData.date,
            time: sessionData.time,
            patientName: sessionData.name,
            patientPhone: sessionData.phone,
            comment: sessionData.comment || ''
        });

        if (messageId) {
            try {
                await bot.deleteMessage(chatId, messageId);
            } catch (e) {}
        }

        await sendSuccessMessage(bot, chatId, sessionData, service, appointmentId);
        
        await notifyDoctor(bot, {
            id: appointmentId,
            userId: chatId,
            patientName: sessionData.name,
            patientPhone: sessionData.phone,
            serviceName: service.name,
            date: sessionData.date,
            time: sessionData.time,
            comment: sessionData.comment
        });

        delete userSession[chatId];
        delete userState[chatId];

        await bot.sendMessage(chatId, 'Выберите действие:', config.MAIN_KEYBOARD);

    } catch (error) {
        console.error('Ошибка в handleConfirmYes:', error);
        await bot.sendMessage(chatId, 'Произошла ошибка при сохранении записи. Пожалуйста, попробуйте позже.');
    }
}

// ==================== ОТПРАВКА СООБЩЕНИЯ ОБ УСПЕХЕ ====================
/**
 * Отправляет пользователю сообщение об успешной записи
 */
async function sendSuccessMessage(bot, chatId, sessionData, service, appointmentId) {
    const formattedDate = formatDateForDisplay(sessionData.date);
    
    const successMessage = `
ЗАПИСЬ ПОДТВЕРЖДЕНА

━━━━━━━━━━━━━━━━━━
Номер записи: #${appointmentId}

Услуга: ${service.name}
Дата: ${formattedDate}
Время: ${sessionData.time}
Пациент: ${sessionData.name}
Телефон: ${sessionData.phone}

━━━━━━━━━━━━━━━━━━
Напоминание придёт за час до приёма.

Список записей: /mylist
Отмена: /cancel_${appointmentId}

Спасибо, что выбрали ${config.CLINIC_NAME}!
    `;

    await bot.sendMessage(chatId, successMessage, { parse_mode: 'HTML' });
}

// ==================== ОБРАБОТКА ОТМЕНЫ ====================
/**
 * Обрабатывает отмену записи
 */
async function handleConfirmNo(bot, chatId, userSession, userState, messageId) {
    if (messageId) {
        try {
            await bot.deleteMessage(chatId, messageId);
        } catch (e) {}
    }

    await bot.sendMessage(chatId, 'Запись отменена. Если передумаете, нажмите "📅 Записаться на приём"');

    delete userSession[chatId];
    delete userState[chatId];

    await bot.sendMessage(chatId, 'Выберите действие:', config.MAIN_KEYBOARD);
}

// ==================== ОБРАБОТКА НАЗАД К ДАТЕ ====================
/**
 * Возвращает пользователя к выбору даты
 */
async function handleBackToDate(bot, chatId, userSession, userState, messageId) {
    if (messageId) {
        try {
            await bot.deleteMessage(chatId, messageId);
        } catch (e) {}
    }

    delete userState[chatId];
    
    const { showAvailableTimes } = require('./time.js');
    await showAvailableTimes(bot, chatId, userSession, userState);
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

function formatDateForDisplay(dateStr) {
    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString('ru-RU', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
}

function formatPrice(price) {
    return price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function formatPhone(phone) {
    return phone;
}

// ==================== ЭКСПОРТ ====================
module.exports = {
    showConfirmation,
    handleConfirmYes,
    handleConfirmNo,
    handleBackToDate
};