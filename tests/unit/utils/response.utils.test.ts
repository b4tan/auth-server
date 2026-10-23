import { jest } from '@jest/globals';
import Send from '@utils/logging/response.utils.js';
import type { Response } from 'express';

describe('Send', () => {
    let mockRes: Partial<Response>;

    beforeEach(() => {
        mockRes = {
            status: jest.fn().mockReturnThis() as unknown as Response['status'],
            json: jest.fn().mockReturnThis() as unknown as Response['json'],
        };
    });

    describe('success', () => {
        it('should return 200 status code', () => {
            Send.success(mockRes as Response, { id: '1' });
            expect(mockRes.status).toHaveBeenCalledWith(200);
        });

        it('should include ok: true in response', () => {
            Send.success(mockRes as Response, { id: '1' });
            expect(mockRes.json).toHaveBeenCalledWith({
                ok: true,
                message: 'success',
                data: { id: '1' },
            });
        });

        it('should include message in response', () => {
            Send.success(mockRes as Response, { id: '1' }, 'Custom message');
            expect(mockRes.json).toHaveBeenCalledWith({
                ok: true,
                message: 'Custom message',
                data: { id: '1' },
            });
        });

        it('should include data in response', () => {
            const data = { id: '1', name: 'Test' };
            Send.success(mockRes as Response, data);
            expect(mockRes.json).toHaveBeenCalledWith({
                ok: true,
                message: 'success',
                data,
            });
        });
    });

    describe('error', () => {
        it('should return 500 status code', () => {
            Send.error(mockRes as Response, null);
            expect(mockRes.status).toHaveBeenCalledWith(500);
        });

        it('should include ok: false in response', () => {
            Send.error(mockRes as Response, null);
            expect(mockRes.json).toHaveBeenCalledWith({
                ok: false,
                message: 'error',
                data: null,
            });
        });

        it('should accept custom message', () => {
            Send.error(mockRes as Response, null, 'Custom error');
            expect(mockRes.json).toHaveBeenCalledWith({
                ok: false,
                message: 'Custom error',
                data: null,
            });
        });
    });

    describe('notFound', () => {
        it('should return 404 status code', () => {
            Send.notFound(mockRes as Response, null);
            expect(mockRes.status).toHaveBeenCalledWith(404);
        });

        it('should include ok: false in response', () => {
            Send.notFound(mockRes as Response, null);
            expect(mockRes.json).toHaveBeenCalledWith({
                ok: false,
                message: 'not found',
                data: null,
            });
        });
    });

    describe('unauthorized', () => {
        it('should return 401 status code', () => {
            Send.unauthorized(mockRes as Response, null);
            expect(mockRes.status).toHaveBeenCalledWith(401);
        });

        it('should include ok: false in response', () => {
            Send.unauthorized(mockRes as Response, null);
            expect(mockRes.json).toHaveBeenCalledWith({
                ok: false,
                message: 'unauthorized',
                data: null,
            });
        });
    });

    describe('forbidden', () => {
        it('should return 403 status code', () => {
            Send.forbidden(mockRes as Response, null);
            expect(mockRes.status).toHaveBeenCalledWith(403);
        });

        it('should include ok: false in response', () => {
            Send.forbidden(mockRes as Response, null);
            expect(mockRes.json).toHaveBeenCalledWith({
                ok: false,
                message: 'forbidden',
                data: null,
            });
        });
    });

    describe('badRequest', () => {
        it('should return 400 status code', () => {
            Send.badRequest(mockRes as Response, null);
            expect(mockRes.status).toHaveBeenCalledWith(400);
        });

        it('should include ok: false in response', () => {
            Send.badRequest(mockRes as Response, null);
            expect(mockRes.json).toHaveBeenCalledWith({
                ok: false,
                message: 'bad request',
                data: null,
            });
        });
    });

    describe('validationErrors', () => {
        it('should return 422 status code', () => {
            Send.validationErrors(mockRes as Response, { email: ['Invalid email'] });
            expect(mockRes.status).toHaveBeenCalledWith(422);
        });

        it('should include errors object in response', () => {
            const errors = { email: ['Invalid email'], password: ['Too short'] };
            Send.validationErrors(mockRes as Response, errors);
            expect(mockRes.json).toHaveBeenCalledWith({
                ok: false,
                message: 'Validation error',
                errors,
            });
        });
    });

    describe('consistent response format', () => {
        it('should return consistent response format for all methods', () => {
            const methods = [
                () => Send.success(mockRes as Response, { data: 'test' }),
                () => Send.error(mockRes as Response, null),
                () => Send.notFound(mockRes as Response, null),
                () => Send.unauthorized(mockRes as Response, null),
                () => Send.forbidden(mockRes as Response, null),
                () => Send.badRequest(mockRes as Response, null),
            ];

            methods.forEach(method => {
                method();
                expect(mockRes.json).toHaveBeenCalledWith(
                    expect.objectContaining({
                        ok: expect.any(Boolean),
                    })
                );
            });
        });
    });
});
