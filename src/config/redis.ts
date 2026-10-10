// server/config/redis.js

import { Redis } from '@upstash/redis';

// ============================================================
// ✅ اتصال Upstash Redis
// ============================================================

if (
  !process.env.UPSTASH_REDIS_REST_URL ||
  !process.env.UPSTASH_REDIS_REST_TOKEN
) {
  console.warn(
    '⚠️ Upstash Redis credentials missing. Queue features will be disabled.',
  );
}

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
  // ✅ إعادة المحاولة تلقائياً عند الفشل
  retry: {
    retries: 3,
    backoff: (retryCount) => Math.exp(retryCount) * 100,
  },
});

// ============================================================
// ✅ اختبار الاتصال (اختياري)
// ============================================================
export async function testRedisConnection() {
  try {
    await redis.set('ping', 'pong', { ex: 10 });
    const result = await redis.get('ping');

    if (result === 'pong') {
      console.log('✅ Upstash Redis connected successfully');
      return true;
    }

    console.warn('⚠️ Redis connected but ping failed');
    return false;
  } catch (error) {
    console.error('❌ Upstash Redis connection failed:', error.message);
    return false;
  }
}
