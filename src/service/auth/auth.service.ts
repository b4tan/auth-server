import type { IAuthRepository } from '@repositories/auth.repository.js';
import type { ITokenUtils } from '@utils/crypto/token.utils.js';
import type { IPasswordUtils } from '@utils/crypto/password.utils.js';
import type { TokenPayload } from '@utils/crypto/token.utils.js';
import type { UserCredentials, RefreshSession } from '@prisma/client';
import type { IOTPStrategy, OtpChannel, OtpSendResult, OtpVerifyResult } from '@service/auth/otp/otp-strategy.interface.js';
import { AuthErrors, AuthError } from '@errors/auth.error.js';
import logger from '@utils/logging/logger.utils.js';

// We have to orchestrate this class when adding OTP so doesn't violate Single Responsibility Principle

export interface LoginResult {
  user: { id: string; email: string; role: string; scope: string[] };
  accessToken: string;
  refreshToken: string;
}

export interface RegisterResult {
  user: { id: string; email: string };
}

export interface SendOtpResult {
  success: boolean;
  expiresAt: Date;
  channel: OtpChannel;
  providerSid?: string;
}

export interface VerifyOtpResult {
  success: boolean;
  remainingAttempts?: number;
  lockedUntil?: Date;
}

type OtpProviderFactory = (channel: OtpChannel) => IOTPStrategy;

export class AuthService {
    constructor(
        private authRepo: IAuthRepository,
        private tokenUtils: ITokenUtils,
        private passwordUtils: IPasswordUtils,
        private createOtpProvider: OtpProviderFactory,
    ) {}

    private async createAuthTokens(user: UserCredentials): Promise<{ accessToken: string; refreshToken: string }> {
        const payload = this.tokenUtils.userToTokenPayload(user);
        const accessToken = this.tokenUtils.generateAccessToken(payload);
        const refreshToken = this.tokenUtils.generateRefreshToken();
        const refreshTokenHash = this.tokenUtils.hashRefreshToken(refreshToken);

        await this.authRepo.createRefreshSession({
            userId: user.id,
            tokenHash: refreshTokenHash,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
        });

        return { accessToken, refreshToken };
    }

    async login(email: string, password: string): Promise<LoginResult> {
        logger.debug("Login attempt", { email });

        // 1. Find user
        const user = await this.authRepo.findUserByEmail(email);
        if (!user) {
            throw AuthErrors.invalidCredentials();
        }

        // 2. Verify password
        const isPasswordValid = await this.passwordUtils.comparePassword(password, user.passwordHash);
        if (!isPasswordValid) {
            throw AuthErrors.invalidCredentials();
        }

        // 3. Check email verification
        if (!user.emailVerified) {
            throw AuthErrors.emailNotVerified();
        }

        // 4. Generate tokens
        const { accessToken, refreshToken } = await this.createAuthTokens(user);

        logger.info("Login successful", {
            userId: user.id,
            email: user.email,
            role: user.role,
        });

        return {
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                scope: user.scope
            },
            accessToken,
            refreshToken
        };
    }

    async register(email: string, password: string, phone: string): Promise<RegisterResult> {
      logger.debug("Registration attempt", { email, phone });

      // 1. Check if user exists
      const existingUser = await this.authRepo.findUserByEmail(email);
      if (existingUser) {
          throw AuthErrors.emailInUse();
      }

      // 2. Hash password
      const hashedPassword = await this.passwordUtils.hashPassword(password);

      // 3. Create user
      const newUser = await this.authRepo.createUser({
          email,
          password: hashedPassword,
          phone,
          role: 'worker',
          scope: []
      });

      await this.sendOtp(email, "email"); // Send email verification OTP

      logger.info("User registered", {
          userId: newUser.id,
          email: newUser.email,
      });

      return {
          user: {
          id: newUser.id,
          email: newUser.email
          }
      };
      }

    async logout(userId: string, refreshToken?: string): Promise<void> {
    if (refreshToken) {
        const refreshTokenHash = this.tokenUtils.hashRefreshToken(refreshToken);
        await this.authRepo.revokeRefreshSession(refreshTokenHash);
        logger.debug("User logged out", { userId });
        }
    }

    async refreshToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
        logger.debug("Token refresh attempt");

        // Hash incoming refresh token
        const oldTokenHash = this.tokenUtils.hashRefreshToken(refreshToken);
        
        // Find session by old hash (include user)
        const session = await this.authRepo.findRefreshSessionByHash(oldTokenHash);

        if (!session) {
            throw AuthErrors.invalidRefreshToken();
        }

        // Reject if revoked
        if (session.revokedAt) {
            throw AuthErrors.refreshTokenRevoked();
        }

        // Reject if expired
        if (session.expiresAt < new Date()) {
            throw AuthErrors.refreshTokenExpired();
        }

        // Generate new refresh token and hash
        const newRefreshToken = this.tokenUtils.generateRefreshToken();
        const newTokenHash = this.tokenUtils.hashRefreshToken(newRefreshToken);
        const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

        // Rotate token: atomically update the same session row
        // Retry once if collision occurs (extremely rare)
        try {
            await this.authRepo.rotateRefreshSession(oldTokenHash, newTokenHash, newExpiresAt);
        } catch (error) {
            // Handle refreshTokenCollision by retrying once with a new token
            if (error instanceof AuthError && error.code === 'REFRESH_TOKEN_COLLISION') {
                const retryToken = this.tokenUtils.generateRefreshToken();
                const retryTokenHash = this.tokenUtils.hashRefreshToken(retryToken);
                await this.authRepo.rotateRefreshSession(oldTokenHash, retryTokenHash, newExpiresAt);
                // Use retry token
                const payload = this.tokenUtils.userToTokenPayload(session.user);
                return {
                    accessToken: this.tokenUtils.generateAccessToken(payload),
                    refreshToken: retryToken,
                };
            }
            // For all other errors (including AuthErrors and unknown errors), re-throw as-is
            // This ensures domain errors bubble up correctly and unknown errors become 500
            throw error;
        }

        // Generate new access token
        const payload = this.tokenUtils.userToTokenPayload(session.user);
        
        logger.debug("Token refresh successful", {
            userId: session.user.id,
        });

        return {
            accessToken: this.tokenUtils.generateAccessToken(payload),
            refreshToken: newRefreshToken,
        };
    }

    async getUserById(userId: string): Promise<{ id: string; email: string; role: string; scope: string[] }> {
        const user = await this.authRepo.findUserById(userId);
        
        if (!user) {
        throw AuthErrors.userNotFound();
        }

        return {
        id: user.id,
        email: user.email,
        role: user.role,
        scope: user.scope
        };
    }


    private getOtpProvider(channel: OtpChannel): IOTPStrategy {
        return this.createOtpProvider(channel);
    }

    async sendOtp(identifier: string, channel: OtpChannel): Promise<SendOtpResult> {
        logger.debug("OTP send request", { identifier, channel });

        const otpProvider = this.getOtpProvider(channel);
        
        // If switching channels, invalidate the previous channel's OTP
        await this.invalidateOtherChannelOtps(identifier, channel);
        
        const result: OtpSendResult = await otpProvider.sendOtp(identifier);
        
        const sendResult: SendOtpResult = {
            success: result.success,
            expiresAt: result.expiresAt,
            channel,
        };
        
        if (result.providerSid !== undefined) {
            sendResult.providerSid = result.providerSid;
        }

        logger.info("OTP sent", {
            identifier,
            channel,
            expiresAt: result.expiresAt,
        });
        
        return sendResult;
    }

    async verifyOtp(identifier: string, code: string, channel: OtpChannel): Promise<VerifyOtpResult> {
        const otpProvider = this.getOtpProvider(channel);
        const result: OtpVerifyResult = await otpProvider.verifyOtp(identifier, code);
        
        const verifyResult: VerifyOtpResult = {
            success: result.success,
        };
        
        if (result.remainingAttempts !== undefined) {
            verifyResult.remainingAttempts = result.remainingAttempts;
        }
        
        if (result.lockedUntil !== undefined) {
            verifyResult.lockedUntil = result.lockedUntil;
        }
        
        return verifyResult;
    }

    private async invalidateOtherChannelOtps(identifier: string, currentChannel: OtpChannel): Promise<void> {
        // Only email channel is supported, no other channels to invalidate
        return;
    }

    private async invalidatePendingEmailOtp(email: string): Promise<void> {
        const emailOtp = await this.authRepo.findOtpbyEmail(email);
        if (emailOtp?.status === 'pending') {
            await this.authRepo.upsertEmailOtp(email, { status: 'expired' });
        }
    }


    async verifyEmailAfterOtp(email: string): Promise<void> {
        const emailOtp = await this.authRepo.findOtpbyEmail(email);
        if (!emailOtp || emailOtp.status !== 'verified') {
            throw AuthErrors.emailOtpNotVerified();
        }
        
        await this.authRepo.verifyUserEmail(email);
    }


    async verifyOtpAndLogin(identifier: string, code: string, channel: OtpChannel): Promise<LoginResult> {
        logger.debug("OTP verification and login attempt", { identifier, channel });

        // 1. Verify OTP
        const verifyOtpResult = await this.verifyOtp(identifier, code, channel);
        if (!verifyOtpResult.success) {
            if (verifyOtpResult.lockedUntil) {
                throw AuthErrors.otpLocked(verifyOtpResult.lockedUntil);
            }
            throw AuthErrors.invalidOtp();
        }

        // 2. Mark identifier as verified based on channel
        await this.verifyEmailAfterOtp(identifier);

        // 3. Get user by identifier
        const user = await this.authRepo.findUserByEmail(identifier);
        
        if (!user) {
            throw AuthErrors.userNotFound();
        }

        // 4. Generate tokens
        const { accessToken, refreshToken } = await this.createAuthTokens(user);

        logger.info("OTP verified and login successful", {
            userId: user.id,
            identifier,
            channel,
        });

        return {
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                scope: user.scope
            },
            accessToken,
            refreshToken
        };
    }
}