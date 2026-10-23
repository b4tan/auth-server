/// <reference path="../../../src/types/express.d.ts" />
// Mock jsonwebtoken BEFORE importing - ES modules require unstable_mockModule
import { jest } from '@jest/globals';
import type { Request as ExpressRequest } from 'express';

// Use the same type structure as src/types/express.d.ts
// This ensures consistency with the existing type definitions
type RequestWithUser = ExpressRequest & {
    user?: {
        id: string;
        role: string;
        scope: string[];
        claims?: Record<string, unknown>;
    };
};

// Create TokenExpiredError class for the mock
class TokenExpiredError extends Error {
    constructor(message: string, public expiredAt: Date) {
        super(message);
        this.name = 'TokenExpiredError';
    }
}

jest.unstable_mockModule('jsonwebtoken', () => ({
    default: {},
    TokenExpiredError,
}));

// Mock the repository and token utils used in auth.middleware.ts default export
jest.unstable_mockModule('@repositories/auth.repository.js', () => {
    const mockRepo = {
        findRefreshSessionByHash: jest.fn(),
        findUserByEmail: jest.fn(),
        findUserById: jest.fn(),
        createUser: jest.fn(),
        createRefreshSession: jest.fn(),
        findActiveRefreshSessionByHash: jest.fn(),
        updateRefreshSession: jest.fn(),
        revokeRefreshSession: jest.fn(),
    };
    return {
        __esModule: true,
        default: mockRepo,
        AuthRepository: jest.fn(() => mockRepo),
        createAuthRepository: jest.fn(() => mockRepo),
    };
});

jest.unstable_mockModule('@utils/crypto/token.utils.js', () => {
    const mockTokenUtils = {
        generateAccessToken: jest.fn(),
        verifyAccessToken: jest.fn(),
        generateRefreshToken: jest.fn(),
        verifyRefreshToken: jest.fn(),
        userToTokenPayload: jest.fn(),
        hashRefreshToken: jest.fn(),
    };
    return {
        __esModule: true,
        createTokenUtils: jest.fn(() => mockTokenUtils),
    };
});

jest.unstable_mockModule('@utils/logging/response.utils.js', () => ({
    default: {
        unauthorized: jest.fn(),
    },
}));

// Import after mocking
const { createAuthMiddleware } = await import('@middleware/auth.middleware.js');
const { default: Send } = await import('@utils/logging/response.utils.js');
import type { ITokenUtils, TokenPayload } from '@utils/crypto/token.utils.js';
import type { Request, Response, NextFunction } from 'express';

describe('AuthMiddleware', () => {
    let mockTokenUtils: jest.Mocked<ITokenUtils>;
    let mockReq: RequestWithUser;
    let mockRes: Response;
    let mockNext: NextFunction;
    let middleware: ReturnType<typeof createAuthMiddleware>;

    beforeEach(() => {
        mockTokenUtils = {
            generateAccessToken: jest.fn(),
            verifyAccessToken: jest.fn(),
            generateRefreshToken: jest.fn(),
            verifyRefreshToken: jest.fn(),
            userToTokenPayload: jest.fn(),
            hashRefreshToken: jest.fn(),
        };

        mockReq = {
            headers: {},
            cookies: {},
            user: undefined,
        } as unknown as Request;

        mockRes = {
            status: jest.fn().mockReturnThis() as jest.Mock,
            json: jest.fn().mockReturnThis() as jest.Mock,
        } as unknown as Response;

        mockNext = jest.fn();
        middleware = createAuthMiddleware(mockTokenUtils);
        jest.clearAllMocks();
    });

    describe('verifyAccessToken', () => {
        it('should set req.user for valid token', () => {
            const payload: TokenPayload = {
                id: 'user-123',
                role: 'worker',
                scope: ['read'],
            };

            mockReq.headers = { authorization: 'Bearer valid-token' };
            mockTokenUtils.verifyAccessToken.mockReturnValue(payload);

            middleware.verifyAccessToken(mockReq, mockRes, mockNext);

            expect(mockTokenUtils.verifyAccessToken).toHaveBeenCalledWith('valid-token');
            expect(mockReq.user).toEqual(payload);
            expect(mockNext).toHaveBeenCalled();
            expect(mockRes.status).not.toHaveBeenCalled();
        });

        it('should return 401 for missing token', () => {
            mockReq.headers = {};

            middleware.verifyAccessToken(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Unauthorized' });
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should return 401 for missing authorization header', () => {
            mockReq.headers = { authorization: undefined };

            middleware.verifyAccessToken(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should return 401 for expired token', () => {
            mockReq.headers = { authorization: 'Bearer expired-token' };
            mockTokenUtils.verifyAccessToken.mockImplementation(() => {
                throw new TokenExpiredError('Token expired', new Date());
            });

            middleware.verifyAccessToken(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Token expired' });
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should return 401 for invalid token', () => {
            mockReq.headers = { authorization: 'Bearer invalid-token' };
            mockTokenUtils.verifyAccessToken.mockImplementation(() => {
                throw new Error('Invalid token');
            });

            middleware.verifyAccessToken(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Unauthorized' });
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should handle Bearer token format correctly', () => {
            const payload: TokenPayload = {
                id: 'user-123',
                role: 'worker',
                scope: ['read'],
            };

            mockReq.headers = { authorization: 'Bearer token-with-spaces' };
            mockTokenUtils.verifyAccessToken.mockReturnValue(payload);

            middleware.verifyAccessToken(mockReq, mockRes, mockNext);

            expect(mockTokenUtils.verifyAccessToken).toHaveBeenCalledWith('token-with-spaces');
            expect(mockNext).toHaveBeenCalled();
        });

        it('should return 401 for missing Bearer prefix', () => {
            const payload: TokenPayload = {
                id: 'user-123',
                role: 'worker',
                scope: ['read'],
            };

            mockReq.headers = { authorization: 'token-without-bearer' };
            mockTokenUtils.verifyAccessToken.mockReturnValue(payload);

            middleware.verifyAccessToken(mockReq, mockRes, mockNext);

            // Should still work if token is valid (Bearer prefix is optional for parsing)
            // But the actual implementation splits on space, so this would fail
            expect(mockRes.status).toHaveBeenCalledWith(401);
        });

        it('should handle extra spaces in Authorization header', () => {
            const payload: TokenPayload = {
                id: 'user-123',
                role: 'worker',
                scope: ['read'],
            };

            // The implementation splits on space and takes [1]
            // 'Bearer  token' splits to ['Bearer', '', 'token'], so [1] is empty string
            // This will fail the !token check, so we test that it returns 401
            mockReq.headers = { authorization: 'Bearer  token-with-extra-space' };
            mockTokenUtils.verifyAccessToken.mockReturnValue(payload);

            middleware.verifyAccessToken(mockReq, mockRes, mockNext);

            // Extra spaces cause split(' ')[1] to be empty string, which fails !token check
            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should return 401 for malformed JWT tokens', () => {
            const malformedTokens = [
                'not-a-jwt-token',
                'invalid.token',
                'a.b',
                'a.b.c.d',
                '',
            ];

            malformedTokens.forEach(token => {
                jest.clearAllMocks();
                mockReq.headers = { authorization: `Bearer ${token}` };
                mockTokenUtils.verifyAccessToken.mockImplementation(() => {
                    throw new Error('Invalid token');
                });

                middleware.verifyAccessToken(mockReq, mockRes, mockNext);

                expect(mockRes.status).toHaveBeenCalledWith(401);
                expect(mockNext).not.toHaveBeenCalled();
            });
        });

        it('should handle tokens with different roles', () => {
            const roles = ['worker', 'admin', 'employer'] as const;

            roles.forEach(role => {
                jest.clearAllMocks();
                const payload: TokenPayload = {
                    id: `user-${role}`,
                    role,
                    scope: role === 'admin' ? ['read', 'write', 'delete'] : ['read'],
                };

                mockReq.headers = { authorization: `Bearer token-${role}` };
                mockTokenUtils.verifyAccessToken.mockReturnValue(payload);

                middleware.verifyAccessToken(mockReq, mockRes, mockNext);

                expect(mockReq.user?.role).toBe(role);
                expect(mockNext).toHaveBeenCalled();
            });
        });

        it('should handle tokens with different scopes', () => {
            const scopeCombinations = [
                [],
                ['read'],
                ['read', 'write'],
                ['read', 'write', 'delete'],
            ];

            scopeCombinations.forEach(scope => {
                jest.clearAllMocks();
                const payload: TokenPayload = {
                    id: 'user-123',
                    role: 'worker',
                    scope,
                };

                mockReq.headers = { authorization: `Bearer token-scope-${scope.join('-')}` };
                mockTokenUtils.verifyAccessToken.mockReturnValue(payload);

                middleware.verifyAccessToken(mockReq, mockRes, mockNext);

                expect(mockReq.user?.scope).toEqual(scope);
                expect(mockNext).toHaveBeenCalled();
            });
        });
    });

    describe('verifyRefreshToken', () => {
        it('should set req.user for valid token', async () => {
            const payload: TokenPayload = {
                id: 'user-123',
                role: 'worker',
                scope: ['read'],
            };

            mockReq.cookies = { refreshToken: 'valid-refresh-token' };
            mockTokenUtils.verifyRefreshToken.mockResolvedValue(payload);

            await middleware.verifyRefreshToken(mockReq, mockRes, mockNext);

            expect(mockTokenUtils.verifyRefreshToken).toHaveBeenCalledWith('valid-refresh-token');
            expect(mockReq.user).toEqual(payload);
            expect(mockNext).toHaveBeenCalled();
        });

        it('should return 401 for missing token', async () => {
            mockReq.cookies = {};

            await middleware.verifyRefreshToken(mockReq, mockRes, mockNext);

            expect(Send.unauthorized).toHaveBeenCalledWith(mockRes, { message: 'No refresh token provided' });
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should return 401 for invalid token', async () => {
            mockReq.cookies = { refreshToken: 'invalid-token' };
            mockTokenUtils.verifyRefreshToken.mockRejectedValue(new Error('Invalid refresh token'));

            await middleware.verifyRefreshToken(mockReq, mockRes, mockNext);

            expect(Send.unauthorized).toHaveBeenCalledWith(mockRes, { message: 'Invalid or expired refresh token' });
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should return 401 for expired refresh token', async () => {
            mockReq.cookies = { refreshToken: 'expired-refresh-token' };
            mockTokenUtils.verifyRefreshToken.mockRejectedValue(new Error('Invalid or expired refresh token'));

            await middleware.verifyRefreshToken(mockReq, mockRes, mockNext);

            expect(Send.unauthorized).toHaveBeenCalledWith(mockRes, { message: 'Invalid or expired refresh token' });
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should return 401 for revoked refresh token', async () => {
            mockReq.cookies = { refreshToken: 'revoked-refresh-token' };
            mockTokenUtils.verifyRefreshToken.mockRejectedValue(new Error('Invalid or expired refresh token'));

            await middleware.verifyRefreshToken(mockReq, mockRes, mockNext);

            expect(Send.unauthorized).toHaveBeenCalledWith(mockRes, { message: 'Invalid or expired refresh token' });
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should handle refresh tokens with different roles', async () => {
            const roles = ['worker', 'admin', 'employer'] as const;

            for (const role of roles) {
                jest.clearAllMocks();
                const payload: TokenPayload = {
                    id: `user-${role}`,
                    role,
                    scope: role === 'admin' ? ['read', 'write', 'delete'] : ['read'],
                };

                mockReq.cookies = { refreshToken: `refresh-token-${role}` };
                mockTokenUtils.verifyRefreshToken.mockResolvedValue(payload);

                await middleware.verifyRefreshToken(mockReq, mockRes, mockNext);

                expect(mockReq.user?.role).toBe(role);
                expect(mockNext).toHaveBeenCalled();
            }
        });
    });
});
