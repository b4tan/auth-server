// Accommodate different OTP channels (Email)
// Note: interfaces are more for Frontend
export type OtpChannel = 'email';

export interface OtpSendResult {
    success: boolean;
    expiresAt: Date;
    providerSid?: string;
}

export interface OtpVerifyResult {
    success: boolean;
    remainingAttempts?: number;
    lockedUntil?: Date;
}

export interface IOTPStrategy {
    channel: OtpChannel;
    sendOtp: (identifier: string) => Promise<OtpSendResult>;
    verifyOtp: (identifier: string, code: string) => Promise<OtpVerifyResult>;
}