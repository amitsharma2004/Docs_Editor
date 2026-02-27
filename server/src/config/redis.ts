import Redis from 'ioredis';
import logger from '../utils/logger';

let redisClient: Redis;

/**
 * Get or create the Redis singleton client.
 */
export const getRedisClient = (): Redis => {
  if (!redisClient) {
    redisClient = new Redis(process.env.REDIS_URL as string, {
      lazyConnect: true,
      retryStrategy: (times: number) => {
        if (times > 5) return null;
        return Math.min(times * 500, 3000);
      },
    });

    redisClient.on('connect', () => logger.info('Redis connected'));
    redisClient.on('error', (err) => logger.error(`Redis error: ${err.message}`));
  }
  return redisClient;
};
