import { AppError } from "@backend/lib/errors";

type BucketRecord = {
  timestamps: number[];
};

const buckets = new Map<string, BucketRecord>();

export type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
  message?: string;
};

/**
 * In-memory sliding-window rate limiter for auth and invitation endpoints.
 * Throws AppError("RATE_LIMITED", 429) when request count exceeds limit within windowMs.
 */
export function enforceRateLimit(options: RateLimitOptions, nowMs = Date.now()): void {
  const { key, limit, windowMs, message } = options;
  const cutoff = nowMs - windowMs;
  const record = buckets.get(key) ?? { timestamps: [] };
  const recent = record.timestamps.filter((ts) => ts > cutoff);

  if (recent.length >= limit) {
    buckets.set(key, { timestamps: recent });
    throw new AppError(
      "RATE_LIMITED",
      429,
      message ?? "Too many requests. Please wait a moment before trying again."
    );
  }

  recent.push(nowMs);
  buckets.set(key, { timestamps: recent });

  if (buckets.size > 5000) {
    for (const [entryKey, entry] of buckets.entries()) {
      if (entry.timestamps.every((ts) => ts <= cutoff)) {
        buckets.delete(entryKey);
      }
    }
  }
}

export function resetRateLimitBuckets(): void {
  buckets.clear();
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  return realIp || "unknown";
}
