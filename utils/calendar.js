// ==================== МОДУЛЬ РАБОТЫ С КАЛЕНДАРЁМ ====================
// Отвечает за генерацию дат, слотов времени и проверку доступности

const config = require('../config.js');
const { getBusySlots, isTimeSlotAvailable } = require('../database.js');

// ==================== ГЕНЕРАЦИЯ ДАТ НА НЕДЕЛЮ ====================
/**
 * Генерирует массив дат на ближайшие N дней
 * @param {number} daysCount - количество дней для генерации
 * @returns {Array} массив объектов с датами
 */
function generateDates(daysCount = 7) {
    const dates = [];
    const today = new Date();
    
    for (let i = 0; i < daysCount; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        
        // Форматируем дату для базы данных (YYYY-MM-DD)
        const dateStr = date.toISOString().split('T')[0];
        
        // Форматируем для отображения пользователю
        const displayDate = date.toLocaleDateString('ru-RU', {
            weekday: 'short',
            day: 'numeric',
            month: 'short'
        });
        
        dates.push({
            raw: dateStr,        // 2024-03-15 (для базы)
            display: displayDate, // "пт, 15 мар" (для пользователя)
            full: date,           // объект Date (для вычислений)
            isWeekend: date.getDay() === 0 || date.getDay() === 6 // выходной?
        });
    }
    
    return dates;
}

// ==================== ГЕНЕРАЦИЯ ВРЕМЕННЫХ СЛОТОВ ====================
/**
 * Генерирует доступные временные слоты на основе рабочего времени
 * @param {string} date - дата в формате YYYY-MM-DD
 * @param {number} serviceId - ID услуги (для проверки занятости)
 * @returns {Promise<Array>} массив объектов со слотами
 */
async function generateTimeSlots(date, serviceId = null) {
    const slots = [];
    const { start, end, interval } = config.WORK_HOURS;
    
    // Получаем занятые слоты из базы
    const busySlots = await getBusySlots(date, serviceId);
    
    // Генерируем все возможные слоты
    for (let hour = start; hour < end; hour++) {
        for (let minute = 0; minute < 60; minute += interval) {
            const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
            
            // Проверяем, не в прошлом ли это время (для сегодняшней даты)
            const isInPast = isTimeInPast(date, timeStr);
            
            // Проверяем, свободен ли слот
            const isAvailable = !busySlots.includes(timeStr) && !isInPast;
            
            slots.push({
                time: timeStr,
                display: timeStr,
                available: isAvailable,
                busy: busySlots.includes(timeStr),
                past: isInPast
            });
        }
    }
    
    return slots;
}

// ==================== ПРОВЕРКА, НЕ В ПРОШЛОМ ЛИ ВРЕМЯ ====================
/**
 * Проверяет, не прошло ли уже указанное время
 * @param {string} date - дата YYYY-MM-DD
 * @param {string} time - время HH:MM
 * @returns {boolean} true если время уже прошло
 */
function isTimeInPast(date, time) {
    const now = new Date();
    const targetDate = new Date(date + 'T' + time + ':00');
    
    return targetDate < now;
}

// ==================== ПОЛУЧИТЬ ТОЛЬКО СВОБОДНЫЕ СЛОТЫ ====================
/**
 * Возвращает только свободные слоты
 * @param {string} date - дата
 * @param {number} serviceId - ID услуги
 * @returns {Promise<Array>} массив свободных слотов
 */
async function getAvailableSlots(date, serviceId) {
    const allSlots = await generateTimeSlots(date, serviceId);
    return allSlots.filter(slot => slot.available);
}

// ==================== СОЗДАТЬ INLINE-КЛАВИАТУРУ С ДАТАМИ ====================
function createDatesKeyboard(datesArray, prefix = 'date') {
    const keyboard = {
        reply_markup: {
            inline_keyboard: []
        }
    };
    
    for (let i = 0; i < datesArray.length; i += 3) {
        const row = [];
        for (let j = 0; j < 3 && i + j < datesArray.length; j++) {
            const date = datesArray[i + j];
            const buttonText = date.isWeekend ? `🌙 ${date.display}` : date.display;
            row.push({
                text: buttonText,
                callback_data: `${prefix}_${date.raw}`
            });
        }
        keyboard.reply_markup.inline_keyboard.push(row);
    }
    
    return keyboard;
}

// ==================== СОЗДАТЬ INLINE-КЛАВИАТУРУ СО ВРЕМЕНЕМ ====================
/**
 * Создаёт клавиатуру с кнопками времени
 * @param {Array} slots - массив слотов из generateTimeSlots()
 * @param {number} columns - количество кнопок в ряду
 * @returns {Object} клавиатура для Telegram
 */
function createTimeKeyboard(slots, columns = 3) {
    const keyboard = {
        reply_markup: {
            inline_keyboard: []
        }
    };
    
    // Фильтруем только доступные слоты
    const availableSlots = slots.filter(slot => slot.available);
    
    // Группируем по columns в ряд
    for (let i = 0; i < availableSlots.length; i += columns) {
        const row = [];
        
        for (let j = 0; j < columns && i + j < availableSlots.length; j++) {
            const slot = availableSlots[i + j];
            
            row.push({
                text: slot.display,
                callback_data: `time_${slot.time}`
            });
        }
        
        keyboard.reply_markup.inline_keyboard.push(row);
    }
    
    // Добавляем кнопку "Назад к датам"
    keyboard.reply_markup.inline_keyboard.push([
        { text: '🔙 Назад к датам', callback_data: 'back_to_dates' }
    ]);
    
    return keyboard;
}

// ==================== ПОЛУЧИТЬ БЛИЖАЙШИЕ СВОБОДНЫЕ СЛОТЫ ====================
/**
 * Находит ближайшие свободные слоты
 * @param {number} serviceId - ID услуги
 * @param {number} limit - сколько слотов найти
 * @returns {Promise<Array>} массив ближайших свободных слотов
 */
async function getNearestSlots(serviceId, limit = 5) {
    const nearestSlots = [];
    let daysToCheck = 14; // Проверяем ближайшие 14 дней
    
    for (let i = 0; i < daysToCheck && nearestSlots.length < limit; i++) {
        const date = new Date();
        date.setDate(date.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];
        
        const availableSlots = await getAvailableSlots(dateStr, serviceId);
        
        for (const slot of availableSlots) {
            if (nearestSlots.length < limit) {
                nearestSlots.push({
                    date: dateStr,
                    dateDisplay: date.toLocaleDateString('ru-RU', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short'
                    }),
                    time: slot.time,
                    full: slot
                });
            } else {
                break;
            }
        }
    }
    
    return nearestSlots;
}

// ==================== ПРОВЕРИТЬ, РАБОЧИЙ ЛИ ДЕНЬ ====================
/**
 * Проверяет, рабочий ли день
 * @param {string} dateStr - дата YYYY-MM-DD
 * @returns {boolean} true если рабочий день
 */
function isWorkingDay(dateStr) {
    const date = new Date(dateStr + 'T12:00:00');
    const day = date.getDay();
    return day !== 0 && day !== 6; // Не суббота и не воскресенье
}

// ==================== ПОЛУЧИТЬ СЛЕДУЮЩИЙ РАБОЧИЙ ДЕНЬ ====================
/**
 * Возвращает следующий рабочий день
 * @returns {string} дата в формате YYYY-MM-DD
 */
function getNextWorkingDay() {
    let date = new Date();
    date.setDate(date.getDate() + 1); // Начинаем с завтра
    
    while (!isWorkingDay(date.toISOString().split('T')[0])) {
        date.setDate(date.getDate() + 1);
    }
    
    return date.toISOString().split('T')[0];
}

// ==================== ЭКСПОРТ ВСЕХ ФУНКЦИЙ ====================
module.exports = {
    generateDates,
    generateTimeSlots,
    getAvailableSlots,
    createDatesKeyboard,
    createTimeKeyboard,
    getNearestSlots,
    isTimeInPast,
    isWorkingDay,
    getNextWorkingDay
};