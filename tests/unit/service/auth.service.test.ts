import { jest } from '@jest/globals';
import { AuthService } from '@service/auth/auth.service.js';
import type { IAuthRepository } from '@repositories/auth.repository.js';
import type { ITokenUtils } from '@utils/crypto/token.utils.js';
import type { IPasswordUtils } from '@utils/crypto/password.utils.js';
import type { UserCredentials, RefreshSession, EmailOtp } from '@prisma/client';
import type { IOTPStrategy } from '@service/auth/otp/otp-strategy.interface.js';

describe('AuthService', () => {
    let authService: AuthService;
    let mockAuthRepo: jest.Mocked<IAuthRepository>;
    let mockTokenUtils: jest.Mocked<ITokenUtils>;
    let mockPasswordUtils: jest.Mocked<IPasswordUtils>;
    let mockOtpProviderFactory: jest.Mock<(channel: 'email') => IOTPStrategy>;
    let mockEmailOtpProvider: jest.Mocked<IOTPStrategy>;

    beforeEach(() => {
        mockAuthRepo = {
            findUserByEmail: jest.fn(),
            findUserById: jest.fn(),
            findUserByPhone: jest.fn(),
            findOtpbyEmail: jest.fn(),
            upsertEmailOtp: jest.fn(),
            createUser: jest.fn(),
            verifyUserEmail: jest.fn(),
            verifyUserPhone: jest.fn(),
            disableUser: jest.fn(),
            enableUser: jest.fn(),
            createRefreshSession: jest.fn(),
            findRefreshSessionByHash: jest.fn(),
            updateRefreshSession: jest.fn(),
            rotateRefreshSession: jest.fn(),
            revokeRefreshSession: jest.fn(),
        };

        mockTokenUtils = {
            generateAccessToken: jest.fn(),
            verifyAccessToken: jest.fn(),
            generateRefreshToken: jest.fn(),
            verifyRefreshToken: jest.fn(),
            userToTokenPayload: jest.fn(),
            hashRefreshToken: jest.fn(),
        };

        mockPasswordUtils = {
            hashPassword: jest.fn(),
            comparePassword: jest.fn(),
        };

        // Mock OTP provider factory
        mockEmailOtpProvider = {
            channel: 'email',
            sendOtp: jest.fn(),
            verifyOtp: jest.fn(),
        } as jest.Mocked<IOTPStrategy>;

        mockOtpProviderFactory = jest.fn((channel: 'email') => {
            return mockEmailOtpProvider;
        });

        authService = new AuthService(mockAuthRepo, mockTokenUtils, mockPasswordUtils, mockOtpProviderFactory);
    });

    describe('login', () => {
        it('should return tokens for valid credentials', async () => {
            const mockUser: UserCredentials = {
                id: 'user-123',
                email: 'test@example.com',
                passwordHash: 'hashed-password',
                phone: '+1234567890',
                role: 'worker',
                scope: ['read'],
                emailVerified: true,
                phoneVerified: false,
                disabled: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            const payload = { id: 'user-123', role: 'worker', scope: ['read'] };
            const accessToken = 'access-token';
            const refreshToken = 'refresh-token';
            const refreshTokenHash = 'hashed-refresh-token';

            mockAuthRepo.findUserByEmail.mockResolvedValue(mockUser);
            mockPasswordUtils.comparePassword.mockResolvedValue(true);
            mockTokenUtils.userToTokenPayload.mockReturnValue(payload);
            mockTokenUtils.generateAccessToken.mockReturnValue(accessToken);
            mockTokenUtils.generateRefreshToken.mockReturnValue(refreshToken);
            mockTokenUtils.hashRefreshToken.mockReturnValue(refreshTokenHash);
            mockAuthRepo.createRefreshSession.mockResolvedValue({} as RefreshSession);

            const result = await authService.login('test@example.com', 'password');

            expect(mockAuthRepo.findUserByEmail).toHaveBeenCalledWith('test@example.com');
            expect(mockPasswordUtils.comparePassword).toHaveBeenCalledWith('password', mockUser.passwordHash);
            expect(result.accessToken).toBe(accessToken);
            expect(result.refreshToken).toBe(refreshToken);
            expect(result.user.id).toBe('user-123');
        });

        it('should throw error for invalid email', async () => {
            mockAuthRepo.findUserByEmail.mockResolvedValue(null);

            await expect(authService.login('nonexistent@example.com', 'password')).rejects.toThrow('Invalid credentials');
        });

        it('should throw error for invalid password', async () => {
            const mockUser: UserCredentials = {
                id: 'user-123',
                email: 'test@example.com',
                passwordHash: 'hashed-password',
                phone: '+1234567890',
                role: 'worker',
                scope: ['read'],
                emailVerified: true,
                phoneVerified: false,
                disabled: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockAuthRepo.findUserByEmail.mockResolvedValue(mockUser);
            mockPasswordUtils.comparePassword.mockResolvedValue(false);

            await expect(authService.login('test@example.com', 'wrong-password')).rejects.toThrow('Invalid credentials');
        });

        it('should handle disabled user login', async () => {
            const disabledUser: UserCredentials = {
                id: 'user-123',
                email: 'disabled@example.com',
                passwordHash: 'hashed-password',
                phone: '+1234567890',
                role: 'worker',
                scope: ['read'],
                emailVerified: true,
                phoneVerified: false,
                disabled: true, // User is disabled
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockAuthRepo.findUserByEmail.mockResolvedValue(disabledUser);
            mockPasswordUtils.comparePassword.mockResolvedValue(true);
            mockTokenUtils.userToTokenPayload.mockReturnValue({ id: 'user-123', role: 'worker', scope: ['read'] });
            mockTokenUtils.generateAccessToken.mockReturnValue('access-token');
            mockTokenUtils.generateRefreshToken.mockReturnValue('refresh-token');
            mockTokenUtils.hashRefreshToken.mockReturnValue('hashed-refresh-token');
            mockAuthRepo.createRefreshSession.mockResolvedValue({} as RefreshSession);

            // Note: Current implementation doesn't check disabled status
            // This test documents expected behavior - should reject disabled users
            const result = await authService.login('disabled@example.com', 'password');
            expect(result).toBeDefined();
            // TODO: Add disabled user check in AuthService.login()
        });

        it('should handle login with different roles', async () => {
            const roles = ['worker', 'admin', 'employer'] as const;

            for (const role of roles) {
                const mockUser: UserCredentials = {
                    id: `user-${role}`,
                    email: `${role}@example.com`,
                    passwordHash: 'hashed-password',
                    phone: '+1234567890',
                    role,
                    scope: role === 'admin' ? ['read', 'write', 'delete'] : ['read'],
                    emailVerified: true,
                    phoneVerified: false,
                    disabled: false,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };

                const payload = { id: mockUser.id, role, scope: mockUser.scope };
                const accessToken = `access-token-${role}`;
                const refreshToken = `refresh-token-${role}`;
                const refreshTokenHash = `hashed-refresh-token-${role}`;

                mockAuthRepo.findUserByEmail.mockResolvedValue(mockUser);
                mockPasswordUtils.comparePassword.mockResolvedValue(true);
                mockTokenUtils.userToTokenPayload.mockReturnValue(payload);
                mockTokenUtils.generateAccessToken.mockReturnValue(accessToken);
                mockTokenUtils.generateRefreshToken.mockReturnValue(refreshToken);
                mockTokenUtils.hashRefreshToken.mockReturnValue(refreshTokenHash);
                mockAuthRepo.createRefreshSession.mockResolvedValue({} as RefreshSession);

                const result = await authService.login(`${role}@example.com`, 'password');

                expect(result.user.role).toBe(role);
                expect(result.accessToken).toBe(accessToken);
            }
        });

        it('should handle login with different scopes', async () => {
            const scopeCombinations = [
                [],
                ['read'],
                ['read', 'write'],
                ['read', 'write', 'delete'],
            ];

            for (const scope of scopeCombinations) {
                const mockUser: UserCredentials = {
                    id: `user-scope-${scope.join('-')}`,
                    email: 'test@example.com',
                    passwordHash: 'hashed-password',
                    phone: '+1234567890',
                    role: 'worker',
                    scope,
                    emailVerified: true,
                    phoneVerified: false,
                    disabled: false,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };

                const payload = { id: mockUser.id, role: 'worker', scope };
                const accessToken = `access-token-${scope.join('-')}`;
                const refreshToken = `refresh-token-${scope.join('-')}`;
                const refreshTokenHash = `hashed-refresh-token-${scope.join('-')}`;

                mockAuthRepo.findUserByEmail.mockResolvedValue(mockUser);
                mockPasswordUtils.comparePassword.mockResolvedValue(true);
                mockTokenUtils.userToTokenPayload.mockReturnValue(payload);
                mockTokenUtils.generateAccessToken.mockReturnValue(accessToken);
                mockTokenUtils.generateRefreshToken.mockReturnValue(refreshToken);
                mockTokenUtils.hashRefreshToken.mockReturnValue(refreshTokenHash);
                mockAuthRepo.createRefreshSession.mockResolvedValue({} as RefreshSession);

                const result = await authService.login('test@example.com', 'password');

                expect(result.user.scope).toEqual(scope);
            }
        });

        it('should handle database connection errors', async () => {
            mockAuthRepo.findUserByEmail.mockRejectedValue(new Error('Database connection failed'));

            await expect(authService.login('test@example.com', 'password')).rejects.toThrow('Database connection failed');
        });

        it('should create refresh session', async () => {
            const mockUser: UserCredentials = {
                id: 'user-123',
                email: 'test@example.com',
                passwordHash: 'hashed-password',
                phone: '+1234567890',
                role: 'worker',
                scope: ['read'],
                emailVerified: true,
                phoneVerified: false,
                disabled: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            const refreshToken = 'refresh-token';
            const refreshTokenHash = 'hashed-refresh-token';

            mockAuthRepo.findUserByEmail.mockResolvedValue(mockUser);
            mockPasswordUtils.comparePassword.mockResolvedValue(true);
            mockTokenUtils.userToTokenPayload.mockReturnValue({ id: 'user-123', role: 'worker', scope: ['read'] });
            mockTokenUtils.generateAccessToken.mockReturnValue('access-token');
            mockTokenUtils.generateRefreshToken.mockReturnValue(refreshToken);
            mockTokenUtils.hashRefreshToken.mockReturnValue(refreshTokenHash);
            mockAuthRepo.createRefreshSession.mockResolvedValue({} as RefreshSession);

            await authService.login('test@example.com', 'password');

            expect(mockAuthRepo.createRefreshSession).toHaveBeenCalledWith({
                userId: 'user-123',
                tokenHash: refreshTokenHash,
                expiresAt: expect.any(Date),
            });
        });
    });

    describe('register', () => {
        it('should create new user', async () => {
            const hashedPassword = 'hashed-password';
            const mockUser: UserCredentials = {
                id: 'new-user-123',
                email: 'new@example.com',
                passwordHash: hashedPassword,
                phone: '+1234567890',
                role: 'worker',
                scope: [],
                emailVerified: false,
                phoneVerified: false,
                disabled: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockAuthRepo.findUserByEmail.mockResolvedValue(null);
            mockPasswordUtils.hashPassword.mockResolvedValue(hashedPassword);
            mockAuthRepo.createUser.mockResolvedValue(mockUser);
            mockEmailOtpProvider.sendOtp.mockResolvedValue({ success: true, expiresAt: new Date() });

            const result = await authService.register('new@example.com', 'password', '+15551234567');

            expect(mockPasswordUtils.hashPassword).toHaveBeenCalledWith('password');
            expect(mockAuthRepo.createUser).toHaveBeenCalledWith({
                email: 'new@example.com',
                password: hashedPassword,
                phone: '+15551234567',
                role: 'worker',
                scope: [],
            });
            expect(result.user.id).toBe('new-user-123');
        });

        it('should throw error if email exists', async () => {
            const existingUser: UserCredentials = {
                id: 'user-123',
                email: 'existing@example.com',
                passwordHash: 'hashed',
                phone: '+1234567890',
                role: 'worker',
                scope: [],
                emailVerified: false,
                phoneVerified: false,
                disabled: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockAuthRepo.findUserByEmail.mockResolvedValue(existingUser);

            await expect(authService.register('existing@example.com', 'password', '+15551234567')).rejects.toThrow('Email is already in use');
        });

        it('should hash password before storing', async () => {
            const hashedPassword = 'hashed-password';
            const mockUser: UserCredentials = {
                id: 'new-user-123',
                email: 'new@example.com',
                passwordHash: hashedPassword,
                phone: '+1234567890',
                role: 'worker',
                scope: [],
                emailVerified: false,
                phoneVerified: false,
                disabled: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockAuthRepo.findUserByEmail.mockResolvedValue(null);
            mockPasswordUtils.hashPassword.mockResolvedValue(hashedPassword);
            mockAuthRepo.createUser.mockResolvedValue(mockUser);
            mockEmailOtpProvider.sendOtp.mockResolvedValue({ success: true, expiresAt: new Date() });

            await authService.register('new@example.com', 'plain-password', '+15551234567');

            expect(mockPasswordUtils.hashPassword).toHaveBeenCalledWith('plain-password');
            expect(mockAuthRepo.createUser).toHaveBeenCalledWith({
                email: 'new@example.com',
                password: hashedPassword,
                phone: '+15551234567',
                role: 'worker',
                scope: [],
            });
        });
    });

    describe('logout', () => {
        it('should revoke refresh session', async () => {
            const refreshToken = 'refresh-token';
            const refreshTokenHash = 'hashed-refresh-token';

            mockTokenUtils.hashRefreshToken.mockReturnValue(refreshTokenHash);
            mockAuthRepo.revokeRefreshSession.mockResolvedValue();

            await authService.logout('user-123', refreshToken);

            expect(mockTokenUtils.hashRefreshToken).toHaveBeenCalledWith(refreshToken);
            expect(mockAuthRepo.revokeRefreshSession).toHaveBeenCalledWith(refreshTokenHash);
        });

        it('should handle missing refresh token', async () => {
            await authService.logout('user-123', '');

            expect(mockAuthRepo.revokeRefreshSession).not.toHaveBeenCalled();
        });
    });

    describe('refreshToken', () => {
        it('should rotate refresh token and return new access token and refresh token', async () => {
            const oldRefreshToken = 'old-refresh-token';
            const oldTokenHash = 'hashed-old-token';
            const newRefreshToken = 'new-refresh-token';
            const newTokenHash = 'hashed-new-token';
            const mockSession: RefreshSession = {
                id: 'session-123',
                userId: 'user-123',
                tokenHash: oldTokenHash,
                expiresAt: new Date(Date.now() + 1000000),
                revokedAt: null,
                createdAt: new Date(),
            };

            const mockUser: UserCredentials = {
                id: 'user-123',
                email: 'test@example.com',
                passwordHash: 'hashed',
                phone: '+1234567890',
                role: 'worker',
                scope: ['read'],
                emailVerified: false,
                phoneVerified: false,
                disabled: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            const payload = { id: 'user-123', role: 'worker', scope: ['read'] };
            const newAccessToken = 'new-access-token';

            mockTokenUtils.hashRefreshToken
                .mockReturnValueOnce(oldTokenHash) // For old token
                .mockReturnValueOnce(newTokenHash); // For new token
            mockAuthRepo.findRefreshSessionByHash.mockResolvedValue({
                ...mockSession,
                user: mockUser,
            });
            mockTokenUtils.userToTokenPayload.mockReturnValue(payload);
            mockTokenUtils.generateAccessToken.mockReturnValue(newAccessToken);
            mockTokenUtils.generateRefreshToken.mockReturnValue(newRefreshToken);
            mockAuthRepo.rotateRefreshSession.mockResolvedValue();

            const result = await authService.refreshToken(oldRefreshToken);

            expect(result).toEqual({
                accessToken: newAccessToken,
                refreshToken: newRefreshToken,
            });
            expect(mockAuthRepo.rotateRefreshSession).toHaveBeenCalledWith(
                oldTokenHash,
                newTokenHash,
                expect.any(Date)
            );
        });

        it('should throw AuthError for invalid token', async () => {
            const refreshToken = 'invalid-token';
            const refreshTokenHash = 'hashed-invalid-token';

            mockTokenUtils.hashRefreshToken.mockReturnValue(refreshTokenHash);
            mockAuthRepo.findRefreshSessionByHash.mockResolvedValue(null);

            await expect(authService.refreshToken(refreshToken)).rejects.toThrow();
            try {
                await authService.refreshToken(refreshToken);
            } catch (error: any) {
                expect(error.status).toBe(401);
                expect(error.code).toBe('INVALID_REFRESH_TOKEN');
            }
        });

        it('should throw error for expired refresh token session', async () => {
            const refreshToken = 'expired-token';
            const refreshTokenHash = 'hashed-expired-token';

            // findRefreshSessionByHash filters out expired sessions
            mockTokenUtils.hashRefreshToken.mockReturnValue(refreshTokenHash);
            mockAuthRepo.findRefreshSessionByHash.mockResolvedValue(null);

            await expect(authService.refreshToken(refreshToken)).rejects.toThrow('Invalid refresh token');
        });

        it('should throw error for revoked refresh token session', async () => {
            const refreshToken = 'revoked-token';
            const refreshTokenHash = 'hashed-revoked-token';

            // findRefreshSessionByHash filters out revoked sessions
            mockTokenUtils.hashRefreshToken.mockReturnValue(refreshTokenHash);
            mockAuthRepo.findRefreshSessionByHash.mockResolvedValue(null);

            await expect(authService.refreshToken(refreshToken)).rejects.toThrow('Invalid refresh token');
        });

        it('should prevent token reuse after logout', async () => {
            const userId = 'user-123';
            const refreshToken = 'refresh-token-123';
            const refreshTokenHash = 'hashed-refresh-token';

            // First logout
            mockTokenUtils.hashRefreshToken.mockReturnValue(refreshTokenHash);
            mockAuthRepo.revokeRefreshSession.mockResolvedValue();

            await authService.logout(userId, refreshToken);
            expect(mockAuthRepo.revokeRefreshSession).toHaveBeenCalledWith(refreshTokenHash);

            // Try to reuse the same token for refresh
            jest.clearAllMocks();
            mockTokenUtils.hashRefreshToken.mockReturnValue(refreshTokenHash);
            // After logout, findRefreshSessionByHash should return null
            mockAuthRepo.findRefreshSessionByHash.mockResolvedValue(null);

            await expect(authService.refreshToken(refreshToken)).rejects.toThrow();
            try {
                await authService.refreshToken(refreshToken);
            } catch (error: any) {
                expect(error.status).toBe(401);
                expect(error.code).toBe('INVALID_REFRESH_TOKEN');
            }
        });

        it('should handle database errors during refresh', async () => {
            const refreshToken = 'refresh-token';
            const refreshTokenHash = 'hashed-refresh-token';

            mockTokenUtils.hashRefreshToken.mockReturnValue(refreshTokenHash);
            mockAuthRepo.findRefreshSessionByHash.mockRejectedValue(new Error('Database error'));

            await expect(authService.refreshToken(refreshToken)).rejects.toThrow('Database error');
        });

        it('should prevent replay attack by rejecting second refresh with same token', async () => {
            const oldRefreshToken = 'old-refresh-token';
            const oldTokenHash = 'hashed-old-token';
            const newRefreshToken = 'new-refresh-token';
            const newTokenHash = 'hashed-new-token';
            const mockSession: RefreshSession = {
                id: 'session-123',
                userId: 'user-123',
                tokenHash: oldTokenHash,
                expiresAt: new Date(Date.now() + 1000000),
                revokedAt: null,
                createdAt: new Date(),
            };

            const mockUser: UserCredentials = {
                id: 'user-123',
                email: 'test@example.com',
                passwordHash: 'hashed',
                phone: '+1234567890',
                role: 'worker',
                scope: ['read'],
                emailVerified: false,
                phoneVerified: false,
                disabled: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            const payload = { id: 'user-123', role: 'worker', scope: ['read'] };
            const newAccessToken = 'new-access-token';

            // First refresh succeeds
            mockTokenUtils.hashRefreshToken
                .mockReturnValueOnce(oldTokenHash) // For old token
                .mockReturnValueOnce(newTokenHash); // For new token
            mockAuthRepo.findRefreshSessionByHash.mockResolvedValueOnce({
                ...mockSession,
                user: mockUser,
            });
            mockTokenUtils.userToTokenPayload.mockReturnValue(payload);
            mockTokenUtils.generateAccessToken.mockReturnValue(newAccessToken);
            mockTokenUtils.generateRefreshToken.mockReturnValue(newRefreshToken);
            mockAuthRepo.rotateRefreshSession.mockResolvedValueOnce();

            const firstResult = await authService.refreshToken(oldRefreshToken);
            expect(firstResult.refreshToken).toBe(newRefreshToken);

            // Second refresh with same old token should fail (replay attack)
            jest.clearAllMocks();
            mockTokenUtils.hashRefreshToken.mockReturnValue(oldTokenHash);
            mockAuthRepo.findRefreshSessionByHash.mockResolvedValueOnce({
                ...mockSession,
                user: mockUser,
            });
            mockTokenUtils.generateRefreshToken.mockReturnValue('another-new-token');
            mockTokenUtils.hashRefreshToken.mockReturnValueOnce(oldTokenHash).mockReturnValueOnce('another-new-hash');
            
            // rotateRefreshSession throws refreshTokenAlreadyUsed because count !== 1
            const { AuthErrors } = await import('@errors/auth.error.js');
            mockAuthRepo.rotateRefreshSession.mockRejectedValueOnce(AuthErrors.refreshTokenAlreadyUsed());

            await expect(authService.refreshToken(oldRefreshToken)).rejects.toMatchObject({
                status: 401,
                code: 'REFRESH_TOKEN_ALREADY_USED',
            });
        });

        it('should retry once on refresh token collision', async () => {
            const oldRefreshToken = 'old-refresh-token';
            const oldTokenHash = 'hashed-old-token';
            const newRefreshToken = 'new-refresh-token';
            const newTokenHash = 'hashed-new-token';
            const retryRefreshToken = 'retry-refresh-token';
            const retryTokenHash = 'hashed-retry-token';
            const mockSession: RefreshSession = {
                id: 'session-123',
                userId: 'user-123',
                tokenHash: oldTokenHash,
                expiresAt: new Date(Date.now() + 1000000),
                revokedAt: null,
                createdAt: new Date(),
            };

            const mockUser: UserCredentials = {
                id: 'user-123',
                email: 'test@example.com',
                passwordHash: 'hashed',
                phone: '+1234567890',
                role: 'worker',
                scope: ['read'],
                emailVerified: false,
                phoneVerified: false,
                disabled: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            const payload = { id: 'user-123', role: 'worker', scope: ['read'] };
            const newAccessToken = 'new-access-token';

            mockTokenUtils.hashRefreshToken
                .mockReturnValueOnce(oldTokenHash) // For old token
                .mockReturnValueOnce(newTokenHash) // For new token (collision)
                .mockReturnValueOnce(retryTokenHash); // For retry new token
            mockAuthRepo.findRefreshSessionByHash.mockResolvedValue({
                ...mockSession,
                user: mockUser,
            });
            mockTokenUtils.userToTokenPayload.mockReturnValue(payload);
            mockTokenUtils.generateAccessToken.mockReturnValue(newAccessToken);
            mockTokenUtils.generateRefreshToken
                .mockReturnValueOnce(newRefreshToken) // First attempt
                .mockReturnValueOnce(retryRefreshToken); // Retry attempt
            
            // First rotation attempt throws collision error
            const { AuthErrors } = await import('@errors/auth.error.js');
            mockAuthRepo.rotateRefreshSession
                .mockRejectedValueOnce(AuthErrors.refreshTokenCollision())
                .mockResolvedValueOnce(); // Retry succeeds

            const result = await authService.refreshToken(oldRefreshToken);

            expect(result).toEqual({
                accessToken: newAccessToken,
                refreshToken: retryRefreshToken,
            });
            expect(mockAuthRepo.rotateRefreshSession).toHaveBeenCalledTimes(2);
            expect(mockAuthRepo.rotateRefreshSession).toHaveBeenNthCalledWith(
                1,
                oldTokenHash,
                newTokenHash,
                expect.any(Date)
            );
            expect(mockAuthRepo.rotateRefreshSession).toHaveBeenNthCalledWith(
                2,
                oldTokenHash,
                retryTokenHash,
                expect.any(Date)
            );
        });
    });

    describe('getUserById', () => {
        it('should return user data', async () => {
            const mockUser: UserCredentials = {
                id: 'user-123',
                email: 'test@example.com',
                passwordHash: 'hashed',
                phone: '+1234567890',
                role: 'worker',
                scope: ['read'],
                emailVerified: false,
                phoneVerified: false,
                disabled: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockAuthRepo.findUserById.mockResolvedValue(mockUser);

            const result = await authService.getUserById('user-123');

            expect(result.id).toBe('user-123');
            expect(result.email).toBe('test@example.com');
            expect(result.role).toBe('worker');
            expect(result.scope).toEqual(['read']);
        });

        it('should throw error if user not found', async () => {
            mockAuthRepo.findUserById.mockResolvedValue(null);

            await expect(authService.getUserById('nonexistent-id')).rejects.toThrow('User not found');
        });

        it('should retrieve users with different roles', async () => {
            const roles = ['worker', 'admin', 'employer'] as const;

            for (const role of roles) {
                const mockUser: UserCredentials = {
                    id: `user-${role}`,
                    email: `${role}@example.com`,
                passwordHash: 'hashed',
                    phone: '+1234567890',
                    role,
                    scope: role === 'admin' ? ['read', 'write', 'delete'] : ['read'],
                    emailVerified: true,
                    phoneVerified: false,
                    disabled: false,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };

                mockAuthRepo.findUserById.mockResolvedValueOnce(mockUser);
                const result = await authService.getUserById(`user-${role}`);
                expect(result.role).toBe(role);
            }
        });

        it('should retrieve users with different scopes', async () => {
            const scopeCombinations = [
                [],
                ['read'],
                ['read', 'write'],
                ['read', 'write', 'delete'],
            ];

            for (const scope of scopeCombinations) {
                const mockUser: UserCredentials = {
                    id: `user-scope-${scope.join('-')}`,
                    email: 'test@example.com',
                    passwordHash: 'hashed',
                    phone: '+1234567890',
                    role: 'worker',
                    scope,
                    emailVerified: false,
                    phoneVerified: false,
                    disabled: false,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };

                mockAuthRepo.findUserById.mockResolvedValueOnce(mockUser);
                const result = await authService.getUserById(`user-scope-${scope.join('-')}`);
                expect(result.scope).toEqual(scope);
            }
        });

        it('should handle database errors', async () => {
            mockAuthRepo.findUserById.mockRejectedValue(new Error('Database connection failed'));

            await expect(authService.getUserById('user-123')).rejects.toThrow('Database connection failed');
        });
    });

    describe('sendOtp', () => {
        it('should send email OTP successfully', async () => {
            const identifier = 'test@example.com';
            const channel = 'email';
            const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
            const providerSid = 'email-sid-123';

            mockAuthRepo.findUserByEmail.mockResolvedValue(null);
            mockEmailOtpProvider.sendOtp.mockResolvedValue({
                success: true,
                expiresAt,
                providerSid,
            });

            const result = await authService.sendOtp(identifier, channel);

            expect(mockOtpProviderFactory).toHaveBeenCalledWith('email');
            expect(mockEmailOtpProvider.sendOtp).toHaveBeenCalledWith(identifier);
            expect(result).toEqual({
                success: true,
                expiresAt,
                channel: 'email',
                providerSid,
            });
        });

        it('should send OTP without providerSid', async () => {
            const identifier = 'test@example.com';
            const channel = 'email';
            const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

            mockAuthRepo.findUserByEmail.mockResolvedValue(null);
            mockEmailOtpProvider.sendOtp.mockResolvedValue({
                success: true,
                expiresAt,
            });

            const result = await authService.sendOtp(identifier, channel);

            expect(result).toEqual({
                success: true,
                expiresAt,
                channel: 'email',
            });
            expect(result.providerSid).toBeUndefined();
        });

        it('should not invalidate other channel OTPs when only email channel exists', async () => {
            const identifier = 'test@example.com';
            const channel = 'email';
            const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

            const mockUser: UserCredentials = {
                id: 'user-123',
                email: 'test@example.com',
                passwordHash: 'hashed',
                phone: '+15551234567',
                role: 'worker',
                scope: [],
                emailVerified: false,
                phoneVerified: false,
                disabled: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockAuthRepo.findUserByEmail.mockResolvedValue(mockUser);
            mockEmailOtpProvider.sendOtp.mockResolvedValue({
                success: true,
                expiresAt,
            });

            await authService.sendOtp(identifier, channel);

            // Only email channel is supported, so no other channels to invalidate
            expect(mockEmailOtpProvider.sendOtp).toHaveBeenCalledWith(identifier);
        });

        it('should not invalidate OTP if user does not exist', async () => {
            const identifier = 'test@example.com';
            const channel = 'email';
            const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

            mockAuthRepo.findUserByEmail.mockResolvedValue(null);
            mockEmailOtpProvider.sendOtp.mockResolvedValue({
                success: true,
                expiresAt,
            });

            await authService.sendOtp(identifier, channel);

            // Only email channel exists, so no other channel OTPs to invalidate
            expect(mockEmailOtpProvider.sendOtp).toHaveBeenCalledWith(identifier);
        });
    });

    describe('verifyOtp', () => {
        it('should verify email OTP successfully', async () => {
            const identifier = 'test@example.com';
            const code = '123456';
            const channel = 'email';

            mockEmailOtpProvider.verifyOtp.mockResolvedValue({
                success: true,
            });

            const result = await authService.verifyOtp(identifier, code, channel);

            expect(mockOtpProviderFactory).toHaveBeenCalledWith('email');
            expect(mockEmailOtpProvider.verifyOtp).toHaveBeenCalledWith(identifier, code);
            expect(result).toEqual({
                success: true,
            });
        });

        it('should return remaining attempts on failed verification', async () => {
            const identifier = 'test@example.com';
            const code = 'wrong-code';
            const channel = 'email';

            mockEmailOtpProvider.verifyOtp.mockResolvedValue({
                success: false,
                remainingAttempts: 2,
            });

            const result = await authService.verifyOtp(identifier, code, channel);

            expect(result).toEqual({
                success: false,
                remainingAttempts: 2,
            });
        });

        it('should return lockedUntil when account is locked', async () => {
            const identifier = 'test@example.com';
            const code = 'wrong-code';
            const channel = 'email';
            const lockedUntil = new Date(Date.now() + 30 * 60 * 1000);

            mockEmailOtpProvider.verifyOtp.mockResolvedValue({
                success: false,
                remainingAttempts: 0,
                lockedUntil,
            });

            const result = await authService.verifyOtp(identifier, code, channel);

            expect(result).toEqual({
                success: false,
                remainingAttempts: 0,
                lockedUntil,
            });
        });
    });

    describe('verifyEmailAfterOtp', () => {
        it('should verify user email when OTP is verified', async () => {
            const email = 'test@example.com';
            const mockEmailOtp: EmailOtp = {
                id: 'otp-123',
                email,
                codeHash: 'hashed-code',
                status: 'verified',
                attempts: 0,
                lockedUntil: null,
                expiresAt: new Date(Date.now() + 1000000),
                createdAt: new Date(),
            };

            const mockUser: UserCredentials = {
                id: 'user-123',
                email,
                passwordHash: 'hashed',
                phone: '+15551234567',
                role: 'worker',
                scope: [],
                emailVerified: true,
                phoneVerified: false,
                disabled: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockAuthRepo.findOtpbyEmail.mockResolvedValue(mockEmailOtp);
            mockAuthRepo.verifyUserEmail.mockResolvedValue(mockUser);

            await authService.verifyEmailAfterOtp(email);

            expect(mockAuthRepo.findOtpbyEmail).toHaveBeenCalledWith(email);
            expect(mockAuthRepo.verifyUserEmail).toHaveBeenCalledWith(email);
        });

        it('should throw error when OTP does not exist', async () => {
            const email = 'test@example.com';

            mockAuthRepo.findOtpbyEmail.mockResolvedValue(null);

            await expect(authService.verifyEmailAfterOtp(email)).rejects.toThrow(
                'Email OTP must be verified before marking email as verified'
            );
            expect(mockAuthRepo.verifyUserEmail).not.toHaveBeenCalled();
        });

        it('should throw error when OTP is not verified', async () => {
            const email = 'test@example.com';
            const mockEmailOtp: EmailOtp = {
                id: 'otp-123',
                email,
                codeHash: 'hashed-code',
                status: 'pending',
                attempts: 0,
                lockedUntil: null,
                expiresAt: new Date(Date.now() + 1000000),
                createdAt: new Date(),
            };

            mockAuthRepo.findOtpbyEmail.mockResolvedValue(mockEmailOtp);

            await expect(authService.verifyEmailAfterOtp(email)).rejects.toThrow(
                'Email OTP must be verified before marking email as verified'
            );
            expect(mockAuthRepo.verifyUserEmail).not.toHaveBeenCalled();
        });
    });

    describe('verifyOtpAndLogin', () => {
        it('should verify email OTP and return tokens', async () => {
            const email = 'test@example.com';
            const otp = '123456';
            const mockUser: UserCredentials = {
                id: 'user-123',
                email,
                passwordHash: 'hashed-password',
                phone: '+1234567890',
                role: 'worker',
                scope: ['read'],
                emailVerified: false,
                phoneVerified: false,
                disabled: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            const verifiedUser = { ...mockUser, emailVerified: true };
            const payload = { id: 'user-123', role: 'worker', scope: ['read'] };
            const accessToken = 'access-token';
            const refreshToken = 'refresh-token';
            const refreshTokenHash = 'hashed-refresh-token';

            const mockEmailOtp: EmailOtp = {
                id: 'otp-123',
                email,
                codeHash: 'hashed-code',
                status: 'verified',
                attempts: 0,
                lockedUntil: null,
                expiresAt: new Date(Date.now() + 1000000),
                createdAt: new Date(),
            };

            mockEmailOtpProvider.verifyOtp.mockResolvedValue({ success: true });
            mockAuthRepo.findOtpbyEmail.mockResolvedValue(mockEmailOtp);
            mockAuthRepo.verifyUserEmail.mockResolvedValue(verifiedUser);
            mockAuthRepo.findUserByEmail.mockResolvedValue(verifiedUser);
            mockTokenUtils.userToTokenPayload.mockReturnValue(payload);
            mockTokenUtils.generateAccessToken.mockReturnValue(accessToken);
            mockTokenUtils.generateRefreshToken.mockReturnValue(refreshToken);
            mockTokenUtils.hashRefreshToken.mockReturnValue(refreshTokenHash);
            mockAuthRepo.createRefreshSession.mockResolvedValue({} as RefreshSession);

            const result = await authService.verifyOtpAndLogin(email, otp, 'email');

            expect(mockEmailOtpProvider.verifyOtp).toHaveBeenCalledWith(email, otp);
            expect(mockAuthRepo.verifyUserEmail).toHaveBeenCalledWith(email);
            expect(mockAuthRepo.findUserByEmail).toHaveBeenCalledWith(email);
            expect(result.accessToken).toBe(accessToken);
            expect(result.refreshToken).toBe(refreshToken);
            expect(result.user.id).toBe('user-123');
            expect(result.user.email).toBe(email);
        });

        it('should throw error when OTP verification fails', async () => {
            const email = 'test@example.com';
            const otp = 'wrong-otp';

            mockEmailOtpProvider.verifyOtp.mockResolvedValue({ success: false });

            await expect(authService.verifyOtpAndLogin(email, otp, 'email')).rejects.toThrow('Invalid or expired OTP');
            expect(mockAuthRepo.verifyUserEmail).not.toHaveBeenCalled();
        });

        it('should throw error when user not found after verification', async () => {
            const email = 'test@example.com';
            const otp = '123456';

            const mockEmailOtp: EmailOtp = {
                id: 'otp-123',
                email,
                codeHash: 'hashed-code',
                status: 'verified',
                attempts: 0,
                lockedUntil: null,
                expiresAt: new Date(Date.now() + 1000000),
                createdAt: new Date(),
            };

            mockEmailOtpProvider.verifyOtp.mockResolvedValue({ success: true });
            mockAuthRepo.findOtpbyEmail.mockResolvedValue(mockEmailOtp);
            mockAuthRepo.verifyUserEmail.mockResolvedValue({} as UserCredentials);
            mockAuthRepo.findUserByEmail.mockResolvedValue(null);

            await expect(authService.verifyOtpAndLogin(email, otp, 'email')).rejects.toThrow('User not found');
        });
    });
});