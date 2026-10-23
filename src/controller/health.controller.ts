import Send from "@utils/logging/response.utils.js";
import type { Request, Response } from "express";
import appConfig from "@config/app.config.js";

/**
 * Health check controller
 * Handles root path and health check endpoints
 * Follows SRP: single responsibility for health/status responses
 */
export class HealthController {

  getRoot = (req: Request, res: Response): void => {
    Send.success(res, {
      message: "BISA Backend API",
      version: "1.0.0",
      status: "operational",
      endpoints: {
        auth: "/api/auth",
        user: "/api/user",
        health: "/health"
      }
    }, "API is running");
  };

  getHealth = (req: Request, res: Response): void => {
    Send.success(res, {
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || "development",
      server: {
        host: appConfig.host,
        port: appConfig.port
      }
    }, "Server is healthy");
  };
}

