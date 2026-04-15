/**
 * WebSocket менеджер для real-time обновлений
 */
import { Server } from 'socket.io';
import { getFullDashboardData } from './statsService.js';
import { getWeather } from './weatherService.js';

let io = null;
const connectedClients = new Set();

/**
 * Инициализация WebSocket сервера
 */
export function initWebSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.on('connection', (socket) => {
    console.log(`🔌 Клиент подключен: ${socket.id}`);
    connectedClients.add(socket.id);

    // Отправляем текущие данные при подключении
    sendCurrentData(socket);

    socket.on('disconnect', () => {
      console.log(`🔌 Клиент отключен: ${socket.id}`);
      connectedClients.delete(socket.id);
    });

    socket.on('get-dashboard-data', async () => {
      const data = await getDashboardData();
      socket.emit('dashboard-update', data);
    });
  });

  console.log('✅ WebSocket сервер запущен');
  return io;
}

/**
 * Получить полные данные для дашборда
 */
async function getDashboardData() {
  const [stats, weather] = await Promise.all([
    getFullDashboardData(),
    getWeather(),
  ]);

  return {
    ...stats,
    weather,
  };
}

/**
 * Отправить текущие данные клиенту
 */
async function sendCurrentData(socket) {
  try {
    const data = await getDashboardData();
    socket.emit('dashboard-update', data);
  } catch (error) {
    console.error('❌ Ошибка отправки данных:', error.message);
  }
}

/**
 * Транслировать обновление всем клиентам
 */
export async function broadcastUpdate() {
  if (!io) return;

  try {
    const data = await getDashboardData();
    io.emit('dashboard-update', data);
    console.log(`📡 Трансляция обновления (${connectedClients.size} клиентов)`);
  } catch (error) {
    console.error('❌ Ошибка трансляции:', error.message);
  }
}

/**
 * Транслировать событие доступа
 */
export function broadcastAccessEvent(event) {
  if (!io) return;

  io.emit('access-event', event);
  console.log(`📡 Событие доступа транслировано`);
}

/**
 * Получить количество подключённых клиентов
 */
export function getConnectedClientsCount() {
  return connectedClients.size;
}

export default {
  initWebSocket,
  broadcastUpdate,
  broadcastAccessEvent,
  getConnectedClientsCount,
};
