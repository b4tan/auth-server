import { jest } from '@jest/globals';
import { MemoryTokenBucket, RedisTokenBucket } from '@utils/ratelimit/token-bucket.js';

const policy = { capacity: 3, refillPerSecond: 1 };

describe('MemoryTokenBucket', () => {
    let now: number;
    let bucket: MemoryTokenBucket;

    beforeEach(() => {
        now = 1_000_000;
        bucket = new MemoryTokenBucket(() => now);
    });

    it('allows a burst up to capacity, then refuses', async () => {
        const results = [];
        for (let i = 0; i < 4; i++) results.push(await bucket.consume('k', policy));

        expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
        expect(results.map((r) => r.remaining)).toEqual([2, 1, 0, 0]);
        expect(results[3]!.retryAfterSeconds).toBe(1);
    });

    it('refills over time, but never past capacity', async () => {
        for (let i = 0; i < 3; i++) await bucket.consume('k', policy);
        expect((await bucket.consume('k', policy)).allowed).toBe(false);

        now += 1000; // one token back
        expect((await bucket.consume('k', policy)).allowed).toBe(true);
        expect((await bucket.consume('k', policy)).allowed).toBe(false);

        now += 60_000; // long idle: refills to capacity, not beyond
        const results = [];
        for (let i = 0; i < 4; i++) results.push((await bucket.consume('k', policy)).allowed);
        expect(results).toEqual([true, true, true, false]);
    });

    it('reports how long until the next token for slow refill rates', async () => {
        const slow = { capacity: 1, refillPerSecond: 1 / 300 };
        await bucket.consume('k', slow);
        expect((await bucket.consume('k', slow)).retryAfterSeconds).toBe(300);

        now += 100_000;
        expect((await bucket.consume('k', slow)).retryAfterSeconds).toBe(200);
    });

    it('keeps separate buckets per key', async () => {
        for (let i = 0; i < 3; i++) await bucket.consume('a', policy);
        expect((await bucket.consume('a', policy)).allowed).toBe(false);
        expect((await bucket.consume('b', policy)).allowed).toBe(true);
    });

    it('starts over after clear()', async () => {
        for (let i = 0; i < 3; i++) await bucket.consume('k', policy);
        bucket.clear();
        expect((await bucket.consume('k', policy)).allowed).toBe(true);
    });
});

describe('RedisTokenBucket', () => {
    it('runs the script atomically against the key with the policy', async () => {
        const evalMock = jest.fn(async (..._args: unknown[]) => [1, '2.5']);
        const bucket = new RedisTokenBucket({ eval: evalMock } as never);

        const result = await bucket.consume('ratelimit:login:1.2.3.4', policy);

        expect(evalMock).toHaveBeenCalledWith(expect.stringContaining("redis.call('TIME')"), 1, 'ratelimit:login:1.2.3.4', 3, 1);
        expect(result).toEqual({ allowed: true, remaining: 2, retryAfterSeconds: 0 });
    });

    it('turns a refusal into a retry time', async () => {
        const bucket = new RedisTokenBucket({ eval: jest.fn(async () => [0, '0.25']) } as never);

        expect(await bucket.consume('k', { capacity: 3, refillPerSecond: 0.5 })).toEqual({
            allowed: false,
            remaining: 0,
            retryAfterSeconds: 2,
        });
    });
});
