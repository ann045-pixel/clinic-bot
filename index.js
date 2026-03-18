// ==================== ПОДКЛЮЧАЕМ КОНФИГ ====================
// Тут все настройки бота: токен, услуги, время работы
const config = require('./config.js');

// ==================== ПОДКЛЮЧАЕМ БИБЛИОТЕКИ ====================
const TelegramBot = require('node-telegram-bot-api');
const { 
    getServices,
    getServiceById,
    getAppointmentById,
    getPatient,
    getUserUpcomingAppointments,
    getUserAppointments,
    cancelAppointment,
    initServicesFromConfig,
    updateAppointmentStatus,
    getAvailableSlots
} = require('./database.js');
const { startReminderScheduler, notifyPatientConfirmed, notifyPatientRejected } = require('./utils/notifications.js');

// ==================== ПОДКЛЮЧАЕМ ОБРАБОТЧИКИ ====================
// Каждый обработчик отвечает за свою команду или этап записи
const { handleStart, sendClinicInfo } = require('./handlers/start.js');
const { showServices, handleServiceSelected } = require('./handlers/services.js');
const { showAvailableDates, handleDateSelected, showNearestDates } = require('./handlers/date.js');
const { showAvailableTimes, handleTimeSelected } = require('./handlers/time.js');
const { startContactCollection, handleContactInput, useExistingContacts } = require('./handlers/contacts.js');
const { showConfirmation, handleConfirmYes, handleConfirmNo, handleBackToDate } = require('./handlers/confirm.js');
const { showMyAppointments, showAppointmentDetails, handleCancelAppointment } = require('./handlers/myAppointments.js');
const { 
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
    handleAdminDateSelected
} = require('./handlers/admin.js');

// ==================== ТОКЕН БОТА ====================
const token = config.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

console.log('Бот записи запущен');
console.log(`Клиника: ${config.CLINIC_NAME}`);
console.log(`ID врача: ${config.DOCTOR_ID}`);

// ==================== ВРЕМЕННОЕ ХРАНИЛИЩЕ ДАННЫХ ====================
// userSession хранит данные текущей записи (услуга, дата, время, имя, телефон)
// userState хранит этап на котором находится пользователь (awaiting_name, awaiting_phone и т.д.)
const userSession = {};
const userState = {};

// ==================== ЗАПУСК ПЛАНИРОВЩИКА НАПОМИНАНИЙ ====================
// Проверяет каждые 10 минут, кому пора отправить напоминание о записи
startReminderScheduler(bot, 10);

// ==================== ИНИЦИАЛИЗАЦИЯ УСЛУГ ====================
// При первом запуске заполняет таблицу услуг из config.SERVICES
(async () => {
    try {
        await initServicesFromConfig(config.SERVICES);
        console.log('Услуги загружены в базу');
    } catch (error) {
        console.error('Ошибка при загрузке услуг:', error);
    }
})();

// ==================== КОМАНДЫ ====================
// /start — начало работы, приветствие
// /admin — панель врача (только для config.DOCTOR_ID)
// /today, /tomorrow, /week — просмотр записей для врача
// /mylist — список записей пациента
bot.onText(/\/start/, (msg) => handleStart(bot, msg));
bot.onText(/\/admin/, (msg) => handleAdmin(bot, msg));
bot.onText(/\/today/, (msg) => handleToday(bot, msg));
bot.onText(/\/tomorrow/, (msg) => handleTomorrow(bot, msg));
bot.onText(/\/week/, (msg) => handleWeek(bot, msg));
bot.onText(/\/all/, (msg) => handleAllAppointments(bot, msg));
bot.onText(/\/pending/, (msg) => handlePending(bot, msg));
bot.onText(/\/stats/, (msg) => handleStats(bot, msg));
bot.onText(/\/patients/, (msg) => handlePatients(bot, msg));
bot.onText(/\/schedule/, (msg) => handleSchedule(bot, msg));
bot.onText(/\/services/, (msg) => handleServices(bot, msg));
bot.onText(/\/mylist/, (msg) => showMyAppointments(bot, msg.chat.id));

// ==================== ОБРАБОТКА ТЕКСТОВЫХ КНОПОК ====================
// Основное меню, которое видит пользователь
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    // Пропускаем команды, они обрабатываются выше
    if (text.startsWith('/')) return;
    
    // Если пользователь в процессе ввода данных (имя, телефон, комментарий)
    if (userState[chatId]) {
        await handleContactInput(bot, msg, userState, userSession);
        return;
    }
    
    // Обработка кнопок меню
    switch(text) {
        case '📅 Записаться на приём':
            await showServices(bot, chatId, userSession);
            break;
        case '📋 Мои записи':
        case '/mylist':
            await showMyAppointments(bot, chatId);
            break;
        case 'ℹ️ О клинике':
            await sendClinicInfo(bot, chatId);
            break;
        case 'Сегодня':
            await handleToday(bot, msg);
            break;
        case 'Завтра':
            await handleTomorrow(bot, msg);
            break;
        case 'Ожидают':
            await handlePending(bot, msg);
            break;
        case 'Статистика':
            await handleStats(bot, msg);
            break;
        case 'Пациенты':
            await handlePatients(bot, msg);
            break;
        case 'Расписание':
            await handleSchedule(bot, msg);
            break;
        case 'Главное меню':
            await bot.sendMessage(chatId, 'Главное меню:', config.MAIN_KEYBOARD);
            break;
        default:
            await bot.sendMessage(chatId, 'Неизвестная команда. Используйте меню ниже.');
    }
});


// ==================== ОБРАБОТКА INLINE-КНОПОК ====================
// Все кнопки, которые появляются в процессе записи
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const data = query.data;
    
    await bot.answerCallbackQuery(query.id);
    
    // ===== ВЫБОР УСЛУГИ =====
    // Нажатие на кнопку услуги в /services
    if (data.startsWith('service_')) {
        const serviceId = data.replace('service_', '');
        await handleServiceSelected(bot, chatId, serviceId, userSession, messageId);
        return;
    }
    
    // ===== ВЫБОР ДАТЫ =====
    // Для пациентов — выбор даты из календаря
    if (data.startsWith('date_')) {
        const selectedDate = data.replace('date_', '');
        await handleDateSelected(bot, chatId, selectedDate, userSession, userState, messageId);
        return;
    }
    
    // ===== ВЫБОР ДАТЫ ДЛЯ АДМИНА =====
    // Для врача — управление расписанием
    if (data.startsWith('admin_date_')) {
        const selectedDate = data.replace('admin_date_', '');
        await handleAdminDateSelected(bot, chatId, selectedDate, messageId);
        return;
    }
    
    // ===== ВЫБОР ВРЕМЕНИ =====
    // После выбора даты — выбор свободного времени
    if (data.startsWith('time_')) {
        const selectedTime = data.replace('time_', '');
        await handleTimeSelected(bot, chatId, selectedTime, userSession, userState, messageId);
        return;
    }
    
    // ===== КОНТАКТЫ =====
    // Использовать сохраненные данные или ввести новые
    if (data === 'use_existing_contact') {
        await useExistingContacts(bot, chatId, userSession, messageId);
        return;
    }
    
    if (data === 'new_contact') {
        userState[chatId] = 'awaiting_name';
        await bot.sendMessage(chatId, 'Введите ваше имя:');
        await bot.deleteMessage(chatId, messageId);
        return;
    }
    
    // ===== ПОДТВЕРЖДЕНИЕ =====
    // Подтверждение или отмена записи
    if (data === 'confirm_yes') {
        const sessionData = userSession[chatId];
        if (!sessionData) {
            await bot.sendMessage(chatId, 'Сессия устарела. Начните заново.');
            return;
        }
        await handleConfirmYes(bot, chatId, sessionData, userSession, userState, messageId);
        return;
    }
    
    if (data === 'confirm_no') {
        await handleConfirmNo(bot, chatId, userSession, userState, messageId);
        return;
    }
    
    if (data === 'back_to_date') {
        await handleBackToDate(bot, chatId, userSession, userState, messageId);
        return;
    }
    
    // ===== ПРОСМОТР ЗАПИСЕЙ =====
    // Пациент смотрит детали своей записи
    if (data.startsWith('view_appointment_')) {
        const appointmentId = parseInt(data.replace('view_appointment_', ''));
        try {
            const appointment = await getAppointmentById(appointmentId);
            if (appointment) {
                await showAppointmentDetails(bot, chatId, appointment, messageId);
            } else {
                await bot.sendMessage(chatId, 'Запись не найдена');
            }
        } catch (error) {
            console.error('Ошибка при получении записи:', error);
        }
        return;
    }
    
    // ===== ОТМЕНА ЗАПИСИ =====
    // Пациент отменяет свою запись
    if (data.startsWith('cancel_appointment_')) {
        const appointmentId = parseInt(data.replace('cancel_appointment_', ''));
        await handleCancelAppointment(bot, chatId, appointmentId);
        await bot.deleteMessage(chatId, messageId);
        return;
    }
    
    // ===== ВОЗВРАТ =====
    // Кнопки "Назад" в разных местах
    if (data === 'back_to_services') {
        await bot.deleteMessage(chatId, messageId);
        await showServices(bot, chatId, userSession);
        return;
    }
    
    if (data === 'back_to_main') {
        await bot.deleteMessage(chatId, messageId);
        await bot.sendMessage(chatId, 'Главное меню:', config.MAIN_KEYBOARD);
        return;
    }
    
    if (data === 'back_to_appointments') {
        await bot.deleteMessage(chatId, messageId);
        await showMyAppointments(bot, chatId);
        return;
    }
    
    if (data === 'back_to_schedule') {
        await handleSchedule(bot, { chat: { id: chatId } });
        await bot.deleteMessage(chatId, messageId).catch(e => {});
        return;
    }
    
    if (data === 'admin_refresh_schedule') {
        await handleSchedule(bot, { chat: { id: chatId } });
        await bot.deleteMessage(chatId, messageId).catch(e => {});
        return;
    }
    
    // ===== АДМИН-КОМАНДЫ =====
    // Подтверждение записи врачом
    if (data.startsWith('admin_confirm_')) {
        const appointmentId = parseInt(data.replace('admin_confirm_', ''));
        try {
            await updateAppointmentStatus(appointmentId, 'confirmed');
            const appointment = await getAppointmentById(appointmentId);
            if (appointment) {
                await bot.sendMessage(
                    appointment.user_id,
                    `Ваша запись на ${appointment.appointment_date} в ${appointment.appointment_time} подтверждена врачом!`
                );
            }
            
            await bot.editMessageText(
                query.message.text.replace('⏳', '✅') + '\n\n✅ ПОДТВЕРЖДЕНО',
                {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'HTML'
                }
            );
        } catch (error) {
            console.error('Ошибка при подтверждении:', error);
        }
        return;
    }
    
    // Отклонение записи врачом
    if (data.startsWith('admin_reject_')) {
        const appointmentId = parseInt(data.replace('admin_reject_', ''));
        try {
            await updateAppointmentStatus(appointmentId, 'cancelled');
            const appointment = await getAppointmentById(appointmentId);
            if (appointment) {
                await bot.sendMessage(
                    appointment.user_id,
                    `Ваша запись на ${appointment.appointment_date} в ${appointment.appointment_time} отклонена. Пожалуйста, выберите другое время.`
                );
            }
            
            await bot.editMessageText(
                query.message.text.replace('⏳', '❌') + '\n\n❌ ОТКЛОНЕНО',
                {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'HTML'
                }
            );
        } catch (error) {
            console.error('Ошибка при отклонении:', error);
        }
        return;
    }
    
    // Просмотр деталей записи админом
    if (data.startsWith('admin_view_')) {
        const appointmentId = parseInt(data.replace('admin_view_', ''));
        try {
            const appointment = await getAppointmentById(appointmentId);
            if (!appointment) {
                await bot.sendMessage(chatId, 'Запись не найдена');
                return;
            }
            
            const details = `
Запись #${appointment.id}

Пациент: ${appointment.patient_name}
Телефон: ${appointment.patient_phone}
Услуга: ${appointment.service_name}
Дата: ${appointment.appointment_date}
Время: ${appointment.appointment_time}
Статус: ${appointment.status}
Комментарий: ${appointment.comment || 'нет'}

Создано: ${new Date(appointment.created_at).toLocaleString()}
            `;
            
            await bot.sendMessage(chatId, details, { parse_mode: 'HTML' });
            
        } catch (error) {
            console.error('Ошибка при просмотре:', error);
        }
        return;
    }
});

bot.onText(/\/testreminder/, async (msg) => {
    const chatId = msg.chat.id;
    
    // Только для админа
    if (chatId !== config.DOCTOR_ID) return;
    
    const { checkAndSendReminders } = require('./utils/notifications.js');
    await checkAndSendReminders(bot);
    await bot.sendMessage(chatId, '✅ Проверка напоминаний выполнена');
});

// ==================== ЗАКРЫТИЕ ПРИ ВЫХОДЕ ====================
// Корректное завершение работы бота
process.on('SIGINT', () => {
    console.log('Бот остановлен');
    process.exit();
});

process.on('SIGTERM', () => {
    console.log('Бот остановлен');
    process.exit();
});
