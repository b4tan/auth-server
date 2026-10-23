// Orchestrator for Email OTP operations (Business Logic)
import type { IOTPStrategy, OtpSendResult, OtpVerifyResult } from "@service/auth/otp/otp-strategy.interface.js";
import type { IEmailProvider } from "@providers/email.provider.js";
import type { IAuthRepository } from "@repositories/auth.repository.js";
import type { IOtpUtils } from "@utils/auth/otp.utils.js";
import type { IEmailTemplateUtils } from "@utils/auth/email-template.utils.js";
import EmailTemplateUtils from "@utils/auth/email-template.utils.js";
import { AuthErrors } from "@errors/auth.error.js";
import logger from "@utils/logging/logger.utils.js";

const OTP_EXPIRY_MINUTES = 15;
const MAX_ATTEMPTS = 3;
const LOCKOUT_MINUTES = 30;

export class EmailOtpProvider implements IOTPStrategy {
    channel = 'email' as const;

    constructor(
        private readonly emailProvider: IEmailProvider,
        private readonly authRepository: IAuthRepository,
        private readonly otpUtils: IOtpUtils,
        private readonly emailTemplateUtils: IEmailTemplateUtils = EmailTemplateUtils,
    ) {}

    async sendOtp(identifier: string): Promise<OtpSendResult> {
        const email = identifier;
        const now = new Date();

        const otpCode = this.otpUtils.generateOtp();
        const codeHash = this.otpUtils.hashOtpCode(otpCode);
        const expiresAt = new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60 * 1000);

        const otpRecord = await this.authRepository.findOtpbyEmail(email);
        if (otpRecord?.lockedUntil && otpRecord.lockedUntil > new Date()) {
          logger.warn("OTP send blocked - account locked", {
            email,
            lockedUntil: otpRecord.lockedUntil,
          });
          throw AuthErrors.otpLocked(otpRecord.lockedUntil);
        }

        await this.authRepository.upsertEmailOtp(email, {
            codeHash,
            expiresAt,
            status: 'pending',
        });

        await this.sendVerificationEmail(email, otpCode);

        logger.debug("OTP sent via email", {
            email,
            expiresAt,
        });

        return {
            success: true,
            expiresAt,
        };
    }
    // Revist this logic later
    async verifyOtp(identifier: string, code: string): Promise<OtpVerifyResult> {
        const email = identifier;
        const now = new Date();
        
        const otpRecord = await this.authRepository.findOtpbyEmail(email);
        if (!otpRecord) {
            logger.debug("OTP verification failed - no OTP record found", { email });
            return { success: false };
        }

        if (otpRecord.lockedUntil && otpRecord.lockedUntil > now) {
            logger.warn("OTP verification blocked - account locked", {
                email,
                lockedUntil: otpRecord.lockedUntil,
            });
            return {
                success: false,
                lockedUntil: otpRecord.lockedUntil,
            };
        }

        if (otpRecord.expiresAt < now) {
            await this.authRepository.upsertEmailOtp(email, {
                status: 'expired',
            });
            logger.debug("OTP verification failed - expired", { email });
            return { success: false };
        }

        const isValid = await this.otpUtils.verifyOtpCode(code, otpRecord.codeHash);
        
        if (!isValid) {
            const newAttempts = otpRecord.attempts + 1;
            const isMaxAttemptsReached = newAttempts >= MAX_ATTEMPTS;
            
            let lockedUntil: Date | null = null;
            if (isMaxAttemptsReached) {
                lockedUntil = new Date(now.getTime() + LOCKOUT_MINUTES * 60 * 1000);
                logger.warn("OTP verification failed - account locked due to max attempts", {
                    email,
                    attempts: newAttempts,
                    lockedUntil,
                });
            } else {
                logger.debug("OTP verification failed - invalid code", {
                    email,
                    attempts: newAttempts,
                    remainingAttempts: MAX_ATTEMPTS - newAttempts,
                });
            }

            await this.authRepository.upsertEmailOtp(email, {
                attempts: newAttempts,
                lockedUntil,
                status: isMaxAttemptsReached ? 'failed' : 'pending',
            });

            const result: OtpVerifyResult = {
                success: false,
                remainingAttempts: Math.max(0, MAX_ATTEMPTS - newAttempts),
            };
            
            if (lockedUntil) {
                result.lockedUntil = lockedUntil;
            }

            return result;
        }
        // OTP is valid - mark as verified and reset attempts and lockedUntil
        await this.authRepository.upsertEmailOtp(email, {
            status: 'verified',
            attempts: 0,
            lockedUntil: null,
        });

        logger.debug("OTP verification successful", { email });

        return { success: true };
    }

    
    // Not sure this should be here
    private async sendVerificationEmail(email: string, otpCode: string): Promise<void> {
        const subject = 'Verify Your Email - Bisa';
        const html = this.emailTemplateUtils.renderOtpVerificationEmail(otpCode, OTP_EXPIRY_MINUTES);
        
        await this.emailProvider.sendMail(email, subject, html);
    }
}

