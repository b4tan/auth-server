// Mock prisma BEFORE importing - ES modules require unstable_mockModule
import { jest } from '@jest/globals';

const mockPrismaClient = {
    userCredentials: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
    },
    refreshSession: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
    },
    emailOtp: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
    },
};

jest.unstable_mockModule('@lib/prisma.js', () => ({
    prisma: mockPrismaClient,
}));

// Import prisma first to ensure the mock is applied
const { prisma } = await import('@lib/prisma.js');

// Import repository modules after mocking prisma - this ensures they use the mocked prisma
// We need to import the individual repositories to ensure they load with the mocked prisma
await import('@repositories/user.repository.js');
await import('@repositories/email-otp.repository.js');
await import('@repositories/refresh-session.repository.js');

// Now import AuthRepository - it will use the repositories that have the mocked prisma
const { AuthRepository } = await import('@repositories/auth.repository.js');
import type { UserCredentials, RefreshSession, Role, EmailOtp } from '@prisma/client';

describe('AuthRepository', () => {
    let repository: InstanceType<typeof AuthRepository>;
    // Use the mocked prisma from the import
    const mockPrisma = prisma as jest.Mocked<typeof prisma>;

    beforeEach(() => {
        repository = new AuthRepository();
        jest.clearAllMocks();
    });

    describe('findUserByEmail', () => {
        it('should return user when exists', async () => {
            const mockUser: UserCredentials = {
                id: 'user-123',
                email: 'test@example.com',
                passwordHash: 'hashed',
                phone: '+15551234567',
                role: 'worker' as Role,
                scope: ['read'],
                emailVerified: false,
                phoneVerified: false,
                disabled: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockPrisma.userCredentials.findUnique.mockResolvedValue(mockUser);

            const result = await repository.findUserByEmail('test@example.com');

            expect(mockPrisma.userCredentials.findUnique).toHaveBeenCalledWith({
                where: { email: 'test@example.com' },
            });
            expect(result).toEqual(mockUser);
        });

        it('should return null when not found', async () => {
            mockPrisma.userCredentials.findUnique.mockResolvedValue(null);

            const result = await repository.findUserByEmail('nonexistent@example.com');

            expect(result).toBeNull();
        });
    });

    describe('findUserById', () => {
        it('should return user when exists', async () => {
            const mockUser: UserCredentials = {
                id: 'user-123',
                email: 'test@example.com',
                passwordHash: 'hashed',
                phone: '+15551234567',
                role: 'worker' as Role,
                scope: ['read'],
                emailVerified: false,
                phoneVerified: false,
                disabled: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockPrisma.userCredentials.findUnique.mockResolvedValue(mockUser);

            const result = await repository.findUserById('user-123');

            expect(mockPrisma.userCredentials.findUnique).toHaveBeenCalledWith({
                where: { id: 'user-123' },
            });
            expect(result).toEqual(mockUser);
        });

        it('should return null when not found', async () => {
            mockPrisma.userCredentials.findUnique.mockResolvedValue(null);

            const result = await repository.findUserById('nonexistent-id');

            expect(result).toBeNull();
        });
    });

    describe('findUserByPhone', () => {
        it('should return user when exists', async () => {
            const mockUser: UserCredentials = {
                id: 'user-123',
                email: 'test@example.com',
                passwordHash: 'hashed',
                phone: '+15551234567',
                role: 'worker' as Role,
                scope: ['read'],
                emailVerified: false,
                phoneVerified: false,
                disabled: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockPrisma.userCredentials.findUnique.mockResolvedValue(mockUser);

            const result = await repository.findUserByPhone('+15551234567');

            expect(mockPrisma.userCredentials.findUnique).toHaveBeenCalledWith({
                where: { phone: '+15551234567' },
            });
            expect(result).toEqual(mockUser);
        });

        it('should return null when not found', async () => {
            mockPrisma.userCredentials.findUnique.mockResolvedValue(null);

            const result = await repository.findUserByPhone('+19999999999');

            expect(result).toBeNull();
        });
    });

    describe('createUser', () => {
        it('should create user with correct data', async () => {
            const inputData = {
                email: 'new@example.com',
                password: 'hashed-password',
                phone: '+15551234567',
                role: 'worker' as Role,
                scope: ['read'],
            };

            const mockUser: UserCredentials = {
                id: 'new-user-123',
                email: inputData.email,
                passwordHash: inputData.password,
                phone: inputData.phone,
                role: inputData.role,
                scope: inputData.scope,
                emailVerified: false,
                phoneVerified: false,
                disabled: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockPrisma.userCredentials.create.mockResolvedValue(mockUser);

            const result = await repository.createUser(inputData);

            expect(mockPrisma.userCredentials.create).toHaveBeenCalledWith({
                data: {
                    email: inputData.email,
                    passwordHash: inputData.password,
                    phone: inputData.phone,
                    role: inputData.role,
                    scope: inputData.scope,
                },
            });
            expect(result).toEqual(mockUser);
        });
    });

    describe('verifyUserEmail', () => {
        it('should mark email as verified', async () => {
            const mockUser: UserCredentials = {
                id: 'user-123',
                email: 'test@example.com',
                passwordHash: 'hashed',
                phone: '+15551234567',
                role: 'worker' as Role,
                scope: ['read'],
                emailVerified: true,
                phoneVerified: false,
                disabled: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockPrisma.userCredentials.update.mockResolvedValue(mockUser);

            const result = await repository.verifyUserEmail('test@example.com');

            expect(mockPrisma.userCredentials.update).toHaveBeenCalledWith({
                where: { email: 'test@example.com' },
                data: { emailVerified: true },
            });
            expect(result).toEqual(mockUser);
        });
    });

    describe('verifyUserPhone', () => {
        it('should mark phone as verified', async () => {
            const mockUser: UserCredentials = {
                id: 'user-123',
                email: 'test@example.com',
                passwordHash: 'hashed',
                phone: '+15551234567',
                role: 'worker' as Role,
                scope: ['read'],
                emailVerified: false,
                phoneVerified: true,
                disabled: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockPrisma.userCredentials.update.mockResolvedValue(mockUser);

            const result = await repository.verifyUserPhone('+15551234567');

            expect(mockPrisma.userCredentials.update).toHaveBeenCalledWith({
                where: { phone: '+15551234567' },
                data: { phoneVerified: true },
            });
            expect(result).toEqual(mockUser);
        });
    });

    describe('disableUser', () => {
        it('should disable user', async () => {
            mockPrisma.userCredentials.update.mockResolvedValue({} as any);

            await repository.disableUser('user-123');

            expect(mockPrisma.userCredentials.update).toHaveBeenCalledWith({
                where: { id: 'user-123' },
                data: { disabled: true },
            });
        });
    });

    describe('enableUser', () => {
        it('should enable user', async () => {
            mockPrisma.userCredentials.update.mockResolvedValue({} as any);

            await repository.enableUser('user-123');

            expect(mockPrisma.userCredentials.update).toHaveBeenCalledWith({
                where: { id: 'user-123' },
                data: { disabled: false },
            });
        });
    });

    describe('findOtpbyEmail', () => {
        it('should return OTP when exists', async () => {
            const mockOtp: EmailOtp = {
                id: 'otp-123',
                email: 'test@example.com',
                codeHash: 'hashed-code',
                status: 'pending',
                attempts: 0,
                lockedUntil: null,
                expiresAt: new Date(Date.now() + 1000000),
                createdAt: new Date(),
            };

            mockPrisma.emailOtp.findUnique.mockResolvedValue(mockOtp);

            const result = await repository.findOtpbyEmail('test@example.com');

            expect(mockPrisma.emailOtp.findUnique).toHaveBeenCalledWith({
                where: { email: 'test@example.com' },
            });
            expect(result).toEqual(mockOtp);
        });

        it('should return null when not found', async () => {
            mockPrisma.emailOtp.findUnique.mockResolvedValue(null);

            const result = await repository.findOtpbyEmail('nonexistent@example.com');

            expect(result).toBeNull();
        });
    });

    describe('upsertEmailOtp', () => {
        it('should create OTP when not exists', async () => {
            const mockOtp: EmailOtp = {
                id: 'otp-123',
                email: 'test@example.com',
                codeHash: 'hashed-code',
                status: 'pending',
                attempts: 0,
                lockedUntil: null,
                expiresAt: new Date(Date.now() + 1000000),
                createdAt: new Date(),
            };

            mockPrisma.emailOtp.upsert.mockResolvedValue(mockOtp);

            const result = await repository.upsertEmailOtp('test@example.com', {
                codeHash: 'hashed-code',
                expiresAt: new Date(Date.now() + 1000000),
                status: 'pending',
            });

            expect(mockPrisma.emailOtp.upsert).toHaveBeenCalledWith({
                where: { email: 'test@example.com' },
                update: {
                    codeHash: 'hashed-code',
                    expiresAt: expect.any(Date),
                    status: 'pending',
                },
                create: {
                    email: 'test@example.com',
                    codeHash: 'hashed-code',
                    expiresAt: expect.any(Date),
                    status: 'pending',
                    attempts: 0,
                    lockedUntil: null,
                },
            });
            expect(result).toEqual(mockOtp);
        });

        it('should update OTP when exists', async () => {
            const mockOtp: EmailOtp = {
                id: 'otp-123',
                email: 'test@example.com',
                codeHash: 'hashed-code',
                status: 'verified',
                attempts: 1,
                lockedUntil: null,
                expiresAt: new Date(Date.now() + 1000000),
                createdAt: new Date(),
            };

            mockPrisma.emailOtp.upsert.mockResolvedValue(mockOtp);

            const result = await repository.upsertEmailOtp('test@example.com', {
                status: 'verified',
                attempts: 1,
            });

            expect(mockPrisma.emailOtp.upsert).toHaveBeenCalledWith({
                where: { email: 'test@example.com' },
                update: {
                    status: 'verified',
                    attempts: 1,
                },
                create: expect.objectContaining({
                    email: 'test@example.com',
                    expiresAt: expect.any(Date),
                    status: 'verified', // Uses data.status since it's provided
                    attempts: 1, // Uses data.attempts since it's provided
                    lockedUntil: null,
                }),
            });
            expect(result).toEqual(mockOtp);
        });
    });

    describe('createRefreshSession', () => {
        it('should create session', async () => {
            const sessionData = {
                userId: 'user-123',
                tokenHash: 'hashed-token',
                expiresAt: new Date(Date.now() + 1000000),
            };

            const mockSession: RefreshSession = {
                id: 'session-123',
                userId: sessionData.userId,
                tokenHash: sessionData.tokenHash,
                expiresAt: sessionData.expiresAt,
                revokedAt: null,
                createdAt: new Date(),
            };

            mockPrisma.refreshSession.create.mockResolvedValue(mockSession);

            const result = await repository.createRefreshSession(sessionData);

            expect(mockPrisma.refreshSession.create).toHaveBeenCalledWith({
                data: sessionData,
            });
            expect(result).toEqual(mockSession);
        });
    });

    describe('findRefreshSessionByHash', () => {
        it('should return session with user', async () => {
            const mockUser: UserCredentials = {
                id: 'user-123',
                email: 'test@example.com',
                passwordHash: 'hashed',
                phone: '+15551234567',
                role: 'worker' as Role,
                scope: ['read'],
                emailVerified: false,
                phoneVerified: false,
                disabled: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            const mockSession: RefreshSession & { user: UserCredentials } = {
                id: 'session-123',
                userId: 'user-123',
                tokenHash: 'hashed-token',
                expiresAt: new Date(),
                revokedAt: null,
                createdAt: new Date(),
                user: mockUser,
            };

            mockPrisma.refreshSession.findUnique.mockResolvedValue(mockSession);

            const result = await repository.findRefreshSessionByHash('hashed-token');

            expect(mockPrisma.refreshSession.findUnique).toHaveBeenCalledWith({
                where: { tokenHash: 'hashed-token' },
                include: { user: true },
            });
            expect(result).toEqual(mockSession);
        });

        it('should return null when session not found', async () => {
            mockPrisma.refreshSession.findUnique.mockResolvedValue(null);

            const result = await repository.findRefreshSessionByHash('nonexistent-hash');

            expect(result).toBeNull();
        });
    });

    describe('revokeRefreshSession', () => {
        it('should mark session as revoked', async () => {
            mockPrisma.refreshSession.update.mockResolvedValue({} as any);

            await repository.revokeRefreshSession('hashed-token');

            expect(mockPrisma.refreshSession.update).toHaveBeenCalledWith({
                where: { tokenHash: 'hashed-token' },
                data: { revokedAt: expect.any(Date) },
            });
        });
    });

    describe('updateRefreshSession', () => {
        it('should extend expiration', async () => {
            mockPrisma.refreshSession.update.mockResolvedValue({} as any);

            await repository.updateRefreshSession('hashed-token');

            expect(mockPrisma.refreshSession.update).toHaveBeenCalledWith({
                where: { tokenHash: 'hashed-token' },
                data: { expiresAt: expect.any(Date) },
            });
        });
    });

    describe('rotateRefreshSession', () => {
        it('should atomically rotate refresh token successfully', async () => {
            const oldTokenHash = 'old-hash';
            const newTokenHash = 'new-hash';
            const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

            mockPrisma.refreshSession.updateMany.mockResolvedValue({ count: 1 });

            await repository.rotateRefreshSession(oldTokenHash, newTokenHash, newExpiresAt);

            expect(mockPrisma.refreshSession.updateMany).toHaveBeenCalledWith({
                where: {
                    tokenHash: oldTokenHash,
                    revokedAt: null,
                    expiresAt: { gt: expect.any(Date) },
                },
                data: {
                    tokenHash: newTokenHash,
                    expiresAt: newExpiresAt,
                },
            });
        });

        it('should throw invalidRefreshToken when count is 0', async () => {
            const oldTokenHash = 'old-hash';
            const newTokenHash = 'new-hash';
            const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

            mockPrisma.refreshSession.updateMany.mockResolvedValue({ count: 0 });

            const { AuthErrors } = await import('@errors/auth.error.js');
            await expect(
                repository.rotateRefreshSession(oldTokenHash, newTokenHash, newExpiresAt)
            ).rejects.toThrow();
            
            try {
                await repository.rotateRefreshSession(oldTokenHash, newTokenHash, newExpiresAt);
            } catch (error: any) {
                expect(error.status).toBe(401);
                expect(error.code).toBe('INVALID_REFRESH_TOKEN');
            }
        });

        it('should throw refreshTokenAlreadyUsed when count !== 1', async () => {
            const oldTokenHash = 'old-hash';
            const newTokenHash = 'new-hash';
            const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

            mockPrisma.refreshSession.updateMany.mockResolvedValue({ count: 2 });

            const { AuthErrors } = await import('@errors/auth.error.js');
            await expect(
                repository.rotateRefreshSession(oldTokenHash, newTokenHash, newExpiresAt)
            ).rejects.toThrow();
            
            try {
                await repository.rotateRefreshSession(oldTokenHash, newTokenHash, newExpiresAt);
            } catch (error: any) {
                expect(error.status).toBe(401);
                expect(error.code).toBe('REFRESH_TOKEN_ALREADY_USED');
            }
        });

        it('should throw refreshTokenCollision on P2002 uniqueness constraint', async () => {
            const oldTokenHash = 'old-hash';
            const newTokenHash = 'new-hash';
            const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

            const { Prisma } = await import('@prisma/client');
            const prismaError = new Prisma.PrismaClientKnownRequestError(
                'Unique constraint violation',
                {
                    code: 'P2002',
                    clientVersion: '5.0.0',
                } as any
            );

            mockPrisma.refreshSession.updateMany.mockRejectedValue(prismaError);

            const { AuthErrors } = await import('@errors/auth.error.js');
            await expect(
                repository.rotateRefreshSession(oldTokenHash, newTokenHash, newExpiresAt)
            ).rejects.toThrow();
            
            try {
                await repository.rotateRefreshSession(oldTokenHash, newTokenHash, newExpiresAt);
            } catch (error: any) {
                expect(error.status).toBe(500);
                expect(error.code).toBe('REFRESH_TOKEN_COLLISION');
            }
        });

        it('should re-throw non-P2002 Prisma errors', async () => {
            const oldTokenHash = 'old-hash';
            const newTokenHash = 'new-hash';
            const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

            const { Prisma } = await import('@prisma/client');
            const prismaError = new Prisma.PrismaClientKnownRequestError(
                'Some other error',
                {
                    code: 'P2003',
                    clientVersion: '5.0.0',
                } as any
            );

            mockPrisma.refreshSession.updateMany.mockRejectedValue(prismaError);

            await expect(
                repository.rotateRefreshSession(oldTokenHash, newTokenHash, newExpiresAt)
            ).rejects.toThrow(prismaError);
        });

        it('should re-throw non-Prisma errors', async () => {
            const oldTokenHash = 'old-hash';
            const newTokenHash = 'new-hash';
            const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

            const genericError = new Error('Database connection failed');
            mockPrisma.refreshSession.updateMany.mockRejectedValue(genericError);

            await expect(
                repository.rotateRefreshSession(oldTokenHash, newTokenHash, newExpiresAt)
            ).rejects.toThrow('Database connection failed');
        });
    });
    });
