const PRODUCTION_FALLBACK_ORIGIN = "https://gritinterviewhub.vercel.app";
const LOCAL_FALLBACK_ORIGIN = "http://localhost:3000";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

function readHeader(
  headers: Headers | Record<string, string | undefined> | undefined,
  name: string
): string | undefined {
  if (!headers) return undefined;
  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name) ?? undefined;
  }
  const record = headers as Record<string, string | undefined>;
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(record)) {
    if (k.toLowerCase() === lower && v) return v;
  }
  return undefined;
}

function normalizeOrigin(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const candidate =
      trimmed.startsWith("http://") || trimmed.startsWith("https://")
        ? trimmed
        : `https://${trimmed}`;
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.hostname === "0.0.0.0") {
      url.hostname = "localhost";
    }
    return url.origin;
  } catch {
    return null;
  }
}

function parseHostname(hostOrOrigin: string | null | undefined): string | null {
  if (!hostOrOrigin) return null;
  try {
    const candidate =
      hostOrOrigin.startsWith("http://") || hostOrOrigin.startsWith("https://")
        ? hostOrOrigin
        : `http://${hostOrOrigin}`;
    return new URL(candidate).hostname.toLowerCase();
  } catch {
    return hostOrOrigin.split(":")[0]?.toLowerCase() || null;
  }
}

function isLocalHostname(hostname: string | null | undefined): boolean {
  if (!hostname) return false;
  const clean = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return LOCAL_HOSTNAMES.has(clean);
}

function isLocalOrigin(origin: string | null | undefined): boolean {
  return isLocalHostname(parseHostname(origin));
}

function originFromHostAndProto(
  hostHeader: string | undefined,
  protoHeader: string | undefined
): string | null {
  if (!hostHeader) return null;
  const firstHost = hostHeader.split(",")[0]?.trim();
  if (!firstHost) return null;
  const hostname = parseHostname(firstHost);
  const proto =
    protoHeader?.split(",")[0]?.trim().toLowerCase() ||
    (isLocalHostname(hostname) ? "http" : "https");
  const normalizedHost = firstHost.startsWith("0.0.0.0")
    ? firstHost.replace(/^0\.0\.0\.0/, "localhost")
    : firstHost;
  return normalizeOrigin(`${proto}://${normalizedHost}`);
}

export interface ResolveOriginInput {
  requestUrl?: string;
  headers?: Headers | Record<string, string | undefined>;
  env?: Record<string, string | undefined>;
}

/**
 * Resolves the canonical public origin for auth email redirects and invite links.
 * Supports local development (http://localhost:3000) while guaranteeing Vercel/proxy
 * production deployments resolve to their public HTTPS domain (e.g. https://gritinterviewhub.vercel.app).
 */
export function resolvePublicAppOrigin(input: ResolveOriginInput): string {
  const env = input.env ?? process.env;
  const forwardedHost = readHeader(input.headers, "x-forwarded-host");
  const forwardedProto = readHeader(input.headers, "x-forwarded-proto");
  const headerHost = readHeader(input.headers, "host");
  const headerOrigin = readHeader(input.headers, "origin");

  const forwardedOrigin = originFromHostAndProto(forwardedHost, forwardedProto);
  const hostOrigin = originFromHostAndProto(headerHost, forwardedProto);
  const requestHeaderOrigin = normalizeOrigin(headerOrigin);
  const requestUrlOrigin = normalizeOrigin(input.requestUrl);
  const configuredOrigin = normalizeOrigin(env.NEXT_PUBLIC_APP_URL);

  const requestIsExplicitlyLocal =
    isLocalOrigin(forwardedOrigin) ||
    (forwardedOrigin === null && isLocalOrigin(hostOrigin));

  // If NEXT_PUBLIC_APP_URL points to a real public deployment, prefer it unless
  // this is a non-production local request on localhost.
  if (configuredOrigin && !isLocalOrigin(configuredOrigin)) {
    if (!requestIsExplicitlyLocal || env.NODE_ENV === "production") {
      return configuredOrigin;
    }
  }

  if (forwardedOrigin && !isLocalOrigin(forwardedOrigin)) {
    return forwardedOrigin;
  }

  if (requestHeaderOrigin && !isLocalOrigin(requestHeaderOrigin)) {
    return requestHeaderOrigin;
  }

  if (hostOrigin && !isLocalOrigin(hostOrigin)) {
    return hostOrigin;
  }

  if (requestUrlOrigin && !isLocalOrigin(requestUrlOrigin)) {
    return requestUrlOrigin;
  }

  const vercelProdOrigin = normalizeOrigin(env.VERCEL_PROJECT_PRODUCTION_URL);
  if (vercelProdOrigin && !isLocalOrigin(vercelProdOrigin)) {
    return vercelProdOrigin;
  }

  const vercelOrigin = normalizeOrigin(env.VERCEL_URL);
  if (vercelOrigin && !isLocalOrigin(vercelOrigin)) {
    return vercelOrigin;
  }

  if (forwardedOrigin && isLocalOrigin(forwardedOrigin)) {
    return forwardedOrigin;
  }

  if (hostOrigin && isLocalOrigin(hostOrigin)) {
    return hostOrigin;
  }

  if (requestUrlOrigin && isLocalOrigin(requestUrlOrigin)) {
    return requestUrlOrigin;
  }

  if (configuredOrigin) {
    return configuredOrigin;
  }

  return env.NODE_ENV === "production"
    ? PRODUCTION_FALLBACK_ORIGIN
    : LOCAL_FALLBACK_ORIGIN;
}

export function resolveRequestOrigin(request: Request): string {
  return resolvePublicAppOrigin({
    requestUrl: request.url,
    headers: request.headers,
  });
}
