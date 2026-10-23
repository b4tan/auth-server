import "express";

// Global type augmentation - no imports/exports needed
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: string;
        scope: string[];
        claims?: Record<string, unknown>;
      };
      requestId?: string;
    }
  }
}

export {};
