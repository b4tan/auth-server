import type { Request, Response, NextFunction } from 'express';
import BaseRouter, { type RouteConfig } from "@routes/router.js";
import { SignupRequest, LoginRequest, VerifyEmailRequest, ResendOtpRequest } from '@schemas/auth.schema.js'; 
import { 
  authController, 
  authMiddleware,
  CsrfMiddleware,
  ValidationMiddleware,
  rateLimit
} from '@container.js';
import { byEmail } from '@middleware/ratelimit.middleware.js';
import rateLimitConfig from '@config/ratelimit.config.js';
import Send from '@utils/logging/response.utils.js';

const { policies } = rateLimitConfig;

class AuthRouter extends BaseRouter {
  protected routes(): RouteConfig[] {
    return [
      {
        method: "get",
        path: "/csrf-token",
        middleware: [
          CsrfMiddleware.generateCrsfToken
        ],
        handler: (req: Request, res: Response) => {
          return Send.success(res, { message: "CSRF token generated" });
        }
      },
      {
        method: "post",
        path: "/login",
        middleware: [
          rateLimit('login-ip', policies.loginPerIp),
          rateLimit('login-email', policies.loginPerEmail, byEmail),
          CsrfMiddleware.verifyCrsfToken,
          ValidationMiddleware.validate(LoginRequest)
        ],
        handler: authController.login.bind(authController)
      },
      {
        method: "post",
        path: "/register",
        middleware: [
          rateLimit('register-ip', policies.registerPerIp),
          CsrfMiddleware.verifyCrsfToken,
          ValidationMiddleware.validate(SignupRequest)
        ],
        handler: authController.register.bind(authController)
      },
      {
        method: "post",
        path: "/logout",
        middleware: [
          CsrfMiddleware.verifyCrsfToken,
          authMiddleware.verifyRefreshToken,
        ],
        handler: authController.logout.bind(authController)
      },
      {
        method: "post",
        path: "/refresh-token",
        middleware: [
          rateLimit('refresh-ip', policies.refreshPerIp),
          CsrfMiddleware.verifyCrsfToken,
          authMiddleware.verifyRefreshToken
        ],
        handler: authController.refresh.bind(authController)
      },
      {
        method: "post",
        path: "/verify-email",
        middleware: [
          rateLimit('verify-ip', policies.verifyPerIp),
          CsrfMiddleware.verifyCrsfToken,
          ValidationMiddleware.validate(VerifyEmailRequest)
        ],
        handler: authController.verify.bind(authController)
      },
      {
        method: "post",
        path: "/resend-otp",
        middleware: [
          rateLimit('otp-ip', policies.otpPerIp),
          rateLimit('otp-email', policies.otpPerEmail, byEmail),
          CsrfMiddleware.verifyCrsfToken,
          ValidationMiddleware.validate(ResendOtpRequest)
        ],
        handler: authController.resendOtp.bind(authController)
      },
    ];
  }
}

export default new AuthRouter().router;