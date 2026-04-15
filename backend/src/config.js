/**
 * Конфигурация приложения
 */
import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Приложение
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  siteName: process.env.SITE_NAME || 'СТРОЙПЛОЩАДКА A',
  
  // База данных
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'construction_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  },
  
  // Redis
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  
  // Weather API
  weather: {
    apiKey: process.env.WEATHER_API_KEY || '',
    lat: process.env.WEATHER_LAT || '55.7558',
    lon: process.env.WEATHER_LON || '37.6173',
    updateInterval: parseInt(process.env.WEATHER_UPDATE_INTERVAL || '600000', 10),
  },
  
  // CORS
  corsOrigin: process.env.CORS_ORIGIN || '*',
  
  // Логирование
  logLevel: process.env.LOG_LEVEL || 'info',
};

export default config;
