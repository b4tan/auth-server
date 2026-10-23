// Handles HTTP requests for authentication
import Send from "@utils/logging/response.utils.js";
import type { Request, Response } from "express";
import { LoginRequest, SignupRequest, VerifyEmailRequest, ResendOtpRequest } from "@schemas/auth.schema.js";
import { z } from "zod";
import { AuthService } from "@service/auth/auth.service.js";
import ErrorHandler from "@utils/logging/error-handler.utils.js";
import { getRefreshTokenCookieOptions, getCsrfTokenCookieOptions } from "@utils/auth/cookie.utils.js";

export class AuthController {
  constructor(private authService: AuthService) {}

  login = async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body as z.infer<typeof LoginRequest>;
      
      const result = await this.authService.login(email, password);

      // Access token is managed client-side -> set in headers
      res.cookie("refreshToken", result.refreshToken, getRefreshTokenCookieOptions());

      // Return access token in response body for client to store and send in Authorization header
      return Send.success(res, {
        user: result.user,
        accessToken: result.accessToken
      });
    } catch (error) {
      ErrorHandler.handleControllerError(res, error, "Login failed.");
    }
  }

  register = async (req: Request, res: Response) => {
    try {
      const { email, password, phone } = req.body as z.infer<typeof SignupRequest>;
      
      const result = await this.authService.register(email, password, phone);
      
      return Send.success(res, result.user, "User successfully registered.");
    } catch (error) {
      ErrorHandler.handleControllerError(res, error, "Registration failed.");
    }
  }

  logout = async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      const refreshToken = req.cookies.refreshToken;

      if (userId) {
        await this.authService.logout(userId, refreshToken);
      }

      // Clear refresh token cookie (access token is managed client-side)
      // Must use matching options for browsers to clear cookies reliably
      res.clearCookie("refreshToken", getRefreshTokenCookieOptions());
      res.clearCookie("csrf-token", getCsrfTokenCookieOptions());

      return Send.success(res, null, "Logged out successfully.");
    } catch (error) {
      ErrorHandler.handleControllerError(res, error, "Logout failed.");
    }
  }

  refresh = async (req: Request, res: Response) => {
    try {
      const refreshToken = req.cookies.refreshToken;

      if (!refreshToken) {
        return Send.unauthorized(res, { message: "Missing refresh token" });
      }

      const { accessToken, refreshToken: newRefreshToken } = await this.authService.refreshToken(refreshToken);

      // Set new refresh token cookie (rotation)
      res.cookie("refreshToken", newRefreshToken, getRefreshTokenCookieOptions());

      // Return new access token in response body for client to store and send in Authorization header
      return Send.success(res, { 
        accessToken,
        message: "Access token refreshed successfully" 
      });
    } catch (error) {
      ErrorHandler.handleControllerError(res, error, "Failed to refresh token");
    }
  }

  verify = async (req: Request, res: Response) => {
    try {
      const { email, otp } = req.body as z.infer<typeof VerifyEmailRequest>;
      
      const result = await this.authService.verifyOtpAndLogin(email, otp, 'email');

      res.cookie("refreshToken", result.refreshToken, getRefreshTokenCookieOptions());

      return Send.success(res, {
        user: result.user,
        accessToken: result.accessToken
      }, "Email verified successfully");
    } catch (error) {
      ErrorHandler.handleControllerError(res, error, "Email verification failed.");
    }
  }

  resendOtp = async (req: Request, res: Response) => {
    try {
      const { email } = req.body as z.infer<typeof ResendOtpRequest>;
      
      const result = await this.authService.sendOtp(email, 'email');
      
      return Send.success(res, {
        email,
        expiresAt: result.expiresAt,
        channel: result.channel
      }, "OTP resent successfully");
    } catch (error) {
      ErrorHandler.handleControllerError(res, error, "Resend OTP failed.");
    }
  }
}