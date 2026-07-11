const SECRET_BYTE_LENGTH = 32;

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

/** Compares every position and folds the length difference into the result. */
export function hashesMatch(expected: string, actual: string): boolean {
  const length = Math.max(expected.length, actual.length);
  let difference = expected.length ^ actual.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (expected.charCodeAt(index) || 0) ^ (actual.charCodeAt(index) || 0);
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
