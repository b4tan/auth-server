// Mock auth.config using unstable_mockModule for ES modules
// This must be done before importing the module that uses it
import { jest } from '@jest/globals';
import crypto from 'crypto';

// Generate test RSA keys once for all tests (performance optimization)
// Generate synchronously before mocking so keys are available in mock factory
const testKeys = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// Generate wrong keypair for invalid signature tests
const wrongKeys = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// Mock auth.config BEFORE importing token.utils
jest.unstable_mockModule('@config/auth.config.js', () => ({
    default: {
        algorithm: 'RS256',
        privateKey: testKeys.privateKey,
        publicKey: testKeys.publicKey,
        refreshPepper: 'test-refresh-pepper-for-testing-only',
    },
}));

// Now import after mocking
const { createTokenUtils } = await import('@utils/crypto/token.utils.js');
import type { ITokenUtils, TokenPayload } from '@utils/crypto/token.utils.js';
import jwt from 'jsonwebtoken';
import type { IAuthRepository } from '@repositories/auth.repository.js';

describe('TokenUtils', () => {
    let tokenUtils: ITokenUtils;
    let mockAuthRepo: jest.Mocked<IAuthRepository>;
    let mockConfig: {
        privateKey: string;
        publicKey: string;
        algorithm: jwt.Algorithm;
        refreshPepper: string;
    };

    beforeEach(() => {
        // Reuse the pre-generated keys
        mockConfig = {
            privateKey: testKeys.privateKey,
            publicKey: testKeys.publicKey,
            algorithm: 'RS256',
            refreshPepper: 'test-pepper-secret',
        };

        mockAuthRepo = {
            findUserByEmail: jest.fn(),
            findUserById: jest.fn(),
            findUserByPhone: jest.fn(),
            findOtpbyEmail: jest.fn(),
            createUser: jest.fn(),
            upsertEmailOtp: jest.fn(),
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

        tokenUtils = createTokenUtils(mockAuthRepo, mockConfig);
    });

    describe('generateAccessToken', () => {
        it('should create valid JWT', () => {
            const payload: TokenPayload = {
                id: 'user-123',
                role: 'worker',
                scope: ['read'],
            };

            const token = tokenUtils.generateAccessToken(payload);

            expect(token).toBeDefined();
            expect(typeof token).toBe('string');
            expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
        });

        it('should create token with correct payload', () => {
            const payload: TokenPayload = {
                id: 'user-123',
                role: 'admin',
                scope: ['read', 'write'],
            };

            const token = tokenUtils.generateAccessToken(payload);
            const decoded = jwt.verify(token, mockConfig.publicKey) as jwt.JwtPayload;

            expect(decoded.id).toBe(payload.id);
            expect(decoded.role).toBe(payload.role);
            expect(decoded.scope).toEqual(payload.scope);
        });
    });

    describe('verifyAccessToken', () => {
        it('should validate correct token', () => {
            const payload: TokenPayload = {
                id: 'user-123',
                role: 'worker',
                scope: ['read'],
            };

            const token = tokenUtils.generateAccessToken(payload);
            const verified = tokenUtils.verifyAccessToken(token);

            expect(verified.id).toBe(payload.id);
            expect(verified.role).toBe(payload.role);
            expect(verified.scope).toEqual(payload.scope);
        });

        it('should reject expired token', () => {
            jest.useFakeTimers();
            const fixedTime = new Date('2024-01-01T00:00:00Z');
            jest.setSystemTime(fixedTime);

            const payload: TokenPayload = {
                id: 'user-123',
                role: 'worker',
                scope: ['read'],
            };

            // Create token with 1 second expiration
            const expiredToken = jwt.sign(
                payload,
                mockConfig.privateKey,
                { algorithm: mockConfig.algorithm, expiresIn: '1s' }
            );

            // Advance time by 2 seconds to make token expired
            jest.advanceTimersByTime(2000);

                    expect(() => tokenUtils.verifyAccessToken(expiredToken)).toThrow();

            jest.useRealTimers();
        });

        it('should reject invalid signature', () => {
            const payload: TokenPayload = {
                id: 'user-123',
                role: 'worker',
                scope: ['read'],
            };

            // Sign with wrong private key
            const invalidToken = jwt.sign(payload, wrongKeys.privateKey, {
                algorithm: mockConfig.algorithm,
            });

            expect(() => tokenUtils.verifyAccessToken(invalidToken)).toThrow();
        });

        it('should reject token with missing id', () => {
            const invalidPayload = { role: 'worker', scope: ['read'] };
            const invalidToken = jwt.sign(invalidPayload, mockConfig.privateKey, {
                algorithm: mockConfig.algorithm,
            });

            expect(() => tokenUtils.verifyAccessToken(invalidToken)).toThrow('missing id');
        });

        it('should reject token with missing role', () => {
            const invalidPayload = { id: 'user-123', scope: ['read'] };
            const invalidToken = jwt.sign(invalidPayload, mockConfig.privateKey, {
                algorithm: mockConfig.algorithm,
            });

            expect(() => tokenUtils.verifyAccessToken(invalidToken)).toThrow('missing role');
        });

        it('should reject token with missing scope', () => {
            const invalidPayload = { id: 'user-123', role: 'worker' };
            const invalidToken = jwt.sign(invalidPayload, mockConfig.privateKey, {
                algorithm: mockConfig.algorithm,
            });

            expect(() => tokenUtils.verifyAccessToken(invalidToken)).toThrow('missing or invalid scope');
        });

        it('should reject HS256 token (algorithm confusion attack)', () => {
            const payload: TokenPayload = {
                id: 'user-123',
                role: 'worker',
                scope: ['read'],
            };

            // Attempt to sign with HS256 using public key as secret (algorithm confusion)
            const hs256Token = jwt.sign(payload, mockConfig.publicKey, {
                algorithm: 'HS256',
            });

            // Should reject because verifyAccessToken only allows RS256
            expect(() => tokenUtils.verifyAccessToken(hs256Token)).toThrow();
        });

        it('should reject token with alg: none (no signature)', () => {
            const payload: TokenPayload = {
                id: 'user-123',
                role: 'worker',
                scope: ['read'],
            };

            // Create unsigned token (alg: none)
            const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
            const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
            const noneToken = `${header}.${body}.`;

            // Should reject because verifyAccessToken requires RS256 signature
            expect(() => tokenUtils.verifyAccessToken(noneToken)).toThrow();
        });

        it('should reject malformed JWT tokens', () => {
            const malformedTokens = [
                'not-a-jwt-token',
                'invalid.token',
                'a.b',
                'a.b.c.d',
                '',
                'Bearer token',
            ];

            malformedTokens.forEach(token => {
                expect(() => tokenUtils.verifyAccessToken(token)).toThrow();
            });
        });

        it('should handle tokens with different roles', () => {
            const roles = ['worker', 'admin', 'employer'] as const;

            roles.forEach(role => {
                const payload: TokenPayload = {
                    id: `user-${role}`,
                    role,
                    scope: role === 'admin' ? ['read', 'write', 'delete'] : ['read'],
                };

                const token = tokenUtils.generateAccessToken(payload);
                const verified = tokenUtils.verifyAccessToken(token);

                expect(verified.role).toBe(role);
            });
        });

        it('should handle tokens with different scopes', () => {
            const scopeCombinations = [
                [],
                ['read'],
                ['read', 'write'],
                ['read', 'write', 'delete'],
                ['admin'],
            ];

            scopeCombinations.forEach(scope => {
                const payload: TokenPayload = {
                    id: 'user-123',
                    role: 'worker',
                    scope,
                };

                const token = tokenUtils.generateAccessToken(payload);
                const verified = tokenUtils.verifyAccessToken(token);

                expect(verified.scope).toEqual(scope);
            });
        });

        it('should use default config when no config provided', () => {
            // Create tokenUtils without passing config - should use mocked default config
            const defaultTokenUtils = createTokenUtils(mockAuthRepo);
            
            const payload: TokenPayload = {
                id: 'user-123',
                role: 'worker',
                scope: ['read'],
            };

            const token = defaultTokenUtils.generateAccessToken(payload);
            // Verify using the mocked default public key
            const decoded = jwt.verify(token, testKeys.publicKey) as jwt.JwtPayload;

            expect(decoded.id).toBe(payload.id);
            expect(decoded.role).toBe(payload.role);
            expect(decoded.scope).toEqual(payload.scope);
        });
    });

    describe('generateRefreshToken', () => {
        it('should generate random hex string', () => {
            const token1 = tokenUtils.generateRefreshToken();
            const token2 = tokenUtils.generateRefreshToken();

            expect(token1).toBeDefined();
            expect(typeof token1).toBe('string');
            expect(token1).toMatch(/^[0-9a-f]+$/); // hex string
            expect(token1.length).toBe(128); // 64 bytes = 128 hex chars
            expect(token1).not.toBe(token2); // should be different
        });
    });

    describe('hashRefreshToken', () => {
        it('should produce consistent hash', () => {
            const token = 'test-refresh-token';
            const hash1 = tokenUtils.hashRefreshToken(token);
            const hash2 = tokenUtils.hashRefreshToken(token);

            expect(hash1).toBe(hash2);
            expect(typeof hash1).toBe('string');
            expect(hash1.length).toBe(64); // SHA256 hex = 64 chars
        });

        it('should produce different hash for different tokens', () => {
            const token1 = 'token-1';
            const token2 = 'token-2';
            const hash1 = tokenUtils.hashRefreshToken(token1);
            const hash2 = tokenUtils.hashRefreshToken(token2);

            expect(hash1).not.toBe(hash2);
        });
    });

    describe('userToTokenPayload', () => {
        it('should map user correctly', () => {
            const user = {
                id: 'user-123',
                role: 'worker',
                scope: ['read', 'write'],
            };

            const payload = tokenUtils.userToTokenPayload(user);

            expect(payload.id).toBe(user.id);
            expect(payload.role).toBe(user.role);
            expect(payload.scope).toEqual(user.scope);
        });

        it('should handle admin role', () => {
            const user = {
                id: 'admin-123',
                role: 'admin',
                scope: ['admin'],
            };

            const payload = tokenUtils.userToTokenPayload(user);
            expect(payload.role).toBe('admin');
        });
    });

    describe('verifyRefreshToken', () => {
        it('should validate token via repository', async () => {
            const refreshToken = 'test-refresh-token';
            const tokenHash = tokenUtils.hashRefreshToken(refreshToken);
            const mockUser = {
                id: 'user-123',
                email: 'test@example.com',
                passwordHash: 'hashed',
                phone: '+1234567890',
                role: 'worker' as const,
                scope: ['read'],
                emailVerified: false,
                otpCode: null,
                otpExpiresAt: null,
                phoneVerified: false,
                disabled: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockAuthRepo.findRefreshSessionByHash.mockResolvedValue({
                id: 'session-123',
                userId: 'user-123',
                tokenHash,
                expiresAt: new Date(Date.now() + 1000000),
                revokedAt: null,
                createdAt: new Date(),
                user: mockUser,
            });

            const payload = await tokenUtils.verifyRefreshToken(refreshToken);

            expect(mockAuthRepo.findRefreshSessionByHash).toHaveBeenCalledWith(tokenHash);
            expect(payload.id).toBe(mockUser.id);
            expect(payload.role).toBe(mockUser.role);
            expect(payload.scope).toEqual(mockUser.scope);
        });

        it('should throw error for invalid token', async () => {
            const refreshToken = 'invalid-token';
            const tokenHash = tokenUtils.hashRefreshToken(refreshToken);

            mockAuthRepo.findRefreshSessionByHash.mockResolvedValue(null);

            await expect(tokenUtils.verifyRefreshToken(refreshToken)).rejects.toThrow('Invalid refresh token');
            expect(mockAuthRepo.findRefreshSessionByHash).toHaveBeenCalledWith(tokenHash);
        });

        it('should throw error for expired refresh token session', async () => {
            const refreshToken = 'expired-token';
            const tokenHash = tokenUtils.hashRefreshToken(refreshToken);

            // Session expired in the past
            const expiredSession = {
                id: 'session-123',
                userId: 'user-123',
                tokenHash,
                expiresAt: new Date(Date.now() - 1000), // Expired
                revokedAt: null,
                createdAt: new Date(),
                user: {
                    id: 'user-123',
                    email: 'test@example.com',
                    passwordHash: 'hashed',
                    phone: "+1234567890",
                    role: 'worker' as const,
                    scope: ['read'],
                    emailVerified: false,
                    otpCode: null,
                    otpExpiresAt: null,
                    phoneVerified: false,
                    disabled: false,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            };

            mockAuthRepo.findRefreshSessionByHash.mockResolvedValue(expiredSession);

            await expect(tokenUtils.verifyRefreshToken(refreshToken)).rejects.toThrow('Refresh token has expired');
        });

        it('should throw error for revoked refresh token session', async () => {
            const refreshToken = 'revoked-token';
            const tokenHash = tokenUtils.hashRefreshToken(refreshToken);

            // Session is revoked
            const revokedSession = {
                id: 'session-123',
                userId: 'user-123',
                tokenHash,
                expiresAt: new Date(Date.now() + 1000000),
                revokedAt: new Date(),
                createdAt: new Date(),
                user: {
                    id: 'user-123',
                    email: 'test@example.com',
                    passwordHash: 'hashed',
                    phone: "+1234567890",
                    role: 'worker' as const,
                    scope: ['read'],
                    emailVerified: false,
                    otpCode: null,
                    otpExpiresAt: null,
                    phoneVerified: false,
                    disabled: false,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            };

            mockAuthRepo.findRefreshSessionByHash.mockResolvedValue(revokedSession);

            await expect(tokenUtils.verifyRefreshToken(refreshToken)).rejects.toThrow('Refresh token has been revoked');
        });
    });
});
