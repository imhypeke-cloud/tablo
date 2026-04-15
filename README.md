# LIVE-табло стройплощадки с интеграцией СКУД

## 📋 Описание

Система реального времени для отображения статистики посещаемости стройплощадки на телевизорах/мониторах.

### Возможности:
- ✅ Подсчёт людей на площадке в реальном времени
- ✅ Статистика входа/выхода за день
- ✅ Разделение по категориям (Рабочие, ИТР, Подрядчики, Гости)
- ✅ LIVE погода
- ✅ Мгновенное обновление через WebSocket
- ✅ Поддержка нескольких КПП
- ✅ Интеграция с СКУД через webhook

## 🏗️ Архитектура

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│    СКУД     │────▶│   Backend    │────▶│  Frontend   │
│  (Webhook)  │     │ (Node.js +   │     │  (Dashboard)│
└─────────────┘     │  WebSocket)  │     └─────────────┘
                    │       │      │
                    │       ▼      │
                    │  PostgreSQL  │
                    └──────────────┘
```

## 🚀 Быстрый старт

### Вариант 1: Docker Compose (рекомендуется)

```bash
# Перейти в директорию docker
cd docker

# Запустить все сервисы
docker-compose up -d

# Проверить логи
docker-compose logs -f backend

# Открыть дашборд
http://localhost
```

### Вариант 2: Локальная разработка

#### Backend:
```bash
cd backend

# Установить зависимости
npm install

# Скопировать .env
cp .env.example .env

# Запустить миграции
npm run migrate

# Запустить сервер
npm start
# или для разработки
npm run dev
```

#### Frontend:
Просто откройте `frontend/src/index.html` в браузере или используйте любой статический сервер.

## 📡 API

### Получить данные дашборда
```
GET /api/dashboard
```

Ответ:
```json
{
  "siteName": "СТРОЙПЛОЩАДКА A",
  "totalInside": 1998,
  "totalEntriesToday": 2000,
  "totalExitsToday": 2,
  "categories": {
    "worker": 1800,
    "itr": 150,
    "contractor": 48,
    "guest": 0
  },
  "weather": {
    "temp": 18,
    "description": "Ясно",
    "humidity": 65,
    "pressure": 760,
    "windSpeed": 3.5
  }
}
```

### Webhook от СКУД
```
POST /api/access-event
Content-Type: application/json

{
  "employeeId": "EMP001",
  "checkpointCode": "MAIN_GATE",
  "eventType": "entry",
  "eventTime": "2024-01-15T08:30:00Z",
  "sourceSystem": "SCUD_SYSTEM_1"
}
```

### Проверка здоровья
```
GET /api/health
```

## 🔌 WebSocket

Подключение:
```javascript
const socket = io('http://localhost');

socket.on('dashboard-update', (data) => {
  console.log('Новые данные:', data);
});

socket.on('access-event', (event) => {
  console.log('Событие доступа:', event);
});
```

## 🗄️ База данных

### Таблицы:
- `employees` - сотрудники
- `checkpoints` - контрольные точки (КПП)
- `access_events` - события доступа
- `current_presence` - текущее присутствие
- `daily_statistics` - дневная статистика

### Категории сотрудников:
- `worker` - Рабочие
- `itr` - ИТР/ИТС
- `contractor` - Подрядчики
- `guest` - Гости

## ⚙️ Конфигурация

Переменные окружения (backend/.env):

```bash
# Приложение
PORT=3000
SITE_NAME=СТРОЙПЛОЩАДКА A

# База данных
DB_HOST=postgres
DB_PORT=5432
DB_NAME=construction_db
DB_USER=postgres
DB_PASSWORD=postgres_secret_password

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# Погода (OpenWeatherMap)
WEATHER_API_KEY=your_api_key_here
WEATHER_LAT=55.7558
WEATHER_LON=37.6173
WEATHER_UPDATE_INTERVAL=600000
```

## 🌤️ Настройка погоды

1. Получите API ключ на https://openweathermap.org/api
2. Укажите ключ в `.env`:
   ```
   WEATHER_API_KEY=your_actual_api_key
   ```
3. Настройте координаты вашей площадки:
   ```
   WEATHER_LAT=55.7558
   WEATHER_LON=37.6173
   ```

## 📊 Пример использования

### Интеграция с СКУД

```python
# Пример отправки события из системы СКУД
import requests

def send_access_event(employee_id, event_type, checkpoint='MAIN_GATE'):
    response = requests.post(
        'http://your-server.com/api/access-event',
        json={
            'employeeId': employee_id,
            'checkpointCode': checkpoint,
            'eventType': event_type,  # 'entry' или 'exit'
            'sourceSystem': 'MY_SCUD'
        }
    )
    return response.json()

# Сотрудник вошёл
send_access_event('EMP001', 'entry')

# Сотрудник вышел
send_access_event('EMP001', 'exit')
```

## 🛠️ Production развёртывание

### Требования:
- Docker & Docker Compose
- 2 GB RAM минимум
- 2 CPU ядра
- 10 GB дискового пространства

### Команды:

```bash
# Запуск
docker-compose up -d

# Остановка
docker-compose down

# Просмотр логов
docker-compose logs -f

# Обновление
docker-compose pull
docker-compose up -d --force-recreate

# Резервное копирование БД
docker-compose exec postgres pg_dump -U postgres construction_db > backup.sql

# Восстановление БД
docker-compose exec -T postgres psql -U postgres construction_db < backup.sql
```

## 📈 Масштабирование

Система поддерживает:
- 2000-5000 сотрудников
- Несколько КПП
- До 100 одновременных WebSocket подключений
- 24/7 работу

### Для больших нагрузок:
1. Увеличьте ресурсы контейнеров
2. Настройте кластеризацию PostgreSQL
3. Используйте Redis Cluster
4. Добавьте балансировщик нагрузки

## 🔒 Безопасность

- HTTPS рекомендуется для production
- Настройте CORS для конкретных доменов
- Используйте авторизацию для webhook endpoints
- Регулярно обновляйте зависимости

## 📝 Лицензия

MIT License

## 👥 Поддержка

Для вопросов и предложений создавайте Issues в репозитории.
