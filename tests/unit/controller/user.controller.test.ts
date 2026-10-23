/// <reference path="../../../src/types/express.d.ts" />
// Mock response.utils BEFORE importing - ES modules require unstable_mockModule
import { jest } from '@jest/globals';
import type { Request as ExpressRequest } from 'express';

// Use the same type structure as src/types/express.d.ts
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
const { UserController } = await import('@controller/user.controller.js');
const { AuthService } = await import('@service/auth/auth.service.js');
const { AuthErrors } = await import('@errors/auth.error.js');
const { default: Send } = await import('@utils/logging/response.utils.js');
import type { Response } from 'express';

describe('UserController', () => {
    let userController: InstanceType<typeof UserController>;
    let mockAuthService: jest.Mocked<InstanceType<typeof AuthService>>;
    let mockReq: RequestWithUser;
    let mockRes: Response;

    beforeEach(() => {
        mockAuthService = {
            login: jest.fn(),
            register: jest.fn(),
            logout: jest.fn(),
            refreshToken: jest.fn(),
            getUserById: jest.fn(),
        } as any;

        userController = new UserController(mockAuthService);

        mockReq = {} as unknown as RequestWithUser;

        mockRes = {
            status: jest.fn().mockReturnThis() as jest.Mock,
            json: jest.fn().mockReturnThis() as jest.Mock,
        } as unknown as Response;

        // Spy on Send static methods
        jest.spyOn(Send, 'success');
        jest.spyOn(Send, 'error');
        jest.spyOn(Send, 'unauthorized');
        jest.spyOn(Send, 'notFound');
        jest.spyOn(Send, 'forbidden');
        jest.spyOn(Send, 'badRequest');
        jest.spyOn(Send, 'validationErrors');

        jest.clearAllMocks();
    });

    describe('getUser', () => {
        it('should return 200 with user data when user exists', async () => {
            const userData = {
                id: 'user-123',
                email: 'test@example.com',
                role: 'worker',
                scope: ['read'],
            };

            mockReq.user = { id: 'user-123', role: 'worker', scope: ['read'] };
            mockAuthService.getUserById.mockResolvedValue(userData);

            await userController.getUser(mockReq, mockRes);

            expect(mockAuthService.getUserById).toHaveBeenCalledWith('user-123');
            expect(Send.success).toHaveBeenCalledWith(mockRes, { user: userData });
        });

        it('should return 401 when userId is missing from request', async () => {
            delete mockReq.user;

            await userController.getUser(mockReq, mockRes);

            expect(Send.unauthorized).toHaveBeenCalledWith(mockRes, { message: 'User not found' });
            expect(mockAuthService.getUserById).not.toHaveBeenCalled();
        });

        it('should return 404 when user not found', async () => {
            mockReq.user = { id: 'nonexistent-id', role: 'worker', scope: ['read'] };
            mockAuthService.getUserById.mockRejectedValue(AuthErrors.userNotFound());

            await userController.getUser(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(404);
        });

        it('should return 500 for unexpected errors', async () => {
            mockReq.user = { id: 'user-123', role: 'worker', scope: ['read'] };
            mockAuthService.getUserById.mockRejectedValue(new Error('Database error'));

            await userController.getUser(mockReq, mockRes);

            expect(Send.error).toHaveBeenCalledWith(mockRes, null, 'Internal server error');
        });

        it('should call authService.getUserById() with correct userId', async () => {
            const userId = 'user-123';
            mockReq.user = { id: userId, role: 'worker', scope: ['read'] };
            mockAuthService.getUserById.mockResolvedValue({
                id: userId,
                email: 'test@example.com',
                role: 'worker',
                scope: ['read'],
            });

            await userController.getUser(mockReq, mockRes);

            expect(mockAuthService.getUserById).toHaveBeenCalledWith(userId);
        });

        it('should handle AuthService errors correctly', async () => {
            mockReq.user = { id: 'user-123', role: 'worker', scope: ['read'] };
            mockAuthService.getUserById.mockRejectedValue(new Error('Service error'));

            await userController.getUser(mockReq, mockRes);

            expect(Send.error).toHaveBeenCalled();
        });
    });
});
