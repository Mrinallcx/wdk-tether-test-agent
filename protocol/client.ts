import { PayAgentProtocolError } from "./errors.js";

export type HttpClient = {
  get(path: string, query?: Record<string, string | undefined>): Promise<unknown>;
  post(path: string, body: unknown, headers?: Record<string, string>): Promise<{
    status: number;
    body: unknown;
  }>;
};

export function createHttpClient(input: {
  baseUrl: string;
  apiKey: string;
  fetchImpl: typeof fetch;
}): HttpClient {
  const baseUrl = input.baseUrl.replace(/\/$/, "");

  async function request(
    path: string,
    init: RequestInit,
  ): Promise<{ status: number; body: unknown }> {
    const headers = new Headers(init.headers);
    if (!headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${input.apiKey}`);
    }
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await input.fetchImpl(`${baseUrl}${path}`, {
      ...init,
      headers,
    });
    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    return { status: response.status, body };
  }

  return {
    async get(path, query = {}) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value != null && value !== "") params.set(key, value);
      }
      const suffix = params.size > 0 ? `?${params}` : "";
      const { status, body } = await request(`${path}${suffix}`, { method: "GET" });
      if (status < 200 || status >= 300) {
        const message =
          typeof body === "object" && body && "error" in body
            ? String((body as { error: unknown }).error)
            : `GET ${path} failed (${status})`;
        throw new PayAgentProtocolError("HTTP_ERROR", message);
      }
      return body;
    },

    async post(path, body, extraHeaders = {}) {
      return request(path, {
        method: "POST",
        body: JSON.stringify(body),
        headers: extraHeaders,
      });
    },
  };
}

export function newIdempotencyKey() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    throw new PayAgentProtocolError(
      "NO_CRYPTO",
      "crypto.randomUUID is required to build an Idempotency-Key",
    );
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
