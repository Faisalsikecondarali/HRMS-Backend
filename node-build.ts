import path from "path";
import { createServer } from "./index";
import * as express from "express";
import http from "http";
import { initSocket } from "./realtime/socket";
import fs from "fs";

async function startServer() {
  const app = await createServer();
  const port = (process.env.PORT ? Number(process.env.PORT) : 3000);

  // In production, serve the built SPA files
  const __dirname = import.meta.dirname;
  const distPath = path.join(__dirname, "../spa");

  const spaIndexPath = path.join(distPath, "index.html");
  const hasSpaBuild = fs.existsSync(spaIndexPath);

  if (hasSpaBuild) {
    // Serve static files
    app.use(express.static(distPath));

    // Handle React Router - serve index.html for all non-API routes
    app.get("*", (req, res) => {
      // Don't serve index.html for API routes
      if (req.path.startsWith("/api/") || req.path.startsWith("/health")) {
        return res.status(404).json({ error: "API endpoint not found" });
      }

      res.sendFile(spaIndexPath);
    });
  }

  const server = http.createServer(app);
  initSocket(server);
  server.listen(port, "0.0.0.0", () => {
    console.log(`🚀 Attendance System server running on 0.0.0.0:${port}`);
    console.log(`📱 Frontend: http://0.0.0.0:${port}`);
    console.log(`🔧 API: http://0.0.0.0:${port}/api`);
  });
}

startServer().catch(console.error);

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("🛑 Received SIGTERM, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("🛑 Received SIGINT, shutting down gracefully");
  process.exit(0);
});
