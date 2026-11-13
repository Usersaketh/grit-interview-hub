import type { ApiErrorBody, ApiSuccessBody } from "@frontend/types/api";

export class ApiClientError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown
  ) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function formatApiErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.status === 401) {
      return "Your session has expired or you are not signed in. Please sign in again.";
    }
    if (error.status === 403) {
      return error.message || "You do not have permission to perform this action.";
    }
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "An unexpected error occurred while communicating with the server.";
}

async function parseJsonSafe(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  headers.set("Accept", "application/json");

  const response = await fetch(path, {
    ...options,
    headers,
    credentials: "same-origin",
    cache: "no-store",
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const parsed = await parseJsonSafe(response);

  if (!response.ok) {
    const errBody = parsed as Partial<ApiErrorBody> | null;
    const code = errBody?.error?.code ?? `HTTP_${response.status}`;
    const message =
      errBody?.error?.message ??
      (response.status === 401
        ? "Authentication is required"
        : response.status === 403
          ? "You do not have permission to perform this action"
          : `Request failed with status ${response.status}`);
    throw new ApiClientError(
      response.status,
      code,
      message,
      errBody?.error?.details
    );
  }

  const successBody = parsed as Partial<ApiSuccessBody<T>> | null;
  if (successBody && "data" in successBody) {
    return successBody.data as T;
  }

  return parsed as T;
}
