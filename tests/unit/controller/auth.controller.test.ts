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
const { AuthController } = await import('@controller/auth.controller.js');
const { AuthService } = await import('@service/auth/auth.service.js');
const { default: Send } = await import('@utils/logging/response.utils.js');
const { AuthErrors } = await import('@errors/auth.error.js');
import type { Response } from 'express';

describe('AuthController', () => {
    let authController: InstanceType<typeof AuthController>;
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
            verifyOtpAndLogin: jest.fn(),
        } as any;

        authController = new AuthController(mockAuthService);

        mockReq = {
            body: {},
            cookies: {},
        } as unknown as RequestWithUser;

        mockRes = {
            cookie: jest.fn() as jest.Mock,
            clearCookie: jest.fn() as jest.Mock,
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

    describe('login', () => {
        it('should return 200 with tokens', async () => {
            const loginResult = {
                user: { id: 'user-123', email: 'test@example.com', role: 'worker', scope: ['read'] },
                accessToken: 'access-token',
                refreshToken: 'refresh-token',
            };

            mockReq.body = { email: 'test@example.com', password: 'password' };
            mockAuthService.login.mockResolvedValue(loginResult);

            await authController.login(mockReq, mockRes);

            expect(mockAuthService.login).toHaveBeenCalledWith('test@example.com', 'password');
            expect(Send.success).toHaveBeenCalledWith(mockRes, {
                user: loginResult.user,
                accessToken: loginResult.accessToken
            });
        });

        it('should return 401 for invalid credentials', async () => {
            mockReq.body = { email: 'test@example.com', password: 'wrong-password' };
            const authError = AuthErrors.invalidCredentials();
            mockAuthService.login.mockRejectedValue(authError);

            await authController.login(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({
                ok: false,
                message: 'Invalid credentials',
                code: 'INVALID_CREDENTIALS',
            });
        });

        it('should set refresh token cookie', async () => {
            const loginResult = {
                user: { id: 'user-123', email: 'test@example.com', role: 'worker', scope: ['read'] },
                accessToken: 'access-token',
                refreshToken: 'refresh-token',
            };

            mockReq.body = { email: 'test@example.com', password: 'password' };
            mockAuthService.login.mockResolvedValue(loginResult);

            await authController.login(mockReq, mockRes);

            expect(mockRes.cookie).toHaveBeenCalledWith('refreshToken', 'refresh-token', {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
                path: '/',
                sameSite: 'strict',
            });
        });

        it('should return access token in response body (not cookie)', async () => {
            const loginResult = {
                user: { id: 'user-123', email: 'test@example.com', role: 'worker', scope: ['read'] },
                accessToken: 'access-token',
                refreshToken: 'refresh-token',
            };

            mockReq.body = { email: 'test@example.com', password: 'password' };
            mockAuthService.login.mockResolvedValue(loginResult);

            await authController.login(mockReq, mockRes);

            // Access token is returned in response body, not set as cookie
            expect(Send.success).toHaveBeenCalledWith(mockRes, {
                user: loginResult.user,
                accessToken: loginResult.accessToken
            });
            // Verify accessToken cookie is NOT set
            expect(mockRes.cookie).not.toHaveBeenCalledWith('accessToken', expect.anything(), expect.anything());
        });
    });

    describe('register', () => {
        it('should return 200 with user data and success message', async () => {
            const registerResult = {
                user: { id: 'user-123', email: 'new@example.com', role: 'worker', scope: ['read'] },
            };

            mockReq.body = { email: 'new@example.com', password: 'password', phone: '+15551234567' };
            mockAuthService.register.mockResolvedValue(registerResult);

            await authController.register(mockReq, mockRes);

            expect(mockAuthService.register).toHaveBeenCalledWith('new@example.com', 'password', '+15551234567');
            expect(Send.success).toHaveBeenCalledWith(mockRes, registerResult.user, 'User successfully registered.');
            expect(mockRes.cookie).not.toHaveBeenCalled(); // No cookies set on registration
        });

        it('should return 409 for existing email', async () => {
            mockReq.body = { email: 'existing@example.com', password: 'password', phone: '+15551234567' };
            const authError = AuthErrors.emailInUse();
            mockAuthService.register.mockRejectedValue(authError);

            await authController.register(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(409);
            expect(mockRes.json).toHaveBeenCalledWith({
                ok: false,
                message: 'Email is already in use',
                code: 'EMAIL_IN_USE',
            });
        });
    });

    describe('verify', () => {
        it('should return 200 with tokens when OTP is valid', async () => {
            const verifyResult = {
                user: { id: 'user-123', email: 'test@example.com', role: 'worker', scope: ['read'] },
                accessToken: 'access-token',
                refreshToken: 'refresh-token',
            };

            mockReq.body = { email: 'test@example.com', otp: '123456' };
            mockAuthService.verifyOtpAndLogin.mockResolvedValue(verifyResult);

            await authController.verify(mockReq, mockRes);

            expect(mockAuthService.verifyOtpAndLogin).toHaveBeenCalledWith('test@example.com', '123456', 'email');
            expect(mockRes.cookie).toHaveBeenCalledWith('refreshToken', 'refresh-token', {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
                path: '/',
                sameSite: 'strict',
            });
            expect(Send.success).toHaveBeenCalledWith(mockRes, {
                user: verifyResult.user,
                accessToken: verifyResult.accessToken
            }, 'Email verified successfully');
        });

        it('should return 400 for invalid OTP', async () => {
            mockReq.body = { email: 'test@example.com', otp: 'wrong-otp' };
            const authError = AuthErrors.invalidOtp();
            mockAuthService.verifyOtpAndLogin.mockRejectedValue(authError);

            await authController.verify(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith({
                ok: false,
                message: 'Invalid or expired OTP',
                code: 'INVALID_OTP',
            });
        });

        it('should return 404 when user not found', async () => {
            mockReq.body = { email: 'test@example.com', otp: '123456' };
            const authError = AuthErrors.userNotFound();
            mockAuthService.verifyOtpAndLogin.mockRejectedValue(authError);

            await authController.verify(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(404);
            expect(mockRes.json).toHaveBeenCalledWith({
                ok: false,
                message: 'User not found',
                code: 'USER_NOT_FOUND',
            });
        });
    });

    describe('logout', () => {
        it('should return 200 and clears cookie', async () => {
            mockReq.user = { id: 'user-123', role: 'worker', scope: ['read'] };
            mockReq.cookies = { refreshToken: 'refresh-token' };
            mockAuthService.logout.mockResolvedValue();

            await authController.logout(mockReq, mockRes);

            expect(mockAuthService.logout).toHaveBeenCalledWith('user-123', 'refresh-token');
            expect(mockRes.clearCookie).toHaveBeenCalledWith('refreshToken', expect.objectContaining({ httpOnly: true }));
            expect(mockRes.clearCookie).toHaveBeenCalledWith('csrf-token', expect.anything());
            expect(Send.success).toHaveBeenCalledWith(mockRes, null, 'Logged out successfully.');
        });

        it('should handle missing userId gracefully', async () => {
            delete mockReq.user;
            mockReq.cookies = { refreshToken: 'refresh-token' };

            await authController.logout(mockReq, mockRes);

            expect(mockAuthService.logout).not.toHaveBeenCalled();
            expect(mockRes.clearCookie).toHaveBeenCalled();
        });
    });

    describe('refresh', () => {
        it('should return 200 with new access token and set new refresh token cookie', async () => {
            mockReq.user = { id: 'user-123', role: 'worker', scope: ['read'] };
            mockReq.cookies = { refreshToken: 'old-refresh-token' };
            mockAuthService.refreshToken.mockResolvedValue({
                accessToken: 'new-access-token',
                refreshToken: 'new-refresh-token',
            });

            await authController.refresh(mockReq, mockRes);

            expect(mockAuthService.refreshToken).toHaveBeenCalledWith('old-refresh-token');
            // Access token is returned in response body
            expect(Send.success).toHaveBeenCalledWith(mockRes, {
                accessToken: 'new-access-token',
                message: 'Access token refreshed successfully'
            });
            // New refresh token cookie should be set
            expect(mockRes.cookie).toHaveBeenCalledWith(
                'refreshToken',
                'new-refresh-token',
                expect.objectContaining({
                    httpOnly: true,
                    secure: expect.any(Boolean),
                    maxAge: 7 * 24 * 60 * 60 * 1000,
                    sameSite: 'strict',
                })
            );
        });

        it('should return 401 for invalid refresh token', async () => {
            mockReq.user = { id: 'user-123', role: 'worker', scope: ['read'] };
            mockReq.cookies = { refreshToken: 'invalid-token' };
            const authError = AuthErrors.invalidRefreshToken();
            mockAuthService.refreshToken.mockRejectedValue(authError);

            await authController.refresh(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({
                ok: false,
                message: 'Invalid refresh token',
                code: 'INVALID_REFRESH_TOKEN',
            });
        });

        it('should return 401 when refresh token is missing', async () => {
            delete mockReq.user;
            mockReq.cookies = {};

            await authController.refresh(mockReq, mockRes);

            expect(Send.unauthorized).toHaveBeenCalledWith(mockRes, { message: 'Missing refresh token' });
            expect(mockAuthService.refreshToken).not.toHaveBeenCalled();
        });

        it('should handle refresh token reuse after logout', async () => {
            mockReq.user = { id: 'user-123', role: 'worker', scope: ['read'] };
            mockReq.cookies = { refreshToken: 'revoked-refresh-token' };
            mockAuthService.refreshToken.mockRejectedValue(new Error('Invalid refresh token'));

            await authController.refresh(mockReq, mockRes);

            expect(Send.error).toHaveBeenCalled();
            expect(mockRes.cookie).not.toHaveBeenCalled(); // No cookie set on error
        });

        it('should handle login with different roles', async () => {
            const roles = ['worker', 'admin', 'employer'] as const;

            for (const role of roles) {
                jest.clearAllMocks();
                const loginResult = {
                    user: { id: `user-${role}`, email: `${role}@example.com`, role, scope: role === 'admin' ? ['read', 'write', 'delete'] : ['read'] },
                    accessToken: `access-token-${role}`,
                    refreshToken: `refresh-token-${role}`,
                };

                mockReq.body = { email: `${role}@example.com`, password: 'password' };
                mockAuthService.login.mockResolvedValue(loginResult);

                await authController.login(mockReq, mockRes);

                expect(Send.success).toHaveBeenCalledWith(mockRes, {
                    user: loginResult.user,
                    accessToken: loginResult.accessToken
                });
                expect(loginResult.user.role).toBe(role);
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
                jest.clearAllMocks();
                const loginResult = {
                    user: { id: 'user-123', email: 'test@example.com', role: 'worker' as const, scope },
                    accessToken: 'access-token',
                    refreshToken: 'refresh-token',
                };

                mockReq.body = { email: 'test@example.com', password: 'password' };
                mockAuthService.login.mockResolvedValue(loginResult);

                await authController.login(mockReq, mockRes);

                expect(Send.success).toHaveBeenCalledWith(mockRes, {
                    user: loginResult.user,
                    accessToken: loginResult.accessToken
                });
                expect(loginResult.user.scope).toEqual(scope);
            }
        });

        it('should handle disabled user login', async () => {
            mockReq.body = { email: 'disabled@example.com', password: 'password' };
            mockAuthService.login.mockResolvedValue({
                user: { id: 'user-123', email: 'disabled@example.com', role: 'worker', scope: ['read'] },
                accessToken: 'access-token',
                refreshToken: 'refresh-token',
            });

            // Note: Current implementation doesn't check disabled status
            // This test documents expected behavior
            await authController.login(mockReq, mockRes);

            expect(Send.success).toHaveBeenCalled();
            // TODO: Add disabled user check in AuthService.login()
        });
    });
});
