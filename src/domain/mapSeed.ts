import type { RandomSource } from "./match/random";

declare const mapSeedBrand: unique symbol;

export type MapSeed = string & { readonly [mapSeedBrand]: true };

export const LEGACY_STANDARD_MAP_SEED = "M0-STANDARD" as MapSeed;

const M1_MAP_SEED_PATTERN = /^M1-[0-9A-F]{16}$/;
const UINT32_MAX = 0xffff_ffff;
const UINT32_RANGE = 0x1_0000_0000;

export function parseMapSeed(value: unknown): MapSeed {
  if (
    typeof value !== "string" ||
    (value !== LEGACY_STANDARD_MAP_SEED && !M1_MAP_SEED_PATTERN.test(value))
  ) {
    throw new TypeError("Map seed must be M0-STANDARD or M1 followed by 16 uppercase hex digits.");
  }

  return value as MapSeed;
}

function assertUint32Word(word: number): void {
  if (!Number.isSafeInteger(word) || word < 0 || word > UINT32_MAX) {
    throw new RangeError("Map seed words must be unsigned 32-bit integers.");
  }
}

export function formatM1MapSeed(highWord: number, lowWord: number): MapSeed {
  assertUint32Word(highWord);
  assertUint32Word(lowWord);

  const high = highWord.toString(16).toUpperCase().padStart(8, "0");
  const low = lowWord.toString(16).toUpperCase().padStart(8, "0");
  return `M1-${high}${low}` as MapSeed;
}

export function createMapRandomSource(seed: MapSeed): RandomSource {
  if (!M1_MAP_SEED_PATTERN.test(seed)) {
    throw new RangeError("Only M1 map seeds have a deterministic random stream.");
  }

  const highWord = Number.parseInt(seed.slice(3, 11), 16);
  const lowWord = Number.parseInt(seed.slice(11, 19), 16);
  let a = highWord >>> 0;
  let b = lowWord >>> 0;
  let c = (highWord ^ 0x9e37_79b9) >>> 0;
  let d = (lowWord ^ 0x243f_6a88) >>> 0;

  function nextUint32(): number {
    const value = (a + b + d) >>> 0;
    d = (d + 1) >>> 0;
    a = (b ^ (b >>> 9)) >>> 0;
    b = (c + (c << 3)) >>> 0;
    c = (((c << 21) | (c >>> 11)) + value) >>> 0;
    return value;
  }

  return {
    nextInt(maxExclusive: number): number {
      if (
        !Number.isSafeInteger(maxExclusive) ||
        maxExclusive <= 0 ||
        maxExclusive > UINT32_RANGE
      ) {
        throw new RangeError("maxExclusive must be a positive integer no greater than 2^32.");
      }

      return Number((BigInt(nextUint32()) * BigInt(maxExclusive)) >> 32n);
    }
  };
}
