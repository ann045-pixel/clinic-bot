// ==================== МОДУЛЬ УВЕДОМЛЕНИЙ ====================
// Отправка уведомлений врачу и напоминаний пациентам

const config = require('../config.js');
const { 
    getAppointmentsForReminder, 
    markReminderSent,
    getAppointmentById
} = require('../database.js');

// ==================== УВЕДОМЛЕНИЕ ВРАЧУ О НОВОЙ ЗАПИСИ ====================
/**
 * Отправляет врачу уведомление с кнопками подтверждения/отмены
 */
async function notifyDoctor(bot, appointment) {
    const doctorId = config.DOCTOR_ID;
    
    if (!doctorId) {
        console.log('❌ Не указан DOCTOR_ID в конфиге');
        return;
    }
    
    const notification = `
НОВАЯ ЗАПИСЬ #${appointment.id}

Пациент: ${appointment.patientName}
Телефон: ${appointment.patientPhone}
Услуга: ${appointment.serviceName}
Дата: ${formatDate(appointment.date)}
Время: ${appointment.time}
Комментарий: ${appointment.comment || 'нет'}

Статус: ожидает подтверждения
    `;
    
    const keyboard = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '✅ Подтвердить', callback_data: `admin_confirm_${appointment.id}` },
                    { text: '❌ Отклонить', callback_data: `admin_reject_${appointment.id}` }
                ]
            ]
        }
    };
    
    try {
        await bot.sendMessage(doctorId, notification, {
            reply_markup: keyboard.reply_markup
        });
        console.log(`📨 Уведомление о записи #${appointment.id} отправлено врачу`);
    } catch (error) {
        console.error('❌ Ошибка при отправке уведомления врачу:', error);
    }
}

// ==================== НАПОМИНАНИЕ ПАЦИЕНТУ ====================
/**
 * Отправляет пациенту напоминание за час до приёма
 */
async function sendReminder(bot, appointment) {
    const patientId = appointment.user_id;
    
    const reminderMessage = `
НАПОМИНАНИЕ

Уважаемый(ая) ${appointment.patient_name}!

Через час у вас запланирован визит:

Услуга: ${appointment.service_name}
Дата: ${formatDate(appointment.appointment_date)}
Время: ${appointment.appointment_time}

${config.CLINIC_NAME}
${config.CLINIC_ADDRESS || 'адрес не указан'}
${config.CLINIC_PHONE || 'телефон не указан'}

Для отмены: /cancel_${appointment.id}
    `;
    
    try {
        await bot.sendMessage(patientId, reminderMessage);
        console.log(`📨 Напоминание отправлено пациенту ${patientId}`);
        
        await markReminderSent(appointment.id);
    } catch (error) {
        console.error('❌ Ошибка при отправке напоминания:', error);
    }
}

// ==================== ПРОВЕРКА НАПОМИНАНИЙ ====================
/**
 * Проверяет, кому пора отправить напоминание (каждые 10 мин)
 */
async function checkAndSendReminders(bot) {
    console.log('⏰ Проверка напоминаний...');
    
    try {
        const appointments = await getAppointmentsForReminder();
        
        if (appointments.length === 0) {
            console.log('✅ Нет записей для напоминания');
            return;
        }
        
        console.log(`📋 Найдено ${appointments.length} записей`);
        
        for (const appointment of appointments) {
            await sendReminder(bot, appointment);
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    } catch (error) {
        console.error('❌ Ошибка при проверке напоминаний:', error);
    }
}

// ==================== ПАЦИЕНТУ: ЗАПИСЬ ПОДТВЕРЖДЕНА ====================
/**
 * Уведомляет пациента о подтверждении записи врачом
 */
async function notifyPatientConfirmed(bot, appointmentId) {
    try {
        const appointment = await getAppointmentById(appointmentId);
        
        if (!appointment) {
            console.log(`❌ Запись #${appointmentId} не найдена`);
            return;
        }
        
        const message = `
ЗАПИСЬ ПОДТВЕРЖДЕНА

Уважаемый(ая) ${appointment.patient_name}!

Ваша запись подтверждена врачом:

Услуга: ${appointment.service_name}
Дата: ${formatDate(appointment.appointment_date)}
Время: ${appointment.appointment_time}

Напоминание придёт за час до приёма.

Список записей: /myappointments
Отмена: /cancel_${appointment.id}
        `;
        
        await bot.sendMessage(appointment.user_id, message);
        console.log(`📨 Уведомление о подтверждении отправлено пациенту ${appointment.user_id}`);
    } catch (error) {
        console.error('❌ Ошибка при уведомлении пациента:', error);
    }
}

// ==================== ПАЦИЕНТУ: ЗАПИСЬ ОТКЛОНЕНА ====================
/**
 * Уведомляет пациента об отклонении записи
 */
async function notifyPatientRejected(bot, appointmentId) {
    try {
        const appointment = await getAppointmentById(appointmentId);
        
        if (!appointment) {
            console.log(`❌ Запись #${appointmentId} не найдена`);
            return;
        }
        
        const message = `
ЗАПИСЬ ОТКЛОНЕНА

Уважаемый(ая) ${appointment.patient_name}!

Ваша запись на ${formatDate(appointment.appointment_date)} в ${appointment.appointment_time}
была отклонена врачом.

Пожалуйста, выберите другое время: /book
        `;
        
        await bot.sendMessage(appointment.user_id, message);
        console.log(`📨 Уведомление об отклонении отправлено пациенту ${appointment.user_id}`);
    } catch (error) {
        console.error('❌ Ошибка при уведомлении пациента:', error);
    }
}

// ==================== ВРАЧУ: ПАЦИЕНТ ОТМЕНИЛ ЗАПИСЬ ====================
/**
 * Уведомляет врача об отмене записи пациентом
 */
async function notifyDoctorAboutCancellation(bot, appointmentId) {
    const doctorId = config.DOCTOR_ID;
    
    if (!doctorId) return;
    
    try {
        const appointment = await getAppointmentById(appointmentId);
        
        if (!appointment) return;
        
        const message = `
ПАЦИЕНТ ОТМЕНИЛ ЗАПИСЬ #${appointmentId}

Пациент: ${appointment.patient_name}
Телефон: ${appointment.patient_phone}
Дата: ${formatDate(appointment.appointment_date)}
Время: ${appointment.appointment_time}

Время освободилось.
        `;
        
        await bot.sendMessage(doctorId, message);
        console.log(`📨 Уведомление об отмене отправлено врачу`);
    } catch (error) {
        console.error('❌ Ошибка при уведомлении врача об отмене:', error);
    }
}

// ==================== ФОРМАТИРОВАНИЕ ДАТЫ ====================
/**
 * Единый формат даты для всех уведомлений
 */
function formatDate(dateStr) {
    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long'
    });
}

// ==================== ЗАПУСК ПЛАНИРОВЩИКА ====================
/**
 * Запускает периодическую проверку напоминаний
 */
function startReminderScheduler(bot, intervalMinutes = 10) {
    console.log(`⏰ Планировщик запущен (интервал ${intervalMinutes} мин)`);
    
    setTimeout(() => checkAndSendReminders(bot), 5000);
    
    setInterval(() => {
        checkAndSendReminders(bot);
    }, intervalMinutes * 60 * 1000);
}

// ==================== ЭКСПОРТ ====================
module.exports = {
    notifyDoctor,
    sendReminder,
    checkAndSendReminders,
    notifyPatientConfirmed,
    notifyPatientRejected,
    notifyDoctorAboutCancellation,
    startReminderScheduler
};