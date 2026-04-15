# Архитектура системы LIVE-табло стройплощадки

## 1. Общая архитектурная схема

```
┌─────────────────────────────────────────────────────────────────────┐
│                         СТРОЙПЛОЩАДКА                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                       │
│  │   КПП 1  │    │   КПП 2  │    │   КПП N  │                       │
│  │  СКУД    │    │  СКУД    │    │  СКУД    │                       │
│  └────┬─────┘    └────┬─────┘    └────┬─────┘                       │
│       │               │               │                              │
│       │ (Webhook/     │ (Webhook/     │ (Webhook/                    │
│       │  Polling)     │  Polling)     │  Polling)                    │
│       ▼               ▼               ▼                              │
│  ┌─────────────────────────────────────────────────────────┐        │
│  │              MESSAGE BROKER (Redis Pub/Sub)             │        │
│  └─────────────────────────────────────────────────────────┘        │
│                              │                                       │
│                              ▼                                       │
│  ┌─────────────────────────────────────────────────────────┐        │
│  │                 BACKEND SERVICE                         │        │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │        │
│  │  │   WebSocket │  │   Access    │  │   Weather   │     │        │
│  │  │   Handler   │  │   Processor │  │   Service   │     │        │
│  │  └─────────────┘  └─────────────┘  └─────────────┘     │        │
│  │                                                         │        │
│  │  ┌─────────────────────────────────────────────────┐   │        │
│  │  │              PostgreSQL Database                │   │        │
│  │  │  - employees                                    │   │        │
│  │  │  - access_events                                │   │        │
│  │  │  - current_presence                             │   │        │
│  │  │  - checkpoints                                  │   │        │
│  │  └─────────────────────────────────────────────────┘   │        │
│  └─────────────────────────────────────────────────────────┘        │
│                              │                                       │
│                              ▼                                       │
│  ┌─────────────────────────────────────────────────────────┐        │
│  │              FRONTEND DASHBOARD (TV)                    │        │
│  │  - Real-time WebSocket connection                       │        │
│  │  - Auto-reconnect                                       │        │
│  │  - Modern UI with animations                            │        │
│  └─────────────────────────────────────────────────────────┘        │
│                                                                      │
│  ┌──────────────────┐                                               │
│  │  Weather API     │                                               │
│  │  (OpenWeatherMap)│                                               │
│  └──────────────────┘                                               │
└─────────────────────────────────────────────────────────────────────┘
```

## 2. Схема данных

### Таблицы:

**employees** - Сотрудники
- id (PK)
- employee_id (уникальный идентификатор из СКУД)
- full_name
- category (worker, itr, contractor, guest)
- company (опционально)
- created_at
- updated_at

**checkpoints** - Контрольные точки (КПП)
- id (PK)
- name
- code (идентификатор в СКУД)
- is_active
- created_at

**access_events** - События доступа
- id (PK)
- employee_id (FK -> employees)
- checkpoint_id (FK -> checkpoints)
- event_type (entry/exit)
- event_time
- source_system (идентификатор системы СКУД)
- raw_data (JSON с исходными данными)
- created_at

**current_presence** - Текущее присутствие
- id (PK)
- employee_id (FK -> employees, unique)
- is_inside (boolean)
- last_entry_time
- last_exit_time
- updated_at

**daily_statistics** - Дневная статистика (кэширование)
- id (PK)
- date
- total_entries
- total_exits
- entries_by_category (JSON)
- exits_by_category (JSON)
- updated_at

## 3. Подключение к СКУД

### Варианты интеграции:

**A. Webhook (рекомендуется)**
```
СКУД → POST /api/v1/access-event → Backend
```
- Мгновенная доставка
- Минимальная задержка
- Требуется поддержка со стороны СКУД

**B. SQL Polling**
```sql
SELECT * FROM scud_events 
WHERE processed = false 
ORDER BY event_time 
LIMIT 100;
```
- Универсальный способ
- Задержка 1-5 секунд
- Нагрузка на БД СКУД

**C. REST API Polling**
```
GET /scud-api/events?since=<timestamp>
```
- Чистый интерфейс
- Задержка зависит от интервала опроса

## 4. Технологический стек

**Backend:**
- Node.js 18+ (Express + Fastify)
- PostgreSQL 15+
- Redis (Pub/Sub для WebSocket)
- Socket.IO (WebSocket)
- Docker & Docker Compose

**Frontend:**
- React 18+ или Vanilla JS + HTMX
- Socket.IO Client
- TailwindCSS для стилей
- Vite для сборки

**Инфраструктура:**
- Docker Compose для оркестрации
- Nginx как reverse proxy
- PM2 для управления процессами

## 5. Логика подсчёта

### "Сейчас на площадке":
```
SELECT COUNT(*) FROM current_presence WHERE is_inside = true;
```

### По категориям:
```sql
SELECT e.category, COUNT(*) as count
FROM current_presence cp
JOIN employees e ON cp.employee_id = e.id
WHERE cp.is_inside = true
GROUP BY e.category;
```

### "Зашло сегодня" / "Вышло сегодня":
```sql
-- Зашло
SELECT COUNT(*) FROM access_events 
WHERE event_type = 'entry' 
AND DATE(event_time) = CURRENT_DATE;

-- Вышло
SELECT COUNT(*) FROM access_events 
WHERE event_type = 'exit' 
AND DATE(event_time) = CURRENT_DATE;
```

### По компаниям (опционально):
```sql
SELECT e.company, COUNT(*) as count
FROM current_presence cp
JOIN employees e ON cp.employee_id = e.id
WHERE cp.is_inside = true
GROUP BY e.company
ORDER BY count DESC;
```

## 6. API Погоды

Используем OpenWeatherMap API:
```javascript
const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric&lang=ru`;
```

Обновление каждые 10 минут.

## 7. Развёртывание (Docker)

Структура контейнеров:
- backend (Node.js приложение)
- frontend (статические файлы через Nginx)
- postgres (база данных)
- redis (кэш и pub/sub)
- nginx (reverse proxy)
