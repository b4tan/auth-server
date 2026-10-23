// End-to-end tests: Test full HTTP request/response flow with complete authentication and authorization
// This should be rewritten later, this is horribly written
import { jest } from '@jest/globals';
import * as crypto from 'crypto';
import type { UserCredentials, RefreshSession, EmailOtp, Role } from '@prisma/client';
import type { Express } from 'express';

// Create hash function for OTP utils mock
const hashOtpCode = (code: string): string => {
    return crypto.createHash('sha256').update(code).digest('hex');
};

const verifyOtpCode = async (code: string, hash: string): Promise<boolean> => {
    const codeHash = hashOtpCode(code);
    // Ensure both are the same length for timingSafeEqual
    if (codeHash.length !== hash.length) {
        return false;
    }
    return crypto.timingSafeEqual(Buffer.from(codeHash), Buffer.from(hash));
};

// Helper functions
function buildUser(overrides: Partial<UserCredentials> = {}): UserCredentials {
    return {
        id: overrides.id || 'user-123',
        email: overrides.email || 'test@example.com',
        passwordHash: overrides.passwordHash || 'hashed-password',
        phone: overrides.phone || '+1234567890',
        role: overrides.role || 'worker',
        scope: overrides.scope || [],
        emailVerified: overrides.emailVerified ?? false,
        phoneVerified: overrides.phoneVerified ?? false,
        disabled: overrides.disabled ?? false,
        createdAt: overrides.createdAt || new Date(),
        updatedAt: overrides.updatedAt || new Date(),
    };
}

function buildRefreshSession(overrides: Partial<RefreshSession> = {}): RefreshSession {
    return {
        id: overrides.id || 'session-123',
        userId: overrides.userId || 'user-123',
        tokenHash: overrides.tokenHash || 'hashed-token',
        expiresAt: overrides.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        revokedAt: overrides.revokedAt ?? null,
        createdAt: overrides.createdAt || new Date(),
    };
}

function buildEmailOtp(overrides: Partial<EmailOtp> = {}): EmailOtp {
    return {
        id: overrides.id || 'otp-123',
        email: overrides.email || 'test@example.com',
        codeHash: overrides.codeHash || 'hashed-code',
        status: overrides.status || 'pending',
        attempts: overrides.attempts ?? 0,
        lockedUntil: overrides.lockedUntil ?? null,
        expiresAt: overrides.expiresAt || new Date(Date.now() + 15 * 60 * 1000),
        createdAt: overrides.createdAt || new Date(),
    };
}

// Helper to extract CSRF token from response
function extractCsrfToken(response: any): string {
    const cookies = response.headers['set-cookie'] as string[] | undefined;
    const csrfCookie = Array.isArray(cookies) 
        ? cookies.find((c: string) => c.includes('csrfToken') || c.includes('csrf-token'))
        : undefined;
    if (csrfCookie) {
        const match = csrfCookie.match(/(?:csrfToken|csrf-token)=([^;]+)/);
        if (match && match[1]) return match[1];
    }
    
    // Try header
    const headerToken = response.headers['x-csrf-token'] as string | undefined;
    if (headerToken) {
        return headerToken;
    }
    
    // Fail fast - no fallback
    throw new Error('CSRF token not found in Set-Cookie header or X-CSRF-Token header');
}

// Mock ONLY the database (Prisma) - everything else should be real
// One instance, shared by every importer: jest can load a mocked module more than once.
const sharedPrisma = {
    userCredentials: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
    },
    refreshSession: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
    },
    emailOtp: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
    },
};
jest.unstable_mockModule('@lib/prisma.js', () => ({ prisma: sharedPrisma }));

// Mock email config
jest.unstable_mockModule('@config/email.config.js', () => ({
    default: {
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
            user: 'test-user',
            pass: 'test-pass',
        },
        from: '"Test" <test@ethereal.email>',
    },
}));

// Mock auth.config to provide test keys
jest.unstable_mockModule('@config/auth.config.js', () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    
    return {
        default: {
            algorithm: 'RS256',
            privateKey,
            publicKey,
            refreshPepper: 'test-refresh-pepper-for-e2e-tests',
        },
    };
});

// Mock email provider
jest.unstable_mockModule('@providers/email.provider.js', () => {
    const mockEmailProvider = {
        sendMail: jest.fn<(to: string, subject: string, html: string) => Promise<void>>().mockResolvedValue(undefined),
    };
    return {
        EmailProvider: jest.fn().mockImplementation(() => mockEmailProvider),
        default: mockEmailProvider,
    };
});

// Mock OTP utils to return predictable OTP for testing
jest.unstable_mockModule('@utils/auth/otp.utils.js', () => {
    return {
        default: {
            generateOtp: jest.fn(() => '123456'), // Return predictable OTP for testing
            hashOtpCode,
            verifyOtpCode,
        },
    };
});

// Import REAL implementations after mocking
const express = await import('express');
const request = (await import('supertest')).default;
const cookieParser = await import('cookie-parser');
const cors = await import('cors');
const authRoutes = await import('@routes/auth.routes.js');
const userRoutes = await import('@routes/user.routes.js');
const { prisma } = await import('@lib/prisma.js');
const PasswordUtils = await import('@utils/crypto/password.utils.js');
const OtpUtils = await import('@utils/auth/otp.utils.js');
const { createTokenUtils } = await import('@utils/crypto/token.utils.js');
const AuthRepository = await import('@repositories/auth.repository.js');
const { tokenBucket } = await import('@container.js');
const { MemoryTokenBucket } = await import('@utils/ratelimit/token-bucket.js');
const tokenUtils = createTokenUtils(AuthRepository.default);

describe('Auth E2E Tests - Complete Authentication & Authorization Flow', () => {
    let app: Express;
    let mockPrisma: jest.Mocked<typeof prisma>;

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();

        // Every test comes from the same IP: start each with full rate limit buckets
        if (tokenBucket instanceof MemoryTokenBucket) tokenBucket.clear();
        
        // Create REAL Express app
        app = express.default();
        app.use(express.default.json());
        app.use(cookieParser.default());
        app.use(cors.default({
            origin: ['http://localhost:3000'],
            methods: ['GET', 'POST', 'DELETE'],
            credentials: true,
        }));

        // Setup REAL routes
        app.use('/api/auth', authRoutes.default);
        app.use('/api/user', userRoutes.default);

        mockPrisma = prisma as jest.Mocked<typeof prisma>;
        
        // Reset Prisma mocks
        Object.values(mockPrisma.userCredentials).forEach(mock => {
            if (jest.isMockFunction(mock)) {
                mock.mockReset();
            }
        });
        Object.values(mockPrisma.refreshSession).forEach(mock => {
            if (jest.isMockFunction(mock)) {
                mock.mockReset();
            }
        });
        Object.values(mockPrisma.emailOtp || {}).forEach(mock => {
            if (jest.isMockFunction(mock)) {
                mock.mockReset();
            }
        });
    });

    describe('Complete Authentication Flow', () => {
        it('should complete full flow: register → CSRF → send OTP → verify OTP → verify email → login → get user → refresh → logout', async () => {
            const email = 'flowtest@example.com';
            const password = 'SecurePassword123!';
            const phone = '+15551234567';
            const userId = 'flow-user-123';
            const otpCode = '123456';
            // Calculate hash using the mocked hashOtpCode function (same one used by the real code)
            const codeHash = hashOtpCode(otpCode);

            // 1. Get CSRF token
            const csrfResponse = await request(app)
                .get('/api/auth/csrf-token')
                .expect(200);
            const csrfToken = extractCsrfToken(csrfResponse);

            // 2. Register
            mockPrisma.userCredentials.findUnique.mockResolvedValueOnce(null);
            const newUser = buildUser({
                id: userId,
                email,
                passwordHash: await PasswordUtils.default.hashPassword(password),
                phone,
                scope: [],
                emailVerified: false,
            });
            mockPrisma.userCredentials.create.mockResolvedValueOnce(newUser);

            const registerResponse = await request(app)
                .post('/api/auth/register')
                .set('Cookie', [`csrf-token=${csrfToken}`])
                .set('X-CSRF-Token', csrfToken)
                .send({ email, password, phone })
                .expect(200);

            expect(registerResponse.body.ok).toBe(true);
            expect(registerResponse.body.data.email).toBe(email);

            // 3. Send OTP
            // When sendOtp is called, it will generate '123456' (from mocked generateOtp)
            // and hash it using the mocked hashOtpCode function
            // So we need to ensure the stored OTP has the correct hash
            const emailOtp = buildEmailOtp({
                email,
                codeHash, // Hash of '123456' using mocked hashOtpCode
                status: 'pending',
                expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes from now
            });
            // Mock for invalidateOtherChannelOtps (called by sendOtp)
            mockPrisma.userCredentials.findUnique.mockResolvedValueOnce(newUser);
            // Mock for sendOtp - find existing OTP (should be null for first send)
            mockPrisma.emailOtp.findUnique.mockResolvedValueOnce(null);
            // Mock for sendOtp - upsert new OTP (this is what gets stored)
            mockPrisma.emailOtp.upsert.mockResolvedValueOnce(emailOtp);

            const sendOtpResponse = await request(app)
                .post('/api/auth/resend-otp')
                .set('Cookie', [`csrf-token=${csrfToken}`])
                .set('X-CSRF-Token', csrfToken)
                .send({ email })
                .expect(200);

            expect(sendOtpResponse.body.ok).toBe(true);

            // 4. Verify OTP and mark email as verified via verify-email endpoint
            const verifiedUser = buildUser({
                ...newUser,
                emailVerified: true,
            });
            const verifiedEmailOtp = buildEmailOtp({
                ...emailOtp,
                status: 'verified',
                attempts: 0,
                lockedUntil: null,
            });
            
            // Mock for verifyOtp (called by verifyOtpAndLogin)
            // The EmailOtpProvider.verifyOtp flow:
            // 1. findUnique to get the OTP record (must have correct codeHash and valid expiresAt)
            // Note: codeHash must match what verifyOtpCode will calculate for '123456'
            // The hash should be: 8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92
            const futureDate = new Date(Date.now() + 15 * 60 * 1000);
            const otpForVerification = buildEmailOtp({
                email,
                codeHash, // Hash of '123456' - must match what verifyOtpCode calculates
                expiresAt: futureDate, // Ensure not expired
                status: 'pending',
                attempts: 0,
                lockedUntil: null,
            });
            // This mock is consumed by EmailOtpProvider.verifyOtp -> findOtpbyEmail -> findUnique
            mockPrisma.emailOtp.findUnique.mockResolvedValueOnce(otpForVerification);
            // 2. upsert to mark as verified after successful verification (called by verifyOtp)
            mockPrisma.emailOtp.upsert.mockResolvedValueOnce(verifiedEmailOtp);
            
            // Mock for verifyEmailAfterOtp - needs to find the verified OTP
            mockPrisma.emailOtp.findUnique.mockResolvedValueOnce(verifiedEmailOtp);
            mockPrisma.userCredentials.update.mockResolvedValueOnce(verifiedUser);
            
            // Mock for finding user and creating tokens (in verifyOtpAndLogin)
            mockPrisma.userCredentials.findUnique.mockResolvedValueOnce(verifiedUser);
            const refreshSession = buildRefreshSession({
                userId,
                tokenHash: 'hashed-refresh-token',
            });
            mockPrisma.refreshSession.create.mockResolvedValueOnce(refreshSession);

            const verifyResponse = await request(app)
                .post('/api/auth/verify-email')
                .set('Cookie', [`csrf-token=${csrfToken}`])
                .set('X-CSRF-Token', csrfToken)
                .send({ email, otp: otpCode })
                .expect(200);

            expect(verifyResponse.body.ok).toBe(true);
            expect(verifyResponse.body.data.user.id).toBe(userId);
            expect(verifyResponse.body.data.accessToken).toBeDefined();
            
            const verifyCookies = verifyResponse.headers['set-cookie'] as string[] | undefined;
            const verifyRefreshTokenCookie = Array.isArray(verifyCookies) 
                ? verifyCookies.find((c: string) => c.includes('refreshToken'))
                : undefined;
            expect(verifyRefreshTokenCookie).toBeDefined();

            // 5. Login (user should already be verified)
            mockPrisma.userCredentials.findUnique.mockResolvedValueOnce(verifiedUser);
            const loginRefreshSession = buildRefreshSession({
                userId,
                tokenHash: 'hashed-refresh-token-login',
            });
            mockPrisma.refreshSession.create.mockResolvedValueOnce(loginRefreshSession);

            const loginResponse = await request(app)
                .post('/api/auth/login')
                .set('Cookie', [`csrf-token=${csrfToken}`])
                .set('X-CSRF-Token', csrfToken)
                .send({ email, password })
                .expect(200);

            expect(loginResponse.body.ok).toBe(true);
            expect(loginResponse.body.data.user.id).toBe(userId);
            expect(loginResponse.body.data.accessToken).toBeDefined();

            const cookies = loginResponse.headers['set-cookie'] as string[] | undefined;
            const refreshTokenCookie = Array.isArray(cookies) 
                ? cookies.find((c: string) => c.includes('refreshToken'))
                : undefined;
            expect(refreshTokenCookie).toBeDefined();

            const accessToken = loginResponse.body.data.accessToken;
            const refreshToken = refreshTokenCookie?.split('refreshToken=')[1]?.split(';')[0] || '';

            // 7. Get user
            // Need to mock again since previous call was consumed
            mockPrisma.userCredentials.findUnique.mockResolvedValueOnce(verifiedUser);

            const userResponse = await request(app)
                .get('/api/user/me')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(200);

            expect(userResponse.body.ok).toBe(true);
            expect(userResponse.body.data.user.id).toBe(userId);
            expect(userResponse.body.data.user.email).toBe(email);

            // 8. Refresh token (with rotation)
            const refreshTokenHash = tokenUtils.hashRefreshToken(refreshToken);
            const mockSession = buildRefreshSession({
                userId,
                tokenHash: refreshTokenHash,
                expiresAt: new Date(Date.now() + 1000000),
            });

            // Middleware verifyRefreshToken calls findRefreshSessionByHash
            mockPrisma.refreshSession.findUnique.mockResolvedValueOnce({
                ...mockSession,
                user: verifiedUser,
            } as RefreshSession & { user: UserCredentials });
            // Service refreshToken also calls findRefreshSessionByHash
            mockPrisma.refreshSession.findUnique.mockResolvedValueOnce({
                ...mockSession,
                user: verifiedUser,
            } as RefreshSession & { user: UserCredentials });
            // Service refreshToken calls rotateRefreshSession (updateMany)
            mockPrisma.refreshSession.updateMany.mockResolvedValueOnce({
                count: 1,
            });

            const refreshResponse = await request(app)
                .post('/api/auth/refresh-token')
                .set('Cookie', [
                    refreshTokenCookie || `refreshToken=${refreshToken}`,
                    `csrf-token=${csrfToken}`,
                ])
                .set('X-CSRF-Token', csrfToken)
                .expect(200);

            expect(refreshResponse.body.ok).toBe(true);
            expect(refreshResponse.body.data.accessToken).toBeDefined();
            
            // Verify new refresh token cookie is set
            const refreshCookies = refreshResponse.headers['set-cookie'] as string[] | undefined;
            const newRefreshTokenCookie = Array.isArray(refreshCookies) 
                ? refreshCookies.find((c: string) => c.includes('refreshToken'))
                : undefined;
            expect(newRefreshTokenCookie).toBeDefined();
            expect(newRefreshTokenCookie).not.toContain(refreshToken); // Should be a different token

            // 9. Logout
            const newAccessToken = refreshResponse.body.data.accessToken;
            // Logout needs to find the session first (via verifyRefreshToken middleware)
            mockPrisma.refreshSession.findUnique.mockResolvedValueOnce({
                ...mockSession,
                user: verifiedUser,
            } as RefreshSession & { user: UserCredentials });
            // Then revoke it
            mockPrisma.refreshSession.update.mockResolvedValueOnce({
                ...mockSession,
                revokedAt: new Date(),
            });

            const logoutResponse = await request(app)
                .post('/api/auth/logout')
                .set('Authorization', `Bearer ${newAccessToken}`)
                .set('Cookie', [
                    refreshTokenCookie || `refreshToken=${refreshToken}`,
                    `csrf-token=${csrfToken}`,
                ])
                .set('X-CSRF-Token', csrfToken)
                .expect(200);

            expect(logoutResponse.body.ok).toBe(true);

            // Verify cookies are cleared
            const logoutCookies = logoutResponse.headers['set-cookie'] as string[] | undefined;
            expect(logoutCookies).toBeDefined();
            const clearedRefreshCookie = Array.isArray(logoutCookies) 
                ? logoutCookies.find((c: string) => c.includes('refreshToken='))
                : undefined;
            expect(clearedRefreshCookie).toBeDefined();
        });
    });

    describe('CSRF Protection', () => {
        it('should require CSRF token for POST requests', async () => {
            const response = await request(app)
                .post('/api/auth/register')
                .send({
                    email: 'test@example.com',
                    password: 'SecurePassword123!',
                    phone: '+15551234567',
                })
                .expect(403);

            expect(response.body.message).toBeDefined();
        });

        it('should require CSRF token in header and cookie', async () => {
            const csrfResponse = await request(app)
                .get('/api/auth/csrf-token')
                .expect(200);
            const csrfToken = extractCsrfToken(csrfResponse);

            // Missing header
            const response1 = await request(app)
                .post('/api/auth/register')
                .set('Cookie', [`csrf-token=${csrfToken}`])
                .send({
                    email: 'test@example.com',
                    password: 'SecurePassword123!',
                    phone: '+15551234567',
                })
                .expect(403);

            // Missing cookie
            const response2 = await request(app)
                .post('/api/auth/register')
                .set('X-CSRF-Token', csrfToken)
                .send({
                    email: 'test@example.com',
                    password: 'SecurePassword123!',
                    phone: '+15551234567',
                })
                .expect(403);
        });
    });

    describe('Registration Flow', () => {
        it('should register new user successfully', async () => {
            const csrfResponse = await request(app)
                .get('/api/auth/csrf-token')
                .expect(200);
            const csrfToken = extractCsrfToken(csrfResponse);

            mockPrisma.userCredentials.findUnique.mockResolvedValueOnce(null);
            const newUser = buildUser({
                id: 'new-user-123',
                email: 'newuser@example.com',
                passwordHash: await PasswordUtils.default.hashPassword('SecurePassword123!'),
                phone: '+15551234567',
            });
            mockPrisma.userCredentials.create.mockResolvedValueOnce(newUser);

            const response = await request(app)
                .post('/api/auth/register')
                .set('Cookie', [`csrf-token=${csrfToken}`])
                .set('X-CSRF-Token', csrfToken)
                .send({
                    email: 'newuser@example.com',
                    password: 'SecurePassword123!',
                    phone: '+15551234567',
                })
                .expect(200);

            expect(response.body.ok).toBe(true);
            expect(response.body.data.email).toBe('newuser@example.com');
        });

        it('should reject duplicate email registration with 409', async () => {
            const csrfResponse = await request(app)
                .get('/api/auth/csrf-token')
                .expect(200);
            const csrfToken = extractCsrfToken(csrfResponse);

            const existingUser = buildUser({
                email: 'existing@example.com',
            });
            mockPrisma.userCredentials.findUnique.mockResolvedValueOnce(existingUser);

            const response = await request(app)
                .post('/api/auth/register')
                .set('Cookie', [`csrf-token=${csrfToken}`])
                .set('X-CSRF-Token', csrfToken)
                .send({
                    email: 'existing@example.com',
                    password: 'SecurePassword123!',
                    phone: '+15551234567',
                })
                .expect(409);

            expect(response.body.ok).toBe(false);
            expect(response.body.code).toBe('EMAIL_IN_USE');
            expect(response.body.message).toContain('already in use');
        });

        it('should validate registration input', async () => {
            const csrfResponse = await request(app)
                .get('/api/auth/csrf-token')
                .expect(200);
            const csrfToken = extractCsrfToken(csrfResponse);

            // Invalid email
            await request(app)
                .post('/api/auth/register')
                .set('Cookie', [`csrf-token=${csrfToken}`])
                .set('X-CSRF-Token', csrfToken)
                .send({
                    email: 'invalid-email',
                    password: 'SecurePassword123!',
                    phone: '+15551234567',
                })
                .expect(400);

            // Invalid password (too short)
            await request(app)
                .post('/api/auth/register')
                .set('Cookie', [`csrf-token=${csrfToken}`])
                .set('X-CSRF-Token', csrfToken)
                .send({
                    email: 'test@example.com',
                    password: 'Short1!',
                    phone: '+15551234567',
                })
                .expect(400);
        });
    });

    describe('Rate Limiting', () => {
        it('should return 429 with Retry-After once an email runs out of login attempts', async () => {
            const csrfResponse = await request(app)
                .get('/api/auth/csrf-token')
                .expect(200);
            const csrfToken = extractCsrfToken(csrfResponse);
            mockPrisma.userCredentials.findUnique.mockResolvedValue(null);

            const attempt = () => request(app)
                .post('/api/auth/login')
                .set('Cookie', [`csrf-token=${csrfToken}`])
                .set('X-CSRF-Token', csrfToken)
                .send({ email: 'target@example.com', password: 'WrongPassword123!' });

            // The per-email bucket holds 5 attempts
            for (let i = 0; i < 5; i++) {
                const response = await attempt();
                expect(response.status).toBe(401);
            }

            const limited = await attempt();
            expect(limited.status).toBe(429);
            expect(limited.body.code).toBe('RATE_LIMITED');
            expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
        });

        it('should limit each email separately', async () => {
            const csrfResponse = await request(app)
                .get('/api/auth/csrf-token')
                .expect(200);
            const csrfToken = extractCsrfToken(csrfResponse);
            mockPrisma.userCredentials.findUnique.mockResolvedValue(null);

            const attempt = (email: string) => request(app)
                .post('/api/auth/login')
                .set('Cookie', [`csrf-token=${csrfToken}`])
                .set('X-CSRF-Token', csrfToken)
                .send({ email, password: 'WrongPassword123!' });

            for (let i = 0; i < 5; i++) await attempt('first@example.com');
            expect((await attempt('first@example.com')).status).toBe(429);
            expect((await attempt('second@example.com')).status).toBe(401);
        });
    });

    describe('Login Flow', () => {
        it('should login successfully with verified email', async () => {
            const csrfResponse = await request(app)
                .get('/api/auth/csrf-token')
                .expect(200);
            const csrfToken = extractCsrfToken(csrfResponse);

            const email = 'test@example.com';
            const password = 'SecurePassword123!';
            const verifiedUser = buildUser({
                email,
                passwordHash: await PasswordUtils.default.hashPassword(password),
                emailVerified: true,
            });

            mockPrisma.userCredentials.findUnique.mockResolvedValueOnce(verifiedUser);
            mockPrisma.refreshSession.create.mockResolvedValueOnce(
                buildRefreshSession()
            );

            const response = await request(app)
                .post('/api/auth/login')
                .set('Cookie', [`csrf-token=${csrfToken}`])
                .set('X-CSRF-Token', csrfToken)
                .send({ email, password })
                .expect(200);

            expect(response.body.ok).toBe(true);
            expect(response.body.data.user.email).toBe(email);
            expect(response.body.data.accessToken).toBeDefined();

            const cookies = response.headers['set-cookie'] as string[] | undefined;
            expect(Array.isArray(cookies) && cookies.some((c: string) => c.includes('refreshToken'))).toBe(true);
        });

        it('should reject login with invalid email (401)', async () => {
            const csrfResponse = await request(app)
                .get('/api/auth/csrf-token')
                .expect(200);
            const csrfToken = extractCsrfToken(csrfResponse);

            mockPrisma.userCredentials.findUnique.mockResolvedValueOnce(null);

            const response = await request(app)
                .post('/api/auth/login')
                .set('Cookie', [`csrf-token=${csrfToken}`])
                .set('X-CSRF-Token', csrfToken)
                .send({
                    email: 'nonexistent@example.com',
                    password: 'SecurePassword123!',
                })
                .expect(401);

            expect(response.body.ok).toBe(false);
            expect(response.body.code).toBe('INVALID_CREDENTIALS');
        });

        it('should reject login with invalid password (401)', async () => {
            const csrfResponse = await request(app)
                .get('/api/auth/csrf-token')
                .expect(200);
            const csrfToken = extractCsrfToken(csrfResponse);

            const email = 'test@example.com';
            const user = buildUser({
                email,
                passwordHash: await PasswordUtils.default.hashPassword('CorrectPassword123!'),
                emailVerified: true,
            });

            mockPrisma.userCredentials.findUnique.mockResolvedValueOnce(user);

            const response = await request(app)
                .post('/api/auth/login')
                .set('Cookie', [`csrf-token=${csrfToken}`])
                .set('X-CSRF-Token', csrfToken)
                .send({
                    email,
                    password: 'WrongPassword123!',
                })
                .expect(401);

            expect(response.body.ok).toBe(false);
            expect(response.body.code).toBe('INVALID_CREDENTIALS');
        });

        it('should reject login with unverified email (403)', async () => {
            const csrfResponse = await request(app)
                .get('/api/auth/csrf-token')
                .expect(200);
            const csrfToken = extractCsrfToken(csrfResponse);

            const email = 'test@example.com';
            const password = 'SecurePassword123!';
            const user = buildUser({
                email,
                passwordHash: await PasswordUtils.default.hashPassword(password),
                emailVerified: false,
            });

            mockPrisma.userCredentials.findUnique.mockResolvedValueOnce(user);

            const response = await request(app)
                .post('/api/auth/login')
                .set('Cookie', [`csrf-token=${csrfToken}`])
                .set('X-CSRF-Token', csrfToken)
                .send({ email, password })
                .expect(403);

            expect(response.body.ok).toBe(false);
            expect(response.body.code).toBe('EMAIL_NOT_VERIFIED');
        });
    });

    describe('OTP Verification Flow', () => {
        it('should reject invalid OTP with 400', async () => {
            const csrfResponse = await request(app)
                .get('/api/auth/csrf-token')
                .expect(200);
            const csrfToken = extractCsrfToken(csrfResponse);

            const email = 'test@example.com';
            const wrongOtp = '999999';
            
            // Mock OTP lookup - OTP exists but code doesn't match
            const emailOtp = buildEmailOtp({
                email,
                codeHash: hashOtpCode('123456'), // Correct code hash
                status: 'pending',
                expiresAt: new Date(Date.now() + 15 * 60 * 1000),
            });
            mockPrisma.emailOtp.findUnique.mockResolvedValueOnce(emailOtp);
            // upsert called when verification fails (increments attempts)
            mockPrisma.emailOtp.upsert.mockResolvedValueOnce({
                ...emailOtp,
                attempts: 1,
            });

            const response = await request(app)
                .post('/api/auth/verify-email')
                .set('Cookie', [`csrf-token=${csrfToken}`])
                .set('X-CSRF-Token', csrfToken)
                .send({ email, otp: wrongOtp })
                .expect(400);

            expect(response.body.ok).toBe(false);
            expect(response.body.code).toBe('INVALID_OTP');
        });
    });

    describe('Token Refresh Flow', () => {
        it('should refresh access token successfully and rotate refresh token', async () => {
            const csrfResponse = await request(app)
                .get('/api/auth/csrf-token')
                .expect(200);
            const csrfToken = extractCsrfToken(csrfResponse);

            const userId = 'user-123';
            const refreshToken = 'refresh-token-123';
            const refreshTokenHash = tokenUtils.hashRefreshToken(refreshToken);
            const mockUser = buildUser({
                id: userId,
                emailVerified: true,
            });
            const mockSession = buildRefreshSession({
                userId,
                tokenHash: refreshTokenHash,
                expiresAt: new Date(Date.now() + 1000000),
            });

            // Middleware calls findRefreshSessionByHash (findUnique with include)
            mockPrisma.refreshSession.findUnique.mockResolvedValueOnce({
                ...mockSession,
                user: mockUser,
            } as RefreshSession & { user: UserCredentials });
            // Service also calls findRefreshSessionByHash
            mockPrisma.refreshSession.findUnique.mockResolvedValueOnce({
                ...mockSession,
                user: mockUser,
            } as RefreshSession & { user: UserCredentials });
            // Service calls rotateRefreshSession (updateMany)
            mockPrisma.refreshSession.updateMany.mockResolvedValueOnce({
                count: 1,
            });

            const response = await request(app)
                .post('/api/auth/refresh-token')
                .set('Cookie', [
                    `refreshToken=${refreshToken}`,
                    `csrf-token=${csrfToken}`,
                ])
                .set('X-CSRF-Token', csrfToken)
                .expect(200);

            expect(response.body.ok).toBe(true);
            expect(response.body.data.accessToken).toBeDefined();
            
            // Verify new refresh token cookie is set
            const cookies = response.headers['set-cookie'] as string[] | undefined;
            const newRefreshTokenCookie = Array.isArray(cookies) 
                ? cookies.find((c: string) => c.includes('refreshToken'))
                : undefined;
            expect(newRefreshTokenCookie).toBeDefined();
            expect(newRefreshTokenCookie).not.toContain(refreshToken); // Should be a different token
        });

        it('should reject refresh with old token after rotation', async () => {
            const csrfResponse = await request(app)
                .get('/api/auth/csrf-token')
                .expect(200);
            const csrfToken = extractCsrfToken(csrfResponse);

            const userId = 'user-123';
            const oldRefreshToken = 'old-refresh-token';
            const oldTokenHash = tokenUtils.hashRefreshToken(oldRefreshToken);
            const mockUser = buildUser({
                id: userId,
                emailVerified: true,
            });
            const mockSession = buildRefreshSession({
                userId,
                tokenHash: oldTokenHash,
                expiresAt: new Date(Date.now() + 1000000),
            });

            // First refresh - succeeds
            mockPrisma.refreshSession.findUnique.mockResolvedValueOnce({
                ...mockSession,
                user: mockUser,
            } as RefreshSession & { user: UserCredentials });
            mockPrisma.refreshSession.findUnique.mockResolvedValueOnce({
                ...mockSession,
                user: mockUser,
            } as RefreshSession & { user: UserCredentials });
            mockPrisma.refreshSession.updateMany.mockResolvedValueOnce({
                count: 1,
            });

            const firstRefresh = await request(app)
                .post('/api/auth/refresh-token')
                .set('Cookie', [
                    `refreshToken=${oldRefreshToken}`,
                    `csrf-token=${csrfToken}`,
                ])
                .set('X-CSRF-Token', csrfToken)
                .expect(200);

            expect(firstRefresh.body.ok).toBe(true);

            // Second refresh with OLD token - should fail (token was rotated)
            mockPrisma.refreshSession.findUnique.mockResolvedValueOnce(null);

            const secondRefresh = await request(app)
                .post('/api/auth/refresh-token')
                .set('Cookie', [
                    `refreshToken=${oldRefreshToken}`,
                    `csrf-token=${csrfToken}`,
                ])
                .set('X-CSRF-Token', csrfToken)
                .expect(401);

            expect(secondRefresh.status).toBe(401);
            expect(secondRefresh.body.ok).toBe(false);
            expect(secondRefresh.body.data.message).toBe('Invalid or expired refresh token');
        });

        it('should reject refresh with invalid token', async () => {
            const csrfResponse = await request(app)
                .get('/api/auth/csrf-token')
                .expect(200);
            const csrfToken = extractCsrfToken(csrfResponse);

            mockPrisma.refreshSession.findUnique.mockResolvedValueOnce(null);

            const response = await request(app)
                .post('/api/auth/refresh-token')
                .set('Cookie', [
                    'refreshToken=invalid-token',
                    `csrf-token=${csrfToken}`,
                ])
                .set('X-CSRF-Token', csrfToken)
                .expect(401);

            expect(response.status).toBe(401);
            expect(response.body.ok).toBe(false);
            expect(response.body.data.message).toBe('Invalid or expired refresh token');
        });
    });

    describe('Authorization Flow', () => {
        it('should return user data with valid access token', async () => {
            const userId = 'user-123';
            const accessToken = tokenUtils.generateAccessToken({
                id: userId,
                role: 'worker',
                scope: ['read'],
            });

            const mockUser = buildUser({
                id: userId,
                email: 'test@example.com',
                scope: ['read'],
            });

            mockPrisma.userCredentials.findUnique.mockResolvedValueOnce(mockUser);

            const response = await request(app)
                .get('/api/user/me')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(200);

            expect(response.body.ok).toBe(true);
            expect(response.body.data.user.id).toBe(userId);
            expect(response.body.data.user.scope).toEqual(['read']);
        });

        it('should reject request without access token', async () => {
            const response = await request(app)
                .get('/api/user/me')
                .expect(401);

            expect(response.body.message).toBe('Unauthorized');
        });

        it('should handle different user roles', async () => {
            const roles: Role[] = ['worker', 'admin', 'employer'];

            for (const role of roles) {
                jest.clearAllMocks(); // Clear mocks between iterations
                
                const userId = `user-${role}`;
                const accessToken = tokenUtils.generateAccessToken({
                    id: userId,
                    role,
                    scope: role === 'admin' ? ['read', 'write', 'delete'] : ['read'],
                });

                // UserController returns user from database, not from token
                const mockUser = buildUser({
                    id: userId,
                    email: `${role}@example.com`,
                    role,
                    scope: role === 'admin' ? ['read', 'write', 'delete'] : ['read'],
                });

                mockPrisma.userCredentials.findUnique.mockResolvedValueOnce(mockUser);

                const response = await request(app)
                    .get('/api/user/me')
                    .set('Authorization', `Bearer ${accessToken}`)
                    .expect(200);

                expect(response.body.ok).toBe(true);
                expect(response.body.data.user.role).toBe(role);
            }
        });

        it('should handle different scopes', async () => {
            const scopeCombinations = [
                [],
                ['read'],
                ['read', 'write'],
                ['read', 'write', 'delete'],
            ];

            for (const scope of scopeCombinations) {
                jest.clearAllMocks(); // Clear mocks between iterations
                
                const userId = `user-scope-${scope.join('-') || 'empty'}`;
                const accessToken = tokenUtils.generateAccessToken({
                    id: userId,
                    role: 'worker',
                    scope: scope.length === 0 ? ['read'] : scope, // Default scope is ['read'] if empty
                });

                // UserController returns user from database
                const mockUser = buildUser({
                    id: userId,
                    email: 'scope@example.com',
                    scope: scope.length === 0 ? [] : scope,
                });

                mockPrisma.userCredentials.findUnique.mockResolvedValueOnce(mockUser);

                const response = await request(app)
                    .get('/api/user/me')
                    .set('Authorization', `Bearer ${accessToken}`)
                    .expect(200);

                expect(response.body.ok).toBe(true);
                // UserController returns scope from database
                expect(response.body.data.user.scope).toEqual(scope.length === 0 ? [] : scope);
            }
        });
    });

    describe('Logout Flow', () => {
        it('should logout successfully and clear cookies', async () => {
            const csrfResponse = await request(app)
                .get('/api/auth/csrf-token')
                .expect(200);
            const csrfToken = extractCsrfToken(csrfResponse);

            const userId = 'user-123';
            const refreshToken = 'refresh-token-123';
            const refreshTokenHash = tokenUtils.hashRefreshToken(refreshToken);
            const accessToken = tokenUtils.generateAccessToken({
                id: userId,
                role: 'worker',
                scope: ['read'],
            });

            const mockSession = buildRefreshSession({
                userId,
                tokenHash: refreshTokenHash,
            });

            mockPrisma.refreshSession.findUnique.mockResolvedValueOnce({
                ...mockSession,
                user: buildUser({ id: userId }),
            } as RefreshSession & { user: UserCredentials });
            mockPrisma.refreshSession.update.mockResolvedValueOnce({
                ...mockSession,
                revokedAt: new Date(),
            });

            const response = await request(app)
                .post('/api/auth/logout')
                .set('Authorization', `Bearer ${accessToken}`)
                .set('Cookie', [
                    `refreshToken=${refreshToken}`,
                    `csrf-token=${csrfToken}`,
                ])
                .set('X-CSRF-Token', csrfToken)
                .expect(200);

            expect(response.body.ok).toBe(true);

            // Verify cookies are cleared
            const cookies = response.headers['set-cookie'] as string[] | undefined;
            expect(cookies).toBeDefined();
            const clearedCookies = Array.isArray(cookies) 
                ? cookies.filter((c: string) => c.includes('refreshToken=') || c.includes('csrf-token='))
                : [];
            expect(clearedCookies.length).toBeGreaterThan(0);
        });
    });
});
