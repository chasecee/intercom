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
  })
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

const sanitizeDeviceName = (name) => {
  if (typeof name !== "string") return null;
  return (
    name
      .trim()
      .slice(0, 50)
      .replace(/[<>\"'&]/g, "") || null
  );
};

io.on("connection", (socket) => {
  socket.on("register-device", (payload) => {
    if (!payload || typeof payload !== "object") return;
    const { displayName } = payload;
    const sanitized = sanitizeDeviceName(displayName);
    if (!sanitized) return;

    devices.set(socket.id, {
      deviceId: socket.id,
      displayName: sanitized,
    });

    broadcastDeviceList();
  });

  socket.on("update-device-name", (payload) => {
    if (!payload || typeof payload !== "object") return;
    const { displayName } = payload;
    const sanitized = sanitizeDeviceName(displayName);
    if (!sanitized) return;

    const device = devices.get(socket.id);
    if (device) {
      device.displayName = sanitized;
      broadcastDeviceList();
    }
  });

  socket.on("signal", (payload) => {
    if (!payload || typeof payload !== "object") return;
    const { callId, fromDeviceId, targetDeviceId, data } = payload;

    if (
      targetDeviceId &&
      typeof targetDeviceId === "string" &&
      targetDeviceId.length <= 100 &&
      fromDeviceId &&
      typeof fromDeviceId === "string" &&
      fromDeviceId.length <= 100 &&
      data
    ) {
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
