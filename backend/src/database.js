/**
 * Подключение к базе данных PostgreSQL
 */
import pkg from 'pg';
const { Pool } = pkg;
import config from './config.js';

const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
  max: 20, // максимальное количество подключений
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Проверка подключения
pool.on('connect', () => {
  console.log('✅ Подключено к базе данных PostgreSQL');
});

pool.on('error', (err) => {
  console.error('❌ Ошибка подключения к БД:', err.message);
  process.exit(-1);
});

// Тестовое подключение
export async function testConnection() {
  try {
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    console.log('✅ База данных готова к работе');
    return true;
  } catch (err) {
    console.error('❌ Ошибка подключения к БД:', err.message);
    return false;
  }
}

export default pool;
