import { describe, expect, it } from "vitest";
import {
  LEGACY_STANDARD_MAP_SEED,
  createMapRandomSource,
  formatM1MapSeed,
  parseMapSeed
} from "../../src/domain/mapSeed";

describe("map seed codec", () => {
  it("accepts only the exact legacy standard seed and canonical M1 shape", () => {
    expect(parseMapSeed("M0-STANDARD")).toBe(LEGACY_STANDARD_MAP_SEED);
    expect(parseMapSeed("M1-0000000000000000")).toBe("M1-0000000000000000");
    expect(parseMapSeed("M1-0123456789ABCDEF")).toBe("M1-0123456789ABCDEF");
    expect(parseMapSeed("M1-FFFFFFFFFFFFFFFF")).toBe("M1-FFFFFFFFFFFFFFFF");
  });

  it.each([
    "m0-standard",
    "m1-0123456789abcdef",
    " M0-STANDARD",
    "M0-STANDARD ",
    "M1-0123456789ABCDE",
    "M1-0123456789ABCDEF0",
    "M1-0123456789ABCDEG",
    "M0-0123456789ABCDEF",
    "M2-0123456789ABCDEF"
  ])("rejects the non-canonical string %j", (value) => {
    expect(() => parseMapSeed(value)).toThrow();
  });

  it.each([undefined, null, 0, true, {}, [], new String("M0-STANDARD")])(
    "rejects the non-string value %j",
    (value) => {
      expect(() => parseMapSeed(value)).toThrow();
    }
  );

  it("formats unsigned 32-bit words in high-word then low-word order", () => {
    expect(formatM1MapSeed(0, 0)).toBe("M1-0000000000000000");
    expect(formatM1MapSeed(0x0123_4567, 0x89ab_cdef)).toBe("M1-0123456789ABCDEF");
    expect(formatM1MapSeed(0xffff_ffff, 0xffff_ffff)).toBe("M1-FFFFFFFFFFFFFFFF");
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1, 0x1_0000_0000])(
    "rejects invalid high word %j",
    (word) => {
      expect(() => formatM1MapSeed(word, 0)).toThrow(RangeError);
    }
  );

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1, 0x1_0000_0000])(
    "rejects invalid low word %j",
    (word) => {
      expect(() => formatM1MapSeed(0, word)).toThrow(RangeError);
    }
  );
});

describe("frozen M1 random stream", () => {
  it.each([
    [
      "all-zero",
      "M1-0000000000000000",
      [608135816, 3023221258, 3942704603, 1466288620, 3803719044, 3442629158]
    ],
    [
      "all-one",
      "M1-1111111111111111",
      [1464901051, 1319224091, 218272673, 2708042722, 2696982429, 1821054105]
    ],
    [
      "alternating-bit",
      "M1-AAAAAAAA55555555",
      [1902788572, 2692131720, 3181534659, 2444422800, 537003675, 1981826790]
    ],
    [
      "all-F",
      "M1-FFFFFFFFFFFFFFFF",
      [3686831477, 1263357422, 350787152, 2691214405, 207369264, 269223425]
    ]
  ])("matches the %s seed vector", (_name, encodedSeed, expected) => {
    const random = createMapRandomSource(parseMapSeed(encodedSeed));

    expect(expected.map(() => random.nextInt(0x1_0000_0000))).toEqual(expected);
  });

  it.each([
    "M1-0000000000000000",
    "M1-1111111111111111",
    "M1-AAAAAAAA55555555",
    "M1-FFFFFFFFFFFFFFFF"
  ])("keeps bounded draws in range for %s", (encodedSeed) => {
    for (const maxExclusive of [1, 2, 9, 19, 0x1_0000_0000]) {
      const random = createMapRandomSource(parseMapSeed(encodedSeed));

      for (let draw = 0; draw < 32; draw += 1) {
        const value = random.nextInt(maxExclusive);
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(maxExclusive);
      }
    }
  });

  it.each([0, -1, 1.5, 0x1_0000_0001, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid exclusive bound %j",
    (maxExclusive) => {
      const random = createMapRandomSource(parseMapSeed("M1-0000000000000000"));

      expect(() => random.nextInt(maxExclusive)).toThrow(RangeError);
    }
  );

  it("rejects the legacy fixed-map seed because it has no random payload", () => {
    expect(() => createMapRandomSource(LEGACY_STANDARD_MAP_SEED)).toThrow(RangeError);
  });
});
