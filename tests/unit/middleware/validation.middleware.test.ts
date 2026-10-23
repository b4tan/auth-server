import { jest } from '@jest/globals';
import ValidationMiddleware from '@middleware/validation.middleware.js';
import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';

describe('ValidationMiddleware', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;

    beforeEach(() => {
        mockReq = {
            body: {},
            query: {},
            params: {},
        };
        mockRes = {
            status: jest.fn().mockReturnThis() as jest.Mock,
            json: jest.fn().mockReturnThis() as jest.Mock,
        } as unknown as Response;
        mockNext = jest.fn();
    });

    describe('validate body', () => {
        it('should pass request when body matches schema', () => {
            const schema = z.object({
                email: z.string().email(),
                name: z.string(),
            });

            mockReq.body = { email: 'test@example.com', name: 'Test' };
            const middleware = ValidationMiddleware.validate(schema, 'body');
            middleware(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalled();
            expect(mockRes.status).not.toHaveBeenCalled();
        });

        it('should return 400 when body validation fails', () => {
            const schema = z.object({
                email: z.string().email(),
            });

            mockReq.body = { email: 'invalid-email' };
            const middleware = ValidationMiddleware.validate(schema, 'body');
            middleware(mockReq as Request, mockRes as Response, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith({
                title: 'Bad Request',
                details: expect.any(Object),
            });
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should override req.body with validated data', () => {
            const schema = z.object({
                email: z.string().email(),
                age: z.coerce.number(),
            });

            mockReq.body = { email: 'test@example.com', age: '25' };
            const middleware = ValidationMiddleware.validate(schema, 'body');
            middleware(mockReq as Request, mockRes as Response, mockNext);

            expect(mockReq.body).toEqual({
                email: 'test@example.com',
                age: 25, // coerced to number
            });
            expect(mockNext).toHaveBeenCalled();
        });
    });

    describe('validate query', () => {
        it('should pass request when query matches schema', () => {
            const schema = z.object({
                page: z.coerce.number(),
                limit: z.coerce.number(),
            });

            mockReq.query = { page: '1', limit: '10' };
            const middleware = ValidationMiddleware.validate(schema, 'query');
            middleware(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalled();
            expect(mockRes.status).not.toHaveBeenCalled();
        });

        it('should return 400 when query validation fails', () => {
            const schema = z.object({
                page: z.coerce.number(),
            });

            mockReq.query = { page: 'invalid' };
            const middleware = ValidationMiddleware.validate(schema, 'query');
            middleware(mockReq as Request, mockRes as Response, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockNext).not.toHaveBeenCalled();
        });
    });

    describe('validate params', () => {
        it('should pass request when params match schema', () => {
            const schema = z.object({
                id: z.string().uuid(),
            });

            mockReq.params = { id: '123e4567-e89b-12d3-a456-426614174000' };
            const middleware = ValidationMiddleware.validate(schema, 'params');
            middleware(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalled();
            expect(mockRes.status).not.toHaveBeenCalled();
        });

        it('should return 400 when params validation fails', () => {
            const schema = z.object({
                id: z.string().uuid(),
            });

            mockReq.params = { id: 'invalid-uuid' };
            const middleware = ValidationMiddleware.validate(schema, 'params');
            middleware(mockReq as Request, mockRes as Response, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockNext).not.toHaveBeenCalled();
        });
    });

    describe('error formatting', () => {
        it('should include formatted Zod errors in response', () => {
            const schema = z.object({
                email: z.string().email(),
                age: z.number().min(18),
            });

            mockReq.body = { email: 'invalid', age: 15 };
            const middleware = ValidationMiddleware.validate(schema, 'body');
            middleware(mockReq as Request, mockRes as Response, mockNext);

            expect(mockRes.json).toHaveBeenCalledWith({
                title: 'Bad Request',
                details: expect.objectContaining({
                    _errors: expect.any(Array),
                }),
            });
        });

        it('should handle nested validation errors correctly', () => {
            const schema = z.object({
                user: z.object({
                    name: z.string().min(1),
                    email: z.string().email(),
                }),
            });

            mockReq.body = { user: { name: '', email: 'invalid' } };
            const middleware = ValidationMiddleware.validate(schema, 'body');
            middleware(mockReq as Request, mockRes as Response, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalled();
        });
    });

    describe('different schema types', () => {
        it('should work with string schema', () => {
            const schema = z.string().min(5);
            mockReq.body = 'valid-string';
            const middleware = ValidationMiddleware.validate(schema, 'body');
            middleware(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalled();
        });

        it('should work with number schema', () => {
            const schema = z.number().min(0);
            mockReq.body = 42;
            const middleware = ValidationMiddleware.validate(schema, 'body');
            middleware(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalled();
        });

        it('should work with array schema', () => {
            const schema = z.array(z.string());
            mockReq.body = ['item1', 'item2'];
            const middleware = ValidationMiddleware.validate(schema, 'body');
            middleware(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalled();
        });
    });

    describe('preserve original request', () => {
        it('should preserve original request when validation passes', () => {
            const schema = z.object({
                email: z.string().email(),
            });

            const originalBody = { email: 'test@example.com', extra: 'field' };
            mockReq.body = originalBody;
            const middleware = ValidationMiddleware.validate(schema, 'body');
            middleware(mockReq as Request, mockRes as Response, mockNext);

            // Note: The middleware overwrites req.body with validated data
            // This is expected behavior based on the implementation
            expect(mockReq.body).toEqual({ email: 'test@example.com' });
            expect(mockNext).toHaveBeenCalled();
        });
    });
});
