import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

declare module "cloudflare:test" {
  interface ProvidedEnv extends Env {}
}

describe("combined Worker", () => {
  it("reports API health as JSON", async () => {
    const response = await SELF.fetch("https://example.com/api/health");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({ ok: true, schemaVersion: 1 });
  });

  it("returns a stable safe error for an unknown API route", async () => {
    const response = await SELF.fetch("https://example.com/api/unknown");

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "ROOM_NOT_FOUND",
        params: {},
        retryable: false
      }
    });
  });

  it("serves the SPA shell for a client-side route", async () => {
    const response = await SELF.fetch("https://example.com/online/lobby");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain("<title>Catan Imitation</title>");
  });
});
