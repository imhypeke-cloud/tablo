/**
 * Сервис статистики - получение данных для дашборда
 */
import pool from './database.js';

/**
 * Получить общую статистику для дашборда
 */
export async function getDashboardStats() {
  const query = `
    SELECT 
      (SELECT COUNT(*) FROM current_presence WHERE is_inside = true) as total_inside,
      (SELECT COUNT(*) FROM access_events WHERE event_type = 'entry' AND DATE(event_time) = CURRENT_DATE) as total_entries_today,
      (SELECT COUNT(*) FROM access_events WHERE event_type = 'exit' AND DATE(event_time) = CURRENT_DATE) as total_exits_today
  `;
  
  const result = await pool.query(query);
  return result.rows[0];
}

/**
 * Получить статистику по категориям
 */
export async function getCategoryStats() {
  const query = `
    SELECT 
      e.category,
      COUNT(CASE WHEN cp.is_inside = true THEN 1 END) as inside_count
    FROM employees e
    LEFT JOIN current_presence cp ON e.id = cp.employee_id
    WHERE cp.is_inside = true OR cp.is_inside IS NULL
    GROUP BY e.category
    ORDER BY inside_count DESC
  `;
  
  const result = await pool.query(query);
  
  // Преобразуем в удобный формат
  const stats = {
    worker: 0,
    itr: 0,
    contractor: 0,
    guest: 0,
  };
  
  result.rows.forEach(row => {
    if (stats.hasOwnProperty(row.category)) {
      stats[row.category] = parseInt(row.inside_count, 10);
    }
  });
  
  return stats;
}

/**
 * Получить полную статистику для дашборда
 */
export async function getFullDashboardData() {
  const [generalStats, categoryStats] = await Promise.all([
    getDashboardStats(),
    getCategoryStats(),
  ]);
  
  return {
    totalInside: parseInt(generalStats.total_inside, 10),
    totalEntriesToday: parseInt(generalStats.total_entries_today, 10),
    totalExitsToday: parseInt(generalStats.total_exits_today, 10),
    categories: categoryStats,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Обработка события доступа от СКУД
 */
export async function processAccessEvent(eventData) {
  const {
    employeeId,
    checkpointCode,
    eventType,
    eventTime,
    sourceSystem,
    rawData,
  } = eventData;
  
  const query = `
    SELECT process_access_event(
      $1, $2, $3, $4, $5, $6
    ) as event_id
  `;
  
  const values = [
    employeeId,
    checkpointCode,
    eventType,
    eventTime || new Date().toISOString(),
    sourceSystem || 'SCUD',
    JSON.stringify(rawData || {}),
  ];
  
  const result = await pool.query(query, values);
  return result.rows[0].event_id;
}

/**
 * Получить количество людей на площадке по компаниям
 */
export async function getCompanyStats() {
  const query = `
    SELECT 
      e.company,
      COUNT(*) as count
    FROM current_presence cp
    JOIN employees e ON cp.employee_id = e.id
    WHERE cp.is_inside = true AND e.company IS NOT NULL
    GROUP BY e.company
    ORDER BY count DESC
    LIMIT 10
  `;
  
  const result = await pool.query(query);
  return result.rows;
}

export default {
  getDashboardStats,
  getCategoryStats,
  getFullDashboardData,
  processAccessEvent,
  getCompanyStats,
};
