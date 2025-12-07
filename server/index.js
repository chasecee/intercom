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

io.on("connection", (socket) => {
  socket.on("join", (room) => {
    if (typeof room !== "string") return;
    const trimmed = room.trim();
    if (!trimmed) return;
    socket.join(trimmed);
    socket.data.room = trimmed;
  });

  socket.on("signal", (payload) => {
    const { room, data } = payload || {};
    if (typeof room !== "string") return;
    const trimmed = room.trim();
    if (!trimmed || !data) return;
    socket.to(trimmed).emit("signal", data);
  });

  socket.on("disconnect", () => {
    if (socket.data.room) {
      socket.leave(socket.data.room);
    }
  });
});

server.listen(port, () => {
  console.log(`signaling listening on ${port}`);
});


