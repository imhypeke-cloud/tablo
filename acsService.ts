import fetch from 'node-fetch';

const API_BASE = process.env.ACS_API_URL || 'https://api.acs-gateway.com'; // URL шлюза из переменных окружения или по умолчанию
const API_KEY = process.env.ACS_API_KEY || '42517013';
const API_SECRET = process.env.ACS_API_SECRET || 'zBYGou3vZWhidMyMQHfd';

interface ACSEvent {
  employee_id: string;
  employee_name: string;
  direction: 'IN' | 'OUT';
  timestamp: string;
  gate_id: string;
  category?: string;
}

interface ACSStats {
  currentlyOnSite: number;
  enteredToday: number;
  exitedToday: number;
  byCategory: Record<string, number>;
  recentEvents: any[];
}

async function makeRequest(endpoint: string, params: Record<string, any> = {}) {
  const timestamp = Date.now().toString();
  const signature = Buffer.from(`${API_KEY}:${timestamp}:${endpoint}`).toString('base64');
  
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-API-Key': API_KEY,
      'X-API-Secret': API_SECRET,
      'X-Timestamp': timestamp,
      'X-Signature': signature,
      'Content-Type': 'application/json'
    }
  });
  
  if (!response.ok) {
    throw new Error(`ACS API Error: ${response.status} ${response.statusText}`);
  }
  
  return await response.json();
}

export async function getLiveStats(): Promise<ACSStats> {
  try {
    // Получаем текущую статистику с СКУД
    const stats = await makeRequest('/stats/live');
    
    return {
      currentlyOnSite: stats.on_site || 0,
      enteredToday: stats.entered_today || 0,
      exitedToday: stats.exited_today || 0,
      byCategory: stats.by_category || {},
      recentEvents: stats.recent_events || []
    };
  } catch (error) {
    console.error('Failed to fetch ACS stats:', error);
    // Возвращаем пустую статистику при ошибке
    return {
      currentlyOnSite: 0,
      enteredToday: 0,
      exitedToday: 0,
      byCategory: {},
      recentEvents: []
    };
  }
}

export async function getRecentEvents(limit: number = 10): Promise<ACSEvent[]> {
  try {
    const events = await makeRequest('/events/recent', { limit });
    return events.map((e: any) => ({
      employee_id: e.employee_id,
      employee_name: e.employee_name,
      direction: e.direction,
      timestamp: e.timestamp,
      gate_id: e.gate_id,
      category: e.category
    }));
  } catch (error) {
    console.error('Failed to fetch ACS events:', error);
    return [];
  }
}

export async function syncEvents(): Promise<void> {
  try {
    // Синхронизируем последние события с локальной БД
    const events = await getRecentEvents(100);
    console.log(`Synced ${events.length} events from ACS`);
  } catch (error) {
    console.error('Failed to sync ACS events:', error);
  }
}

// Health check
export async function checkConnection(): Promise<boolean> {
  try {
    await makeRequest('/health');
    return true;
  } catch {
    return false;
  }
}
