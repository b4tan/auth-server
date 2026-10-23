import type { BucketPolicy } from '@utils/ratelimit/token-bucket.js';

// capacity = burst allowed at once; refillPerSecond = steady rate after that.
const perMinute = (n: number) => n / 60;

const rateLimitConfig = {
  // Redis keeps buckets shared across instances; without it they live in memory.
  redisUrl: process.env.REDIS_URL,
  policies: {
    loginPerIp: { capacity: 10, refillPerSecond: perMinute(10) },
    loginPerEmail: { capacity: 5, refillPerSecond: perMinute(1) },
    registerPerIp: { capacity: 5, refillPerSecond: perMinute(1) },
    verifyPerIp: { capacity: 10, refillPerSecond: perMinute(5) },
    otpPerIp: { capacity: 5, refillPerSecond: perMinute(1) },
    otpPerEmail: { capacity: 3, refillPerSecond: perMinute(0.2) }, // one every 5 minutes
    refreshPerIp: { capacity: 30, refillPerSecond: perMinute(30) },
  } satisfies Record<string, BucketPolicy>,
};

export default rateLimitConfig;
