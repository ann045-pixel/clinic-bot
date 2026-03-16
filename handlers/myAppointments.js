// ==================== МОДУЛЬ ПРОСМОТРА ЗАПИСЕЙ ====================
// Отображает список записей пользователя (текущих и прошлых)

const { getUserUpcomingAppointments, getUserAppointments, cancelAppointment, getAppointmentById } = require('../database.js');
const config = require('../config.js');
const { notifyDoctorAboutCancellation } = require('../utils/notifications.js');

// ==================== ПОКАЗАТЬ ЗАПИСИ ПОЛЬЗОВАТЕЛЯ ====================
/**
 * Показывает пользователю его записи (текущие и прошлые)
 */
async function showMyAppointments(bot, chatId) {
    try {
        const upcomingAppointments = await getUserUpcomingAppointments(chatId);
        const allAppointments = await getUserAppointments(chatId);
        
        if (allAppointments.length === 0) {
            await handleNoAppointments(bot, chatId);
            return;
        }

        const message = buildAppointmentsMessage(upcomingAppointments, allAppointments);
        const keyboard = createAppointmentsKeyboard(upcomingAppointments, allAppointments);

        await bot.sendMessage(chatId, message, {
            parse_mode: 'HTML',
            reply_markup: keyboard.reply_markup
        });

    } catch (error) {
        console.error('Ошибка в showMyAppointments:', error);
        await bot.sendMessage(chatId, 'Произошла ошибка при загрузке ваших записей');
    }
}

// ==================== ПОКАЗАТЬ ДЕТАЛИ ЗАПИСИ ====================
/**
 * Показывает подробную информацию о конкретной записи
 */
async function showAppointmentDetails(bot, chatId, appointment, messageId) {
    const statusEmoji = getStatusEmoji(appointment.status);
    const statusText = getStatusText(appointment.status);
    const formattedDate = formatDateForDisplay(appointment.appointment_date);
    
    const detailsMessage = `
ДЕТАЛИ ЗАПИСИ #${appointment.id}

━━━━━━━━━━━━━━━━━━
Услуга: ${appointment.service_name}
Дата: ${formattedDate}
Время: ${appointment.appointment_time}
Пациент: ${appointment.patient_name}
Телефон: ${appointment.patient_phone}
Комментарий: ${appointment.comment || 'нет'}

Статус: ${statusEmoji} ${statusText}
Создано: ${formatDateTime(appointment.created_at)}

━━━━━━━━━━━━━━━━━━
${config.CLINIC_NAME}
${config.CLINIC_ADDRESS || 'адрес не указан'}
${config.CLINIC_PHONE || 'телефон не указан'}
    `;

    const keyboard = createDetailsKeyboard(appointment);

    if (messageId) {
        await bot.editMessageText(detailsMessage, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: keyboard.reply_markup
        });
    } else {
        await bot.sendMessage(chatId, detailsMessage, {
            parse_mode: 'HTML',
            reply_markup: keyboard.reply_markup
        });
    }
}

// ==================== ФОРМИРОВАНИЕ СООБЩЕНИЯ СО СПИСКОМ ЗАПИСЕЙ ====================
/**
 * Создает текст сообщения со списком записей
 */
function buildAppointmentsMessage(upcoming, all) {
    let message = 'ВАШИ ЗАПИСИ\n\n';

    if (upcoming.length > 0) {
        message += 'ПРЕДСТОЯЩИЕ ЗАПИСИ:\n';
        upcoming.forEach(apt => {
            const statusEmoji = getStatusEmoji(apt.status);
            const formattedDate = formatDateShort(apt.appointment_date);
            message += `${statusEmoji} ${formattedDate} ${apt.appointment_time} — ${apt.service_name}\n`;
            message += `   #${apt.id}\n`;
        });
        message += '\n';
    }

    const pastAppointments = all.filter(apt => {
        const aptDate = new Date(apt.appointment_date + 'T' + apt.appointment_time);
        return aptDate < new Date() || apt.status === 'completed' || apt.status === 'cancelled';
    }).slice(0, 5);

    if (pastAppointments.length > 0) {
        message += 'ПРОШЛЫЕ ЗАПИСИ:\n';
        pastAppointments.forEach(apt => {
            const statusEmoji = getStatusEmoji(apt.status);
            const formattedDate = formatDateShort(apt.appointment_date);
            message += `${statusEmoji} ${formattedDate} ${apt.appointment_time} — ${apt.service_name}\n`;
        });
        message += '\n';
    }

    message += 'Нажмите на кнопку, чтобы увидеть детали записи';

    return message;
}

// ==================== СОЗДАНИЕ КЛАВИАТУРЫ СО СПИСКОМ ЗАПИСЕЙ ====================
/**
 * Создает inline-клавиатуру со списком записей
 */
function createAppointmentsKeyboard(upcoming, all) {
    const keyboard = {
        reply_markup: {
            inline_keyboard: []
        }
    };

    upcoming.forEach(apt => {
        const statusEmoji = getStatusEmoji(apt.status);
        const formattedDate = formatDateShort(apt.appointment_date);
        keyboard.reply_markup.inline_keyboard.push([
            { 
                text: `${statusEmoji} ${formattedDate} ${apt.appointment_time} — ${apt.service_name}`, 
                callback_data: `view_appointment_${apt.id}` 
            }
        ]);
    });

    if (upcoming.length === 0) {
        const pastToShow = all.slice(0, 5);
        pastToShow.forEach(apt => {
            const statusEmoji = getStatusEmoji(apt.status);
            const formattedDate = formatDateShort(apt.appointment_date);
            keyboard.reply_markup.inline_keyboard.push([
                { 
                    text: `${statusEmoji} ${formattedDate} ${apt.appointment_time} — ${apt.service_name}`, 
                    callback_data: `view_appointment_${apt.id}` 
                }
            ]);
        });
    }

    keyboard.reply_markup.inline_keyboard.push([
        { text: 'В главное меню', callback_data: 'back_to_main' }
    ]);

    return keyboard;
}

// ==================== СОЗДАНИЕ КЛАВИАТУРЫ ДЛЯ ДЕТАЛЕЙ ЗАПИСИ ====================
/**
 * Создает клавиатуру для страницы деталей записи
 */
function createDetailsKeyboard(appointment) {
    const keyboard = {
        reply_markup: {
            inline_keyboard: []
        }
    };

    const aptDate = new Date(appointment.appointment_date + 'T' + appointment.appointment_time);
    if (aptDate > new Date() && appointment.status !== 'cancelled' && appointment.status !== 'completed') {
        keyboard.reply_markup.inline_keyboard.push([
            { text: '❌ Отменить запись', callback_data: `cancel_appointment_${appointment.id}` }
        ]);
    }

    keyboard.reply_markup.inline_keyboard.push([
        { text: 'К списку записей', callback_data: 'back_to_appointments' }
    ]);

    return keyboard;
}

// ==================== ОБРАБОТКА ОТСУТСТВИЯ ЗАПИСЕЙ ====================
/**
 * Обрабатывает случай, когда у пользователя нет записей
 */
async function handleNoAppointments(bot, chatId) {
    const message = `
У вас пока нет записей

Хотите записаться на приём?
    `;

    const keyboard = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '📅 Записаться на приём', callback_data: 'back_to_services' }],
                [{ text: 'В главное меню', callback_data: 'back_to_main' }]
            ]
        }
    };

    await bot.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        reply_markup: keyboard.reply_markup
    });
}

// ==================== ОБРАБОТКА ОТМЕНЫ ЗАПИСИ ====================
/**
 * Обрабатывает отмену записи пользователем
 */
async function handleCancelAppointment(bot, chatId, appointmentId) {
    try {
        const appointment = await getAppointmentById(appointmentId);
        
        await cancelAppointment(appointmentId);
        
        await notifyDoctorAboutCancellation(bot, appointmentId);
        
        await bot.sendMessage(chatId, `
✅ Запись #${appointmentId} отменена

Если вы захотите записаться снова, нажмите "📅 Записаться на приём"
        `, { parse_mode: 'HTML' });
        
        await showMyAppointments(bot, chatId);

    } catch (error) {
        console.error('Ошибка при отмене записи:', error);
        await bot.sendMessage(chatId, 'Не удалось отменить запись');
    }
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

function getStatusEmoji(status) {
    const emojis = {
        'pending': '⏳',
        'confirmed': '✅',
        'cancelled': '❌',
        'completed': '✔️'
    };
    return emojis[status] || '⏳';
}

function getStatusText(status) {
    const texts = {
        'pending': 'Ожидает подтверждения',
        'confirmed': 'Подтверждена',
        'cancelled': 'Отменена',
        'completed': 'Завершена'
    };
    return texts[status] || status;
}

function formatDateShort(dateStr) {
    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short'
    });
}

function formatDateForDisplay(dateStr) {
    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString('ru-RU', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
}

function formatDateTime(dateTimeStr) {
    const date = new Date(dateTimeStr);
    return date.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// ==================== ЭКСПОРТ ====================
module.exports = {
    showMyAppointments,
    showAppointmentDetails,
    handleCancelAppointment
};