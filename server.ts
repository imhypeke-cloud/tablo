import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import * as db from "./db.ts";

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    },
  });

  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // API Routes
  app.get("/api/stats", (req, res) => {
    try {
      res.json(db.getStats());
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch stats" });
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
    socket.emit("stats_update", db.getStats());
    
    socket.on("disconnect", () => {
      console.log("Dashboard disconnected");
    });
  });

  // ACS Event Simulator
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
