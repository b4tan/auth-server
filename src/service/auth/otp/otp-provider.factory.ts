import type { IOTPStrategy } from "@service/auth/otp/otp-strategy.interface.js";
import type { OtpChannel } from "@service/auth/otp/otp-strategy.interface.js";
import type { IEmailProvider } from "@providers/email.provider.js";
import type { IAuthRepository } from "@repositories/auth.repository.js";
import type { IOtpUtils } from "@utils/auth/otp.utils.js";
import { EmailOtpProvider } from "@service/auth/otp/email-otp.provider.js";
import { AuthErrors } from "@errors/auth.error.js";

export function createOtpProvider(
    channel: OtpChannel,
    dependencies: {
        emailProvider?: IEmailProvider;
        authRepository: IAuthRepository;
        otpUtils: IOtpUtils;
    }
): IOTPStrategy {
    switch (channel) {
        case 'email':
            if (!dependencies.emailProvider) {
                throw AuthErrors.invalidOtp(); // Configuration error, but use user-facing error
            }
            return new EmailOtpProvider(
                dependencies.emailProvider,
                dependencies.authRepository,
                dependencies.otpUtils
            );
        
        default:
            throw AuthErrors.invalidOtp(); // Unsupported channel, but use user-facing error
    }
}

export function createOtpProviderFactory(dependencies: {
    emailProvider?: IEmailProvider;
    authRepository: IAuthRepository;
    otpUtils: IOtpUtils;
}): (channel: OtpChannel) => IOTPStrategy {
    return (channel: OtpChannel) => createOtpProvider(channel, dependencies);
}
