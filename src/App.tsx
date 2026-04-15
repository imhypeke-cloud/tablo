import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Users, ArrowDownToLine, ArrowUpFromLine, Clock, Building2, Wind, Thermometer } from 'lucide-react';

interface Stats {
  currentlyOnSite: number;
  enteredToday: number;
  exitedToday: number;
  byCategory: Record<string, number>;
  recentEvents: Array<{
    id: number;
    name: string;
    category: string;
    direction: 'IN' | 'OUT';
    timestamp: string;
    gate_id: string;
  }>;
}

interface Weather {
  temp: number;
  condition: string;
  city: string;
  wind: string;
  humidity: string;
}

function App() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const socket: Socket = io();

    socket.on('stats_update', (data: Stats) => {
      setStats(data);
    });

    fetch('/api/weather')
      .then(res => res.json())
      .then(setWeather);

    const timer = setInterval(() => setCurrentTime(new Date()), 1000);

    return () => {
      socket.disconnect();
      clearInterval(timer);
    };
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('ru-RU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  };

  const formatEventTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  };

  if (!stats) {
    return <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
      <div className="text-white text-2xl">Загрузка...</div>
    </div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="flex justify-between items-center bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">ACS Live Dashboard</h1>
            <p className="text-slate-400">{formatDate(currentTime)}</p>
          </div>
          <div className="text-right">
            <div className="text-4xl font-mono font-bold text-cyan-400">{formatTime(currentTime)}</div>
            {weather && (
              <div className="flex items-center gap-2 text-slate-300 mt-2 justify-end">
                <Thermometer size={16} />
                <span>{weather.temp}°C</span>
                <Wind size={16} />
                <span>{weather.wind}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Stats Cards */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        {/* Currently On Site */}
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-6 shadow-xl transform hover:scale-105 transition-transform">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-emerald-100 text-sm font-medium mb-1">На объекте</p>
              <p className="text-5xl font-bold text-white">{stats.currentlyOnSite}</p>
              <p className="text-emerald-100 text-xs mt-2">человек сейчас</p>
            </div>
            <Users size={64} className="text-emerald-200 opacity-50" />
          </div>
        </div>

        {/* Entered Today */}
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-6 shadow-xl transform hover:scale-105 transition-transform">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm font-medium mb-1">Вошли сегодня</p>
              <p className="text-5xl font-bold text-white">{stats.enteredToday}</p>
              <ArrowDownToLine size={64} className="text-blue-200 opacity-50" />
            </div>
          </div>
        </div>

        {/* Exited Today */}
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-6 shadow-xl transform hover:scale-105 transition-transform">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-orange-100 text-sm font-medium mb-1">Вышли сегодня</p>
              <p className="text-5xl font-bold text-white">{stats.exitedToday}</p>
              <ArrowUpFromLine size={64} className="text-orange-200 opacity-50" />
            </div>
          </div>
        </div>
      </div>

      {/* Secondary Row */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By Category */}
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700">
          <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Building2 size={24} className="text-cyan-400" />
            По категориям
          </h3>
          <div className="grid grid-cols-2 gap-4">
            {Object.entries(stats.byCategory).map(([category, count]) => (
              <div key={category} className="bg-slate-700/50 rounded-xl p-4">
                <p className="text-slate-400 text-sm mb-1">{category}</p>
                <p className="text-3xl font-bold text-cyan-400">{count}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Events */}
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700">
          <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Clock size={24} className="text-cyan-400" />
            Последние события
          </h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {stats.recentEvents.map((event) => (
              <div key={event.id} className="flex items-center justify-between bg-slate-700/30 rounded-lg p-3 hover:bg-slate-700/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${event.direction === 'IN' ? 'bg-emerald-400' : 'bg-orange-400'}`} />
                  <div>
                    <p className="text-white font-medium">{event.name}</p>
                    <p className="text-slate-400 text-xs">{event.category} • {event.gate_id}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`px-2 py-1 rounded text-xs font-bold ${event.direction === 'IN' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-orange-500/20 text-orange-400'}`}>
                    {event.direction === 'IN' ? 'ВХОД' : 'ВЫХОД'}
                  </span>
                  <p className="text-slate-400 text-xs mt-1">{formatEventTime(event.timestamp)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
