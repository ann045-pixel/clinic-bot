# 🏥 Бот для записи к врачу

Telegram-бот для автоматизации записи пациентов. Позволяет выбирать услугу, дату, время и оставлять контактные данные.

## Функционал

### Для пациентов
- Запись на приём (выбор услуги → даты → времени)
- Просмотр своих записей
- Информация о клинике
- Подтверждение записи
- Отмена записи
- Автоматические напоминания за час до приёма

### Для администратора
- Просмотр записей на сегодня/завтра/неделю
- Подтверждение и отклонение записей
- Статистика по услугам
- Список пациентов
- Управление расписанием

## 🛠 Технологии

- Node.js
- Telegram Bot API
- SQLite3
- PM2 (для продакшена)

## 📁 Структура проекта

📁 clinic-bot/
├── 📄 index.js # Главный файл
├── 📄 config.js # Конфигурация
├── 📄 database.js # Работа с БД
├── 📄 .env # Переменные окружения
├── 📁 handlers/ # Обработчики
│ ├── start.js
│ ├── services.js
│ ├── date.js
│ ├── time.js
│ ├── contacts.js
│ ├── confirm.js
│ ├── myAppointments.js
│ └── admin.js
└── 📁 utils/ # Утилиты
├── calendar.js
└── notifications.js

## Установка 
### Локально
```bash
git clone https://github.com/твой-логин/clinic-bot.git
cd clinic-bot
npm install
cp .env.example .env  # Добавь свой токен
node index.js

### На сервере через PM2 

git clone https://github.com/твой-логин/clinic-bot.git
cd clinic-bot
npm install
cp .env.example .env  # Добавь токен
pm2 start index.js --name clinic-bot
pm2 save
pm2 startup

## Настройка

1. Получи токен у @BotFather
Добавь его в .env:
BOT_TOKEN=твой_токен_сюда

2. ID администратора
В config.js укажи свой Telegram ID:
const DOCTOR_ID = 123456789;  // Твой ID

3. Услуги

В config.js можно редактировать список услуг:
const SERVICES = [
    { 
        id: 1, 
        name: 'Первичный приём', 
        duration: 30, 
        price: 2000,
        description: 'Осмотр, сбор анамнеза'
    }
];

## По вопросам разработки: @CypherNight




