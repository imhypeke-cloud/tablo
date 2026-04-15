/**
 * SKUD Integration Service
 * Подключение к системе СКУД через API polling и webhook
 */

const axios = require('axios');
const crypto = require('crypto');
const { 
  SKUD_API_URL, 
  SKUD_API_KEY, 
  SKUD_API_SECRET,
  SKUD_POLL_INTERVAL 
} = require('../config');

class SkudService {
  constructor() {
    this.apiKey = SKUD_API_KEY;
    this.apiSecret = SKUD_API_SECRET;
    this.apiUrl = SKUD_API_URL;
    this.pollInterval = parseInt(SKUD_POLL_INTERVAL) || 5000;
    this.pollingEnabled = false;
    this.pollTimer = null;
    this.lastEventId = null;
  }

  /**
   * Генерация подписи для запросов к СКУД
   * @param {string} method - HTTP метод
   * @param {string} path - Путь endpoint
   * @param {number} timestamp - Unix timestamp
   * @returns {string} Подпись запроса
   */
  generateSignature(method, path, timestamp) {
    const data = `${method}${path}${timestamp}${this.apiSecret}`;
    return crypto.createHmac('sha256', this.apiSecret).update(data).digest('hex');
  }

  /**
   * Создание заголовков авторизации для СКУД
   * @param {string} method - HTTP метод
   * @param {string} path - Путь endpoint
   * @returns {Object} Заголовки
   */
  getAuthHeaders(method, path) {
    const timestamp = Date.now();
    const signature = this.generateSignature(method, path, timestamp);
    
    return {
      'X-SKUD-API-Key': this.apiKey,
      'X-SKUD-Timestamp': timestamp.toString(),
      'X-SKUD-Signature': signature,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Получение последних событий из СКУД (polling)
   * @param {number} limit - Количество событий
   * @returns {Promise<Array>} Массив событий
   */
  async fetchEvents(limit = 100) {
    try {
      const path = '/events';
      const url = `${this.apiUrl}${path}?limit=${limit}`;
      
      const response = await axios.get(url, {
        headers: this.getAuthHeaders('GET', path),
        timeout: 5000
      });

      if (response.data && response.data.events) {
        return response.data.events;
      }

      return [];
    } catch (error) {
      console.error('[SKUD] Ошибка получения событий:', error.message);
      
      // Если ошибка 401/403 - проблема с ключами
      if (error.response && [401, 403].includes(error.response.status)) {
        console.error('[SKUD] Ошибка авторизации. Проверьте API ключи!');
      }
      
      return [];
    }
  }

  /**
   * Получение информации о сотруднике из СКУД
   * @param {string} employeeId - ID сотрудника
   * @returns {Promise<Object|null>} Информация о сотруднике
   */
  async getEmployeeInfo(employeeId) {
    try {
      const path = `/employees/${employeeId}`;
      const url = `${this.apiUrl}${path}`;
      
      const response = await axios.get(url, {
        headers: this.getAuthHeaders('GET', path),
        timeout: 5000
      });

      return response.data || null;
    } catch (error) {
      console.error(`[SKUD] Ошибка получения информации о сотруднике ${employeeId}:`, error.message);
      return null;
    }
  }

  /**
   * Получение статуса доступа сотрудника
   * @param {string} employeeId - ID сотрудника
   * @returns {Promise<Object|null>} Статус доступа
   */
  async getAccessStatus(employeeId) {
    try {
      const path = `/access-status/${employeeId}`;
      const url = `${this.apiUrl}${path}`;
      
      const response = await axios.get(url, {
        headers: this.getAuthHeaders('GET', path),
        timeout: 5000
      });

      return response.data || null;
    } catch (error) {
      console.error(`[SKUD] Ошибка получения статуса доступа ${employeeId}:`, error.message);
      return null;
    }
  }

  /**
   * Запуск polling режима
   * @param {Function} onEventCallback - Callback для обработки событий
   */
  startPolling(onEventCallback) {
    if (this.pollingEnabled) {
      console.log('[SKUD] Polling уже запущен');
      return;
    }

    this.pollingEnabled = true;
    console.log(`[SKUD] Запуск polling каждые ${this.pollInterval}мс`);

    const poll = async () => {
      if (!this.pollingEnabled) return;

      try {
        const events = await this.fetchEvents(50);
        
        for (const event of events) {
          // Пропускаем уже обработанные события
          if (this.lastEventId && event.id <= this.lastEventId) {
            continue;
          }

          console.log(`[SKUD] Новое событие: ${event.eventType} - ${event.employeeId}`);
          
          // Вызываем callback для обработки события
          await onEventCallback(event);
          
          // Обновляем последний обработанный ID
          this.lastEventId = event.id;
        }
      } catch (error) {
        console.error('[SKUD] Ошибка при polling:', error.message);
      }

      // Планируем следующий опрос
      this.pollTimer = setTimeout(poll, this.pollInterval);
    };

    // Первый запуск сразу
    poll();
  }

  /**
   * Остановка polling режима
   */
  stopPolling() {
    this.pollingEnabled = false;
    
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    
    console.log('[SKUD] Polling остановлен');
  }

  /**
   * Обработка webhook от СКУД
   * @param {Object} payload - Данные вебхука
   * @param {string} signature - Подпись вебхука
   * @returns {boolean} Успешность проверки
   */
  verifyWebhook(payload, signature) {
    if (!signature) {
      console.error('[SKUD] Отсутствует подпись вебхука');
      return false;
    }

    const expectedSignature = crypto
      .createHmac('sha256', this.apiSecret)
      .update(JSON.stringify(payload))
      .digest('hex');

    if (signature !== expectedSignature) {
      console.error('[SKUD] Неверная подпись вебхука');
      return false;
    }

    return true;
  }

  /**
   * Преобразование события СКУД в формат системы
   * @param {Object} skudEvent - Событие от СКУД
   * @returns {Object} Нормализованное событие
   */
  normalizeEvent(skudEvent) {
    return {
      employeeId: skudEvent.employeeId || skudEvent.card_number,
      checkpointCode: skudEvent.checkpointCode || skudEvent.door_id,
      eventType: skudEvent.eventType === 'IN' || skudEvent.direction === 'entry' ? 'entry' : 'exit',
      timestamp: skudEvent.timestamp || skudEvent.event_time || new Date().toISOString(),
      skudEventId: skudEvent.id,
      raw: skudEvent
    };
  }
}

// Экспорт singleton экземпляра
module.exports = new SkudService();
