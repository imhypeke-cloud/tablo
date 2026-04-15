/**
 * Скрипт миграции базы данных
 */
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pkg from 'pg';
const { Pool } = pkg;
import config from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigrations() {
  console.log('🔄 Запуск миграций...');

  const pool = new Pool({
    host: config.db.host,
    port: config.db.port,
    database: config.db.database,
    user: config.db.user,
    password: config.db.password,
  });

  try {
    // Проверка подключения
    await pool.query('SELECT NOW()');
    console.log('✅ Подключено к базе данных');

    // Чтение SQL файла миграции
    const migrationPath = join(__dirname, '../migrations/001_initial_schema.sql');
    const sql = await readFile(migrationPath, 'utf-8');

    // Выполнение миграции
    await pool.query(sql);
    console.log('✅ Миграция успешно выполнена');

    // Проверка создания таблиц
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);

    console.log('📊 Созданные таблицы:');
    tables.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });

  } catch (error) {
    console.error('❌ Ошибка миграции:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
    console.log('👋 Завершение работы');
  }
}

runMigrations();
