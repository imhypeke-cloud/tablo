/**
 * Основной файл приложения
 * Сервер для LIVE-табло стройплощадки
 */
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import config from './config.js';
import { testConnection } from './database.js';
import { initWebSocket, broadcastUpdate, broadcastAccessEvent } from './websocket.js';
import { getFullDashboardData, processAccessEvent } from './services/statsService.js';
import { getWeather, refreshWeather } from './services/weatherService.js';

const app = express();
const httpServer = createServer(app);

// Middleware
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

// API Routes

/**
 * GET /api/health - Проверка здоровья
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

/**
 * GET /api/dashboard - Получить данные дашборда
 */
app.get('/api/dashboard', async (req, res) => {
  try {
    const [stats, weather] = await Promise.all([
      getFullDashboardData(),
      getWeather(),
    ]);

    res.json({
      siteName: config.siteName,
      ...stats,
      weather,
    });
  } catch (error) {
    console.error('❌ Ошибка получения данных дашборда:', error.message);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

/**
 * POST /api/access-event - Webhook от СКУД
 * Принимает события доступа от системы контроля доступа
 */
app.post('/api/access-event', async (req, res) => {
  try {
    const {
      employee_id,
      employeeId,
      checkpoint_code,
      checkpointCode,
      event_type,
      eventType,
      event_time,
      eventTime,
      source_system,
      sourceSystem,
      raw_data,
      rawData,
    } = req.body;

    // Нормализуем данные (поддержка разных форматов)
    const eventData = {
      employeeId: employee_id || employeeId,
      checkpointCode: checkpoint_code || checkpointCode,
      eventType: event_type || eventType,
      eventTime: event_time || eventTime,
      sourceSystem: source_system || sourceSystem,
      rawData: raw_data || rawData,
    };

    // Валидация
    if (!eventData.employeeId || !eventData.eventType) {
      return res.status(400).json({
        error: 'Missing required fields: employeeId, eventType',
      });
    }

    // Обработка события
    const eventId = await processAccessEvent(eventData);

    // Трансляция обновления всем клиентам
    await broadcastUpdate();

    // Трансляция события
    broadcastAccessEvent({
      eventId,
      ...eventData,
      timestamp: new Date().toISOString(),
    });

    console.log(`✅ Событие доступа обработано: ${eventData.employeeId} - ${eventData.eventType}`);

    res.json({
      success: true,
      eventId,
      message: 'Event processed successfully',
    });
  } catch (error) {
    console.error('❌ Ошибка обработки события доступа:', error.message);
    res.status(500).json({ error: 'Failed to process access event' });
  }
});

/**
 * POST /api/weather/refresh - Принудительно обновить погоду
 */
app.post('/api/weather/refresh', async (req, res) => {
  try {
    const weather = await refreshWeather();
    await broadcastUpdate();
    res.json({ success: true, weather });
  } catch (error) {
    console.error('❌ Ошибка обновления погоды:', error.message);
    res.status(500).json({ error: 'Failed to refresh weather' });
  }
});

/**
 * GET /api/stats/category - Статистика по категориям
 */
app.get('/api/stats/category', async (req, res) => {
  try {
    const stats = await getFullDashboardData();
    res.json({ categories: stats.categories });
  } catch (error) {
    console.error('❌ Ошибка получения статистики:', error.message);
    res.status(500).json({ error: 'Failed to fetch category stats' });
  }
});

// Раздача статических файлов (frontend)
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.use(express.static(join(__dirname, '../../frontend/dist')));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '../../frontend/dist/index.html'));
});

// Инициализация
async function start() {
  console.log('🚀 Запуск сервера LIVE-табло...');
  console.log(`📍 Название площадки: ${config.siteName}`);

  // Проверка подключения к БД
  const dbConnected = await testConnection();
  if (!dbConnected) {
    console.error('❌ Не удалось подключиться к базе данных');
    process.exit(1);
  }

  // Инициализация WebSocket
  initWebSocket(httpServer);

  // Запуск HTTP сервера
  httpServer.listen(config.port, '0.0.0.0', () => {
    console.log(`✅ Сервер запущен на порту ${config.port}`);
    console.log(`📊 Dashboard: http://localhost:${config.port}`);
    console.log(`🔌 WebSocket: ws://localhost:${config.port}`);
    console.log(`📡 API: http://localhost:${config.port}/api`);
  });

  // Периодическое обновление погоды
  setInterval(async () => {
    await refreshWeather();
    await broadcastUpdate();
  }, config.weather.updateInterval);

  // Обработка ошибок
  process.on('unhandledRejection', (err) => {
    console.error('❌ Unhandled Rejection:', err);
  });

  process.on('SIGTERM', () => {
    console.log('👋 SIGTERM received, shutting down...');
    httpServer.close(() => {
      process.exit(0);
    });
  });
}

start();

export default app;
