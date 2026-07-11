import { describe, expect, it } from "vitest";

import {
  CONNECTION_TICKET_TTL_MS,
  hashSecret,
  hashesMatch,
  issueConnectionTicket,
  issueSeatToken,
  type RandomBytesSource
} from "../../worker/crypto";
import {
  HttpProtocolError,
  assertRequestOrigin,
  jsonResponse,
  parseBearerToken,
  readJsonObject,
  safeErrorResponse
} from "../../worker/http";

function deterministicBytes(byte: number, observedLengths: number[]): RandomBytesSource {
  return (target) => {
    observedLengths.push(target.byteLength);
    target.fill(byte);
  };
}

async function expectSafeProtocolError(
  promise: Promise<unknown>,
  code: "RULE_VIOLATION" | "SEAT_TOKEN_INVALID"
): Promise<void> {
  try {
    await promise;
    throw new Error("expected the operation to reject");
  } catch (error) {
    expect(error).toBeInstanceOf(HttpProtocolError);
    const response = safeErrorResponse(error);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    await expect(response.json()).resolves.toEqual({
      error: {
        code,
        params: {},
        retryable: false
      }
    });
  }
}

describe("anonymous credential cryptography", () => {
  it("uses exactly 32 injected random bytes for base64url seat tokens", async () => {
    const observedLengths: number[] = [];

    const issued = await issueSeatToken(deterministicBytes(0xff, observedLengths));

    expect(observedLengths).toEqual([32]);
    expect(issued.seatToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(issued.seatToken).not.toContain("=");
    expect(issued.seatTokenHash).toBe(await hashSecret(issued.seatToken));
  });

  it("hashes with SHA-256 base64url and compares hashes without plaintext", async () => {
    const abcHash = "ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0";
    const defHash = await hashSecret("def");

    await expect(hashSecret("abc")).resolves.toBe(abcHash);
    expect(hashesMatch(abcHash, abcHash)).toBe(true);
    expect(hashesMatch(abcHash, defHash)).toBe(false);
  });

  it("rejects malformed and non-canonical values before fixed-size hash comparison", () => {
    const validZeroHash = "A".repeat(43);
    const invalidHashes = [
      "!",
      "A".repeat(42),
      "A".repeat(44),
      "A".repeat(1_000_000),
      `${"A".repeat(42)}+`,
      `${"A".repeat(42)}B`
    ];

    expect(hashesMatch(validZeroHash, validZeroHash)).toBe(true);
    for (const invalid of invalidHashes) {
      expect(hashesMatch(invalid, invalid)).toBe(false);
      expect(hashesMatch(validZeroHash, invalid)).toBe(false);
      expect(hashesMatch(invalid, validZeroHash)).toBe(false);
    }
  });

  it("issues 32-byte one-time ticket data with an exact 30-second expiry", async () => {
    const observedLengths: number[] = [];
    const now = 1_750_000_000_000;

    const issued = await issueConnectionTicket(
      now,
      deterministicBytes(0x5a, observedLengths)
    );

    expect(CONNECTION_TICKET_TTL_MS).toBe(30_000);
    expect(observedLengths).toEqual([32]);
    expect(issued.ticket).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(issued.ticketHash).toBe(await hashSecret(issued.ticket));
    expect(issued.expiresAt).toBe(now + 30_000);
    expect(Object.keys(issued).sort()).toEqual(["expiresAt", "ticket", "ticketHash"]);
  });
});

describe("bounded HTTP input", () => {
  it("accepts an object whose UTF-8 body is exactly 16 KiB", async () => {
    const prefix = '{"value":"ok"}';
    const body = `${prefix}${" ".repeat(16 * 1024 - prefix.length)}`;
    const request = new Request("https://game.example/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body
    });

    await expect(readJsonObject(request)).resolves.toEqual({ value: "ok" });
  });

  it("rejects multibyte bodies by UTF-8 bytes rather than JS string length", async () => {
    const body = JSON.stringify({ value: "界".repeat(5_500) });
    expect(body.length).toBeLessThan(16 * 1024);
    expect(new TextEncoder().encode(body).byteLength).toBeGreaterThan(16 * 1024);
    const request = new Request("https://game.example/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body
    });

    await expectSafeProtocolError(readJsonObject(request), "RULE_VIOLATION");
  });

  it("rejects malformed JSON, non-object JSON, and non-JSON content safely", async () => {
    for (const [body, contentType] of [
      ["not json", "application/json"],
      ["[]", "application/json"],
      ['{"value":true}', "text/plain"]
    ]) {
      const request = new Request("https://game.example/api/rooms", {
        method: "POST",
        headers: { "content-type": contentType },
        body
      });
      await expectSafeProtocolError(readJsonObject(request), "RULE_VIOLATION");
    }
  });

  it("rejects malformed, unsafe, and mismatched Content-Length values", async () => {
    for (const declaredLength of [
      "garbage",
      "-1",
      "1.5",
      "1,2",
      "01",
      String(Number.MAX_SAFE_INTEGER + 1),
      String(16 * 1024 + 1),
      "1",
      "3"
    ]) {
      const request = new Request("https://game.example/api/rooms", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": declaredLength
        },
        body: "{}"
      });
      await expectSafeProtocolError(readJsonObject(request), "RULE_VIOLATION");
    }
  });

  it("accepts canonical Content-Length only when it matches actual UTF-8 bytes", async () => {
    const body = JSON.stringify({ value: "界" });
    const byteLength = new TextEncoder().encode(body).byteLength;
    const request = new Request("https://game.example/api/rooms", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": String(byteLength)
      },
      body
    });

    await expect(readJsonObject(request)).resolves.toEqual({ value: "界" });
  });

  it("rejects invalid UTF-8, null, scalar, and array JSON values", async () => {
    const invalidUtf8 = new Uint8Array([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0x80, 0x22, 0x7d]);
    const invalidUtf8Request = new Request("https://game.example/api/rooms", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": String(invalidUtf8.byteLength)
      },
      body: invalidUtf8
    });
    await expectSafeProtocolError(readJsonObject(invalidUtf8Request), "RULE_VIOLATION");

    for (const body of ["null", "true", "42", '"text"', "[]"]) {
      const request = new Request("https://game.example/api/rooms", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": String(new TextEncoder().encode(body).byteLength)
        },
        body
      });
      await expectSafeProtocolError(readJsonObject(request), "RULE_VIOLATION");
    }
  });
});

describe("authorization and origin boundaries", () => {
  it("parses only a strict base64url Bearer credential", () => {
    const credential = "a".repeat(42) + "_";
    expect(parseBearerToken(new Headers({ authorization: `Bearer ${credential}` }))).toBe(
      credential
    );

    for (const authorization of [undefined, "Basic abc", "Bearer", "bearer abc", "Bearer a+b"] as const) {
      const headers = new Headers();
      if (authorization !== undefined) headers.set("authorization", authorization);
      try {
        parseBearerToken(headers);
        throw new Error("expected invalid authorization");
      } catch (error) {
        expect(error).toMatchObject({ code: "SEAT_TOKEN_INVALID" });
      }
    }
  });

  it("accepts same-origin production requests", () => {
    const request = new Request("https://game.example/api/rooms", {
      method: "POST",
      headers: { origin: "https://game.example" }
    });

    expect(() => assertRequestOrigin(request)).not.toThrow();
  });

  it("allows explicit HTTP loopback origins only for a loopback target", () => {
    for (const [url, origin] of [
      ["http://127.0.0.1:8787/api/rooms", "http://localhost:5173"],
      ["http://localhost:8787/api/rooms", "http://127.0.0.1:5173"],
      ["http://[::1]:8787/api/rooms", "http://[::1]:5173"]
    ]) {
      expect(() =>
        assertRequestOrigin(
          new Request(url, { method: "POST", headers: { origin } })
        )
      ).not.toThrow();
    }

    expect(() =>
      assertRequestOrigin(
        new Request("https://game.example/api/rooms", {
          method: "POST",
          headers: { origin: "http://localhost:5173" }
        })
      )
    ).toThrow(HttpProtocolError);
  });

  it("rejects missing, wildcard, malformed, and cross-origin values", () => {
    for (const origin of [undefined, "*", "not an origin", "https://evil.example"] as const) {
      const headers = new Headers();
      if (origin !== undefined) headers.set("origin", origin);
      const request = new Request("https://game.example/api/rooms", {
        method: "POST",
        headers
      });
      try {
        assertRequestOrigin(request);
        throw new Error("expected invalid origin");
      } catch (error) {
        expect(error).toMatchObject({ code: "RULE_VIOLATION" });
      }
    }
  });
});

describe("safe JSON responses", () => {
  it("sets the stable JSON content type", async () => {
    const response = jsonResponse({ ok: true }, { status: 201 });

    expect(response.status).toBe(201);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("never serializes internal messages, stacks, credentials, or hashes", async () => {
    const seatToken = "seat-secret-that-must-not-leak";
    const tokenHash = await hashSecret(seatToken);
    const internal = new Error(`database failed for ${seatToken} / ${tokenHash}`);
    internal.stack = `stack includes ${seatToken}`;

    const response = safeErrorResponse(internal);
    const serialized = await response.text();

    expect(response.status).toBe(500);
    expect(JSON.parse(serialized)).toEqual({
      error: { code: "INTERNAL_ERROR", params: {}, retryable: true }
    });
    expect(serialized).not.toContain(seatToken);
    expect(serialized).not.toContain(tokenHash);
    expect(serialized).not.toContain("database failed");
    expect(serialized).not.toContain("stack");
  });
});
