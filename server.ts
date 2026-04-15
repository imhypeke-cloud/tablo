import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import * as db from "./db.ts";
import * as acsService from "./acsService.ts";
import dotenv from 'dotenv';

// Загружаем переменные окружения
dotenv.config();

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    },
  });

  const PORT = process.env.PORT || 3000;
  
  // Проверка подключения к СКУД
  const acsConnected = await acsService.checkConnection();
  console.log(`ACS Gateway Connection: ${acsConnected ? 'Connected' : 'Offline (using simulation)'}`);

  app.use(cors());
  app.use(express.json());

  // API Routes
  app.get("/api/stats", async (req, res) => {
    try {
      if (acsConnected) {
        const stats = await acsService.getLiveStats();
        res.json(stats);
      } else {
        res.json(db.getStats());
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  app.get("/api/events", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      if (acsConnected) {
        const events = await acsService.getRecentEvents(limit);
        res.json(events);
      } else {
        const stats = db.getStats();
        res.json(stats.recentEvents);
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch events" });
    }
  });

  app.get("/api/weather", (req, res) => {
    // Mock weather data
    res.json({
      temp: 22,
      condition: "Partly Cloudy",
      city: "Site Alpha",
      wind: "12 km/h",
      humidity: "58%"
    });
  });

  // Socket.io
  io.on("connection", (socket) => {
    console.log("Dashboard connected:", socket.id);
    
    // Отправляем статистику при подключении
    if (acsConnected) {
      acsService.getLiveStats().then(stats => {
        socket.emit("stats_update", stats);
      });
    } else {
      socket.emit("stats_update", db.getStats());
    }
    
    socket.on("disconnect", () => {
      console.log("Dashboard disconnected");
    });
  });

  // ACS Event Polling (если подключены к реальному API)
  if (acsConnected) {
    setInterval(async () => {
      try {
        const stats = await acsService.getLiveStats();
        io.emit("stats_update", stats);
      } catch (err) {
        console.error("ACS polling error:", err);
      }
    }, 5000); // Опрос каждые 5 секунд
  } else {
    // ACS Event Simulator (режим симуляции)
    setInterval(() => {
      try {
        const employee = db.getRandomEmployee();
        if (!employee) return;
        
        const lastDir = db.getEmployeeLastDirection(employee.id);
        const newDir = lastDir === 'IN' ? 'OUT' : 'IN';
        const gateId = `CP-${Math.floor(Math.random() * 4) + 1}`;
        
        const stats = db.recordEvent(employee.id, newDir, gateId);
        io.emit("stats_update", stats);
      } catch (err) {
        console.error("Simulation error:", err);
      }
    }, 4000);
  }

  // Vite Integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`>>> ACS Live Server running on port ${PORT}`);
  });
}

startServer().catch(console.error);
