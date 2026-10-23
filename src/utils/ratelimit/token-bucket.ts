// Token bucket rate limiting.
// Each key gets a bucket of `capacity` tokens that refills at `refillPerSecond`.
// A request takes one token; an empty bucket means the request is refused until
// enough time has passed to refill one.
import type { Redis } from 'ioredis';

export interface BucketPolicy {
  capacity: number;        // burst size
  refillPerSecond: number; // sustained rate
}

export interface ConsumeResult {
  allowed: boolean;
  remaining: number;         // whole tokens left after this request
  retryAfterSeconds: number; // 0 when allowed
}

export interface ITokenBucket {
  consume(key: string, policy: BucketPolicy): Promise<ConsumeResult>;
}

/** Seconds until one token is back, given a fractional token count. */
function retryAfter(tokens: number, policy: BucketPolicy): number {
  return Math.max(1, Math.ceil((1 - tokens) / policy.refillPerSecond));
}

// Refill, then take a token if there is one, in one atomic step so concurrent
// requests across server instances can't overspend a bucket. Uses Redis' own
// clock so instances with skewed clocks agree. Returns {allowed, tokens}; tokens
// is a string because Redis truncates Lua numbers to integers.
const CONSUME_SCRIPT = `
local capacity = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)

local bucket = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(bucket[1]) or capacity
local ts = tonumber(bucket[2]) or now
tokens = math.min(capacity, tokens + math.max(0, now - ts) / 1000 * rate)

local allowed = 0
if tokens >= 1 then
  tokens = tokens - 1
  allowed = 1
end

redis.call('HSET', KEYS[1], 'tokens', tokens, 'ts', now)
-- Drop the key once it would have refilled anyway.
redis.call('PEXPIRE', KEYS[1], math.ceil(capacity / rate * 1000))
return { allowed, tostring(tokens) }
`;

export class RedisTokenBucket implements ITokenBucket {
  constructor(private readonly redis: Pick<Redis, 'eval'>) {}

  async consume(key: string, policy: BucketPolicy): Promise<ConsumeResult> {
    const [allowed, tokensRaw] = (await this.redis.eval(
      CONSUME_SCRIPT,
      1,
      key,
      policy.capacity,
      policy.refillPerSecond,
    )) as [number, string];
    const tokens = Number(tokensRaw);
    return {
      allowed: allowed === 1,
      remaining: Math.floor(tokens),
      retryAfterSeconds: allowed === 1 ? 0 : retryAfter(tokens, policy),
    };
  }
}

/** The same algorithm in process memory, for local development and tests. Not shared across instances. */
export class MemoryTokenBucket implements ITokenBucket {
  private buckets = new Map<string, { tokens: number; ts: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  async consume(key: string, policy: BucketPolicy): Promise<ConsumeResult> {
    const now = this.now();
    const bucket = this.buckets.get(key) ?? { tokens: policy.capacity, ts: now };
    let tokens = Math.min(policy.capacity, bucket.tokens + (Math.max(0, now - bucket.ts) / 1000) * policy.refillPerSecond);

    const allowed = tokens >= 1;
    if (allowed) tokens -= 1;
    this.buckets.set(key, { tokens, ts: now });

    return {
      allowed,
      remaining: Math.floor(tokens),
      retryAfterSeconds: allowed ? 0 : retryAfter(tokens, policy),
    };
  }

  clear(): void {
    this.buckets.clear();
  }
}
