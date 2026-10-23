/// <reference path="../../../src/types/express.d.ts" />
// Mock response.utils BEFORE importing - ES modules require unstable_mockModule
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

jest.unstable_mockModule('@utils/logging/response.utils.js', () => ({
    default: {
        success: jest.fn(),
        error: jest.fn(),
        unauthorized: jest.fn(),
        notFound: jest.fn(),
        forbidden: jest.fn(),
        badRequest: jest.fn(),
        validationErrors: jest.fn(),
    },
}));

// Import after mocking
const { default: ScopeMiddleware } = await import('@middleware/scope.middleware.js');
const { default: Send } = await import('@utils/logging/response.utils.js');
import type { Request, Response, NextFunction } from 'express';

describe('ScopeMiddleware', () => {
    let mockReq: RequestWithUser;
    let mockRes: Response;
    let mockNext: NextFunction;

    beforeEach(() => {
        mockReq = {} as unknown as Request;
        mockRes = {
            status: jest.fn().mockReturnThis() as jest.Mock,
            json: jest.fn().mockReturnThis() as jest.Mock,
        } as unknown as Response;
        mockNext = jest.fn();
        jest.clearAllMocks();
    });

    describe('requireScope', () => {
        it('should allow request when user has all required scopes', () => {
            mockReq.user = {
                id: 'user-123',
                role: 'worker',
                scope: ['jobs:read', 'jobs:write', 'users:read'],
            };

            const middleware = ScopeMiddleware.requireScope(['jobs:read', 'jobs:write']);
            middleware(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalled();
            expect(Send.forbidden).not.toHaveBeenCalled();
        });

        it('should allow request when user is admin (bypasses scope check)', () => {
            mockReq.user = {
                id: 'admin-123',
                role: 'admin',
                scope: [],
            };

            const middleware = ScopeMiddleware.requireScope(['jobs:write']);
            middleware(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalled();
            expect(Send.forbidden).not.toHaveBeenCalled();
        });

        it('should return 403 when user lacks required scopes', () => {
            mockReq.user = {
                id: 'user-123',
                role: 'worker',
                scope: ['jobs:read'],
            };

            const middleware = ScopeMiddleware.requireScope(['jobs:write']);
            middleware(mockReq, mockRes, mockNext);

            expect(Send.forbidden).toHaveBeenCalledWith(
                mockRes,
                expect.objectContaining({
                    message: 'Forbidden: Insufficient permissions',
                    required: ['jobs:write'],
                    granted: ['jobs:read'],
                })
            );
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should return 403 when user has partial scopes (not all)', () => {
            mockReq.user = {
                id: 'user-123',
                role: 'worker',
                scope: ['jobs:read'],
            };

            const middleware = ScopeMiddleware.requireScope(['jobs:read', 'jobs:write']);
            middleware(mockReq, mockRes, mockNext);

            expect(Send.forbidden).toHaveBeenCalled();
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should return 401 when user is not authenticated', () => {
            delete mockReq.user;

            const middleware = ScopeMiddleware.requireScope(['jobs:read']);
            middleware(mockReq, mockRes, mockNext);

            expect(Send.unauthorized).toHaveBeenCalledWith(
                mockRes,
                expect.objectContaining({
                    message: 'Unauthorized',
                })
            );
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should return 401 when req.user is undefined', () => {
            delete mockReq.user;

            const middleware = ScopeMiddleware.requireScope(['jobs:read']);
            middleware(mockReq, mockRes, mockNext);

            expect(Send.unauthorized).toHaveBeenCalled();
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should handle empty scopes array correctly', () => {
            mockReq.user = {
                id: 'user-123',
                role: 'worker',
                scope: ['jobs:read'],
            };

            const middleware = ScopeMiddleware.requireScope([]);
            middleware(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalled();
        });

        it('should handle multiple required scopes correctly', () => {
            mockReq.user = {
                id: 'user-123',
                role: 'worker',
                scope: ['jobs:read', 'jobs:write', 'users:read', 'users:write'],
            };

            const middleware = ScopeMiddleware.requireScope(['jobs:read', 'jobs:write', 'users:read']);
            middleware(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalled();
        });

        it('should include required and granted scopes in error response', () => {
            mockReq.user = {
                id: 'user-123',
                role: 'worker',
                scope: ['jobs:read'],
            };

            const requiredScopes = ['jobs:write', 'users:read'];
            const middleware = ScopeMiddleware.requireScope(requiredScopes);
            middleware(mockReq, mockRes, mockNext);

            expect(Send.forbidden).toHaveBeenCalledWith(
                mockRes,
                expect.objectContaining({
                    required: requiredScopes,
                    granted: ['jobs:read'],
                })
            );
        });
    });
});
