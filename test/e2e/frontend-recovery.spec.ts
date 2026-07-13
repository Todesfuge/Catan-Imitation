import { expect, test, type Locator, type Page } from "@playwright/test";
import { createInitialAppState } from "../../src/app/localGameState";
import { projectRoomView } from "../../src/online/projectRoomView";
import { publicBoardSignature } from "./seededMapHelpers";

async function openLocal(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Play Local Game" }).click();
}

async function installLocalMapSeed(page: Page, seed: string): Promise<void> {
  const highWord = Number.parseInt(seed.slice(3, 11), 16);
  const lowWord = Number.parseInt(seed.slice(11, 19), 16);
  await page.addInitScript(({ high, low }) => {
    const original = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = ((array: ArrayBufferView) => {
      if (array instanceof Uint32Array && array.length === 2) {
        array[0] = high;
        array[1] = low;
        return array;
      }
      return original(array);
    }) as typeof crypto.getRandomValues;
  }, { high: highWord, low: lowWord });
}

async function openLocalAtSeed(page: Page, seed: string): Promise<void> {
  await installLocalMapSeed(page, seed);
  await openLocal(page);
  await page.getByRole("button", { name: "Open settings" }).click();
  await expect(page.locator("[data-map-seed]")).toHaveValue(seed);
  await page.getByRole("button", { name: "Close utility panel" }).click();
}

async function completeLocalSetup(page: Page): Promise<void> {
  for (let placement = 0; placement < 8; placement += 1) {
    const settlements = page.locator('[data-board-action-target="setupSettlement"]');
    expect(await settlements.count()).toBeGreaterThan(0);
    await settlements.first().press("Enter");
    const roads = page.locator('[data-board-action-target="setupRoad"]');
    expect(await roads.count()).toBeGreaterThan(0);
    await roads.first().press("Enter");
  }
  await expect(page.locator('[data-action="roll-dice"]')).toBeEnabled();
  await expect(page.locator('[data-board-action-target^="setup"]')).toHaveCount(0);
}

async function installOnlineLobbyMock(page: Page, seatCount: 3 | 4) {
  await page.addInitScript(({ seatCount: count }) => {
    const roomCode = "234567";
    const hostSeatId = "seat-host";
    const seats = Array.from({ length: count }, (_, index) => ({
      seatId: index === 0 ? hostSeatId : `seat-${index + 1}`,
      nickname: index === 0 ? "Host" : `Player ${index + 1}`,
      ready: true
    }));
    let roomVersion = 1;
    let socket: MockWebSocket | undefined;
    const state = {
      createRequests: 0,
      joinRequests: 0,
      leaveRequests: 0,
      socketCount: 0,
      copied: [] as string[],
      sent: [] as Array<Record<string, unknown>>,
      joinPath: "",
      ack(commandId: string) {
        roomVersion += 1;
        socket?.emit("message", { data: JSON.stringify(snapshot(commandId)) });
      },
      reject(commandId: string) {
        socket?.emit("message", {
          data: JSON.stringify({
            type: "command.rejected",
            commandId,
            error: { code: "COMMAND_NOT_ALLOWED", params: {}, retryable: false }
          })
        });
      }
    };
    const snapshot = (acknowledgedCommandId?: string) => ({
      type: "room.snapshot",
      schemaVersion: 2,
      roomVersion,
      lifecycle: "lobby",
      publicState: {
        roomCode,
        lifecycle: "lobby",
        roomVersion,
        hostSeatId,
        seats,
        submittedBidSeatIds: []
      },
      privateState: { seatId: hostSeatId, seatTokenPresent: true },
      allowedActions: {},
      presence: seats.map((seat) => ({ seatId: seat.seatId, connectionCount: 1, online: true })),
      ...(acknowledgedCommandId ? { acknowledgedCommandId } : {})
    });
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
      status,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof Request ? input.url : input.toString());
      const method = init?.method ?? "GET";
      if (method === "POST" && url.pathname === "/api/rooms") {
        state.createRequests += 1;
        return json({ roomCode, seatId: hostSeatId, seatToken: "s".repeat(43) }, 201);
      }
      if (method === "POST" && url.pathname.endsWith("/join")) {
        state.joinRequests += 1;
        state.joinPath = url.pathname;
        return json({ roomCode, seatId: hostSeatId, seatToken: "s".repeat(43) }, 201);
      }
      if (method === "POST" && url.pathname.endsWith("/connection-ticket")) {
        return json({ ticket: "t".repeat(43), expiresInMs: 30_000 }, 201);
      }
      if (method === "DELETE" && url.pathname.includes("/seats/")) {
        state.leaveRequests += 1;
        return new Response(null, { status: 204 });
      }
      return json({ error: { code: "ROOM_NOT_FOUND", params: {}, retryable: false } }, 404);
    };
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (value: string) => { state.copied.push(value); } }
    });
    class MockWebSocket {
      readyState = 0;
      private listeners = new Map<string, Set<(event: unknown) => void>>();

      constructor(_url: string) {
        socket = this;
        state.socketCount += 1;
        queueMicrotask(() => {
          this.readyState = 1;
          this.emit("open", {});
          this.emit("message", { data: JSON.stringify(snapshot()) });
        });
      }

      addEventListener(type: string, listener: (event: unknown) => void) {
        const current = this.listeners.get(type) ?? new Set();
        current.add(listener);
        this.listeners.set(type, current);
      }

      removeEventListener(type: string, listener: (event: unknown) => void) {
        this.listeners.get(type)?.delete(listener);
      }

      send(value: string) {
        state.sent.push(JSON.parse(value) as Record<string, unknown>);
      }

      close() {
        this.readyState = 3;
      }

      emit(type: string, event: unknown) {
        for (const listener of this.listeners.get(type) ?? []) listener(event);
      }
    }
    window.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    (window as unknown as { __onlineMock: typeof state }).__onlineMock = state;
  }, { seatCount });
}

function callerOnlineGameSnapshot() {
  const local = createInitialAppState();
  const seats = local.game.players.map((player, index) => ({
    seatId: `seat-${index + 1}`,
    playerId: player.id,
    nickname: player.name,
    ready: true
  }));
  const projected = projectRoomView({
    roomCode: "234567", lifecycle: "playing", roomVersion: 42, hostSeatId: "seat-1", seats,
    matchState: { game: local.game, guild: local.guild, lastDice: local.lastDice }
  }, "seat-1", { connectedSeatIds: seats.map((seat) => seat.seatId) });
  return {
    type: "room.snapshot", schemaVersion: 2, roomVersion: 42, lifecycle: "playing",
    ...projected,
    presence: seats.map((seat, index) => ({ seatId: seat.seatId, connectionCount: index === 2 ? 0 : 1, online: index !== 2 }))
  };
}

async function installOnlineGameMock(page: Page) {
  const nextSeedSnapshot = callerOnlineGameSnapshot();
  nextSeedSnapshot.roomVersion = 43;
  (nextSeedSnapshot.publicState as unknown as Record<string, unknown>).roomVersion = 43;
  await page.addInitScript(({ initialSnapshot, refreshedSnapshot }) => {
    let currentSnapshot = structuredClone(initialSnapshot);
    let socket: MockWebSocket | undefined;
    const state = {
      sent: [] as Array<Record<string, unknown>>,
      socketCount: 0,
      copied: [] as string[],
      clipboardMode: "success" as "success" | "missing" | "reject" | "deferred",
      pendingClipboard: [] as Array<() => void>,
      holdConnections: false,
      setClipboardMode(mode: "success" | "missing" | "reject" | "deferred") { this.clipboardMode = mode; },
      resolveClipboard() { this.pendingClipboard.shift()?.(); },
      setRestartCapability(canRestartMatch: boolean) {
        const next = structuredClone(currentSnapshot);
        next.roomVersion += 1;
        next.publicState.roomVersion = next.roomVersion;
        next.privateState.canRestartMatch = canRestartMatch;
        currentSnapshot = next;
        socket?.emit("message", { data: JSON.stringify(next) });
      },
      changeSeed() {
        currentSnapshot = structuredClone(refreshedSnapshot);
        socket?.emit("message", { data: JSON.stringify(currentSnapshot) });
      },
      disconnect() {
        if (!socket) return;
        this.holdConnections = true;
        socket.readyState = 3;
        socket.emit("close", { code: 1006, reason: "test disconnect", wasClean: false });
      }
    };
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
      status, headers: { "content-type": "application/json; charset=utf-8" }
    });
    window.fetch = async (input) => {
      const path = new URL(typeof input === "string" ? input : input instanceof Request ? input.url : input.toString()).pathname;
      if (path === "/api/rooms") return json({ roomCode: "234567", seatId: "seat-1", seatToken: "s".repeat(43) }, 201);
      if (path.endsWith("/connection-ticket")) return json({ ticket: "t".repeat(43), expiresInMs: 30_000 }, 201);
      return json({ error: { code: "ROOM_NOT_FOUND", params: {}, retryable: false } }, 404);
    };
    class MockWebSocket {
      readyState = 0;
      private listeners = new Map<string, Set<(event: unknown) => void>>();
      constructor(_url: string) {
        socket = this;
        state.socketCount += 1;
        if (state.holdConnections) return;
        queueMicrotask(() => {
          this.readyState = 1;
          this.emit("open", {});
          this.emit("message", { data: JSON.stringify(currentSnapshot) });
        });
      }
      addEventListener(type: string, listener: (event: unknown) => void) {
        const entries = this.listeners.get(type) ?? new Set(); entries.add(listener); this.listeners.set(type, entries);
      }
      removeEventListener(type: string, listener: (event: unknown) => void) { this.listeners.get(type)?.delete(listener); }
      send(value: string) { state.sent.push(JSON.parse(value) as Record<string, unknown>); }
      close() { this.readyState = 3; }
      emit(type: string, event: unknown) { for (const listener of this.listeners.get(type) ?? []) listener(event); }
    }
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      get() {
        if (state.clipboardMode === "missing") return undefined;
        return {
          writeText: async (value: string) => {
            if (state.clipboardMode === "reject") throw new Error("clipboard denied");
            if (state.clipboardMode === "deferred") {
              await new Promise<void>((resolve) => state.pendingClipboard.push(resolve));
            }
            state.copied.push(value);
          }
        };
      }
    });
    window.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    (window as unknown as { __onlineGameMock: typeof state }).__onlineGameMock = state;
  }, { initialSnapshot: callerOnlineGameSnapshot(), refreshedSnapshot: nextSeedSnapshot });
}

async function openMockOnlineGame(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Play Online Game" }).click();
  await page.getByLabel("Create nickname").fill("Voyage1969");
  await page.getByRole("button", { name: "Create room" }).click();
  await expect(page.locator(".online-game-shell")).toBeVisible();
}

async function enterMockCreatedRoom(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Play Online Game" }).click();
  await page.getByLabel("Create nickname").fill("Host");
  await page.getByRole("button", { name: "Create room" }).evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect(page.getByRole("heading", { name: "Private online room" })).toBeVisible();
}

test("mode entry keeps Local offline and focuses recoverable Online validation", async ({ page }) => {
  let apiRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests += 1;
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Play Local Game" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play Online Game" })).toBeVisible();
  await page.getByRole("button", { name: "Play Local Game" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".game-shell")).toBeVisible();
  expect(apiRequests).toBe(0);

  await page.reload();
  await page.getByRole("button", { name: "Play Online Game" }).click();
  await page.getByRole("button", { name: "Create room" }).click();
  const error = page.getByRole("alert");
  await expect(error).toHaveText("Enter a nickname.");
  await expect(error).toBeFocused();
  expect(apiRequests).toBe(0);
});

for (const viewport of [
  { name: "desktop", width: 1280, height: 720 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 }
]) {
  test(`${viewport.name} mode and Online entry do not overflow`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Catan Imitation" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    await page.getByRole("button", { name: "Play Online Game" }).click();
    await expect(page.getByRole("heading", { name: "Online Game" })).toBeVisible();
    const measurements = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      shortTargetCount: [...document.querySelectorAll("button")]
        .filter((button) => button.getBoundingClientRect().height < 44).length
    }));
    expect(measurements.documentWidth).toBeLessThanOrEqual(measurements.viewportWidth);
    expect(measurements.shortTargetCount).toBe(0);
  });
}

test("online lobby keeps locale and command single-flight state across slow acknowledgements", async ({ page }) => {
  await installOnlineLobbyMock(page, 3);
  await enterMockCreatedRoom(page);
  await expect(page.locator(".seat-card")).toHaveCount(3);
  expect(await page.evaluate(() => (window as unknown as { __onlineMock: { createRequests: number } }).__onlineMock.createRequests)).toBe(1);
  expect(await page.evaluate(() => (window as unknown as { __onlineMock: { socketCount: number } }).__onlineMock.socketCount)).toBe(1);

  await page.getByRole("button", { name: "简体中文" }).click();
  await expect(page.getByRole("heading", { name: "私人联机房间" })).toBeVisible();
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("heading", { name: "Private online room" })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __onlineMock: { socketCount: number } }).__onlineMock.socketCount)).toBe(1);

  const start = page.getByRole("button", { name: "Start online game" });
  await start.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __onlineMock: { sent: unknown[] } }).__onlineMock.sent.length)).toBe(1);
  await expect(start).toBeDisabled();
  await page.evaluate(() => {
    (window as unknown as { __onlineMock: { reject(commandId: string): void } }).__onlineMock
      .reject("22222222-2222-4222-8222-222222222222");
  });
  await expect(start).toBeDisabled();
  const firstCommandId = await page.evaluate(() =>
    (window as unknown as { __onlineMock: { sent: Array<{ commandId: string }> } }).__onlineMock.sent[0].commandId
  );
  await page.evaluate((commandId) => {
    (window as unknown as { __onlineMock: { reject(commandId: string): void } }).__onlineMock.reject(commandId);
  }, firstCommandId);
  await expect(page.getByRole("alert")).toContainText("That action is not allowed in the current room state.");
  await expect(start).toBeEnabled();

  await start.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __onlineMock: { sent: unknown[] } }).__onlineMock.sent.length)).toBe(2);
  const secondCommandId = await page.evaluate(() =>
    (window as unknown as { __onlineMock: { sent: Array<{ commandId: string }> } }).__onlineMock.sent[1].commandId
  );
  await page.evaluate((commandId) => {
    (window as unknown as { __onlineMock: { ack(commandId: string): void } }).__onlineMock.ack(commandId);
  }, secondCommandId);
  await expect(start).toBeEnabled();
  await expect(page.getByRole("alert")).toHaveCount(0);

  const ready = page.getByRole("button", { name: "Set not ready" });
  await ready.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __onlineMock: { sent: unknown[] } }).__onlineMock.sent.length)).toBe(3);
  await expect(ready).toBeDisabled();
  const readyCommandId = await page.evaluate(() =>
    (window as unknown as { __onlineMock: { sent: Array<{ commandId: string }> } }).__onlineMock.sent[2].commandId
  );
  await page.evaluate((commandId) => {
    (window as unknown as { __onlineMock: { ack(commandId: string): void } }).__onlineMock.ack(commandId);
  }, readyCommandId);
  await expect(ready).toBeEnabled();

  await page.getByRole("button", { name: "Leave room" }).evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect(page.getByRole("heading", { name: "Catan Imitation" })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __onlineMock: { leaveRequests: number } }).__onlineMock.leaveRequests)).toBe(1);
});

test("join accepts a pasted trimmed room code and remains single-flight", async ({ page }) => {
  await installOnlineLobbyMock(page, 4);
  await page.goto("/");
  await page.getByRole("button", { name: "Play Online Game" }).click();
  await page.getByLabel("Join room code").fill(" 234567 ");
  await page.getByLabel("Join nickname").fill("Guest");
  await page.getByRole("button", { name: "Join room" }).evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect(page.getByRole("heading", { name: "Private online room" })).toBeVisible();
  const result = await page.evaluate(() => {
    const mock = (window as unknown as { __onlineMock: { joinRequests: number; joinPath: string } }).__onlineMock;
    return { requests: mock.joinRequests, path: mock.joinPath };
  });
  expect(result).toEqual({ requests: 1, path: "/api/rooms/234567/join" });
  await expect(page.locator(".seat-card")).toHaveCount(4);
});

for (const viewport of [
  { name: "desktop", width: 1280, height: 720, seats: 3 as const },
  { name: "tablet", width: 768, height: 1024, seats: 4 as const },
  { name: "mobile", width: 390, height: 844, seats: 3 as const }
]) {
  test(`${viewport.name} real lobby seats remain contained and touch accessible`, async ({ page }) => {
    await installOnlineLobbyMock(page, viewport.seats);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await enterMockCreatedRoom(page);
    await expect(page.locator(".seat-card")).toHaveCount(viewport.seats);
    await expect(page.locator(".seat-card").first()).toContainText("Host");
    await expect(page.getByRole("button", { name: "Start online game" })).toBeEnabled();
    const measurements = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      shortTargetCount: [...document.querySelectorAll("button")]
        .filter((button) => button.getBoundingClientRect().height < 44).length,
      wideSeatCount: [...document.querySelectorAll(".seat-card")]
        .filter((seat) => seat.getBoundingClientRect().right > window.innerWidth).length
    }));
    expect(measurements.documentWidth).toBeLessThanOrEqual(measurements.viewportWidth);
    expect(measurements.shortTargetCount).toBe(0);
    expect(measurements.wideSeatCount).toBe(0);
  });
}

for (const viewport of [
  { name: "desktop", width: 1280, height: 768 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 }
]) {
  test(`${viewport.name} caller-only online table is contained and dispatches server commands`, async ({ page }) => {
    await installOnlineGameMock(page);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/");
    await page.getByRole("button", { name: "Play Online Game" }).click();
    await page.getByLabel("Create nickname").fill("Voyage1969");
    await page.getByRole("button", { name: "Create room" }).click();
    await expect(page.locator(".online-game-shell")).toBeVisible();
    await expect(page.getByText("Room 234567")).toBeVisible();
    await expect(page.getByText("Kay is offline")).toBeVisible();
    await expect(page.locator(".resource-strip.compact").filter({ hasText: "Wd" })).toHaveCount(1);
    await expect(page.getByText("Place the next settlement")).toBeVisible();
    const setupTarget = page.locator('[data-board-action-target="setupSettlement"]').first();
    await expect(setupTarget).toBeVisible();
    await setupTarget.focus();
    await expect(setupTarget).toBeFocused();
    const focus = await setupTarget.evaluate((element) => getComputedStyle(element).outlineStyle);
    expect(focus).not.toBe("none");
    await setupTarget.press("Enter");
    await expect.poll(() => page.evaluate(() =>
      (window as unknown as { __onlineGameMock: { sent: unknown[] } }).__onlineGameMock.sent.length
    )).toBe(1);
    const sent = await page.evaluate(() =>
      (window as unknown as { __onlineGameMock: { sent: Array<Record<string, unknown>> } }).__onlineGameMock.sent[0]
    );
    expect(sent).toMatchObject({
      type: "match.command",
      expectedVersion: 42,
      command: { type: "PLACE_SETUP_SETTLEMENT", vertexId: expect.any(String) }
    });
    expect(JSON.stringify(sent)).not.toContain("playerId");
    const measurements = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      shortButtons: [...document.querySelectorAll("button")].filter((button) => {
        const rect = button.getBoundingClientRect();
        return rect.width > 0 && rect.height < 44;
      }).length
    }));
    expect(measurements.documentWidth).toBeLessThanOrEqual(measurements.viewportWidth);
    expect(measurements.shortButtons).toBe(0);
  });
}

test("online Settings confirms each restart mode through the shared table before sending", async ({ page }) => {
  await installOnlineGameMock(page);
  await openMockOnlineGame(page);
  const sent = () => page.evaluate(() =>
    (window as unknown as { __onlineGameMock: { sent: Array<Record<string, unknown>> } }).__onlineGameMock.sent
  );

  for (const [label, mode] of [["New Random Map", "fresh"], ["Replay Current Map", "sameMap"]] as const) {
    await page.getByRole("button", { name: "Open settings" }).click();
    const restart = page.getByRole("button", { name: label });
    await restart.click();
    await expect(page.locator(".restart-confirmation")).toBeVisible();
    expect(await sent()).toHaveLength(mode === "fresh" ? 0 : 1);

    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.locator(".restart-confirmation")).toHaveCount(0);
    await expect(restart).toBeFocused();
    expect(await sent()).toHaveLength(mode === "fresh" ? 0 : 1);

    await restart.click();
    expect(await sent()).toHaveLength(mode === "fresh" ? 0 : 1);
    await page.getByRole("button", { name: "Confirm Restart" }).click();
    await expect(page.locator(".utility-modal")).toHaveCount(0);
    const messages = await sent();
    const message = messages.at(-1)!;
    expect(messages).toHaveLength(mode === "fresh" ? 1 : 2);
    expect(message).toEqual({
      type: "room.restart",
      commandId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
      expectedVersion: 42,
      mode
    });
    expect(message).not.toHaveProperty("seed");
    expect(message).not.toHaveProperty("actorId");
    expect(message).not.toHaveProperty("hostSeatId");
  }
});

test("Settings clears stale confirmation and copy state across close, policy, connection, and seed changes", async ({ page }) => {
  await installOnlineGameMock(page);
  await openMockOnlineGame(page);
  const sentCount = () => page.evaluate(() =>
    (window as unknown as { __onlineGameMock: { sent: unknown[] } }).__onlineGameMock.sent.length
  );
  const openSettings = () => page.getByRole("button", { name: "Open settings" }).click();

  await openSettings();
  await page.getByRole("button", { name: "New Random Map" }).click();
  await page.getByRole("button", { name: "Close utility panel" }).click();
  await expect(page.getByRole("button", { name: "Open settings" })).toBeFocused();
  await openSettings();
  await expect(page.locator(".restart-confirmation")).toHaveCount(0);
  expect(await sentCount()).toBe(0);

  await page.getByRole("button", { name: "Replay Current Map" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Open settings" })).toBeFocused();
  await page.getByRole("button", { name: "Open rulebook" }).click();
  await expect(page.getByRole("heading", { name: "Rulebook" })).toBeVisible();
  await page.keyboard.press("Escape");
  await openSettings();
  await expect(page.locator(".restart-confirmation")).toHaveCount(0);

  const copyStatus = page.locator(".map-seed-copy-status");
  await page.getByRole("button", { name: "Copy Seed" }).click();
  await expect(copyStatus).toHaveText("Map seed copied.");
  const seedBefore = await page.locator("[data-map-seed]").inputValue();
  await page.evaluate(() => {
    (window as unknown as { __onlineGameMock: { changeSeed(): void } }).__onlineGameMock.changeSeed();
  });
  await expect(page.locator("[data-map-seed]")).not.toHaveValue(seedBefore);
  await expect(copyStatus).toHaveText("");

  await page.getByRole("button", { name: "New Random Map" }).click();
  await page.evaluate(() => {
    (window as unknown as { __onlineGameMock: { setRestartCapability(value: boolean): void } }).__onlineGameMock
      .setRestartCapability(false);
  });
  await expect(page.locator(".restart-confirmation")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Confirm Restart" })).toHaveCount(0);
  expect(await sentCount()).toBe(0);
});

test("Settings clears pending restart when the host connection becomes unavailable", async ({ page }) => {
  await installOnlineGameMock(page);
  await openMockOnlineGame(page);
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: "New Random Map" }).click();
  await expect(page.locator(".restart-confirmation")).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { __onlineGameMock: { disconnect(): void } }).__onlineGameMock.disconnect();
  });
  await expect(page.locator(".connection-badge")).toHaveText(/Reconnecting|Offline/);
  await expect(page.locator(".restart-confirmation")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "New Random Map" })).toBeDisabled();
  expect(await page.evaluate(() =>
    (window as unknown as { __onlineGameMock: { sent: unknown[] } }).__onlineGameMock.sent.length
  )).toBe(0);
});

test("seed copy failure remains localized, selectable, and retryable through the real Settings UI", async ({ page }) => {
  await installOnlineGameMock(page);
  await openMockOnlineGame(page);
  await page.getByRole("button", { name: "Open settings" }).click();
  const seed = page.locator("[data-map-seed]");
  const status = page.locator(".map-seed-copy-status");
  const setClipboardMode = (mode: "success" | "missing" | "reject") => page.evaluate((nextMode) => {
    (window as unknown as { __onlineGameMock: { setClipboardMode(value: typeof nextMode): void } }).__onlineGameMock
      .setClipboardMode(nextMode);
  }, mode);

  await setClipboardMode("missing");
  await page.getByRole("button", { name: "Copy Seed" }).click();
  await expect(status).toHaveText("Copy failed. Select the seed and copy it manually.");
  expect(await seed.evaluate((input: HTMLInputElement) => {
    input.select();
    return input.selectionStart === 0 && input.selectionEnd === input.value.length;
  })).toBe(true);

  await setClipboardMode("reject");
  await page.getByRole("button", { name: "Copy Seed" }).click();
  await expect(status).toHaveAttribute("data-copy-attempt", "2");
  await expect(status).toHaveText("Copy failed. Select the seed and copy it manually.");

  await setClipboardMode("success");
  await page.getByRole("button", { name: "Copy Seed" }).click();
  await expect(status).toHaveText("Map seed copied.");
  expect(await page.evaluate(() =>
    (window as unknown as { __onlineGameMock: { copied: string[] } }).__onlineGameMock.copied
  )).toEqual([await seed.inputValue()]);

  await page.locator("[data-language-select]").selectOption("zh-CN");
  await setClipboardMode("reject");
  await page.getByRole("button", { name: "复制种子" }).click();
  await expect(status).toHaveText("复制失败，请选择种子并手动复制。");
});

test("late clipboard completion cannot restore status after Settings or seed invalidates the attempt", async ({ page }) => {
  await installOnlineGameMock(page);
  await openMockOnlineGame(page);
  const status = page.locator(".map-seed-copy-status");
  const deferCopy = () => page.evaluate(() => {
    (window as unknown as { __onlineGameMock: { setClipboardMode(value: "deferred"): void } }).__onlineGameMock
      .setClipboardMode("deferred");
  });
  const resolveCopy = () => page.evaluate(() => {
    (window as unknown as { __onlineGameMock: { resolveClipboard(): void } }).__onlineGameMock.resolveClipboard();
  });

  await page.getByRole("button", { name: "Open settings" }).click();
  await deferCopy();
  await page.getByRole("button", { name: "Copy Seed" }).click();
  await page.getByRole("button", { name: "Close utility panel" }).click();
  await resolveCopy();
  await page.getByRole("button", { name: "Open settings" }).click();
  await expect(status).toHaveText("");

  await deferCopy();
  await page.getByRole("button", { name: "Copy Seed" }).click();
  const previousSeed = await page.locator("[data-map-seed]").inputValue();
  await page.evaluate(() => {
    (window as unknown as { __onlineGameMock: { changeSeed(): void } }).__onlineGameMock.changeSeed();
  });
  await expect(page.locator("[data-map-seed]")).not.toHaveValue(previousSeed);
  await resolveCopy();
  await expect(status).toHaveText("");
});

for (const visual of [
  { locale: "en", width: 1280, height: 768, label: "New Random Map" },
  { locale: "en", width: 390, height: 844, label: "New Random Map" },
  { locale: "zh-CN", width: 1280, height: 768, label: "新随机地图" },
  { locale: "zh-CN", width: 390, height: 844, label: "新随机地图" }
] as const) {
  test(`expanded restart confirmation is contained at ${visual.locale} ${visual.width}px`, async ({ page }, testInfo) => {
    await installOnlineGameMock(page);
    await page.setViewportSize({ width: visual.width, height: visual.height });
    await openMockOnlineGame(page);
    await page.getByRole("button", { name: "Open settings" }).click();
    if (visual.locale === "zh-CN") await page.locator("[data-language-select]").selectOption("zh-CN");
    await page.getByRole("button", { name: visual.label }).click();
    const utility = page.locator(".utility-modal");
    const dialog = page.locator(".modal-card");
    const header = page.locator(".modal-header");
    const close = page.locator("[data-dialog-close]");
    const confirmation = page.locator(".restart-confirmation");
    const confirm = page.getByRole("button", { name: visual.locale === "en" ? "Confirm Restart" : "确认重新开始" });
    await expect(confirmation).toBeVisible();
    await expect(page.getByRole("button", { name: visual.locale === "en" ? "Cancel" : "取消" })).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(visual.width);
    const [utilityBox, dialogBox, headerBox, closeBox, confirmBox, scrollTop] = await Promise.all([
      utility.boundingBox(),
      dialog.boundingBox(),
      header.boundingBox(),
      close.boundingBox(),
      confirm.boundingBox(),
      dialog.evaluate((element) => element.scrollTop)
    ]);
    if (visual.width === 390) expect(scrollTop).toBeGreaterThan(0);
    expect(utilityBox).not.toBeNull();
    expect(dialogBox).not.toBeNull();
    expect(headerBox).not.toBeNull();
    expect(closeBox).not.toBeNull();
    expect(confirmBox).not.toBeNull();
    expect(utilityBox!.y).toBeGreaterThanOrEqual(0);
    expect(dialogBox!.y).toBeGreaterThanOrEqual(0);
    expect(headerBox!.y).toBeGreaterThanOrEqual(0);
    expect(headerBox!.y + headerBox!.height).toBeLessThanOrEqual(visual.height);
    expect(closeBox!.y).toBeGreaterThanOrEqual(0);
    expect(closeBox!.y + closeBox!.height).toBeLessThanOrEqual(visual.height);
    await expect(header).toBeInViewport();
    await expect(close).toBeInViewport();
    expect(confirmBox!.y + confirmBox!.height).toBeLessThanOrEqual(
      Math.min(visual.height, dialogBox!.y + dialogBox!.height)
    );
    const screenshot = await page.screenshot({ path: testInfo.outputPath(`${visual.locale}-${visual.width}-confirmation.png`) });
    await testInfo.attach(`${visual.locale}-${visual.width}-confirmation`, { body: screenshot, contentType: "image/png" });
  });
}

async function advanceBackToFirstPlayer(page: Page) {
  await page.getByRole("button", { name: "End Turn" }).click();
  for (let otherPlayer = 0; otherPlayer < 3; otherPlayer += 1) {
    await page.getByRole("button", { name: "Roll Dice" }).click();
    await page.getByRole("button", { name: "End Turn" }).click();
  }
}

async function setDeterministicTotal(page: Page, total: number) {
  await page.evaluate((nextTotal) => {
    if (!Number.isInteger(nextTotal) || nextTotal < 2 || nextTotal > 12) {
      throw new Error(`invalid deterministic dice total: ${nextTotal}`);
    }
    const first = Math.max(1, nextTotal - 6);
    const second = nextTotal - first;
    const values = [(first - 0.5) / 6, (second - 0.5) / 6];
    let call = 0;
    Math.random = () => values[call++ % 2];
  }, total);
}

async function completePendingLocalDiscards(page: Page) {
  for (let player = 0; player < 4; player += 1) {
    const panel = page.locator('[data-turn-flow="discard"]');
    if (await panel.count() === 0) return;
    const requiredMatch = (await panel.locator("strong").textContent())?.match(/discard (\d+)/i);
    const required = Number(requiredMatch?.[1]);
    expect(required).toBeGreaterThan(0);
    let remaining = required;
    const inputs = panel.locator('input[type="number"]');
    for (let index = 0; index < await inputs.count(); index += 1) {
      const input = inputs.nth(index);
      const amount = Math.min(remaining, Number(await input.getAttribute("max")));
      await input.fill(String(amount));
      remaining -= amount;
    }
    expect(remaining).toBe(0);
    await panel.getByRole("button", { name: "Submit Discard" }).click();
  }
  await expect(page.locator('[data-turn-flow="discard"]')).toHaveCount(0);
}

const playerTradeResources = [
  { key: "wood", short: "Wd", label: "Wood" },
  { key: "brick", short: "Br", label: "Brick" },
  { key: "wool", short: "Wl", label: "Wool" },
  { key: "grain", short: "Gr", label: "Grain" },
  { key: "ore", short: "Or", label: "Ore" }
] as const;

async function readPlayerResources(page: Page, playerIndex: number): Promise<Map<string, number>> {
  const texts = await page.locator(".player-card").nth(playerIndex)
    .locator(".resource-strip.compact .resource-token").allTextContents();
  return new Map(texts.map((text) => {
    const [short, amount] = text.trim().split(/\s+/);
    return [short, Number(amount)] as const;
  }));
}

type BuildResource = (typeof playerTradeResources)[number]["key"];
type MaritimeBuildKind = "Road" | "Settlement" | "City";
type ResourceAmounts = Record<BuildResource, number>;

const maritimeBuildCosts: Record<MaritimeBuildKind, Record<BuildResource, number>> = {
  Road: { wood: 1, brick: 1, wool: 0, grain: 0, ore: 0 },
  Settlement: { wood: 1, brick: 1, wool: 1, grain: 1, ore: 0 },
  City: { wood: 0, brick: 0, wool: 0, grain: 2, ore: 3 }
};

function toResourceAmounts(inventory: ReadonlyMap<string, number>): ResourceAmounts {
  return Object.fromEntries(playerTradeResources.map(({ key, short }) => [
    key,
    inventory.get(short) ?? 0
  ])) as ResourceAmounts;
}

function canCoverCost(inventory: ResourceAmounts, cost: ResourceAmounts): boolean {
  return playerTradeResources.every(({ key }) => inventory[key] >= cost[key]);
}

function missingCostResources(inventory: ResourceAmounts, cost: ResourceAmounts): BuildResource[] {
  return playerTradeResources
    .filter(({ key }) => inventory[key] < cost[key])
    .map(({ key }) => key);
}

async function readBankResources(page: Page): Promise<ResourceAmounts> {
  return Object.fromEntries(await Promise.all(playerTradeResources.map(async ({ key }) => {
    const text = await page.locator(`.bank-panel .resource-token.${key}`).textContent();
    return [key, Number(text?.trim().split(/\s+/).at(-1))] as const;
  }))) as ResourceAmounts;
}

async function completeRequiredMaritimeTrade(
  page: Page,
  fundingCost: ResourceAmounts,
  targetCost: ResourceAmounts,
  receiveResource: BuildResource,
  targetAction: Locator
): Promise<boolean | undefined> {
  const give = page.getByLabel("Maritime give resource");
  const receive = page.getByLabel("Maritime receive resource");
  const before = toResourceAmounts(await readPlayerResources(page, 0));
  expect(missingCostResources(before, fundingCost)).toContain(receiveResource);
  expect(canCoverCost(before, fundingCost)).toBe(false);
  const targetWasUnaffordable = !canCoverCost(before, targetCost);
  if (targetWasUnaffordable) await expect(targetAction).toBeDisabled();

  const options = await give.locator("option:not([disabled])").evaluateAll((entries) => entries
    .map((entry) => ({
      value: (entry as HTMLOptionElement).value,
      text: entry.textContent ?? ""
    }))
    .filter((entry) => entry.value));
  const candidate = options.find((option) => {
    const resource = option.value as BuildResource;
    const ratio = Number(option.text.match(/(\d+):1/)?.[1]);
    return resource !== receiveResource && Number.isInteger(ratio) &&
      before[resource] - ratio >= fundingCost[resource];
  });
  if (!candidate) return undefined;

  await give.selectOption(candidate.value);
  const receiveOptions = await receive.locator("option:not([disabled])").evaluateAll((entries) => entries
    .map((entry) => (entry as HTMLOptionElement).value)
    .filter(Boolean));
  if (!receiveOptions.includes(receiveResource)) {
    await give.selectOption("");
    return undefined;
  }

  await receive.selectOption(receiveResource);
  await page.getByRole("button", { name: "Maritime" }).click();
  const after = toResourceAmounts(await readPlayerResources(page, 0));
  const giveResource = candidate.value as BuildResource;
  const ratio = Number(candidate.text.match(/(\d+):1/)?.[1]);
  expect(after[receiveResource]).toBe(before[receiveResource] + 1);
  expect(after[giveResource]).toBe(before[giveResource] - ratio);
  for (const { key } of playerTradeResources) {
    if (key !== receiveResource && key !== giveResource) expect(after[key]).toBe(before[key]);
  }
  return targetWasUnaffordable && canCoverCost(after, targetCost);
}

async function chooseRoadExtensionTarget(page: Page) {
  const targets = page.locator('[data-board-visible-target="road"]');
  const extensionIndex = await targets.evaluateAll((entries) => {
    const key = (x: number, y: number) => `${x.toFixed(1)},${y.toFixed(1)}`;
    const adjacency = new Map<string, Set<string>>();
    for (const polygon of document.querySelectorAll<SVGPolygonElement>(".board-hex")) {
      const vertices = (polygon.getAttribute("points") ?? "").trim().split(/\s+/).map((point) => {
        const [x, y] = point.split(",").map(Number);
        return key(x, y);
      });
      for (let index = 0; index < vertices.length; index += 1) {
        const left = vertices[index]!;
        const right = vertices[(index + 1) % vertices.length]!;
        adjacency.set(left, new Set([...(adjacency.get(left) ?? []), right]));
        adjacency.set(right, new Set([...(adjacency.get(right) ?? []), left]));
      }
    }
    const occupied = new Set([...document.querySelectorAll<SVGRectElement>(".building-marker")]
      .map((entry) => key(
        Number(entry.getAttribute("x")) + Number(entry.getAttribute("width")) / 2,
        Number(entry.getAttribute("y")) + Number(entry.getAttribute("height")) / 2
      )));
    const hasLegalSettlementEndpoint = (entry: Element) => {
      const endpoints = [
        key(Number(entry.getAttribute("x1")), Number(entry.getAttribute("y1"))),
        key(Number(entry.getAttribute("x2")), Number(entry.getAttribute("y2")))
      ];
      return endpoints.some((endpoint) => !occupied.has(endpoint) &&
        [...(adjacency.get(endpoint) ?? [])].every((neighbor) => !occupied.has(neighbor))
      );
    };
    return entries.findIndex(hasLegalSettlementEndpoint);
  });
  expect(extensionIndex, "Expected a road target that opens a legal settlement vertex").toBeGreaterThanOrEqual(0);
  await targets.nth(extensionIndex).click();
}

interface ProductionMatrixRow {
  readonly playerResources: readonly BuildResource[];
  readonly producedResources: readonly BuildResource[];
  readonly total: number;
}

async function readProductionMatrix(page: Page): Promise<ProductionMatrixRow[]> {
  return page.evaluate(() => {
    const resourceByTerrain: Record<string, BuildResource | undefined> = {
      Forest: "wood",
      Hill: "brick",
      Pasture: "wool",
      Field: "grain",
      Mountain: "ore"
    };
    const centers = [...document.querySelectorAll<SVGRectElement>(".building-marker")]
      .map((entry) => ({
        isPlayer: entry.querySelector("title")?.textContent?.startsWith("Voyage1969 ") ?? false,
        units: entry.classList.contains("city") ? 2 : 1,
        x: Number(entry.getAttribute("x")) + Number(entry.getAttribute("width")) / 2,
        y: Number(entry.getAttribute("y")) + Number(entry.getAttribute("height")) / 2
      }));
    const byTotal = new Map<number, {
      playerResources: BuildResource[];
      producedResources: BuildResource[];
    }>();
    for (const hex of document.querySelectorAll<SVGGElement>(".hex-tile")) {
      const total = Number(hex.querySelector(".dice-number")?.textContent);
      const resource = resourceByTerrain[hex.getAttribute("aria-label") ?? ""];
      if (!Number.isInteger(total) || !resource) continue;
      const points = (hex.querySelector(".board-hex")?.getAttribute("points") ?? "")
        .trim().split(/\s+/).map((point) => {
          const [x, y] = point.split(",").map(Number);
          return { x, y };
        });
      const row = byTotal.get(total) ?? {
        playerResources: [],
        producedResources: []
      };
      for (const center of centers) {
        if (!points.some((point) =>
          Math.abs(point.x - center.x) < 0.5 && Math.abs(point.y - center.y) < 0.5
        )) continue;
        for (let unit = 0; unit < center.units; unit += 1) {
          if (center.isPlayer) row.playerResources.push(resource);
          row.producedResources.push(resource);
        }
      }
      byTotal.set(total, row);
    }
    return [...byTotal.entries()]
      .map(([total, row]) => ({ total, ...row }))
      .sort((left, right) => left.total - right.total);
  });
}

async function advanceBackToFirstPlayerWithoutProduction(page: Page, seed: string): Promise<void> {
  await page.getByRole("button", { name: "End Turn" }).click();
  for (let otherPlayer = 0; otherPlayer < 3; otherPlayer += 1) {
    const matrix = await readProductionMatrix(page);
    const noProduction = matrix.find((row) => row.producedResources.length === 0);
    if (!noProduction) {
      throw new Error(`No globally zero-production roll while advancing ${seed}: ${JSON.stringify(matrix)}`);
    }
    await setDeterministicTotal(page, noProduction.total);
    await page.getByRole("button", { name: "Roll Dice" }).click();
    await page.getByRole("button", { name: "End Turn" }).click();
  }
}

interface ProtectedProductionPlan {
  readonly receive: BuildResource;
  readonly total: number;
}

async function chooseProtectedProductionPlan(
  page: Page,
  fundingCost: ResourceAmounts,
  seed: string
): Promise<ProtectedProductionPlan> {
  const inventory = toResourceAmounts(await readPlayerResources(page, 0));
  const bank = await readBankResources(page);
  const matrix = await readProductionMatrix(page);
  const missing = missingCostResources(inventory, fundingCost);
  const candidates = missing.flatMap((receive) => matrix.flatMap((row) => {
    const donorProduction = row.playerResources.filter((resource) =>
      resource !== receive && bank[resource] > 0
    ).length;
    const bankCanPayRoll = playerTradeResources.every(({ key }) =>
      bank[key] >= row.producedResources.filter((resource) => resource === key).length
    );
    if (bank[receive] <= 0 || row.producedResources.includes(receive) ||
      !bankCanPayRoll || donorProduction === 0) return [];
    return [{
      receive,
      total: row.total,
      score: donorProduction * 100 - (row.producedResources.length - row.playerResources.length) * 10 + bank[receive]
    }];
  })).sort((left, right) => right.score - left.score || left.total - right.total ||
    (left.receive < right.receive ? -1 : left.receive > right.receive ? 1 : 0));
  const plan = candidates[0];
  if (!plan) {
    throw new Error(`No protected maritime production plan for ${seed}: missing=${JSON.stringify(missing)}, inventory=${JSON.stringify(inventory)}, bank=${JSON.stringify(bank)}, matrix=${JSON.stringify(matrix)}`);
  }
  return { receive: plan.receive, total: plan.total };
}

async function fundAndBuildWithMaritime(
  page: Page,
  kind: MaritimeBuildKind,
  seed: string,
  options: { maxRounds?: number } = {}
): Promise<number> {
  const button = page.getByRole("button", { name: kind, exact: true });
  const targetKind = kind.toLowerCase();
  const marker = kind === "Road" ? ".road-marker" : `.building-marker.${targetKind}`;
  const initialMarkerCount = await page.locator(marker).count();
  const maxRounds = options.maxRounds ?? 40;
  const targetCost = maritimeBuildCosts[kind];
  const initialInventory = toResourceAmounts(await readPlayerResources(page, 0));
  expect(canCoverCost(initialInventory, targetCost), `${kind} must start unaffordable for ${seed}`).toBe(false);
  await expect(button).toBeDisabled();
  let tradeCount = 0;
  let targetTradeSeen = false;

  for (let attempt = 0; attempt < maxRounds; attempt += 1) {
    const beforeRoll = toResourceAmounts(await readPlayerResources(page, 0));
    if (canCoverCost(beforeRoll, targetCost)) {
      if (!targetTradeSeen) {
        throw new Error(`${kind} became affordable without a target maritime trade for ${seed}`);
      }
    } else {
      const plan = await chooseProtectedProductionPlan(page, targetCost, seed);
      await setDeterministicTotal(page, plan.total);
      await page.getByRole("button", { name: "Roll Dice" }).click();
      const afterRoll = toResourceAmounts(await readPlayerResources(page, 0));
      expect(afterRoll[plan.receive], `${seed} total ${plan.total} must preserve bank stock for ${plan.receive}`).toBe(beforeRoll[plan.receive]);
      expect(canCoverCost(afterRoll, targetCost), `${kind} must remain unaffordable before the target trade for ${seed}`).toBe(false);
      const completedTargetCost = await completeRequiredMaritimeTrade(
        page,
        targetCost,
        targetCost,
        plan.receive,
        button
      );
      if (completedTargetCost !== undefined) {
        tradeCount += 1;
        targetTradeSeen ||= completedTargetCost;
      }
    }

    const funded = toResourceAmounts(await readPlayerResources(page, 0));
    if (targetTradeSeen && canCoverCost(funded, targetCost)) {
      await expect(button).toBeEnabled();
      await button.click();
      await expect(button).toHaveAttribute("aria-pressed", "true");
      const targets = page.locator(`[data-board-action-target="${targetKind}"]`);
      expect(await targets.count()).toBeGreaterThan(0);
      await page.locator(`[data-board-visible-target="${targetKind}"]`).first().click();
      await expect(targets).toHaveCount(0);
      await expect(page.locator(marker)).toHaveCount(initialMarkerCount + 1);
      return tradeCount;
    }
    if (attempt < maxRounds - 1) await advanceBackToFirstPlayerWithoutProduction(page, seed);
  }
  const inventory = toResourceAmounts(await readPlayerResources(page, 0));
  const bank = await readBankResources(page);
  throw new Error(`${kind} did not converge for ${seed}: inventory=${JSON.stringify(inventory)}, bank=${JSON.stringify(bank)}, targetTradeSeen=${targetTradeSeen}`);
}

async function placeFundedSettlement(
  page: Page,
  initialSettlementCount: number
): Promise<void> {
  const settlement = page.getByRole("button", { name: "Settlement", exact: true });
  await expect(settlement).toBeEnabled();
  await settlement.click();
  const targets = page.locator('[data-board-action-target="settlement"]');
  expect(await targets.count()).toBeGreaterThan(0);
  await page.locator('[data-board-visible-target="settlement"]').first().click();
  await expect(targets).toHaveCount(0);
  await expect(page.locator(".building-marker.settlement")).toHaveCount(initialSettlementCount + 1);
}

async function fundAndBuildSettlementWithMaritime(page: Page, seed: string): Promise<number> {
  const settlement = page.getByRole("button", { name: "Settlement", exact: true });
  const road = page.getByRole("button", { name: "Road", exact: true });
  const settlementCost = maritimeBuildCosts.Settlement;
  const combinedCost: ResourceAmounts = { wood: 2, brick: 2, wool: 1, grain: 1, ore: 0 };
  const initialSettlementCount = await page.locator(".building-marker.settlement").count();
  const initialInventory = toResourceAmounts(await readPlayerResources(page, 0));
  expect(canCoverCost(initialInventory, settlementCost), `Settlement must start unaffordable for ${seed}`).toBe(false);
  await expect(settlement).toBeDisabled();
  let tradeCount = 0;
  let roadsBuilt = 0;
  let targetTradeSeen = false;

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const beforeRoll = toResourceAmounts(await readPlayerResources(page, 0));
    if (targetTradeSeen && canCoverCost(beforeRoll, settlementCost) && await settlement.isEnabled()) {
      await placeFundedSettlement(page, initialSettlementCount);
      return tradeCount;
    }

    const fundingCost = targetTradeSeen ? combinedCost : settlementCost;
    if (!canCoverCost(beforeRoll, fundingCost)) {
      const plan = await chooseProtectedProductionPlan(page, fundingCost, seed);
      await setDeterministicTotal(page, plan.total);
      await page.getByRole("button", { name: "Roll Dice" }).click();
      const afterRoll = toResourceAmounts(await readPlayerResources(page, 0));
      expect(afterRoll[plan.receive], `${seed} total ${plan.total} must preserve bank stock for ${plan.receive}`).toBe(beforeRoll[plan.receive]);
      expect(canCoverCost(afterRoll, fundingCost), `Settlement funding must remain incomplete before maritime trade for ${seed}`).toBe(false);
      const completedTargetCost = await completeRequiredMaritimeTrade(
        page,
        fundingCost,
        settlementCost,
        plan.receive,
        settlement
      );
      if (completedTargetCost !== undefined) {
        tradeCount += 1;
        targetTradeSeen ||= completedTargetCost;
      }
    }

    const funded = toResourceAmounts(await readPlayerResources(page, 0));
    if (targetTradeSeen && canCoverCost(funded, settlementCost) && await settlement.isEnabled()) {
      await placeFundedSettlement(page, initialSettlementCount);
      return tradeCount;
    }

    if (targetTradeSeen && canCoverCost(funded, combinedCost) &&
      await settlement.getAttribute("title") === "No legal target is available.") {
      if (roadsBuilt >= 3) {
        throw new Error(`Settlement route still has no legal target for ${seed} after ${roadsBuilt} outward roads`);
      }
      expect(canCoverCost(funded, combinedCost), `Road ${roadsBuilt + 1} must preserve Settlement cost for ${seed}`).toBe(true);
      await expect(road).toBeEnabled();
      const initialRoadCount = await page.locator(".road-marker").count();
      await road.click();
      expect(await page.locator('[data-board-action-target="road"]').count()).toBeGreaterThan(0);
      await chooseRoadExtensionTarget(page);
      await expect(page.locator(".road-marker")).toHaveCount(initialRoadCount + 1);
      const afterRoad = toResourceAmounts(await readPlayerResources(page, 0));
      expect(canCoverCost(afterRoad, settlementCost), `Road ${roadsBuilt + 1} consumed reserved Settlement resources for ${seed}`).toBe(true);
      expect(afterRoad.wood).toBe(funded.wood - 1);
      expect(afterRoad.brick).toBe(funded.brick - 1);
      roadsBuilt += 1;
      if (await settlement.isEnabled()) {
        await placeFundedSettlement(page, initialSettlementCount);
        return tradeCount;
      }
    }
    if (attempt < 59) await advanceBackToFirstPlayerWithoutProduction(page, seed);
  }

  const inventory = toResourceAmounts(await readPlayerResources(page, 0));
  const bank = await readBankResources(page);
  throw new Error(`Settlement did not converge for ${seed}: roads=${roadsBuilt}, inventory=${JSON.stringify(inventory)}, bank=${JSON.stringify(bank)}, targetTradeSeen=${targetTradeSeen}`);
}

async function prepareAffordablePublicTrade(page: Page): Promise<{
  acceptingPlayer: string;
  offerLabel: string;
  proposerName: string;
  requestLabel: string;
}> {
  const cards = page.locator(".player-card");
  const productiveTotals = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12];

  for (let attempt = 0; attempt < productiveTotals.length + 4; attempt += 1) {
    const activeIndex = await cards.evaluateAll((nodes) => nodes.findIndex((node) => node.classList.contains("active")));
    const proposer = await readPlayerResources(page, activeIndex);
    const offered = playerTradeResources.find((resource) => (proposer.get(resource.short) ?? 0) > 0);
    let acceptingPlayer = "";
    let requested: (typeof playerTradeResources)[number] | undefined;
    for (let index = 0; index < await cards.count(); index += 1) {
      if (index === activeIndex) continue;
      const inventory = await readPlayerResources(page, index);
      requested = playerTradeResources.find((resource) => (inventory.get(resource.short) ?? 0) > 0);
      if (requested) {
        acceptingPlayer = (await cards.nth(index).locator("strong").textContent())!.trim();
        break;
      }
    }
    if (offered && requested && acceptingPlayer) {
      const proposerName = (await cards.nth(activeIndex).locator("strong").textContent())!.trim();
      await page.getByLabel(`Offer ${offered.label}`).fill("1");
      await page.getByLabel(`Request ${requested.label}`).fill("1");
      await expect(page.getByRole("button", { name: "Publish Public Offer" })).toBeEnabled();
      return { acceptingPlayer, offerLabel: offered.label, proposerName, requestLabel: requested.label };
    }

    await page.getByRole("button", { name: "End Turn" }).click();
    await setDeterministicTotal(page, productiveTotals[attempt % productiveTotals.length]);
    await page.getByRole("button", { name: "Roll Dice" }).click();
  }
  throw new Error("no affordable Local public trade converged across a full deterministic roll cycle");
}

test("Local opens in an empty seeded setup and both restart modes rebuild atomically", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 768 });
  await openLocal(page);

  await expect(page.getByText("Place the next settlement")).toBeVisible();
  await expect(page.locator(".player-card")).toHaveCount(4);
  await expect(page.locator(".building-marker")).toHaveCount(0);
  await expect(page.locator(".road-marker")).toHaveCount(0);
  await expect(page.locator(".resource-strip.compact .resource-token")).toHaveCount(20);
  expect(await page.locator(".resource-strip.compact .resource-token").allTextContents())
    .toEqual(expect.arrayContaining(["Wd 0", "Br 0", "Wl 0", "Gr 0", "Or 0"]));
  for (const card of await page.locator(".player-card").allTextContents()) {
    expect(card).toContain("Resources: 0");
    expect(card).toContain("Development: 0");
  }
  await expect(page.getByRole("log").locator("p")).toHaveCount(1);
  await expect(page.getByRole("log")).toHaveText("Setup started. Place settlements and roads in snake order.");
  await expect(page.getByRole("button", { name: "Roll Dice" })).toBeDisabled();

  const initialLayout = await publicBoardSignature(page);
  await page.getByRole("button", { name: "Open settings" }).click();
  const initialSeed = await page.locator("[data-map-seed]").inputValue();
  expect(initialSeed).toMatch(/^M1-[0-9A-F]{16}$/);
  await page.getByRole("button", { name: "Close utility panel" }).click();
  const cleanScreenshot = await page.screenshot({ path: testInfo.outputPath("local-clean-setup-desktop.png") });
  await testInfo.attach("local-clean-setup-desktop", { body: cleanScreenshot, contentType: "image/png" });

  await page.locator('[data-board-action-target="setupSettlement"]').first().press("Enter");
  await page.locator('[data-board-action-target="setupRoad"]').first().press("Enter");
  await expect(page.locator(".building-marker")).toHaveCount(1);
  await expect(page.locator(".road-marker")).toHaveCount(1);

  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: "Replay Current Map" }).click();
  await expect(page.getByText("Place the next settlement")).toBeVisible();
  await expect(page.locator(".building-marker")).toHaveCount(0);
  await expect(page.locator(".road-marker")).toHaveCount(0);
  expect(await publicBoardSignature(page)).toBe(initialLayout);
  await page.getByRole("button", { name: "Open settings" }).click();
  await expect(page.locator("[data-map-seed]")).toHaveValue(initialSeed);
  await page.getByRole("button", { name: "New Random Map" }).click();
  await expect(page.getByText("Place the next settlement")).toBeVisible();
  expect(await publicBoardSignature(page)).not.toBe(initialLayout);
  await page.getByRole("button", { name: "Open settings" }).click();
  const freshSeed = await page.locator("[data-map-seed]").inputValue();
  expect(freshSeed).toMatch(/^M1-[0-9A-F]{16}$/);
  expect(freshSeed).not.toBe(initialSeed);
  const freshScreenshot = await page.screenshot({ path: testInfo.outputPath("local-fresh-setup-desktop.png") });
  await testInfo.attach("local-fresh-setup-desktop", { body: freshScreenshot, contentType: "image/png" });
});

test("a zero-token gathering completes without entering an unwinnable auction", async ({ page }) => {
  await openLocal(page);
  await completeLocalSetup(page);
  await page.getByRole("tab", { name: "Commerce Guild" }).click();
  await page.getByRole("button", { name: "Start Gathering" }).click();
  await page.getByRole("button", { name: "Open Auctions" }).click();
  await expect(page.locator("#root .game-shell")).toBeVisible();
  await expect(page.getByRole("log")).toContainText(
    "The Commerce Guild auction ended because no player has guild tokens."
  );
  await expect(page.getByRole("button", { name: "Resolve Blind Box" })).toHaveCount(0);
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: "New Random Map" }).click();
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("unaffordable actions stay disabled and maritime choices are explicit", async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await openLocal(page);
  await completeLocalSetup(page);
  await page.getByRole("button", { name: "Roll Dice" }).click();

  await expect(page.getByRole("button", { name: "City", exact: true })).toBeDisabled();
  await expect(page.getByLabel("Maritime give resource")).toBeVisible();
  await expect(page.getByLabel("Maritime receive resource")).toBeVisible();
});

test("New Random Map enters interactive snake-order setup", async ({ page }) => {
  await openLocal(page);
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: "New Random Map" }).click();

  await expect(page.getByText("Place the next settlement")).toBeVisible();
  await expect(page.locator('[data-board-action-target="setupSettlement"]')).not.toHaveCount(0);
});

test("New Random Map completes all setup pairs and enters normal play", async ({ page }) => {
  await openLocal(page);
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: "New Random Map" }).click();

  await completeLocalSetup(page);
});

const maritimeSeedCases = [
  "M1-0000000000000000",
  "M1-1111111111111111",
  "M1-FEDCBA9876543210"
] as const;

for (const seed of maritimeSeedCases) {
  test(`explicit maritime choices fund a selected Road target for ${seed}`, async ({ page }) => {
    test.setTimeout(90_000);
    await openLocalAtSeed(page, seed);
    await completeLocalSetup(page);
    expect(await fundAndBuildWithMaritime(page, "Road", seed)).toBeGreaterThan(0);
  });

  test(`explicit maritime choices fund a selected Settlement target for ${seed}`, async ({ page }) => {
    test.setTimeout(150_000);
    await openLocalAtSeed(page, seed);
    await completeLocalSetup(page);
    expect(await fundAndBuildSettlementWithMaritime(page, seed)).toBeGreaterThan(0);
  });

  test(`explicit maritime choices fund a selected City target for ${seed}`, async ({ page }) => {
    test.setTimeout(120_000);
    await openLocalAtSeed(page, seed);
    await completeLocalSetup(page);
    expect(await fundAndBuildWithMaritime(page, "City", seed, { maxRounds: 50 })).toBeGreaterThan(0);
  });
}

test("Commerce controls keep valid named selections across turns", async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await openLocal(page);
  await completeLocalSetup(page);
  await page.getByRole("tab", { name: "Commerce Guild" }).click();

  await expect(page.getByLabel("Token recipient")).toHaveValue("p2");
  await expect(page.getByLabel("Token amount")).toHaveValue("1");
  await page.getByRole("button", { name: "Roll Dice" }).click();
  await page.getByRole("button", { name: "End Turn" }).click();
  await expect(page.getByLabel("Token recipient")).not.toHaveValue("p2");

  await page.getByRole("button", { name: "Start Gathering" }).click();
  await expect(page.getByLabel("Gathering player")).toHaveCount(1);
  await page.getByLabel("Gathering player").selectOption({ label: "Kay (0 tokens)" });
  await expect(page.getByRole("status")).toContainText("Kay: 0 tokens");
  await expect(page.getByRole("status")).toContainText("4 redemptions remaining");
  await expect(page.getByRole("button", { name: "+Wood (19 bank)" })).toBeDisabled();
});

test("utility dialog owns focus, closes with Escape, and restores its opener", async ({ page }) => {
  await openLocal(page);
  const opener = page.getByRole("button", { name: "Open settings" });
  await opener.click();

  await expect(page.getByRole("button", { name: "Close utility panel" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("post-roll guidance describes the current action phase", async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await openLocal(page);
  await completeLocalSetup(page);
  await page.getByRole("button", { name: "Roll Dice" }).click();

  await expect(page.locator(".phase-guidance")).toHaveText("Choose an action or end the turn");
});

for (const viewport of [
  { name: "desktop", width: 1280, height: 720 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 }
]) {
  test(`${viewport.name} keeps actions contained and board-adjacent`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openLocal(page);

    const measurements = await page.evaluate(() => {
      const action = document.querySelector(".action-bar")!.getBoundingClientRect();
      const board = document.querySelector(".board-zone")!.getBoundingClientRect();
      const right = document.querySelector(".right-rail")!.getBoundingClientRect();
      const tradeHub = document.querySelector<HTMLElement>(".trade-hub-content:not([hidden])")!;
      const childBottom = Math.max(
        ...[...document.querySelectorAll(".action-bar > *")].map(
          (element) => element.getBoundingClientRect().bottom
        )
      );
      const childRight = Math.max(
        ...[...document.querySelectorAll(".action-bar > *")].map(
          (element) => element.getBoundingClientRect().right
        )
      );
      return {
        actionBottom: action.bottom,
        actionRight: action.right,
        actionTop: action.top,
        boardBottom: board.bottom,
        childBottom,
        childRight,
        documentWidth: document.documentElement.scrollWidth,
        rightTop: right.top,
        tradeHubClientWidth: tradeHub.clientWidth,
        tradeHubScrollWidth: tradeHub.scrollWidth,
        viewportWidth: window.innerWidth
      };
    });

    expect(measurements.documentWidth).toBeLessThanOrEqual(measurements.viewportWidth);
    expect(measurements.childBottom).toBeLessThanOrEqual(measurements.actionBottom + 1);
    expect(measurements.childRight).toBeLessThanOrEqual(measurements.actionRight + 1);
    expect(measurements.tradeHubScrollWidth).toBeLessThanOrEqual(measurements.tradeHubClientWidth + 1);
    if (viewport.width <= 768) {
      expect(measurements.actionTop).toBeGreaterThanOrEqual(measurements.boardBottom);
      expect(measurements.actionTop).toBeLessThan(measurements.rightTop);
    }
    if (viewport.width === 390) {
      const touchMeasurements = await page.evaluate(() => {
        const utility = document.querySelector(".utility-rail button")!.getBoundingClientRect();
        return { utilityHeight: utility.height, utilityWidth: utility.width };
      });
      expect(touchMeasurements.utilityHeight).toBeGreaterThanOrEqual(44);
      expect(touchMeasurements.utilityWidth).toBeGreaterThanOrEqual(44);
    }
  });
}

test("mobile setup board targets retain a 44px non-scaling hit stroke", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openLocal(page);
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: "New Random Map" }).click();

  const target = page.locator('[data-board-action-target="setupSettlement"]');
  expect(await target.count()).toBeGreaterThan(0);
  const hitStyle = await target.first().evaluate((element) => ({
    strokeWidth: Number.parseFloat(getComputedStyle(element).strokeWidth),
    vectorEffect: getComputedStyle(element).vectorEffect
  }));
  expect(hitStyle.strokeWidth).toBeGreaterThanOrEqual(44);
  expect(hitStyle.vectorEffect).toBe("non-scaling-stroke");
});

test("robber guidance stays readable and log/statistics lists reach their final entries", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openLocal(page);
  await completeLocalSetup(page);
  for (let completedTurn = 0; completedTurn < 8; completedTurn += 1) {
    await setDeterministicTotal(page, 2);
    await page.getByRole("button", { name: "Roll Dice" }).click();
    await page.getByRole("button", { name: "End Turn" }).click();
  }
  await setDeterministicTotal(page, 7);
  await page.getByRole("button", { name: "Roll Dice" }).click();
  await completePendingLocalDiscards(page);

  const robberPanel = page.locator('[data-turn-flow="robber-placement"]');
  await expect(robberPanel).toBeVisible();
  const contrast = await robberPanel.evaluate((element) => {
    const parse = (value: string) => value.match(/[\d.]+/g)!.slice(0, 3).map(Number);
    const luminance = ([red, green, blue]: number[]) => {
      const channels = [red, green, blue].map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.03928
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    };
    const style = getComputedStyle(element);
    const foreground = luminance(parse(style.color));
    const background = luminance(parse(style.backgroundColor));
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);

  const log = page.getByRole("log");
  const logScroll = await log.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight
  }));
  expect(logScroll.scrollHeight).toBeGreaterThan(logScroll.clientHeight);
  await log.hover();
  await page.mouse.wheel(0, 600);
  await expect.poll(() => log.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await log.evaluate((element) => {
    element.scrollTop = 0;
  });
  await log.focus();
  await page.keyboard.press("End");
  await expect.poll(() => log.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(log.locator("p").last()).toHaveText("Setup started. Place settlements and roads in snake order.");
  await expect(log.locator("p").last()).toBeInViewport();

  await page.getByRole("button", { name: "dice", exact: true }).click();
  const diceList = page.getByLabel("Income by player for selected dice total");
  const diceScroll = await diceList.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight
  }));
  expect(diceScroll.scrollHeight).toBeGreaterThan(diceScroll.clientHeight);
  await diceList.hover();
  await page.mouse.wheel(0, 600);
  await expect.poll(() => diceList.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(diceList.locator("p").last()).toBeInViewport();
});

test("a public multi-resource offer is visible to every opponent and accepts atomically", async ({ page }) => {
  await openLocal(page);
  await completeLocalSetup(page);
  await setDeterministicTotal(page, 8);
  await page.getByRole("button", { name: "Roll Dice" }).click();

  const trade = await prepareAffordablePublicTrade(page);
  await page.getByRole("button", { name: "Publish Public Offer" }).click();

  await expect(page.getByText(`${trade.proposerName} offers 1 ${trade.offerLabel} for 1 ${trade.requestLabel}`)).toBeVisible();
  await expect(page.getByRole("button", { name: /^Accept as / })).toHaveCount(3);
  await expect(page.getByRole("button", { name: `Accept as ${trade.acceptingPlayer}` })).toBeEnabled();

  await page.getByRole("button", { name: `Accept as ${trade.acceptingPlayer}` }).click();
  await expect(page.getByText("No public offer is active.")).toBeVisible();
  await expect(page.getByRole("log")).toContainText(`${trade.acceptingPlayer} accepted ${trade.proposerName}'s public player trade`);

  await page.getByRole("tab", { name: "Commerce Guild" }).click();
  await expect(page.locator('[data-trade-hub-panel="commerce"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "Commerce Guild" })).toBeVisible();
});

test("public offers cancel explicitly and clear when the proposer ends the turn", async ({ page }) => {
  await openLocal(page);
  await completeLocalSetup(page);
  await setDeterministicTotal(page, 8);
  await page.getByRole("button", { name: "Roll Dice" }).click();
  const trade = await prepareAffordablePublicTrade(page);
  await page.getByRole("button", { name: "Publish Public Offer" }).click();
  await page.getByRole("button", { name: "Cancel Offer" }).click();
  await expect(page.getByText("No public offer is active.")).toBeVisible();

  await prepareAffordablePublicTrade(page);
  await page.getByRole("button", { name: "Publish Public Offer" }).click();
  await page.getByRole("button", { name: "End Turn" }).click();
  await expect(page.getByText("No public offer is active.")).toBeVisible();
  await expect(page.locator(".turn-status strong")).not.toHaveText(trade.proposerName);
});

test("English defaults, Chinese retranslates history, and the locale survives reload", async ({ page }) => {
  await openLocal(page);
  await completeLocalSetup(page);
  await expect(page.getByRole("heading", { name: "Game Log" })).toBeVisible();
  await setDeterministicTotal(page, 8);
  await page.getByRole("button", { name: "Roll Dice" }).click();
  await expect(page.getByRole("log")).toContainText("Voyage1969 rolled 8");

  await page.getByRole("button", { name: "Open settings" }).click();
  const language = page.locator("[data-language-select]");
  await expect(language).toHaveValue("en");
  await language.selectOption("zh-CN");
  await expect(page.getByRole("button", { name: "掷骰子" })).toBeVisible();
  await page.locator("[data-dialog-close]").click();

  await expect(page.getByRole("heading", { name: "游戏日志" })).toBeVisible();
  await expect(page.getByRole("log")).toContainText("Voyage1969 掷出了 8");
  await expect(page.getByText("产出统计")).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "开始本地游戏" }).click();
  await completeLocalSetup(page);
  await expect(page.getByRole("heading", { name: "游戏日志" })).toBeVisible();
  await expect(page.getByRole("button", { name: "掷骰子" })).toBeVisible();
  await expect(page.getByRole("log")).toContainText("初始设置已开始，请按蛇形顺序放置村庄和道路。");

  await page.getByRole("tab", { name: "商业公会" }).click();
  await page.getByRole("button", { name: "开始集会" }).click();
  await page.getByRole("button", { name: "开启拍卖" }).click();
  await expect(page.getByRole("log")).toContainText(
    "没有玩家持有公会代币，商业公会拍卖已结束。"
  );
  await expect(page.getByLabel("Voyage1969")).toHaveCount(0);
});

test("mobile keeps log and dice statistics internally scrollable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openLocal(page);
  await completeLocalSetup(page);
  for (let completedTurn = 0; completedTurn < 8; completedTurn += 1) {
    await setDeterministicTotal(page, 2);
    await page.getByRole("button", { name: "Roll Dice" }).click();
    await page.getByRole("button", { name: "End Turn" }).click();
  }
  await setDeterministicTotal(page, 7);
  await page.getByRole("button", { name: "Roll Dice" }).click();

  const log = page.getByRole("log");
  expect(await log.evaluate((element) => element.scrollHeight)).toBeGreaterThan(
    await log.evaluate((element) => element.clientHeight)
  );
  await log.focus();
  await page.keyboard.press("End");
  await expect.poll(() => log.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

  await page.getByRole("button", { name: "dice", exact: true }).click();
  const diceList = page.getByLabel("Income by player for selected dice total");
  expect(await diceList.evaluate((element) => element.scrollHeight)).toBeGreaterThan(
    await diceList.evaluate((element) => element.clientHeight)
  );
  await diceList.focus();
  await page.keyboard.press("End");
  await expect.poll(() => diceList.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
});
