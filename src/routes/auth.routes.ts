import type { Request, Response, NextFunction } from 'express';
import BaseRouter, { type RouteConfig } from "@routes/router.js";
import { SignupRequest, LoginRequest, VerifyEmailRequest, ResendOtpRequest } from '@schemas/auth.schema.js'; 
import { 
  authController, 
  authMiddleware,
  CsrfMiddleware,
  ValidationMiddleware
} from '@container.js';
import Send from '@utils/logging/response.utils.js';

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
          CsrfMiddleware.verifyCrsfToken,
          ValidationMiddleware.validate(LoginRequest)
        ],
        handler: authController.login.bind(authController)
      },
      {
        method: "post",
        path: "/register",
        middleware: [
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
          CsrfMiddleware.verifyCrsfToken,
          authMiddleware.verifyRefreshToken
        ],
        handler: authController.refresh.bind(authController)
      },
      {
        method: "post",
        path: "/verify-email",
        middleware: [
          CsrfMiddleware.verifyCrsfToken,
          ValidationMiddleware.validate(VerifyEmailRequest)
        ],
        handler: authController.verify.bind(authController)
      },
      {
        method: "post",
        path: "/resend-otp",
        middleware: [
          CsrfMiddleware.verifyCrsfToken,
          ValidationMiddleware.validate(ResendOtpRequest)
        ],
        handler: authController.resendOtp.bind(authController)
      },
    ];
  }
}

export default new AuthRouter().router;