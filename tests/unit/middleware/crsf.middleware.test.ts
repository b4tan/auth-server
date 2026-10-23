// Mock response.utils BEFORE importing - ES modules require unstable_mockModule
import { jest } from '@jest/globals';
import * as crypto from 'crypto';
/// <reference path="../../../src/types/express.d.ts" /> // Import Express type extensions

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
const { default: CsrfMiddleware } = await import('@middleware/csrf.middlware.js');
const { default: Send } = await import('@utils/logging/response.utils.js');
import type { Request, Response, NextFunction } from 'express';

describe('CsrfMiddleware', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;

    beforeEach(() => {
        mockReq = {
            method: 'POST',
            cookies: {},
            headers: {},
            header: jest.fn() as unknown as Request['header'],
            body: {},
        };
        mockRes = {
            cookie: jest.fn().mockReturnThis() as jest.Mock,
            setHeader: jest.fn().mockReturnThis() as jest.Mock,
            status: jest.fn().mockReturnThis() as jest.Mock,
            json: jest.fn().mockReturnThis() as jest.Mock,
        } as unknown as Response;
        mockNext = jest.fn();
        jest.clearAllMocks();
    });

    describe('generateCrsfToken', () => {
        it('should set csrfToken cookie with correct options', () => {
            CsrfMiddleware.generateCrsfToken(mockReq as Request, mockRes as Response, mockNext);

            expect(mockRes.cookie).toHaveBeenCalledWith(
                'csrf-token',
                expect.any(String),
                expect.objectContaining({
                    httpOnly: false,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax',
                    maxAge: 24 * 60 * 60 * 1000,
                    path: '/',
                })
            );
        });

        it('should set X-CSRF-Token header', () => {
            CsrfMiddleware.generateCrsfToken(mockReq as Request, mockRes as Response, mockNext);

            expect(mockRes.setHeader).toHaveBeenCalledWith(
                'X-CSRF-Token',
                expect.any(String)
            );
        });

        it('should generate random 32-byte hex token', () => {
            CsrfMiddleware.generateCrsfToken(mockReq as Request, mockRes as Response, mockNext);

            const cookieCall = (mockRes.cookie as jest.Mock).mock.calls[0];
            expect(cookieCall).toBeDefined();
            const token = cookieCall![1] as string;

            expect(token).toMatch(/^[0-9a-f]+$/); // hex string
            expect(token.length).toBe(64); // 32 bytes = 64 hex chars
            expect(mockNext).toHaveBeenCalled();
        });

        it('should set the SAME token in cookie and X-CSRF-Token header', () => {
            CsrfMiddleware.generateCrsfToken(mockReq as Request, mockRes as Response, mockNext);

            const cookieCall = (mockRes.cookie as jest.Mock).mock.calls[0];
            expect(cookieCall).toBeDefined();
            const cookieToken = cookieCall![1] as string;

            const headerCall = (mockRes.setHeader as jest.Mock).mock.calls.find(
                (c) => c[0] === 'X-CSRF-Token'
            );
            expect(headerCall).toBeDefined();
            const headerToken = headerCall![1] as string;

            expect(headerToken).toBe(cookieToken);
            expect(headerToken).toBeDefined();
        });
    });

    describe('verifyCrsfToken', () => {
        it('should skip verification for GET requests', () => {
            mockReq.method = 'GET';
            CsrfMiddleware.verifyCrsfToken(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalled();
            expect(Send.forbidden).not.toHaveBeenCalled();
        });

        it('should skip verification for HEAD requests', () => {
            mockReq.method = 'HEAD';
            CsrfMiddleware.verifyCrsfToken(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalled();
            expect(Send.forbidden).not.toHaveBeenCalled();
        });

        it('should skip verification for OPTIONS requests', () => {
            mockReq.method = 'OPTIONS';
            CsrfMiddleware.verifyCrsfToken(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalled();
            expect(Send.forbidden).not.toHaveBeenCalled();
        });

        it('should require CSRF token for PUT requests', () => {
            const token = crypto.randomBytes(32).toString('hex');
            mockReq.method = 'PUT';
            mockReq.cookies = { 'csrf-token': token };
            (mockReq.header as jest.Mock).mockReturnValue(token);

            CsrfMiddleware.verifyCrsfToken(mockReq as Request, mockRes as Response, mockNext);

            expect(mockReq.header).toHaveBeenCalledWith('X-CSRF-Token');
            expect(mockNext).toHaveBeenCalled();
            expect(Send.forbidden).not.toHaveBeenCalled();
        });

        it('should require CSRF token for PATCH requests', () => {
            const token = crypto.randomBytes(32).toString('hex');
            mockReq.method = 'PATCH';
            mockReq.cookies = { 'csrf-token': token };
            (mockReq.header as jest.Mock).mockReturnValue(token);

            CsrfMiddleware.verifyCrsfToken(mockReq as Request, mockRes as Response, mockNext);

            expect(mockReq.header).toHaveBeenCalledWith('X-CSRF-Token');
            expect(mockNext).toHaveBeenCalled();
            expect(Send.forbidden).not.toHaveBeenCalled();
        });

        it('should require CSRF token for DELETE requests', () => {
            const token = crypto.randomBytes(32).toString('hex');
            mockReq.method = 'DELETE';
            mockReq.cookies = { 'csrf-token': token };
            (mockReq.header as jest.Mock).mockReturnValue(token);

            CsrfMiddleware.verifyCrsfToken(mockReq as Request, mockRes as Response, mockNext);

            expect(mockReq.header).toHaveBeenCalledWith('X-CSRF-Token');
            expect(mockNext).toHaveBeenCalled();
            expect(Send.forbidden).not.toHaveBeenCalled();
        });

        it('should reject PUT request when tokens don\'t match', () => {
            mockReq.method = 'PUT';
            mockReq.cookies = { 'csrf-token': 'token-1' };
            (mockReq.header as jest.Mock).mockReturnValue('token-2');

            CsrfMiddleware.verifyCrsfToken(mockReq as Request, mockRes as Response, mockNext);

            expect(Send.forbidden).toHaveBeenCalledWith(
                mockRes,
                expect.objectContaining({
                    message: 'CSRF token mismatch',
                })
            );
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should allow request when cookie and header tokens match', () => {
            const token = crypto.randomBytes(32).toString('hex');
            mockReq.method = 'POST';
            mockReq.cookies = { 'csrf-token': token };
            (mockReq.header as jest.Mock).mockReturnValue(token);

            CsrfMiddleware.verifyCrsfToken(mockReq as Request, mockRes as Response, mockNext);

            expect(mockReq.header).toHaveBeenCalledWith('X-CSRF-Token');
            expect(mockNext).toHaveBeenCalled();
            expect(Send.forbidden).not.toHaveBeenCalled();
        });

        it('should work with case-insensitive header (Express normalizes headers)', () => {
            const token = crypto.randomBytes(32).toString('hex');
            mockReq.method = 'POST';
            mockReq.cookies = { 'csrf-token': token };
            // Express normalizes headers, so req.header('X-CSRF-Token') works even if sent as 'x-csrf-token'
            (mockReq.header as jest.Mock).mockReturnValue(token);

            CsrfMiddleware.verifyCrsfToken(mockReq as Request, mockRes as Response, mockNext);

            // Verify it uses req.header() which Express normalizes
            expect(mockReq.header).toHaveBeenCalledWith('X-CSRF-Token');
            expect(mockNext).toHaveBeenCalled();
            expect(Send.forbidden).not.toHaveBeenCalled();
        });

        it('should return 403 when cookie token is missing', () => {
            mockReq.method = 'POST';
            mockReq.cookies = {};
            (mockReq.header as jest.Mock).mockReturnValue('some-token');

            CsrfMiddleware.verifyCrsfToken(mockReq as Request, mockRes as Response, mockNext);

            expect(Send.forbidden).toHaveBeenCalledWith(
                mockRes,
                expect.objectContaining({
                    message: 'CSRF token missing',
                })
            );
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should return 403 when header token is missing', () => {
            const token = crypto.randomBytes(32).toString('hex');
            mockReq.method = 'POST';
            mockReq.cookies = { 'csrf-token': token };
            (mockReq.header as jest.Mock).mockReturnValue(undefined);

            CsrfMiddleware.verifyCrsfToken(mockReq as Request, mockRes as Response, mockNext);

            expect(Send.forbidden).toHaveBeenCalledWith(
                mockRes,
                expect.objectContaining({
                    message: 'CSRF token missing',
                })
            );
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should return 403 when tokens don\'t match', () => {
            mockReq.method = 'POST';
            mockReq.cookies = { 'csrf-token': 'token-1' };
            (mockReq.header as jest.Mock).mockReturnValue('token-2');

            CsrfMiddleware.verifyCrsfToken(mockReq as Request, mockRes as Response, mockNext);

            expect(Send.forbidden).toHaveBeenCalledWith(
                mockRes,
                expect.objectContaining({
                    message: 'CSRF token mismatch',
                })
            );
            expect(mockNext).not.toHaveBeenCalled();
        });
    });
});
