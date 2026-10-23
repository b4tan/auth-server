// csrf.middleware.ts
import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import Send from "@utils/logging/response.utils.js";
import { getCsrfTokenCookieOptions } from "@utils/auth/cookie.utils.js";
import logger from "@utils/logging/logger.utils.js";

function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

class CsrfMiddleware {
  static generateCrsfToken(req: Request, res: Response, next: NextFunction) {
    const token = crypto.randomBytes(32).toString("hex");

    res.cookie("csrf-token", token, getCsrfTokenCookieOptions());

    res.setHeader("X-CSRF-Token", token);

    next();
  }

  static verifyCrsfToken(req: Request, res: Response, next: NextFunction) {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();

    const cookieToken = req.cookies?.["csrf-token"];
    const headerToken = req.header("X-CSRF-Token");

    if (!cookieToken || !headerToken) {
      logger.warn("CSRF token missing", {
        requestId: req.requestId,
        method: req.method,
        path: req.path,
      });
      return Send.forbidden(res, { message: "CSRF token missing" });
    }
    if (!safeEqual(cookieToken, headerToken)) {
      logger.warn("CSRF token mismatch", {
        requestId: req.requestId,
        method: req.method,
        path: req.path,
      });
      return Send.forbidden(res, { message: "CSRF token mismatch" });
    }
    next();
  }
}

export default CsrfMiddleware;
