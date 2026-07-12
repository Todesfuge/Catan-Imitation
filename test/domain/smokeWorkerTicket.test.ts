import { describe, expect, it } from "vitest";

import { expectConsumedTicketRejected } from "../../scripts/smoke-worker-ticket.mjs";

class FakeSocket extends EventTarget {
  static latest: FakeSocket;

  constructor(_url: string) {
    super();
    FakeSocket.latest = this;
  }

  close(): void {}

  emit(type: "open" | "error" | "close"): void {
    this.dispatchEvent(new Event(type));
  }
}

async function evaluateWith(events: Array<"open" | "error" | "close">): Promise<unknown> {
  const original = globalThis.WebSocket;
  globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket;
  try {
    return await expectConsumedTicketRejected({
      evaluate(callback: (url: string) => Promise<unknown>, url: string) {
        const result = callback(url);
        for (const event of events) FakeSocket.latest.emit(event);
        return result;
      }
    }, "ws://example.test/consumed");
  } finally {
    globalThis.WebSocket = original;
  }
}

describe("consumed ticket smoke assertion", () => {
  it("rejects as soon as a consumed ticket socket opens even if it closes before a message", async () => {
    await expect(evaluateWith(["open", "close"])).rejects.toThrow(
      "consumed ticket upgraded twice"
    );
  });

  it.each([["error"], ["close"], ["error", "close"]] as const)(
    "accepts a never-open rejection sequence: %j",
    async (...events) => {
      await expect(evaluateWith([...events])).resolves.toBe(true);
    }
  );
});
