export class AuthError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'AuthError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AuthError);
    }
  }
}

export const AuthErrors = {
  invalidCredentials: () => new AuthError(401, 'INVALID_CREDENTIALS', 'Invalid credentials'),
  emailInUse: () => new AuthError(409, 'EMAIL_IN_USE', 'Email is already in use'),
  invalidOtp: () => new AuthError(400, 'INVALID_OTP', 'Invalid or expired OTP'),
  emailNotVerified: () => new AuthError(403, 'EMAIL_NOT_VERIFIED', 'Email not verified'),
  userNotFound: () => new AuthError(404, 'USER_NOT_FOUND', 'User not found'),
  invalidRefreshToken: () => new AuthError(401, 'INVALID_REFRESH_TOKEN', 'Invalid refresh token'),
  refreshTokenRevoked: () => new AuthError(401, 'REFRESH_TOKEN_REVOKED', 'Refresh token has been revoked'),
  refreshTokenExpired: () => new AuthError(401, 'REFRESH_TOKEN_EXPIRED', 'Refresh token has expired'),
  refreshTokenAlreadyUsed: () => new AuthError(401, 'REFRESH_TOKEN_ALREADY_USED', 'Refresh token has already been used'),
  refreshTokenCollision: () => new AuthError(500, 'REFRESH_TOKEN_COLLISION', 'Refresh token collision detected'),
  emailOtpNotVerified: () => new AuthError(400, 'EMAIL_OTP_NOT_VERIFIED', 'Email OTP must be verified before marking email as verified'),
  otpLocked: (lockedUntil?: Date) => new AuthError(429, 'OTP_LOCKED', `Account is temporarily locked. Please try again later${lockedUntil ? ` after ${lockedUntil.toISOString()}` : ''}.`),
};

