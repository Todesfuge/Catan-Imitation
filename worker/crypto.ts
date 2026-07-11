const SECRET_BYTE_LENGTH = 32;
const SHA256_BASE64URL_LENGTH = 43;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

export const CONNECTION_TICKET_TTL_MS = 30_000;

export type RandomBytesSource = (target: Uint8Array) => void;

export interface IssuedSeatToken {
  readonly seatToken: string;
  readonly seatTokenHash: string;
}

export interface IssuedConnectionTicket {
  readonly ticket: string;
  readonly ticketHash: string;
  readonly expiresAt: number;
}

function secureRandomBytes(target: Uint8Array): void {
  crypto.getRandomValues(target);
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function createSecret(randomBytes: RandomBytesSource): string {
  const bytes = new Uint8Array(SECRET_BYTE_LENGTH);
  randomBytes(bytes);
  return base64Url(bytes);
}

export async function hashSecret(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return base64Url(new Uint8Array(digest));
}

function parseSha256Hash(value: string): Uint8Array | undefined {
  if (value.length !== SHA256_BASE64URL_LENGTH || !BASE64URL_PATTERN.test(value)) {
    return undefined;
  }

  let binary: string;
  try {
    binary = atob(`${value}=`.replaceAll("-", "+").replaceAll("_", "/"));
  } catch {
    return undefined;
  }
  if (binary.length !== SECRET_BYTE_LENGTH) return undefined;

  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return base64Url(bytes) === value ? bytes : undefined;
}

/** Validates canonical SHA-256 hashes, then compares exactly 32 decoded bytes. */
export function hashesMatch(expected: string, actual: string): boolean {
  const expectedBytes = parseSha256Hash(expected);
  const actualBytes = parseSha256Hash(actual);
  if (expectedBytes === undefined || actualBytes === undefined) return false;

  let difference = 0;
  for (let index = 0; index < SECRET_BYTE_LENGTH; index += 1) {
    difference |= expectedBytes[index] ^ actualBytes[index];
  }
  return difference === 0;
}

export async function issueSeatToken(
  randomBytes: RandomBytesSource = secureRandomBytes
): Promise<IssuedSeatToken> {
  const seatToken = createSecret(randomBytes);
  return { seatToken, seatTokenHash: await hashSecret(seatToken) };
}

export async function issueConnectionTicket(
  now: number,
  randomBytes: RandomBytesSource = secureRandomBytes
): Promise<IssuedConnectionTicket> {
  const ticket = createSecret(randomBytes);
  return {
    ticket,
    ticketHash: await hashSecret(ticket),
    expiresAt: now + CONNECTION_TICKET_TTL_MS
  };
}
