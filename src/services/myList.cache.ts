import Redis from "ioredis";
import logger from "../utils/logger";

export const redis = new Redis(
  process.env.REDIS_URL || "redis://127.0.0.1:6379",
);

redis.on("connect", () => {
  logger.info("✓ Connected to Redis");
});

redis.on("error", (err) => {
  logger.error("✗ Redis connection error:", err.message);
});

redis.on("close", () => {
  logger.warn("⚠ Redis connection closed");
});

// helper: version key for a user
export function userVersionKey(userId: string) {
  return `mylist:${userId}:version`;
}

// helper: page cache key for a user given version, limit and cursor
export function pageCacheKey(
  userId: string,
  version: string,
  limit: number,
  cursor?: string,
) {
  const cursorKey = cursor ? cursor : "start";
  return `mylist:${userId}:v${version}:limit${limit}:cursor${cursorKey}`;
}
