import "dotenv/config";
import express from "express";
import path from "path";
import cors from "cors";
import connectDB from "./config/database";
import authRoutes from "./routes/auth";
import attendanceRoutes from "./routes/attendance";
import { handleDemo } from "./routes/demo";
import taskRoutes from "./routes/tasks";
import notificationRoutes from "./routes/notifications";
import leaveRoutes from "./routes/leave";
import profileRoutes from "./routes/profile";
import shiftsRoutes from "./routes/shifts";
import chatRoutes from "./routes/chat";
import payrollRoutes from "./routes/payroll";
import salariesRoutes from "./routes/salaries";
import adminRoutes from "./routes/admin";
import performanceRoutes from "./routes/performance";
import ownerRoutes from "./routes/owner";
import usersRoutes from "./routes/users";
import hrRoutes from "./routes/hr";

export async function createServer() {
  const app = express();

  // Connect to MongoDB
  await connectDB();

  // Enhanced CORS configuration
  const corsOptions = {
    origin: [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://0.0.0.0:3000',
      'http://10.0.2.2:3000',
      'http://localhost',
      'http://localhost:*',
      'http://10.0.2.2',
      'http://10.0.2.2:*',
      /^http:\/\/192\.168\..*$/,  // Allow any local network IP starting with 192.168.
      /^http:\/\/10\..*$/,        // Allow any local network IP starting with 10.
      /^http:\/\/localhost:[0-9]+$/, // Allow any localhost port
      /^http:\/\/127\.0\.0\.1:[0-9]+$/, // Allow any 127.0.0.1 port
      /^http:\/\/192\.168\.[0-9]+\.[0-9]+:[0-9]+$/ // Allow any local IP with any port
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    optionsSuccessStatus: 200
  };

  // Middleware
  app.use(cors(corsOptions));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Static uploads serving
  app.use("/uploads", express.static(path.resolve("uploads")));

  // Example API routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  app.get("/api/demo", handleDemo);

  // Authentication routes
  app.use("/api/auth", authRoutes);

  // Attendance routes
  app.use("/api/attendance", attendanceRoutes);

  // Task management routes
  app.use("/api/tasks", taskRoutes);

  // Notifications routes
  app.use("/api/notifications", notificationRoutes);

  // Leave management routes
  app.use("/api/leave", leaveRoutes);

  // Profile routes
  app.use("/api/profile", profileRoutes);

  // Shifts routes
  app.use("/api/shifts", shiftsRoutes);

  // Chat routes
  app.use("/api/chat", chatRoutes);

  // Payroll routes (salary plans, work logs, monthly salary)
  app.use("/api/payroll", payrollRoutes);

  // Salaries routes (salary generation, management)
  app.use("/api/salaries", salariesRoutes);

  // Admin utilities
  app.use("/api/admin", adminRoutes);

  // Performance management routes
  app.use("/api/performance", performanceRoutes);

  // Owner dashboard routes
  app.use("/api/owner", ownerRoutes);

  // Users management routes
  app.use("/api/users", usersRoutes);

  // HR management routes
  app.use("/api/hr", hrRoutes);

  return app;
}
