import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

declare module "cloudflare:test" {
  interface ProvidedEnv extends Env {}
}

describe("combined Worker", () => {
  it("reports API health as JSON", async () => {
    const response = await SELF.fetch("https://example.com/api/health");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("serves the SPA shell for a client-side route", async () => {
    const response = await SELF.fetch("https://example.com/online/lobby");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain("<title>Catan Imitation</title>");
  });

  it("keeps room behavior explicitly unimplemented in the Task 8 shell", async () => {
    const room = env.ROOMS.getByName("task-8-shell");
    const response = await room.fetch("https://room.invalid/");

    expect(response.status).toBe(501);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "NOT_IMPLEMENTED",
        message: "Room behavior is implemented in later tasks."
      }
    });
  });
});
