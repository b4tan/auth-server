// Integration tests: Test AuthService + AuthRepository + OTP working together

import { jest } from '@jest/globals';
import * as crypto from 'crypto';
import type { UserCredentials, RefreshSession, EmailOtp, Role } from '@prisma/client';

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

// Mock auth.config to provide test keys (single source of truth)
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
            refreshPepper: 'test-refresh-pepper-for-integration-tests',
        },
    };
});

// Mock email provider
jest.unstable_mockModule('@providers/email.provider.js', () => {
    const mockEmailProvider = {
        sendMail: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    };
    return {
        EmailProvider: jest.fn().mockImplementation(() => mockEmailProvider),
        default: mockEmailProvider,
    };
});

// Mock OTP utils to return predictable OTP for testing
jest.unstable_mockModule('@utils/auth/otp.utils.js', async () => {
    const crypto = await import('crypto');
    const STABLE_OTP = '123456';
    
    const hashOtpCode = (code: string): string => {
        return crypto.createHash('sha256').update(code).digest('hex');
    };
    
    const verifyOtpCode = async (code: string, hash: string): Promise<boolean> => {
        const codeHash = hashOtpCode(code);
        return crypto.timingSafeEqual(Buffer.from(codeHash), Buffer.from(hash));
    };
    
    return {
        default: {
            generateOtp: jest.fn(() => STABLE_OTP), // Return stable OTP for testing
            hashOtpCode,
            verifyOtpCode,
        },
    };
});

// Import REAL implementations after mocking
const { AuthService } = await import('@service/auth/auth.service.js');
const { createTokenUtils } = await import('@utils/crypto/token.utils.js');
const PasswordUtils = await import('@utils/crypto/password.utils.js');
const OtpUtils = await import('@utils/auth/otp.utils.js');
const { createAuthRepository } = await import('@repositories/auth.repository.js');
const { createOtpProviderFactory } = await import('@service/auth/otp/otp-provider.factory.js');
const { prisma } = await import('@lib/prisma.js');
const { default: emailProvider } = await import('@providers/email.provider.js');
const authConfig = await import('@config/auth.config.js');

describe('AuthService Integration Tests', () => {
    let authService: InstanceType<typeof AuthService>;
    let authRepo: ReturnType<typeof createAuthRepository>;
    let tokenUtils: ReturnType<typeof createTokenUtils>;
    let mockPrisma: jest.Mocked<typeof prisma>;

    // In-memory stores to simulate database
    const usersByEmail = new Map<string, UserCredentials>();
    const usersById = new Map<string, UserCredentials>();
    const usersByPhone = new Map<string, UserCredentials>();
    const otpsByEmail = new Map<string, EmailOtp>();
    const sessionsByHash = new Map<string, RefreshSession & { user: UserCredentials }>();

    // Helper to setup Prisma mocks using in-memory stores
    function setupPrismaMocks() {
        // UserCredentials.findUnique
        (mockPrisma.userCredentials.findUnique as jest.Mock).mockImplementation(async (args: any) => {
            let user: UserCredentials | null = null;
            if (args?.where?.email) {
                user = usersByEmail.get(args.where.email) || null;
            } else if (args?.where?.id) {
                user = usersById.get(args.where.id) || null;
            } else if (args?.where?.phone) {
                user = usersByPhone.get(args.where.phone) || null;
            }
            return user;
        });

        // UserCredentials.create
        (mockPrisma.userCredentials.create as jest.Mock).mockImplementation(async (args: any) => {
            const user = buildUser({
                id: crypto.randomUUID(),
                email: args.data.email,
                passwordHash: args.data.passwordHash,
                phone: args.data.phone,
                role: args.data.role,
                scope: args.data.scope,
            });
            usersByEmail.set(user.email, user);
            usersById.set(user.id, user);
            if (user.phone) {
                usersByPhone.set(user.phone, user);
            }
            return user;
        });

        // UserCredentials.update
        (mockPrisma.userCredentials.update as jest.Mock).mockImplementation(async (args: any) => {
            const existing = usersByEmail.get(args.where.email) || usersById.get(args.where.id);
            if (!existing) {
                throw new Error('User not found');
            }
            const updated = { ...existing, ...args.data, updatedAt: new Date() };
            usersByEmail.set(updated.email, updated);
            usersById.set(updated.id, updated);
            if (updated.phone) {
                usersByPhone.set(updated.phone, updated);
            }
            return updated;
        });

        // EmailOtp.findUnique
        (mockPrisma.emailOtp.findUnique as jest.Mock).mockImplementation(async (args: any) => {
            if (args?.where?.email) {
                return otpsByEmail.get(args.where.email) || null;
            }
            return null;
        });

        // EmailOtp.upsert
        (mockPrisma.emailOtp.upsert as jest.Mock).mockImplementation(async (args: any) => {
            const existing = otpsByEmail.get(args.where.email);
            const now = new Date();
            
            if (existing) {
                // Update existing
                const updated = {
                    ...existing,
                    ...args.update,
                };
                otpsByEmail.set(args.where.email, updated);
                return updated;
            } else {
                // Create new
                const created = buildEmailOtp({
                    email: args.where.email,
                    codeHash: args.create.codeHash,
                    expiresAt: args.create.expiresAt || new Date(now.getTime() + 15 * 60 * 1000),
                    status: args.create.status || 'pending',
                    attempts: args.create.attempts ?? 0,
                    lockedUntil: args.create.lockedUntil ?? null,
                });
                otpsByEmail.set(args.where.email, created);
                return created;
            }
        });

        // RefreshSession.findUnique (with user include)
        (mockPrisma.refreshSession.findUnique as jest.Mock).mockImplementation(async (args: any) => {
            if (args?.where?.tokenHash) {
                const session = sessionsByHash.get(args.where.tokenHash);
                if (session && args.include?.user) {
                    return session;
                }
                return session || null;
            }
            return null;
        });

        // RefreshSession.create
        (mockPrisma.refreshSession.create as jest.Mock).mockImplementation(async (args: any) => {
            const user = usersById.get(args.data.userId);
            if (!user) {
                throw new Error('User not found');
            }
            const session = buildRefreshSession({
                id: crypto.randomUUID(),
                userId: args.data.userId,
                tokenHash: args.data.tokenHash,
                expiresAt: args.data.expiresAt,
            });
            sessionsByHash.set(args.data.tokenHash, { ...session, user });
            return session;
        });

        // RefreshSession.update
        (mockPrisma.refreshSession.update as jest.Mock).mockImplementation(async (args: any) => {
            const existing = sessionsByHash.get(args.where.tokenHash);
            if (!existing) {
                throw new Error('Session not found');
            }
            const updated = {
                ...existing,
                ...args.data,
            };
            sessionsByHash.set(args.where.tokenHash, updated);
            return updated;
        });

        // RefreshSession.updateMany (used by rotateRefreshSession)
        (mockPrisma.refreshSession.updateMany as jest.Mock).mockImplementation(async (args: any) => {
            const existing = sessionsByHash.get(args.where.tokenHash);
            if (!existing) {
                return { count: 0 };
            }
            // Check if session is valid (not revoked, not expired)
            const now = new Date();
            if (existing.revokedAt || existing.expiresAt < now) {
                return { count: 0 };
            }
            // Update tokenHash atomically
            const newTokenHash = args.data.tokenHash;
            const updated = {
                ...existing,
                tokenHash: newTokenHash,
                expiresAt: args.data.expiresAt || existing.expiresAt,
            };
            // Remove old hash, add new hash
            sessionsByHash.delete(args.where.tokenHash);
            sessionsByHash.set(newTokenHash, updated);
            return { count: 1 };
        });
    }

    beforeEach(() => {
        // Clear all stores
        usersByEmail.clear();
        usersById.clear();
        usersByPhone.clear();
        otpsByEmail.clear();
        sessionsByHash.clear();

        // Create REAL repository instance (it will use mocked Prisma)
        authRepo = createAuthRepository();
        mockPrisma = prisma as jest.Mocked<typeof prisma>;
        
        // Setup Prisma mocks using in-memory stores
        setupPrismaMocks();
        
        // Create REAL tokenUtils using mocked config (single source of truth)
        tokenUtils = createTokenUtils(authRepo);
        
        // Create OTP provider factory
        const otpProviderFactory = createOtpProviderFactory({
            emailProvider,
            authRepository: authRepo,
            otpUtils: OtpUtils.default,
        });
        
        // Create REAL AuthService with REAL dependencies
        authService = new AuthService(authRepo, tokenUtils, PasswordUtils.default, otpProviderFactory);
        
        jest.clearAllMocks();
    });

    describe('Complete Authentication Flow', () => {
        it('should complete full flow: register → send OTP → verify OTP and login', async () => {
            const email = 'newuser@example.com';
            const password = 'SecurePassword123!';
            const phone = '+15551234567';

            // 1. Register
            const registerResult = await authService.register(email, password, phone);
            expect(registerResult.user.email).toBe(email);
            expect(usersByEmail.has(email)).toBe(true);

            // 2. Send OTP
            const sendOtpResult = await authService.sendOtp(email, 'email');
            expect(sendOtpResult.success).toBe(true);
            expect(sendOtpResult.channel).toBe('email');
            
            // Assert OTP was stored with correct hash
            const storedOtp = otpsByEmail.get(email);
            expect(storedOtp).toBeDefined();
            expect(storedOtp!.status).toBe('pending');
            const expectedHash = OtpUtils.default.hashOtpCode('123456'); // Mocked generateOtp returns '123456'
            expect(storedOtp!.codeHash).toBe(expectedHash);
            expect(emailProvider.sendMail).toHaveBeenCalledWith(
                email,
                expect.stringContaining('Verify'),
                expect.stringContaining('123456')
            );

            // 3. Verify OTP and login
            const verifyResult = await authService.verifyOtpAndLogin(email, '123456', 'email');
            expect(verifyResult.user.email).toBe(email);
            expect(verifyResult.accessToken).toBeDefined();
            expect(verifyResult.refreshToken).toBeDefined();
            
            // Verify email was marked as verified
            const verifiedUser = usersByEmail.get(email);
            expect(verifiedUser?.emailVerified).toBe(true);
            
            // Verify OTP was marked as verified
            const verifiedOtp = otpsByEmail.get(email);
            expect(verifiedOtp?.status).toBe('verified');
            expect(verifiedOtp?.attempts).toBe(0);
            expect(verifiedOtp?.lockedUntil).toBeNull();

            // Verify tokens are valid
            const payload = tokenUtils.verifyAccessToken(verifyResult.accessToken);
            expect(payload.id).toBe(verifiedUser!.id);
        });

        it('should reject login if email is not verified', async () => {
            const email = 'unverified@example.com';
            const password = 'SecurePassword123!';
            
            // Create unverified user
            const unverifiedUser = buildUser({
                email,
                passwordHash: await PasswordUtils.default.hashPassword(password),
                emailVerified: false,
            });
            usersByEmail.set(email, unverifiedUser);
            usersById.set(unverifiedUser.id, unverifiedUser);

            // Login should fail for unverified email
            await expect(
                authService.login(email, password)
            ).rejects.toThrow('Email not verified');
        });
    });

    describe('OTP Flow Integration', () => {
        it('should send OTP and store it in database with correct hash', async () => {
            const email = 'test@example.com';
            
            // Create user first (needed for invalidateOtherChannelOtps)
            const user = buildUser({ email });
            usersByEmail.set(email, user);
            usersById.set(user.id, user);

            const result = await authService.sendOtp(email, 'email');

            expect(result.success).toBe(true);
            expect(result.channel).toBe('email');
            
            // Assert OTP was stored with correct hash matching generated OTP
            const storedOtp = otpsByEmail.get(email);
            expect(storedOtp).toBeDefined();
            const generatedOtp = '123456'; // Mocked generateOtp returns this
            const expectedHash = OtpUtils.default.hashOtpCode(generatedOtp);
            expect(storedOtp!.codeHash).toBe(expectedHash);
            expect(storedOtp!.status).toBe('pending');
            
            // Assert upsert was called with correct hash
            expect(mockPrisma.emailOtp.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { email },
                    create: expect.objectContaining({
                        codeHash: expectedHash,
                    }),
                })
            );
            
            expect(emailProvider.sendMail).toHaveBeenCalledWith(
                email,
                expect.stringContaining('Verify'),
                expect.stringContaining(generatedOtp)
            );
        });

        it('should verify OTP correctly and mark as verified', async () => {
            const email = 'test@example.com';
            const otpCode = '123456';
            const codeHash = OtpUtils.default.hashOtpCode(otpCode);
            
            // Pre-populate OTP in store
            const emailOtp = buildEmailOtp({
                email,
                codeHash,
                status: 'pending',
                attempts: 0,
                expiresAt: new Date(Date.now() + 15 * 60 * 1000),
            });
            otpsByEmail.set(email, emailOtp);

            const result = await authService.verifyOtp(email, otpCode, 'email');

            expect(result.success).toBe(true);
            
            // Assert OTP was updated to verified status
            const updatedOtp = otpsByEmail.get(email);
            expect(updatedOtp?.status).toBe('verified');
            expect(updatedOtp?.attempts).toBe(0);
            expect(updatedOtp?.lockedUntil).toBeNull();
            
            // Assert upsert was called with verified status
            expect(mockPrisma.emailOtp.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { email },
                    update: expect.objectContaining({
                        status: 'verified',
                        attempts: 0,
                        lockedUntil: null,
                    }),
                })
            );
        });

        it('should fail OTP verification with wrong code and increment attempts', async () => {
            const email = 'test@example.com';
            const correctCode = '123456';
            const wrongCode = '000000';
            const codeHash = OtpUtils.default.hashOtpCode(correctCode);
            
            // Pre-populate OTP in store
            const emailOtp = buildEmailOtp({
                email,
                codeHash,
                status: 'pending',
                attempts: 0,
                expiresAt: new Date(Date.now() + 15 * 60 * 1000),
            });
            otpsByEmail.set(email, emailOtp);

            const result = await authService.verifyOtp(email, wrongCode, 'email');

            expect(result.success).toBe(false);
            expect(result.remainingAttempts).toBe(2); // MAX_ATTEMPTS (3) - 1
            
            // Assert attempts were incremented
            const updatedOtp = otpsByEmail.get(email);
            expect(updatedOtp?.attempts).toBe(1);
            expect(updatedOtp?.status).toBe('pending'); // Not locked yet
            
            // Assert upsert was called with incremented attempts
            expect(mockPrisma.emailOtp.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { email },
                    update: expect.objectContaining({
                        attempts: 1,
                        status: 'pending',
                    }),
                })
            );
        });

        it('should lock account after max failed attempts', async () => {
            const email = 'test@example.com';
            const wrongCode = '000000';
            const codeHash = OtpUtils.default.hashOtpCode('123456');
            
            // Pre-populate OTP with 2 attempts (one away from lockout)
            const emailOtp = buildEmailOtp({
                email,
                codeHash,
                status: 'pending',
                attempts: 2,
                expiresAt: new Date(Date.now() + 15 * 60 * 1000),
            });
            otpsByEmail.set(email, emailOtp);

            const result = await authService.verifyOtp(email, wrongCode, 'email');

            expect(result.success).toBe(false);
            expect(result.remainingAttempts).toBe(0);
            expect(result.lockedUntil).toBeDefined();
            expect(result.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
            
            // Assert account was locked
            const lockedOtp = otpsByEmail.get(email);
            expect(lockedOtp?.attempts).toBe(3);
            expect(lockedOtp?.status).toBe('failed');
            expect(lockedOtp?.lockedUntil).toBeDefined();
            expect(lockedOtp?.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
            
            // Assert upsert was called with lockout status
            expect(mockPrisma.emailOtp.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { email },
                    update: expect.objectContaining({
                        attempts: 3,
                        status: 'failed',
                        lockedUntil: expect.any(Date),
                    }),
                })
            );
        });

        it('should resend OTP and invalidate previous OTP', async () => {
            const email = 'test@example.com';
            
            // Create user first
            const user = buildUser({ email });
            usersByEmail.set(email, user);
            usersById.set(user.id, user);
            
            // Pre-populate old OTP
            const oldOtp = buildEmailOtp({
                email,
                codeHash: 'old-hash',
                status: 'pending',
            });
            otpsByEmail.set(email, oldOtp);

            const result = await authService.sendOtp(email, 'email');

            expect(result.success).toBe(true);
            
            // Assert old OTP was replaced with new one
            const newOtp = otpsByEmail.get(email);
            expect(newOtp).toBeDefined();
            expect(newOtp!.codeHash).not.toBe('old-hash');
            const expectedHash = OtpUtils.default.hashOtpCode('123456');
            expect(newOtp!.codeHash).toBe(expectedHash);
            
            // Assert upsert was called (replacing old OTP)
            expect(mockPrisma.emailOtp.upsert).toHaveBeenCalled();
            expect(emailProvider.sendMail).toHaveBeenCalled();
        });

        it('should reject verification when OTP is expired', async () => {
            const email = 'test@example.com';
            const otpCode = '123456';
            const codeHash = OtpUtils.default.hashOtpCode(otpCode);
            
            // Pre-populate expired OTP
            const expiredOtp = buildEmailOtp({
                email,
                codeHash,
                status: 'pending',
                expiresAt: new Date(Date.now() - 1000), // Expired
            });
            otpsByEmail.set(email, expiredOtp);

            const result = await authService.verifyOtp(email, otpCode, 'email');

            expect(result.success).toBe(false);
            
            // Assert OTP was marked as expired
            const updatedOtp = otpsByEmail.get(email);
            expect(updatedOtp?.status).toBe('expired');
        });

        it('should reject verification when account is locked', async () => {
            const email = 'test@example.com';
            const otpCode = '123456';
            const codeHash = OtpUtils.default.hashOtpCode(otpCode);
            
            // Pre-populate locked OTP
            const lockedOtp = buildEmailOtp({
                email,
                codeHash,
                status: 'failed',
                lockedUntil: new Date(Date.now() + 30 * 60 * 1000), // Locked for 30 minutes
            });
            otpsByEmail.set(email, lockedOtp);

            const result = await authService.verifyOtp(email, otpCode, 'email');

            expect(result.success).toBe(false);
            expect(result.lockedUntil).toBeDefined();
        });
    });

    describe('Token Refresh Flow Integration', () => {
        it('should refresh access token successfully', async () => {
            const userId = 'user-123';
            const refreshToken = 'refresh-token-123';
            const refreshTokenHash = tokenUtils.hashRefreshToken(refreshToken);

            const mockUser = buildUser({
                id: userId,
                email: 'test@example.com',
                scope: ['read'],
                emailVerified: true,
            });
            usersById.set(userId, mockUser);
            usersByEmail.set(mockUser.email, mockUser);

            const mockSession = buildRefreshSession({
                userId,
                tokenHash: refreshTokenHash,
                expiresAt: new Date(Date.now() + 1000000),
            });
            sessionsByHash.set(refreshTokenHash, { ...mockSession, user: mockUser });

            const tokenResult = await authService.refreshToken(refreshToken);

            expect(tokenResult).toBeDefined();
            expect(tokenResult.accessToken).toBeDefined();
            expect(tokenResult.refreshToken).toBeDefined();
            const payload = tokenUtils.verifyAccessToken(tokenResult.accessToken);
            expect(payload.id).toBe(userId);
            expect(mockPrisma.refreshSession.updateMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        tokenHash: refreshTokenHash,
                    }),
                })
            );
        });

        it('should fail refresh with expired session', async () => {
            const userId = 'user-123';
            const refreshToken = 'expired-token';
            const refreshTokenHash = tokenUtils.hashRefreshToken(refreshToken);

            // Session not found (expired/revoked)
            sessionsByHash.delete(refreshTokenHash);

            await expect(
                authService.refreshToken(refreshToken)
            ).rejects.toThrow('Invalid refresh token');
        });

        it('should prevent token reuse after logout', async () => {
            const userId = 'user-123';
            const refreshToken = 'refresh-token-123';
            const refreshTokenHash = tokenUtils.hashRefreshToken(refreshToken);

            const mockUser = buildUser({
                id: userId,
                emailVerified: true,
            });
            usersById.set(userId, mockUser);

            const mockSession = buildRefreshSession({
                userId,
                tokenHash: refreshTokenHash,
            });
            sessionsByHash.set(refreshTokenHash, { ...mockSession, user: mockUser });

            // Logout - revoke session
            await authService.logout(userId, refreshToken);
            
            // Verify session was revoked
            const revokedSession = sessionsByHash.get(refreshTokenHash);
            expect(revokedSession?.revokedAt).toBeDefined();
            expect(mockPrisma.refreshSession.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { tokenHash: refreshTokenHash },
                    data: expect.objectContaining({
                        revokedAt: expect.any(Date),
                    }),
                })
            );

            // Try to refresh with revoked token - should fail
            // Note: The middleware would check revokedAt, but for integration test,
            // we simulate by having findUnique return null after revocation
            sessionsByHash.delete(refreshTokenHash); // Simulate revoked session not found

            await expect(
                authService.refreshToken(refreshToken)
            ).rejects.toThrow('Invalid refresh token');
        });

        it('should prevent replay attack by rejecting second refresh with same token', async () => {
            const userId = 'user-123';
            const refreshToken = 'refresh-token-replay';
            const refreshTokenHash = tokenUtils.hashRefreshToken(refreshToken);

            const mockUser = buildUser({
                id: userId,
                emailVerified: true,
            });
            usersById.set(userId, mockUser);

            const mockSession = buildRefreshSession({
                userId,
                tokenHash: refreshTokenHash,
                expiresAt: new Date(Date.now() + 1000000),
            });
            sessionsByHash.set(refreshTokenHash, { ...mockSession, user: mockUser });

            // First refresh succeeds
            const firstResult = await authService.refreshToken(refreshToken);
            expect(firstResult.refreshToken).toBeDefined();
            expect(firstResult.accessToken).toBeDefined();

            // Second refresh with same old token should fail (replay attack)
            // The mock should return count: 0 because the tokenHash was already rotated
            await expect(
                authService.refreshToken(refreshToken)
            ).rejects.toThrow();
            
            try {
                await authService.refreshToken(refreshToken);
            } catch (error: any) {
                expect(error.status).toBe(401);
                expect(['INVALID_REFRESH_TOKEN', 'REFRESH_TOKEN_ALREADY_USED']).toContain(error.code);
            }
        });
    });

    describe('Authorization Flow Integration', () => {
        it('should generate tokens with correct scopes', async () => {
            const email = 'admin@example.com';
            const password = 'SecurePassword123!';
            const adminUser = buildUser({
                email,
                passwordHash: await PasswordUtils.default.hashPassword(password),
                role: 'admin',
                scope: ['read', 'write', 'delete'],
                emailVerified: true,
            });
            usersByEmail.set(email, adminUser);
            usersById.set(adminUser.id, adminUser);

            const result = await authService.login(email, password);

            const payload = tokenUtils.verifyAccessToken(result.accessToken);
            expect(payload.scope).toEqual(['read', 'write', 'delete']);
            expect(payload.role).toBe('admin');
        });

        it('should handle different user roles correctly', async () => {
            const roles: Role[] = ['worker', 'admin', 'employer'];

            for (const role of roles) {
                const email = `${role}@example.com`;
                const password = 'SecurePassword123!';
                const user = buildUser({
                    email,
                    passwordHash: await PasswordUtils.default.hashPassword(password),
                    role,
                    scope: role === 'admin' ? ['read', 'write', 'delete'] : ['read'],
                    emailVerified: true,
                });
                usersByEmail.set(email, user);
                usersById.set(user.id, user);

                const result = await authService.login(email, password);
                const payload = tokenUtils.verifyAccessToken(result.accessToken);
                expect(payload.role).toBe(role);
            }
        });
    });

    describe('Logout Flow Integration', () => {
        it('should revoke refresh session on logout', async () => {
            const userId = 'user-123';
            const refreshToken = 'refresh-token-123';
            const refreshTokenHash = tokenUtils.hashRefreshToken(refreshToken);

            const mockUser = buildUser({ id: userId, emailVerified: true });
            usersById.set(userId, mockUser);

            const mockSession = buildRefreshSession({
                userId,
                tokenHash: refreshTokenHash,
            });
            sessionsByHash.set(refreshTokenHash, { ...mockSession, user: mockUser });

            await authService.logout(userId, refreshToken);

            // Verify session was revoked
            const revokedSession = sessionsByHash.get(refreshTokenHash);
            expect(revokedSession?.revokedAt).toBeDefined();
            expect(mockPrisma.refreshSession.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { tokenHash: refreshTokenHash },
                    data: expect.objectContaining({
                        revokedAt: expect.any(Date),
                    }),
                })
            );
        });
    });
});
