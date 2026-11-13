import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  resolvePublicAppOrigin,
  resolveRequestOrigin,
} from "@backend/lib/origin";
import {
  clearAllHubCaches,
  fetchWithUserCache,
  getCachedData,
  invalidateUserCache,
  setCachedData,
} from "@frontend/services/dataCache";

describe("resolvePublicAppOrigin", () => {
  it("resolves production Vercel deployment from NEXT_PUBLIC_APP_URL", () => {
    const origin = resolvePublicAppOrigin({
      requestUrl: "http://localhost:3000/api/v1/auth/signup",
      headers: { host: "localhost:3000" },
      env: {
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://gritinterviewhub.vercel.app/",
      },
    });
    expect(origin).toBe("https://gritinterviewhub.vercel.app");
  });

  it("keeps http://localhost:3000 for local development requests even when production env var is unset", () => {
    const origin = resolvePublicAppOrigin({
      requestUrl: "http://0.0.0.0:3000/api/v1/auth/signup",
      headers: { host: "0.0.0.0:3000" },
      env: { NODE_ENV: "development" },
    });
    expect(origin).toBe("http://localhost:3000");
  });

  it("uses x-forwarded-host and x-forwarded-proto on Vercel edge proxy", () => {
    const origin = resolvePublicAppOrigin({
      requestUrl: "http://localhost:3000/api/v1/auth/signup",
      headers: new Headers({
        "x-forwarded-host": "gritinterviewhub.vercel.app",
        "x-forwarded-proto": "https",
        host: "localhost:3000",
      }),
      env: { NODE_ENV: "production" },
    });
    expect(origin).toBe("https://gritinterviewhub.vercel.app");
  });

  it("falls back to VERCEL_PROJECT_PRODUCTION_URL when headers are internal", () => {
    const origin = resolvePublicAppOrigin({
      requestUrl: "http://127.0.0.1:3000/api/v1/auth/signup",
      env: {
        NODE_ENV: "production",
        VERCEL_PROJECT_PRODUCTION_URL: "gritinterviewhub.vercel.app",
      },
    });
    expect(origin).toBe("https://gritinterviewhub.vercel.app");
  });

  it("resolves directly from a Request instance via resolveRequestOrigin", () => {
    const req = new Request("https://gritinterviewhub.vercel.app/api/v1/auth/signup", {
      headers: {
        "x-forwarded-host": "gritinterviewhub.vercel.app",
        "x-forwarded-proto": "https",
      },
    });
    expect(resolveRequestOrigin(req)).toBe("https://gritinterviewhub.vercel.app");
  });
});

describe("user-scoped SWR dataCache", () => {
  beforeEach(() => {
    clearAllHubCaches();
  });

  it("isolates cached entries strictly per userId", () => {
    setCachedData("user-a", "student:overview", { score: 1 });
    setCachedData("user-b", "student:overview", { score: 2 });

    expect(getCachedData<{ score: number }>("user-a", "student:overview")?.data).toEqual({
      score: 1,
    });
    expect(getCachedData<{ score: number }>("user-b", "student:overview")?.data).toEqual({
      score: 2,
    });

    invalidateUserCache("user-a", "student:");
    expect(getCachedData("user-a", "student:overview")).toBeNull();
    expect(getCachedData<{ score: number }>("user-b", "student:overview")?.data).toEqual({
      score: 2,
    });
  });

  it("deduplicates concurrent in-flight requests and purges all caches on signout", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true });

    const [a, b] = await Promise.all([
      fetchWithUserCache("user-1", "ops:dashboard", fetcher),
      fetchWithUserCache("user-1", "ops:dashboard", fetcher),
    ]);

    expect(a).toEqual({ ok: true });
    expect(b).toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(1);

    clearAllHubCaches();
    expect(getCachedData("user-1", "ops:dashboard")).toBeNull();
  });
});
