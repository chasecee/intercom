const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const port = Number(process.env.PORT || 3001);
const origins = (process.env.ALLOWED_ORIGINS || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const app = express();

app.use(
  cors({
    origin: origins,
    methods: ["GET", "POST"],
    credentials: true,
  }),
);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: origins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

const devices = new Map();

const broadcastDeviceList = () => {
  const deviceList = Array.from(devices.values()).map((device) => ({
    deviceId: device.deviceId,
    displayName: device.displayName,
    online: true,
  }));
  io.emit("device-list", deviceList);
};

io.on("connection", (socket) => {
  socket.on("register-device", (payload) => {
    const { displayName } = payload || {};
    if (typeof displayName !== "string" || !displayName.trim()) return;

    devices.set(socket.id, {
      deviceId: socket.id,
      displayName: displayName.trim(),
    });

    broadcastDeviceList();
  });

  socket.on("update-device-name", (payload) => {
    const { displayName } = payload || {};
    if (typeof displayName !== "string" || !displayName.trim()) return;

    const device = devices.get(socket.id);
    if (device) {
      device.displayName = displayName.trim();
      broadcastDeviceList();
    }
  });

  socket.on("signal", (payload) => {
    const { callId, fromDeviceId, targetDeviceId, data } = payload || {};

    if (targetDeviceId && typeof targetDeviceId === "string") {
      const targetSocket = Array.from(io.sockets.sockets.values()).find(
        (s) => s.id === targetDeviceId
      );
      if (targetSocket) {
        targetSocket.emit("signal", {
          callId,
          fromDeviceId,
          targetDeviceId,
          data,
        });
      }
    } else {
      const { room, data: roomData } = payload || {};
      if (typeof room === "string") {
        const trimmed = room.trim();
        if (trimmed && roomData) {
          socket.to(trimmed).emit("signal", roomData);
        }
      }
    }
  });

  socket.on("disconnect", () => {
    if (devices.has(socket.id)) {
      devices.delete(socket.id);
      broadcastDeviceList();
    }
  });
});

server.listen(port, () => {
  console.log(`signaling listening on ${port}`);
});


