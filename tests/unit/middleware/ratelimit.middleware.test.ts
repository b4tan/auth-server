import { jest } from '@jest/globals';
import type { Request, Response, NextFunction } from 'express';
import { createRateLimit, byEmail } from '@middleware/ratelimit.middleware.js';
import { MemoryTokenBucket, type ITokenBucket } from '@utils/ratelimit/token-bucket.js';
import logger from '@utils/logging/logger.utils.js';

const policy = { capacity: 2, refillPerSecond: 1 / 60 };

function mockRes() {
    const res = {
        setHeader: jest.fn(),
        status: jest.fn(),
        json: jest.fn(),
    };
    res.status.mockReturnValue(res);
    return res as unknown as Response & typeof res;
}

const req = (overrides: Partial<Request> = {}) => ({ ip: '1.2.3.4', path: '/login', body: {}, ...overrides }) as Request;

describe('rate limit middleware', () => {
    beforeEach(() => {
        jest.spyOn(logger, 'warn').mockImplementation(() => {});
        jest.spyOn(logger, 'error').mockImplementation(() => {});
    });
    afterEach(() => jest.restoreAllMocks());

    it('lets requests through until the bucket is empty, then responds 429', async () => {
        const limit = createRateLimit(new MemoryTokenBucket())('login', policy);
        const next = jest.fn() as unknown as NextFunction;

        for (let i = 0; i < 2; i++) await limit(req(), mockRes(), next);
        expect(next).toHaveBeenCalledTimes(2);

        const res = mockRes();
        await limit(req(), res, next);
        expect(next).toHaveBeenCalledTimes(2);
        expect(res.status).toHaveBeenCalledWith(429);
        expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '60');
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: false, code: 'RATE_LIMITED' }));
    });

    it('sets RateLimit headers on allowed requests', async () => {
        const res = mockRes();
        await createRateLimit(new MemoryTokenBucket())('login', policy)(req(), res, jest.fn() as unknown as NextFunction);

        expect(res.setHeader).toHaveBeenCalledWith('RateLimit-Limit', '2');
        expect(res.setHeader).toHaveBeenCalledWith('RateLimit-Remaining', '1');
    });

    it('keys by email case-insensitively when asked to', async () => {
        const limit = createRateLimit(new MemoryTokenBucket())('login', policy, byEmail);
        const next = jest.fn() as unknown as NextFunction;

        await limit(req({ body: { email: 'A@example.com' } }), mockRes(), next);
        await limit(req({ body: { email: 'a@example.com ' } }), mockRes(), next);
        const res = mockRes();
        await limit(req({ body: { email: 'a@EXAMPLE.com' } }), res, next);

        expect(res.status).toHaveBeenCalledWith(429);
    });

    it('skips the limit when the key is missing', async () => {
        const consume = jest.fn<ITokenBucket['consume']>();
        const next = jest.fn() as unknown as NextFunction;

        await createRateLimit({ consume })('login', policy, byEmail)(req({ body: {} }), mockRes(), next);

        expect(consume).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalled();
    });

    it('lets the request through and logs when the store is down', async () => {
        const consume = jest.fn<ITokenBucket['consume']>().mockRejectedValue(new Error('ECONNREFUSED'));
        const next = jest.fn() as unknown as NextFunction;

        await createRateLimit({ consume })('login', policy)(req(), mockRes(), next);

        expect(next).toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalled();
    });
});
