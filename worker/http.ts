import {
  ERROR_DEFINITIONS,
  MAX_WIRE_BYTES,
  type ProtocolErrorCode,
  type ProtocolErrorParams
} from "../src/online/protocol";

const JSON_CONTENT_TYPE = "application/json; charset=utf-8";
const BASE64URL_SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const FINGERPRINTED_ASSET_PATTERN = /(?:^|\/)[^/]+-[A-Za-z0-9_-]{8,}\.[^/]+$/;
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "connect-src 'self'",
  "font-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self'"
].join("; ");

export class HttpProtocolError extends Error {
  readonly code: ProtocolErrorCode;
  readonly params: ProtocolErrorParams;

  constructor(code: ProtocolErrorCode, params: ProtocolErrorParams = {}) {
    super(code);
    this.name = "HttpProtocolError";
    this.code = code;
    this.params = { ...params };
  }
}

function ruleViolation(): never {
  throw new HttpProtocolError("RULE_VIOLATION");
}

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", JSON_CONTENT_TYPE);
  return new Response(JSON.stringify(body), { ...init, headers });
}

export function hardenResponse(request: Request, response: Response): Response {
  if (response.status === 101) return response;

  const headers = new Headers(response.headers);
  headers.set("content-security-policy", CONTENT_SECURITY_POLICY);
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "no-referrer");
  headers.set("x-frame-options", "DENY");

  const { pathname } = new URL(request.url);
  const contentType = headers.get("content-type")?.toLowerCase() ?? "";
  if (pathname.startsWith("/api/") || contentType.includes("text/html")) {
    headers.set("cache-control", "no-store");
  } else if (FINGERPRINTED_ASSET_PATTERN.test(pathname)) {
    headers.set("cache-control", "public, max-age=31536000, immutable");
  } else {
    headers.set("cache-control", "no-cache");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export function safeErrorResponse(error: unknown): Response {
  const protocolError =
    error instanceof HttpProtocolError
      ? error
      : new HttpProtocolError("INTERNAL_ERROR");
  const definition = ERROR_DEFINITIONS[protocolError.code];
  return jsonResponse(
    {
      error: {
        code: protocolError.code,
        params: protocolError.params,
        retryable: definition.retryable
      }
    },
    { status: definition.httpStatus }
  );
}

async function readBoundedBytes(request: Request): Promise<Uint8Array> {
  const contentLengthHeader = request.headers.get("content-length");
  let declaredLength: number | undefined;
  if (contentLengthHeader !== null) {
    if (!/^(0|[1-9][0-9]*)$/.test(contentLengthHeader)) ruleViolation();
    declaredLength = Number(contentLengthHeader);
    if (!Number.isSafeInteger(declaredLength) || declaredLength > MAX_WIRE_BYTES) {
      ruleViolation();
    }
  }
  if (request.body === null) ruleViolation();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAX_WIRE_BYTES) {
        await reader.cancel();
        ruleViolation();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (declaredLength !== undefined && declaredLength !== byteLength) ruleViolation();

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") ruleViolation();

  let value: unknown;
  try {
    const bytes = await readBoundedBytes(request);
    value = JSON.parse(
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes)
    ) as unknown;
  } catch (error) {
    if (error instanceof HttpProtocolError) throw error;
    return ruleViolation();
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) ruleViolation();
  return value as Record<string, unknown>;
}

export function parseBearerToken(headers: Headers): string {
  const authorization = headers.get("authorization");
  if (authorization === null || !authorization.startsWith("Bearer ")) {
    throw new HttpProtocolError("SEAT_TOKEN_INVALID");
  }
  const credential = authorization.slice("Bearer ".length);
  if (!BASE64URL_SECRET_PATTERN.test(credential)) {
    throw new HttpProtocolError("SEAT_TOKEN_INVALID");
  }
  return credential;
}

function isLoopbackHostname(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "[::1]") return true;
  const octets = hostname.split(".");
  return (
    octets.length === 4 &&
    octets[0] === "127" &&
    octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255)
  );
}

export function assertRequestOrigin(request: Request): void {
  const requestUrl = new URL(request.url);
  const originHeader = request.headers.get("origin");
  if (originHeader === null || originHeader === "*") ruleViolation();

  let origin: URL;
  try {
    origin = new URL(originHeader);
  } catch {
    return ruleViolation();
  }
  if (origin.origin !== originHeader) ruleViolation();
  if (origin.origin === requestUrl.origin) return;

  const isLocalLoopback =
    requestUrl.protocol === "http:" &&
    origin.protocol === "http:" &&
    isLoopbackHostname(requestUrl.hostname) &&
    isLoopbackHostname(origin.hostname);
  if (!isLocalLoopback) ruleViolation();
}
