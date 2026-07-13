import { formatM1MapSeed, type MapSeed } from "../src/domain/mapSeed";

const SECRET_BYTE_LENGTH = 32;
const SHA256_BASE64URL_LENGTH = 43;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const UINT32_RANGE = 0x1_0000_0000;

export const CONNECTION_TICKET_TTL_MS = 30_000;

export type RandomBytesSource = (target: Uint8Array) => void;

/** Captures a fresh public-map seed through a dedicated cryptographic draw. */
export function prepareCryptographicM1MapSeed(
  randomBytes: RandomBytesSource = secureRandomBytes
): MapSeed {
  const bytes = new Uint8Array(8);
  randomBytes(bytes);
  const words = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return formatM1MapSeed(words.getUint32(0), words.getUint32(4));
}

/**
 * A finite cryptographic random source whose entropy is collected before a
 * storage transaction begins. Retried transaction closures therefore consume
 * only local buffered values and never repeat an external random side effect.
 */
export class BufferedCryptoRandomSource {
  private index = 0;

  constructor(private readonly values: Uint32Array) {}

  nextInt(maxExclusive: number): number {
    if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > UINT32_RANGE) {
      throw new RangeError("maxExclusive must be an integer between 1 and 2^32.");
    }
    const limit = Math.floor(UINT32_RANGE / maxExclusive) * maxExclusive;
    while (this.index < this.values.length) {
      const value = this.values[this.index++];
      if (value < limit) return value % maxExclusive;
    }
    throw new RangeError("The buffered cryptographic random source is exhausted.");
  }
}

/** Captures entropy once and returns replayable readers for transaction retries. */
export function prepareBufferedCryptoRandomSource(drawCount = 512): () => BufferedCryptoRandomSource {
  if (!Number.isSafeInteger(drawCount) || drawCount <= 0) {
    throw new RangeError("drawCount must be a positive safe integer.");
  }
  const values = new Uint32Array(drawCount);
  crypto.getRandomValues(values);
  return () => new BufferedCryptoRandomSource(values);
}

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
