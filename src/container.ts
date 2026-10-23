import AuthRepository from '@repositories/auth.repository.js';
import { createTokenUtils } from '@utils/crypto/token.utils.js';
import PasswordUtils from '@utils/crypto/password.utils.js';
import OtpUtils from '@utils/auth/otp.utils.js';
import EmailProvider from '@providers/email.provider.js';
import { createOtpProviderFactory } from '@service/auth/otp/otp-provider.factory.js';
import { AuthService } from '@service/auth/auth.service.js';
import { AuthController } from '@controller/auth.controller.js';
import { UserController } from '@controller/user.controller.js';
import { HealthController } from '@controller/health.controller.js';
import { createAuthMiddleware } from '@middleware/auth.middleware.js';
import CsrfMiddleware from '@middleware/csrf.middlware.js';
import ValidationMiddleware from '@middleware/validation.middleware.js';
import { createRateLimit } from '@middleware/ratelimit.middleware.js';
import { MemoryTokenBucket, RedisTokenBucket, type ITokenBucket } from '@utils/ratelimit/token-bucket.js';
import rateLimitConfig from '@config/ratelimit.config.js';
import logger from '@utils/logging/logger.utils.js';
import { Redis } from 'ioredis';

const tokenUtils = createTokenUtils(AuthRepository);
const otpProviderFactory = createOtpProviderFactory({
    emailProvider: EmailProvider,
    authRepository: AuthRepository,
    otpUtils: OtpUtils,
});
const authService = new AuthService(AuthRepository, tokenUtils, PasswordUtils, otpProviderFactory);
const authController = new AuthController(authService);
const userController = new UserController(authService);
const healthController = new HealthController();

const authMiddleware = createAuthMiddleware(tokenUtils);

const tokenBucket: ITokenBucket = rateLimitConfig.redisUrl
  ? new RedisTokenBucket(new Redis(rateLimitConfig.redisUrl, { maxRetriesPerRequest: 1 }))
  : new MemoryTokenBucket();
if (!rateLimitConfig.redisUrl && process.env.NODE_ENV === 'production') {
  logger.warn('REDIS_URL is not set: rate limits are kept in memory and not shared between instances.');
}
const rateLimit = createRateLimit(tokenBucket);

export { 
  authController, 
  authService, 
  userController,
  healthController,
  authMiddleware, 
  CsrfMiddleware,
  ValidationMiddleware,
  rateLimit,
  tokenBucket,
  AuthRepository, 
  tokenUtils, 
  PasswordUtils 
};