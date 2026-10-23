import { jest } from '@jest/globals';
import { ZodError, z } from 'zod';
import ErrorHandler from '@utils/logging/error-handler.utils.js';
import { AuthError, AuthErrors } from '@errors/auth.error.js';
import logger from '@utils/logging/logger.utils.js';
import type { Response } from 'express';

describe('ErrorHandler', () => {
    let mockRes: Partial<Response>;
    let consoleErrorSpy: jest.SpiedFunction<typeof logger.error>;

    beforeEach(() => {
        mockRes = {
            status: jest.fn().mockReturnThis() as unknown as Response['status'],
            json: jest.fn().mockReturnThis() as unknown as Response['json'],
        };
        consoleErrorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
        jest.clearAllMocks();
    });

    describe('handleControllerError', () => {
        describe('AuthError handling', () => {
            it('should return 401 for invalidCredentials', () => {
                const error = AuthErrors.invalidCredentials();
                ErrorHandler.handleControllerError(mockRes as Response, error, 'Login failed.');

                expect(mockRes.status).toHaveBeenCalledWith(401);
                expect(mockRes.json).toHaveBeenCalledWith({
                    ok: false,
                    message: 'Invalid credentials',
                    code: 'INVALID_CREDENTIALS',
                });
                expect(consoleErrorSpy).not.toHaveBeenCalled();
            });

            it('should return 403 for emailNotVerified', () => {
                const error = AuthErrors.emailNotVerified();
                ErrorHandler.handleControllerError(mockRes as Response, error, 'Login failed.');

                expect(mockRes.status).toHaveBeenCalledWith(403);
                expect(mockRes.json).toHaveBeenCalledWith({
                    ok: false,
                    message: 'Email not verified',
                    code: 'EMAIL_NOT_VERIFIED',
                });
                expect(consoleErrorSpy).not.toHaveBeenCalled();
            });

            it('should return 409 for emailInUse', () => {
                const error = AuthErrors.emailInUse();
                ErrorHandler.handleControllerError(mockRes as Response, error, 'Registration failed.');

                expect(mockRes.status).toHaveBeenCalledWith(409);
                expect(mockRes.json).toHaveBeenCalledWith({
                    ok: false,
                    message: 'Email is already in use',
                    code: 'EMAIL_IN_USE',
                });
            });

            it('should include details when provided', () => {
                const error = new AuthError(400, 'CUSTOM_ERROR', 'Custom error message', { field: 'value' });
                ErrorHandler.handleControllerError(mockRes as Response, error, 'Default message.');

                expect(mockRes.status).toHaveBeenCalledWith(400);
                expect(mockRes.json).toHaveBeenCalledWith({
                    ok: false,
                    message: 'Custom error message',
                    code: 'CUSTOM_ERROR',
                    data: { field: 'value' },
                });
            });

            it('should not include data field when details is undefined', () => {
                const error = AuthErrors.invalidCredentials();
                ErrorHandler.handleControllerError(mockRes as Response, error, 'Login failed.');

                expect(mockRes.json).toHaveBeenCalledWith({
                    ok: false,
                    message: 'Invalid credentials',
                    code: 'INVALID_CREDENTIALS',
                });
                expect(mockRes.json).not.toHaveBeenCalledWith(
                    expect.objectContaining({
                        data: expect.anything(),
                    })
                );
            });
        });

        describe('ZodError handling', () => {
            it('should return 400 for ZodError', () => {
                const schema = z.object({
                    email: z.string().email(),
                    password: z.string().min(8),
                });
                const result = schema.safeParse({ email: 'invalid', password: 'short' });
                
                if (!result.success) {
                    ErrorHandler.handleControllerError(mockRes as Response, result.error, 'Validation failed.');

                    expect(mockRes.status).toHaveBeenCalledWith(400);
                    expect(mockRes.json).toHaveBeenCalledWith({
                        ok: false,
                        message: 'Validation error',
                        errors: expect.objectContaining({
                            email: expect.arrayContaining([expect.any(String)]),
                            password: expect.arrayContaining([expect.any(String)]),
                        }),
                    });
                    expect(consoleErrorSpy).not.toHaveBeenCalled();
                }
            });

            it('should format nested ZodError paths correctly', () => {
                const schema = z.object({
                    user: z.object({
                        name: z.string().min(1),
                        email: z.string().email(),
                    }),
                });
                const result = schema.safeParse({ user: { name: '', email: 'invalid' } });
                
                if (!result.success) {
                    ErrorHandler.handleControllerError(mockRes as Response, result.error, 'Validation failed.');

                    expect(mockRes.status).toHaveBeenCalledWith(400);
                    expect(mockRes.json).toHaveBeenCalledWith({
                        ok: false,
                        message: 'Validation error',
                        errors: expect.objectContaining({
                            'user.name': expect.arrayContaining([expect.any(String)]),
                            'user.email': expect.arrayContaining([expect.any(String)]),
                        }),
                    });
                }
            });
        });

        describe('Unknown error handling', () => {
            it('should return 500 for unknown errors', () => {
                const error = new Error('Some unexpected error');
                ErrorHandler.handleControllerError(mockRes as Response, error, 'Login failed.');

                expect(mockRes.status).toHaveBeenCalledWith(500);
                expect(mockRes.json).toHaveBeenCalledWith({
                    ok: false,
                    message: 'Login failed.',
                    code: undefined,
                    data: null,
                });
                expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
                expect(consoleErrorSpy).toHaveBeenCalledWith('Controller error', error);
            });

            it('should use default message when provided', () => {
                const error = new Error('Unexpected');
                ErrorHandler.handleControllerError(mockRes as Response, error, 'Custom default message');

                expect(mockRes.json).toHaveBeenCalledWith({
                    ok: false,
                    message: 'Custom default message',
                    code: undefined,
                    data: null,
                });
            });

            it('should use default message when error is null', () => {
                ErrorHandler.handleControllerError(mockRes as Response, null, 'Something went wrong');

                expect(mockRes.status).toHaveBeenCalledWith(500);
                expect(mockRes.json).toHaveBeenCalledWith({
                    ok: false,
                    message: 'Something went wrong',
                    code: undefined,
                    data: null,
                });
                expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
            });

            it('should log error only once for unknown errors', () => {
                const error = new Error('Unexpected error');
                ErrorHandler.handleControllerError(mockRes as Response, error, 'Failed');

                expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
            });
        });
    });
});

