/**
 * Сервис погоды - получение данных о погоде
 */
import axios from 'axios';
import config from './config.js';

let cachedWeather = null;
let lastUpdate = 0;

/**
 * Получить данные о погоде
 */
export async function getWeather() {
  const now = Date.now();
  
  // Возвращаем кэшированные данные, если прошло меньше интервала обновления
  if (cachedWeather && (now - lastUpdate) < config.weather.updateInterval) {
    return cachedWeather;
  }
  
  try {
    // Если API ключ не настроен, возвращаем демо-данные
    if (!config.weather.apiKey || config.weather.apiKey === 'your_api_key_here') {
      cachedWeather = {
        temp: 18,
        feelsLike: 16,
        description: 'Ясно',
        icon: '01d',
        humidity: 65,
        pressure: 760,
        windSpeed: 3.5,
        timestamp: new Date().toISOString(),
      };
      lastUpdate = now;
      return cachedWeather;
    }
    
    const url = `https://api.openweathermap.org/data/2.5/weather`;
    const params = {
      lat: config.weather.lat,
      lon: config.weather.lon,
      appid: config.weather.apiKey,
      units: 'metric',
      lang: 'ru',
    };
    
    const response = await axios.get(url, { params });
    const data = response.data;
    
    cachedWeather = {
      temp: Math.round(data.main.temp),
      feelsLike: Math.round(data.main.feels_like),
      description: data.weather[0].description,
      icon: data.weather[0].icon,
      humidity: data.main.humidity,
      pressure: Math.round(data.main.pressure / 133.322), // в мм рт. ст.
      windSpeed: data.wind.speed,
      timestamp: new Date().toISOString(),
    };
    
    lastUpdate = now;
    console.log('✅ Погода обновлена:', cachedWeather.temp + '°C');
    
    return cachedWeather;
  } catch (error) {
    console.error('❌ Ошибка получения погоды:', error.message);
    
    // Возвращаем последние успешные данные или дефолтные
    if (cachedWeather) {
      return cachedWeather;
    }
    
    return {
      temp: 20,
      feelsLike: 18,
      description: 'Нет данных',
      icon: '01d',
      humidity: 0,
      pressure: 0,
      windSpeed: 0,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Принудительно обновить погоду
 */
export async function refreshWeather() {
  lastUpdate = 0;
  return await getWeather();
}

export default {
  getWeather,
  refreshWeather,
};
