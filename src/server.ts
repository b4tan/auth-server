import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import appConfig from '@config/app.config.js';
import healthRoutes from '@routes/health.routes.js';
import authRoutes from '@routes/auth.routes.js';
import userRoutes from '@routes/user.routes.js';
import { requestIdMiddleware } from '@middleware/request-id.middleware.js';
import { requestLoggerMiddleware } from '@middleware/request-logger.middleware.js';
import logger from '@utils/logging/logger.utils.js';
import type { Express, Request, Response } from 'express';

class Server {
  private app: Express;

  constructor() {
    this.app = express();
    this.initMiddleware();
    this.initRoutes();
  }
  private initMiddleware(): void {
    this.app.use(requestIdMiddleware);
    this.app.use(requestLoggerMiddleware);
    
    this.app.use(cors({
      origin: [
        'http://localhost:3000', // frontend
        'https://bisa.com'
      ],
      methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
      exposedHeaders: ['X-CSRF-Token', 'X-Request-ID'], // Expose CSRF token and Request ID headers to frontend
      credentials: true,
    }));
    
    this.app.use(express.json());
    this.app.use(cookieParser() as express.RequestHandler);
  }

  private initRoutes(): void {
    // Health check routes (root and /health)
    this.app.use("/", healthRoutes);

    // API routes - mounted with prefixes
    this.app.use("/api/auth", authRoutes);
    this.app.use("/api/user", userRoutes);
    
    // 404 handler for unmatched routes - MUST be last
    // No path parameter means it catches all unmatched routes
    this.app.use((req: Request, res: Response) => {
      // Only handle if response hasn't been sent
      if (!res.headersSent) {
        res.status(404).json({
          ok: false,
          message: "Route not found",
          path: req.path,
          method: req.method
        });
      }
    });
  }

  // TODO: 
  // implement serverless here

  public start(): void {
    const { port, host } = appConfig;

    this.app.listen(port, host, () => {
        logger.info(`Server is running on http://${host}:${port}`);
    })
}

}
export default Server;