import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { parseMapSeed } from "../../src/domain/mapSeed";
import { createBoardDataForSeed } from "../../src/domain/randomBoard";
import { publicBoardSignature } from "./seededMapHelpers";

type Snapshot = {
  type: "room.snapshot";
  roomVersion: number;
  lifecycle: "lobby" | "playing" | "finished";
  publicState: any;
  privateState: any;
  allowedActions: any;
  acknowledgedCommandId?: string;
};

type CommandRejection = {
  type: "command.rejected";
  commandId: string;
  error: { code: string };
};

function authoritativeGameplayProjection(snapshot: Snapshot) {
  const { roomVersion: _roomVersion, ...publicState } = snapshot.publicState;
  return {
    lifecycle: snapshot.lifecycle,
    publicState,
    privateState: snapshot.privateState,
    allowedActions: snapshot.allowedActions
  };
}

const productionWireSnapshots = new WeakMap<Page, Snapshot[]>();
const wireCommandRejections = new WeakMap<Page, CommandRejection[]>();
const ticketRequestCounts = new WeakMap<Page, { count: number }>();
const productionWireCommands = new WeakMap<Page, Array<Record<string, unknown>>>();

async function trackProductionSockets(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const NativeWebSocket = window.WebSocket;
    const tracked: WebSocket[] = [];
    const TrackingWebSocket = new Proxy(NativeWebSocket, {
      construct(target, args) {
        const socket = Reflect.construct(target, args) as WebSocket;
        tracked.push(socket);
        return socket;
      }
    });
    Object.defineProperty(window, "WebSocket", { configurable: true, value: TrackingWebSocket });
    (window as any).__catanTrackedSockets = tracked;
  });
}

function resourceRichSetupTarget(targets: string[], seed: string): string | undefined {
  const board = createBoardDataForSeed(parseMapSeed(seed)).board;
  return [...targets].sort((left, right) => {
    const score = (vertexId: string) => board
      .filter((hex) => hex.vertexIds.includes(vertexId))
      .reduce((total, hex) => total + (hex.resource === "brick" || hex.resource === "wood" ? 20 : hex.resource ? 8 : 0), 0);
    return score(right) - score(left);
  })[0];
}

async function openOnline(context: BrowserContext, mobile = false): Promise<Page> {
  const page = await context.newPage();
  const snapshots: Snapshot[] = [];
  const rejections: CommandRejection[] = [];
  const tickets = { count: 0 };
  const sentCommands: Array<Record<string, unknown>> = [];
  productionWireSnapshots.set(page, snapshots);
  wireCommandRejections.set(page, rejections);
  ticketRequestCounts.set(page, tickets);
  productionWireCommands.set(page, sentCommands);
  page.on("request", (request) => {
    if (request.url().includes("/connection-ticket")) tickets.count += 1;
  });
  page.on("websocket", (socket) => {
    socket.on("framereceived", ({ payload }) => {
      try {
        const message = JSON.parse(String(payload));
        if (message.type === "room.snapshot") snapshots.push(message);
        if (message.type === "command.rejected") rejections.push(message);
      } catch { /* non-JSON frames are not room messages */ }
    });
    socket.on("framesent", ({ payload }) => {
      try {
        const message = JSON.parse(String(payload));
        if (message.type === "match.command") sentCommands.push(message);
      } catch { /* non-JSON frames are not room messages */ }
    });
  });
  if (mobile) await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Online Game" }).click();
  await expect(page.getByRole("heading", { name: "Online Game" })).toBeVisible();
  return page;
}

async function connectProtocolClient(page: Page, roomCode: string): Promise<Snapshot> {
  return page.evaluate(async (code) => {
    const raw = localStorage.getItem(`catan.online.seat.v1:${code}`);
    if (!raw) throw new Error("missing origin-local seat credential");
    const credential = JSON.parse(raw) as { seatToken: string };
    const ticketResponse = await fetch(`/api/rooms/${code}/connection-ticket`, {
      method: "POST",
      headers: { authorization: `Bearer ${credential.seatToken}` }
    });
    if (!ticketResponse.ok) throw new Error(`ticket request failed: ${ticketResponse.status}`);
    const { ticket } = await ticketResponse.json() as { ticket: string };
    const socket = new WebSocket(`${location.origin.replace(/^http/, "ws")}/api/rooms/${code}/connect?ticket=${encodeURIComponent(ticket)}`);
    const messages: any[] = [];
    (window as any).__catanE2E = { socket, messages };
    return await new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("snapshot timeout")), 8_000);
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data));
        messages.push(message);
        if (message.type === "room.snapshot") {
          clearTimeout(timeout);
          resolve(message);
        }
      });
      socket.addEventListener("error", () => reject(new Error("socket failed")), { once: true });
    });
  }, roomCode);
}

async function latestSnapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const messages = (window as any).__catanE2E.messages as any[];
    const snapshots = messages.filter((message) => message.type === "room.snapshot");
    if (!snapshots.length) throw new Error("no room snapshot");
    return snapshots.at(-1);
  });
}

async function send(page: Page, message: Record<string, unknown>): Promise<Snapshot> {
  const commandId = String(message.commandId);
  await page.evaluate((payload) => (window as any).__catanE2E.socket.send(JSON.stringify(payload)), message);
  await expect.poll(async () => {
    return page.evaluate((id) => ((window as any).__catanE2E.messages as any[]).some(
      (entry) => entry.type === "room.snapshot" && entry.acknowledgedCommandId === id
    ), commandId);
  }, { timeout: 8_000 }).toBe(true);
  return latestSnapshot(page);
}

async function sendRejected(page: Page, message: Record<string, unknown>): Promise<any> {
  const commandId = String(message.commandId);
  await page.evaluate((payload) => (window as any).__catanE2E.socket.send(JSON.stringify(payload)), message);
  await expect.poll(async () => page.evaluate((id) => ((window as any).__catanE2E.messages as any[]).some(
    (entry) => entry.type === "command.rejected" && entry.commandId === id
  ), commandId), { timeout: 8_000 }).toBe(true);
  return page.evaluate((id) => ((window as any).__catanE2E.messages as any[]).filter(
    (entry) => entry.type === "command.rejected" && entry.commandId === id
  ).at(-1), commandId);
}

async function sendProtocolInvalid(page: Page, message: Record<string, unknown>): Promise<any> {
  await page.evaluate((payload) => (window as any).__catanE2E.socket.send(JSON.stringify(payload)), message);
  await expect.poll(async () => page.evaluate(() => ((window as any).__catanE2E.messages as any[]).some(
    (entry) => entry.type === "protocol.incompatible"
  )), { timeout: 8_000 }).toBe(true);
  return page.evaluate(() => ((window as any).__catanE2E.messages as any[]).filter(
    (entry) => entry.type === "protocol.incompatible"
  ).at(-1));
}

async function command(page: Page, commandBody: Record<string, unknown>): Promise<Snapshot> {
  const snapshot = await latestSnapshot(page);
  return send(page, {
    type: "match.command",
    commandId: crypto.randomUUID(),
    expectedVersion: snapshot.roomVersion,
    command: commandBody
  });
}

async function waitForVersion(pages: Page[], version: number): Promise<void> {
  await Promise.all(pages.map((page) => expect.poll(
    async () => (await latestSnapshot(page)).roomVersion,
    { timeout: 8_000 }
  ).toBe(version)));
}

async function synchronized(pages: Page[]): Promise<Snapshot[]> {
  const newest = Math.max(...(await Promise.all(pages.map(latestSnapshot))).map((snapshot) => snapshot.roomVersion));
  await waitForVersion(pages, newest);
  return Promise.all(pages.map(latestSnapshot));
}

async function uiMutation(pages: Page[], actor: Page, action: () => Promise<void>): Promise<Snapshot[]> {
  const before = Math.max(...(await synchronized(pages)).map((snapshot) => snapshot.roomVersion));
  await expect(actor.locator(".online-game-shell")).toHaveAttribute("data-room-version", String(before), { timeout: 8_000 });
  const rejectionIndex = wireCommandRejections.get(actor)?.length ?? 0;
  await action();
  await expect.poll(async () => {
    const rejection = wireCommandRejections.get(actor)?.slice(rejectionIndex).at(-1);
    if (rejection) throw new Error(`UI command ${rejection.commandId} was rejected: ${rejection.error.code}`);
    return (await latestSnapshot(actor)).roomVersion;
  }, { timeout: 8_000 }).toBeGreaterThan(before);
  return synchronized(pages);
}

function expectEmptySetup(snapshot: Snapshot): void {
  expect(snapshot.lifecycle).toBe("playing");
  expect(snapshot.publicState.game.phase).toBe("setup");
  expect(snapshot.publicState.game.buildings).toEqual([]);
  expect(snapshot.publicState.game.roads).toEqual([]);
  expect(snapshot.publicState.game.pendingPlayerTrade).toBeUndefined();
  expect(snapshot.publicState.game.setup).toMatchObject({ stage: "settlement" });
  expect(snapshot.publicState.guild.gathering).toMatchObject({ phase: "idle", auctionRound: 1 });
  expect(snapshot.publicState.submittedBidSeatIds).toEqual([]);
  expect(Object.values(snapshot.privateState.resources as Record<string, number>)).toEqual([0, 0, 0, 0, 0]);
  expect(snapshot.privateState.developmentCards).toEqual([]);
  expect(snapshot.privateState.requiredDecision).toBeUndefined();
}

async function confirmHostRestart(
  pages: Page[],
  host: Page,
  label: "Replay Current Map" | "New Random Map"
): Promise<Snapshot[]> {
  const before = Math.max(...(await synchronized(pages)).map((snapshot) => snapshot.roomVersion));
  await host.getByRole("button", { name: "Open settings" }).click();
  await host.getByRole("button", { name: label }).click();
  await expect(host.locator(".restart-confirmation")).toBeVisible();
  await host.getByRole("button", { name: "Confirm Restart" }).click();
  await waitForVersion(pages, before + 1);
  const after = await synchronized(pages);
  expect(after.map((snapshot) => snapshot.roomVersion)).toEqual([before + 1, before + 1, before + 1]);
  after.forEach(expectEmptySetup);
  return after;
}

async function resolveSeven(pages: Page[]): Promise<boolean> {
  let completedVictimSteal = false;
  for (let guard = 0; guard < 8; guard += 1) {
    const snapshots = await synchronized(pages);
    const phase = snapshots[0].publicState.game.turnState.phase;
    if (phase === "awaitingDiscards") {
      const index = snapshots.findIndex((snapshot) => snapshot.privateState.requiredDecision?.kind === "discardResources");
      if (index < 0) throw new Error("discard phase has no caller decision");
      const required = snapshots[index].privateState.requiredDecision.count as number;
      const available = snapshots[index].privateState.resources as Record<string, number>;
      const discarded: Record<string, number> = { wood: 0, brick: 0, grain: 0, wool: 0, ore: 0 };
      let remaining = required;
      for (const resource of Object.keys(discarded)) {
        const amount = Math.min(remaining, available[resource]);
        discarded[resource] = amount;
        remaining -= amount;
      }
      await uiMutation(pages, pages[index], async () => {
        const nickname = snapshots[index].publicState.seats.find(
          (seat: any) => seat.playerId === snapshots[index].privateState.playerId
        ).nickname;
        for (const [resource, amount] of Object.entries(discarded)) {
          await pages[index].getByLabel(`${nickname} ${resource} discard`).fill(String(amount));
        }
        await pages[index].getByRole("button", { name: "Submit Discard" }).click();
      });
      continue;
    }
    if (phase === "awaitingRobberPlacement") {
      const index = snapshots.findIndex((snapshot) => snapshot.allowedActions.decisions.robberHex.enabled);
      const hexId = snapshots[index].allowedActions.decisions.robberHex.targets[0];
      await uiMutation(pages, pages[index], async () => {
        await pages[index].locator(`[data-robber-target="${hexId}"]`).press("Enter");
      });
      continue;
    }
    if (phase === "awaitingRobberVictim") {
      const index = snapshots.findIndex((snapshot) => snapshot.allowedActions.decisions.robberVictim.enabled);
      const victimId = snapshots[index].allowedActions.decisions.robberVictim.targets[0];
      const victimIndex = snapshots.findIndex((snapshot) => snapshot.privateState.playerId === victimId);
      const count = (resources: Record<string, number>) => Object.values(resources).reduce((sum, amount) => sum + amount, 0);
      const actorBefore = count(snapshots[index].privateState.resources);
      const victimBefore = count(snapshots[victimIndex].privateState.resources);
      const victimName = snapshots[index].publicState.seats.find((seat: any) => seat.playerId === victimId).nickname;
      const after = await uiMutation(pages, pages[index], async () => {
        await pages[index].locator('[data-turn-flow="robber-victim"]').getByRole("button", { name: victimName }).click();
      });
      expect(after[0].publicState.game.turnState.phase).not.toBe("awaitingRobberVictim");
      expect(count(after[index].privateState.resources)).toBe(actorBefore + 1);
      expect(count(after[victimIndex].privateState.resources)).toBe(victimBefore - 1);
      completedVictimSteal = true;
      continue;
    }
    return completedVictimSteal;
  }
  throw new Error("seven flow did not converge");
}

async function submitAuctionRound(
  pages: Page[],
  preferPositive: boolean,
  onUiBid: (index: number) => void
): Promise<boolean> {
  let submittedPositive = false;
  for (let index = 0; index < pages.length; index += 1) {
    const snapshots = await synchronized(pages);
    if (snapshots[0].publicState.guild.gathering.phase !== "auction") break;
    const own = snapshots[index];
    const max = own.allowedActions.sealedBid.maxAmount as number;
    const amount: number = preferPositive && !submittedPositive && max > 0 ? 1 : 0;
    const projectedAfterBid = await uiMutation(pages, pages[index], async () => {
      await pages[index].getByRole("tab", { name: "Commerce Guild" }).click();
      const bidInput = pages[index].getByLabel("Your sealed bid");
      const submitButton = pages[index].getByRole("button", { name: "Submit sealed bid" });
      await expect(bidInput).toBeEnabled();
      await expect(submitButton).toBeEnabled();
      await bidInput.fill(String(amount));
      await submitButton.click();
    });
    onUiBid(index);
    const projected = projectedAfterBid;
    const submittedSeatIds = projected[0].publicState.submittedBidSeatIds as string[];
    if (
      projected[0].publicState.guild.gathering.phase === "auction" &&
      submittedSeatIds.includes(projected[index].privateState.seatId)
    ) {
      expect(projected[index].privateState.ownPendingBid).toBe(amount);
      expect(submittedSeatIds).toContain(projected[index].privateState.seatId);
      expect(JSON.stringify(projected[0].publicState)).not.toContain("bidsBySeatId");
      for (let opponent = index + 1; opponent < projected.length; opponent += 1) {
        expect(projected[opponent].privateState.ownPendingBid).toBeUndefined();
      }
    }
    submittedPositive ||= amount > 0;
  }
  return submittedPositive;
}

async function startThreeBrowserRoom(contexts: BrowserContext[]): Promise<{
  pages: Page[];
  host: Page;
  second: Page;
  third: Page;
  roomCode: string;
  initial: Snapshot[];
}> {
  const [host, second, third] = await Promise.all([
    openOnline(contexts[0]),
    openOnline(contexts[1]),
    openOnline(contexts[2], true)
  ]);
  const pages = [host, second, third];

  await host.getByLabel("Create nickname").fill("Host");
  await host.getByRole("button", { name: "Create room", exact: true }).click();
  await expect(host.getByRole("heading", { name: "Private online room" })).toBeVisible();
  const roomCode = (await host.locator(".room-code-card strong").textContent())!;
  expect(roomCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);

  for (const [page, nickname] of [[second, "Second"], [third, "Third"]] as const) {
    await page.getByLabel("Join room code").fill(roomCode);
    await page.getByLabel("Join nickname").fill(nickname);
    await page.getByRole("button", { name: "Join room", exact: true }).click();
    await expect(page.locator(".room-code-card strong")).toHaveText(roomCode);
  }
  await expect(host.locator(".seat-card")).toHaveCount(3);

  for (let index = 0; index < pages.length; index += 1) {
    await pages[index].getByRole("button", { name: "Set ready" }).click();
    await expect(pages[index].getByRole("button", { name: "Set not ready" })).toBeVisible();
    await expect(host.locator(".seat-state--ready")).toHaveCount(index + 1);
  }
  await expect(host.getByRole("button", { name: "Start online game" })).toBeEnabled();
  await host.getByRole("button", { name: "Start online game" }).click();
  await expect(host.locator(".online-game-shell")).toBeVisible();
  await expect(third.locator(".online-game-shell")).toBeVisible();

  const initial = await Promise.all(pages.map((page) => connectProtocolClient(page, roomCode)));
  return { pages, host, second, third, roomCode, initial };
}

async function completeOnlineSetup(pages: Page[]): Promise<Snapshot[]> {
  for (let placement = 0; placement < pages.length * 2; placement += 1) {
    const snapshots = await synchronized(pages);
    const activeIndex = snapshots.findIndex((snapshot) =>
      snapshot.privateState.playerId === snapshot.publicState.game.activePlayerId
    );
    const vertexId = resourceRichSetupTarget(
      snapshots[activeIndex].allowedActions.setup.settlement.targets,
      snapshots[activeIndex].publicState.game.mapSeed
    );
    if (!vertexId) throw new Error("No Online setup settlement target was available");
    const settlement = await command(pages[activeIndex], {
      type: "PLACE_SETUP_SETTLEMENT",
      vertexId
    });
    await waitForVersion(pages, settlement.roomVersion);
    const edgeId = settlement.allowedActions.setup.road.targets[0];
    if (!edgeId) throw new Error("No Online setup road target was available");
    const road = await command(pages[activeIndex], { type: "PLACE_SETUP_ROAD", edgeId });
    await waitForVersion(pages, road.roomVersion);
  }
  return synchronized(pages);
}

async function advanceOnlineCleanTurn(pages: Page[]): Promise<Snapshot[]> {
  let snapshots = await synchronized(pages);
  const activeIndex = snapshots.findIndex((snapshot) =>
    snapshot.privateState.playerId === snapshot.publicState.game.activePlayerId
  );
  if (snapshots[0].publicState.game.turnState.phase === "awaitingRoll") {
    const rolled = await command(pages[activeIndex], { type: "ROLL_DICE" });
    await waitForVersion(pages, rolled.roomVersion);
    await resolveSeven(pages);
    snapshots = await synchronized(pages);
  }
  expect(snapshots[0].publicState.game.turnState.phase).toBe("action");
  const ended = await command(pages[activeIndex], { type: "END_TURN" });
  await waitForVersion(pages, ended.roomVersion);
  return synchronized(pages);
}

test("three isolated callers share cooldown authority and reconnect without client-supplied identity", async ({ browser }) => {
  test.setTimeout(150_000);
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  try {
    const { pages, third, roomCode } = await startThreeBrowserRoom(contexts);

    let snapshots = await completeOnlineSetup(pages);
    expect(snapshots.map((snapshot) => snapshot.publicState.guild.gathering.cooldownRemaining))
      .toEqual([6, 6, 6]);
    for (const snapshot of snapshots) {
      expect(snapshot.publicState.guild.gathering).not.toHaveProperty("availableAtTurn");
      expect(snapshot.publicState.guild.gathering).not.toHaveProperty("displayDuration");
      expect(snapshot.privateState).not.toHaveProperty("gatheringCooldown");
    }
    for (const page of pages) {
      await page.getByRole("tab", { name: "Commerce Guild" }).click();
      await expect(page.locator('[data-gathering-cooldown="6"]')).toHaveCount(1);
    }

    for (let completedTurn = 1; completedTurn <= 6; completedTurn += 1) {
      snapshots = await advanceOnlineCleanTurn(pages);
      const remaining = 6 - completedTurn;
      expect(snapshots.map((snapshot) => snapshot.publicState.guild.gathering.cooldownRemaining))
        .toEqual([remaining, remaining, remaining]);
    }

    const activeIndex = snapshots.findIndex((snapshot) =>
      snapshot.privateState.playerId === snapshot.publicState.game.activePlayerId
    );
    expect(snapshots.map((snapshot) => snapshot.allowedActions.commerce.startGathering.enabled))
      .toEqual([false, false, false]);
    const rolled = await command(pages[activeIndex], { type: "ROLL_DICE" });
    await waitForVersion(pages, rolled.roomVersion);
    await resolveSeven(pages);
    snapshots = await synchronized(pages);
    expect(snapshots[0].publicState.game.turnState.phase).toBe("action");
    expect(snapshots.map((snapshot) => snapshot.allowedActions.commerce.startGathering.enabled))
      .toEqual(pages.map((_, index) => index === activeIndex));

    const nonCurrentIndex = (activeIndex + 1) % pages.length;
    const beforeNonCurrent = snapshots[0].roomVersion;
    const nonCurrentId = crypto.randomUUID();
    const nonCurrent = await sendRejected(pages[nonCurrentIndex], {
      type: "match.command",
      commandId: nonCurrentId,
      expectedVersion: beforeNonCurrent,
      command: { type: "START_GATHERING" }
    });
    expect(nonCurrent).toMatchObject({
      type: "command.rejected",
      commandId: nonCurrentId,
      error: { code: "RULE_VIOLATION" }
    });
    expect((await synchronized(pages)).map((snapshot) => snapshot.roomVersion))
      .toEqual([beforeNonCurrent, beforeNonCurrent, beforeNonCurrent]);

    const staleId = crypto.randomUUID();
    const stale = await sendRejected(pages[activeIndex], {
      type: "match.command",
      commandId: staleId,
      expectedVersion: beforeNonCurrent - 1,
      command: { type: "START_GATHERING" }
    });
    expect(stale).toMatchObject({
      type: "command.rejected",
      commandId: staleId,
      error: { code: "VERSION_CONFLICT" }
    });
    expect((await synchronized(pages)).map((snapshot) => snapshot.roomVersion))
      .toEqual([beforeNonCurrent, beforeNonCurrent, beforeNonCurrent]);

    const sentBefore = productionWireCommands.get(pages[activeIndex])!.length;
    snapshots = await uiMutation(pages, pages[activeIndex], async () => {
      await pages[activeIndex].getByRole("tab", { name: "Commerce Guild" }).click();
      await pages[activeIndex].getByRole("button", { name: "Start Gathering" }).click();
    });
    expect(snapshots.map((snapshot) => snapshot.roomVersion))
      .toEqual([beforeNonCurrent + 1, beforeNonCurrent + 1, beforeNonCurrent + 1]);
    expect(snapshots.map((snapshot) => snapshot.publicState.guild.gathering.cooldownRemaining))
      .toEqual([3, 3, 3]);
    const startIntent = productionWireCommands.get(pages[activeIndex])!
      .slice(sentBefore)
      .find((message: any) => message.command?.type === "START_GATHERING") as any;
    expect(startIntent).toBeTruthy();
    expect(startIntent.command).toEqual({ type: "START_GATHERING" });

    const completed = await command(pages[activeIndex], { type: "OPEN_AUCTION" });
    await waitForVersion(pages, completed.roomVersion);
    expect(completed.publicState.guild.gathering.phase).toBe("complete");
    snapshots = await advanceOnlineCleanTurn(pages);
    expect(snapshots.map((snapshot) => snapshot.publicState.guild.gathering.cooldownRemaining))
      .toEqual([3, 3, 3]);

    for (let subsequentTurn = 1; subsequentTurn <= 3; subsequentTurn += 1) {
      snapshots = await advanceOnlineCleanTurn(pages);
      const remaining = 3 - subsequentTurn;
      expect(snapshots.map((snapshot) => snapshot.publicState.guild.gathering.cooldownRemaining))
        .toEqual([remaining, remaining, remaining]);
    }

    await third.evaluate(() => (window as any).__catanE2E.socket.close(1000, "reconnect proof"));
    const reconnected = await connectProtocolClient(third, roomCode);
    expect(reconnected.roomVersion).toBeGreaterThanOrEqual(snapshots[0].roomVersion);
    expect(reconnected.publicState.guild.gathering.cooldownRemaining).toBe(0);
    expect(reconnected.publicState.guild.gathering).not.toHaveProperty("availableAtTurn");
    await waitForVersion(pages, reconnected.roomVersion);
    snapshots = await synchronized(pages);
    expect(snapshots.map((snapshot) => snapshot.roomVersion))
      .toEqual([reconnected.roomVersion, reconnected.roomVersion, reconnected.roomVersion]);
    expect(snapshots.map((snapshot) => snapshot.publicState.guild.gathering.cooldownRemaining))
      .toEqual([0, 0, 0]);

    const beforeInvalid = await synchronized(pages);
    const thirdGameplayBeforeInvalid = authoritativeGameplayProjection(beforeInvalid[2]);
    const invalid = await sendProtocolInvalid(third, {
      type: "match.command",
      commandId: crypto.randomUUID(),
      expectedVersion: beforeInvalid[2].roomVersion,
      command: {
        type: "START_GATHERING",
        playerId: beforeInvalid[2].privateState.playerId,
        remainingTurns: 0,
        availableAtTurn: 0
      }
    });
    expect(invalid).toMatchObject({
      type: "protocol.incompatible",
      error: { code: "PROTOCOL_INCOMPATIBLE", params: { expected: 3 } }
    });
    expect((await synchronized(pages)).map((snapshot) => snapshot.roomVersion))
      .toEqual(beforeInvalid.map((snapshot) => snapshot.roomVersion));
    const recoveredAfterInvalid = await connectProtocolClient(third, roomCode);
    expect(recoveredAfterInvalid.roomVersion).toBeGreaterThanOrEqual(beforeInvalid[2].roomVersion);
    expect(recoveredAfterInvalid.publicState.guild.gathering.cooldownRemaining).toBe(0);
    await waitForVersion(pages, recoveredAfterInvalid.roomVersion);
    const afterInvalidRecovery = await synchronized(pages);
    expect(authoritativeGameplayProjection(afterInvalidRecovery[2]))
      .toEqual(thirdGameplayBeforeInvalid);
    expect(afterInvalidRecovery.map((snapshot) => snapshot.publicState.guild.gathering.cooldownRemaining))
      .toEqual([0, 0, 0]);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test("three real browsers converge on host restarts and participant reconnect", async ({ browser }, testInfo) => {
  test.setTimeout(90_000);
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  await Promise.all(contexts.map(trackProductionSockets));

  try {
    const { pages, host, second, third, roomCode, initial } = await startThreeBrowserRoom(contexts);
    expect(await third.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    initial.forEach(expectEmptySetup);
    const initialSeed = initial[0].publicState.game.mapSeed as string;
    expect(initialSeed).toMatch(/^M1-[0-9A-F]{16}$/);
    expect(initial.map((snapshot) => snapshot.publicState.game.mapSeed)).toEqual([
      initialSeed, initialSeed, initialSeed
    ]);
    await Promise.all(pages.map((page) => expect(page.locator(".hex-tile")).toHaveCount(19)));
    await Promise.all(pages.map((page) => expect(page.locator(".port-marker")).toHaveCount(9)));
    const initialLayouts = await Promise.all(pages.map(publicBoardSignature));
    expect(new Set(initialLayouts).size).toBe(1);

    for (let index = 0; index < pages.length; index += 1) {
      await pages[index].getByRole("button", { name: "Open settings" }).click();
      await expect(pages[index].locator("[data-map-seed]")).toHaveValue(initialSeed);
      await expect(pages[index].getByRole("button", { name: "Copy Seed" })).toBeVisible();
      const expectedRestartCount = index === 0 ? 1 : 0;
      await expect(pages[index].getByRole("button", { name: "New Random Map" })).toHaveCount(expectedRestartCount);
      await expect(pages[index].getByRole("button", { name: "Replay Current Map" })).toHaveCount(expectedRestartCount);
      await pages[index].getByRole("button", { name: "Close utility panel" }).click();
    }

    const beforeDenied = await synchronized(pages);
    const deniedCommandId = crypto.randomUUID();
    const denied = await sendRejected(second, {
      type: "room.restart",
      commandId: deniedCommandId,
      expectedVersion: beforeDenied[1].roomVersion,
      mode: "fresh"
    });
    expect(denied).toMatchObject({
      type: "command.rejected",
      commandId: deniedCommandId,
      error: { code: "COMMAND_NOT_ALLOWED", retryable: false }
    });
    expect(await synchronized(pages)).toEqual(beforeDenied);

    const sameMap = await confirmHostRestart(pages, host, "Replay Current Map");
    expect(sameMap.map((snapshot) => snapshot.publicState.game.mapSeed)).toEqual([
      initialSeed, initialSeed, initialSeed
    ]);
    const sameLayouts = await Promise.all(pages.map(publicBoardSignature));
    expect(sameLayouts).toEqual(initialLayouts);

    const freshMap = await confirmHostRestart(pages, host, "New Random Map");
    const freshSeed = freshMap[0].publicState.game.mapSeed as string;
    expect(freshSeed).toMatch(/^M1-[0-9A-F]{16}$/);
    expect(freshSeed).not.toBe(initialSeed);
    expect(freshMap.map((snapshot) => snapshot.publicState.game.mapSeed)).toEqual([
      freshSeed, freshSeed, freshSeed
    ]);
    const freshLayouts = await Promise.all(pages.map(publicBoardSignature));
    expect(new Set(freshLayouts).size).toBe(1);
    expect(freshLayouts[0]).not.toBe(initialLayouts[0]);
    const hostRestartScreenshot = await host.screenshot({ path: testInfo.outputPath("online-host-fresh-setup-desktop.png") });
    await testInfo.attach("online-host-fresh-setup-desktop", { body: hostRestartScreenshot, contentType: "image/png" });
    const mobileRestartScreenshot = await third.screenshot({ path: testInfo.outputPath("online-participant-fresh-setup-mobile.png") });
    await testInfo.attach("online-participant-fresh-setup-mobile", { body: mobileRestartScreenshot, contentType: "image/png" });

    await second.evaluate(() => (window as any).__catanE2E.socket.close(1000, "restart reconnect proof"));
    await second.reload();
    await expect(second.locator(".online-game-shell")).toBeVisible({ timeout: 20_000 });
    const restartRecovered = await connectProtocolClient(second, roomCode);
    expect(restartRecovered.roomVersion).toBeGreaterThanOrEqual(freshMap[1].roomVersion);
    expect(restartRecovered.publicState.game.mapSeed).toBe(freshSeed);
    expect(restartRecovered.privateState.seatId).toBe(initial[1].privateState.seatId);
    expectEmptySetup(restartRecovered);
    expect(await publicBoardSignature(second)).toBe(freshLayouts[1]);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test("three real browsers play an authoritative private room and reconnect", async ({ browser }) => {
  test.setTimeout(180_000);
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  await Promise.all(contexts.map(trackProductionSockets));

  try {
    const { pages, host, second, third, roomCode, initial } = await startThreeBrowserRoom(contexts);
    expect(await third.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const uiDriven = {
      setup: new Set<number>(), roll: false, build: false, maritime: false,
      publish: false, accept: false, endTurn: false, startGathering: false,
      openAuction: false, sealedBid: new Set<number>()
    };
    for (const [viewerIndex, snapshot] of initial.entries()) {
      expect(snapshot.lifecycle).toBe("playing");
      expect(snapshot.privateState.resources).toBeTruthy();
      expect(snapshot.privateState.developmentCards).toBeTruthy();
      const players = snapshot.publicState.game.players;
      expect(players).toHaveLength(3);
      for (const [playerIndex, player] of players.entries()) {
        expect(player).not.toHaveProperty("resources");
        expect(player).not.toHaveProperty("developmentCards");
        if (playerIndex !== viewerIndex) expect(player).toHaveProperty("resourceCardCount");
      }
    }

    for (let placement = 0; placement < 6; placement += 1) {
      const snapshots = await Promise.all(pages.map(latestSnapshot));
      const activeIndex = snapshots.findIndex((snapshot) =>
        snapshot.privateState.playerId === snapshot.publicState.game.activePlayerId
      );
      const settlement = resourceRichSetupTarget(
        snapshots[activeIndex].allowedActions.setup.settlement.targets,
        snapshots[activeIndex].publicState.game.mapSeed
      );
      expect(settlement).toBeTruthy();
      let after = await uiMutation(pages, pages[activeIndex], async () => {
        await pages[activeIndex].locator(`[data-board-action-target="setupSettlement"][aria-label*="${settlement}"]`).press("Enter");
      });
      const road = after[activeIndex].allowedActions.setup.road.targets[0];
      expect(road).toBeTruthy();
      after = await uiMutation(pages, pages[activeIndex], async () => {
        await pages[activeIndex].locator(`[data-board-action-target="setupRoad"][aria-label*="${road}"]`).press("Enter");
      });
      uiDriven.setup.add(activeIndex);
    }

    const ready = await Promise.all(pages.map(latestSnapshot));
    expect(ready[0].publicState.game.phase).toBe("playing");
    const activeIndex = ready.findIndex((snapshot) => snapshot.privateState.playerId === snapshot.publicState.game.activePlayerId);
    const rolledViews = await uiMutation(pages, pages[activeIndex], async () => {
      await pages[activeIndex].getByRole("button", { name: "Roll Dice" }).click();
    });
    uiDriven.roll = true;
    const rolled = rolledViews[activeIndex];
    expect(rolled.publicState.game.lastDice.first).toBeGreaterThanOrEqual(1);
    expect(rolled.publicState.game.lastDice.second).toBeGreaterThanOrEqual(1);
    expect(rolled.acknowledgedCommandId).toMatch(/^[0-9a-f-]{36}$/i);
    const diceLog = rolled.publicState.game.log.find((entry: any) => entry.messageKey === "dice.rolled");
    expect(diceLog.id).toMatch(/^e2e-log-\d+-\d+$/);

    let builtPiece = false;
    let maritimeTrade = false;
    let publicTrade = false;
    let robberVictim = await resolveSeven(pages);
    let positiveAuction = false;
    let zeroBidRound = false;

    for (let turn = 0; turn < 150 && !(builtPiece && maritimeTrade && publicTrade && robberVictim && positiveAuction && zeroBidRound); turn += 1) {
      let snapshots = await synchronized(pages);
      const resolvedPendingSeven = await resolveSeven(pages);
      robberVictim ||= resolvedPendingSeven;
      snapshots = await synchronized(pages);
      const playerIndex = snapshots.findIndex((snapshot) => snapshot.privateState.playerId === snapshot.publicState.game.activePlayerId);

      const auctionOpener = snapshots.findIndex((snapshot) => snapshot.allowedActions.commerce.openAuction.enabled);
      if (auctionOpener >= 0) {
        const tokensBefore = snapshots[0].publicState.game.players.reduce((sum: number, player: any) => sum + player.guildTokens, 0);
        snapshots = await uiMutation(pages, pages[auctionOpener], async () => {
          await pages[auctionOpener].getByRole("tab", { name: "Commerce Guild" }).click();
          await pages[auctionOpener].getByRole("button", { name: "Open Auctions" }).click();
        });
        uiDriven.openAuction = true;
        expect(tokensBefore).toBeGreaterThan(0);
        while (snapshots[0].publicState.guild.gathering.phase === "auction") {
          const usedPositive = await submitAuctionRound(
            pages,
            !positiveAuction,
            (index) => uiDriven.sealedBid.add(index)
          );
          positiveAuction ||= usedPositive;
          zeroBidRound ||= !usedPositive;
          snapshots = await synchronized(pages);
        }
      }

      if (snapshots[0].publicState.game.turnState.phase === "awaitingRoll") {
        const next = await command(pages[playerIndex], { type: "ROLL_DICE" });
        expect(next.publicState.game.lastDice.total).toBeGreaterThanOrEqual(2);
        const resolvedRolledSeven = await resolveSeven(pages);
        robberVictim ||= resolvedRolledSeven;
        snapshots = await synchronized(pages);
      }
      if (snapshots[0].publicState.game.turnState.phase !== "action") continue;

      const active = snapshots[playerIndex];
      const slot = active.allowedActions.commerce.tradeSlots.find((entry: any) => entry.enabled);
      if (slot) {
        await command(pages[playerIndex], { type: "COMPLETE_TRADE_SLOT", slotId: slot.id });
        snapshots = await synchronized(pages);
      }

      if (!builtPiece) {
        const actions = snapshots[playerIndex].allowedActions.turn;
        if (actions.road.enabled && actions.road.targets[0]) {
          const edgeId = actions.road.targets[0];
          snapshots = await uiMutation(pages, pages[playerIndex], async () => {
            await pages[playerIndex].locator('[data-action="build-road"]').click();
            await pages[playerIndex].locator(`[data-board-action-target="road"][aria-label*="${edgeId}"]`).press("Enter");
          });
          builtPiece = true;
          uiDriven.build = true;
        } else if (actions.settlement.enabled && actions.settlement.targets[0]) {
          await command(pages[playerIndex], { type: "BUILD_SETTLEMENT", vertexId: actions.settlement.targets[0] });
          builtPiece = true;
        } else if (actions.city.enabled && actions.city.targets[0]) {
          await command(pages[playerIndex], { type: "BUILD_CITY", buildingId: actions.city.targets[0] });
          builtPiece = true;
        }
        if (builtPiece) snapshots = await synchronized(pages);
      }

      if (!maritimeTrade) {
        const trade = snapshots[playerIndex].allowedActions.maritime.trades[0];
        if (snapshots[playerIndex].allowedActions.maritime.enabled && trade?.receives?.[0]) {
          snapshots = await uiMutation(pages, pages[playerIndex], async () => {
            await pages[playerIndex].locator(`[data-maritime-give="${trade.give}"]`).click();
            await pages[playerIndex].locator(`[data-maritime-receive="${trade.receives[0]}"]`).click();
            await pages[playerIndex].getByRole("button", { name: "Maritime", exact: true }).click();
          });
          maritimeTrade = true;
          uiDriven.maritime = true;
          snapshots = await synchronized(pages);
        }
      }

      if (!publicTrade && snapshots[playerIndex].allowedActions.publicTrade.publish.enabled) {
        const own = snapshots[playerIndex].privateState.resources as Record<string, number>;
        const offered = Object.keys(own).find((resource) => own[resource] > 0);
        const recipientIndex = snapshots.findIndex((snapshot, index) => index !== playerIndex &&
          Object.values(snapshot.privateState.resources as Record<string, number>).some((amount) => amount > 0));
        if (offered && recipientIndex >= 0) {
          const recipientResources = snapshots[recipientIndex].privateState.resources as Record<string, number>;
          const requested = Object.keys(recipientResources).find((resource) => recipientResources[resource] > 0);
          if (requested) {
            const label = (resource: string) => resource[0].toUpperCase() + resource.slice(1);
            snapshots = await uiMutation(pages, pages[playerIndex], async () => {
              await pages[playerIndex].getByLabel(`Offer ${label(offered)}`).fill("1");
              await pages[playerIndex].getByLabel(`Request ${label(requested)}`).fill("1");
              await pages[playerIndex].getByRole("button", { name: "Publish Public Offer" }).click();
            });
            uiDriven.publish = true;
            if (snapshots[recipientIndex].allowedActions.publicTrade.accept.enabled) {
              snapshots = await uiMutation(pages, pages[recipientIndex], async () => {
                await pages[recipientIndex].getByRole("button", { name: new RegExp("^Accept as ") }).click();
              });
              publicTrade = true;
              uiDriven.accept = true;
            } else {
              await command(pages[playerIndex], { type: "CANCEL_PLAYER_TRADE" });
              snapshots = await synchronized(pages);
            }
          }
        }
      }

      const totalGuildTokens = snapshots[0].publicState.game.players.reduce(
        (sum: number, player: any) => sum + player.guildTokens,
        0
      );
      if (totalGuildTokens > 0 && snapshots[playerIndex].allowedActions.commerce.startGathering.enabled) {
        snapshots = await uiMutation(pages, pages[playerIndex], async () => {
          await pages[playerIndex].getByRole("tab", { name: "Commerce Guild" }).click();
          await pages[playerIndex].getByRole("button", { name: "Start Gathering" }).click();
        });
        uiDriven.startGathering = true;
      }
      snapshots = await synchronized(pages);
      if (snapshots[playerIndex].allowedActions.turn.endTurn.enabled) {
        await uiMutation(pages, pages[playerIndex], async () => {
          await pages[playerIndex].getByRole("button", { name: "End Turn" }).click();
        });
        uiDriven.endTurn = true;
      }
    }

    expect({
      builtPiece, maritimeTrade, publicTrade, robberVictim, positiveAuction, zeroBidRound,
    }).toMatchObject({
      builtPiece: true,
      maritimeTrade: true,
      publicTrade: true,
      robberVictim: true,
      positiveAuction: true,
      zeroBidRound: true
    });
    expect({ ...uiDriven, setup: uiDriven.setup.size, sealedBid: uiDriven.sealedBid.size }).toMatchObject({
      setup: 3, roll: true, build: true, maritime: true, publish: true, accept: true,
      endTurn: true, startGathering: true, openAuction: true, sealedBid: 3
    });

    const privateViews = await synchronized(pages);
    const awardedCards = privateViews.flatMap((snapshot, owner) =>
      (snapshot.privateState.developmentCards as Array<{ id: string; kind: string }>).map((card) => ({ card, owner }))
    );
    expect(awardedCards).toHaveLength(1);
    for (let owner = 0; owner < privateViews.length; owner += 1) {
      for (const card of privateViews[owner].privateState.developmentCards as Array<{ id: string; kind: string }>) {
        expect(card.id).toBeTruthy();
        expect(card.kind).toBeTruthy();
        for (let opponent = 0; opponent < privateViews.length; opponent += 1) {
          if (opponent === owner) continue;
          const opponentCards = privateViews[opponent].privateState.developmentCards as Array<{ id: string; kind: string }>;
          expect(opponentCards).not.toContainEqual(expect.objectContaining({ id: card.id }));
          expect(JSON.stringify(privateViews[opponent].publicState)).not.toContain(card.id);
        }
      }
    }
    expect(privateViews[0].publicState.guild.gathering.lastAuctionResult.outcome).toEqual({ kind: "developmentCard" });

    const retainedCredential = await second.evaluate((code) => localStorage.getItem(`catan.online.seat.v1:${code}`), roomCode);
    expect(retainedCredential).toContain("seatToken");
    await second.evaluate(() => (window as any).__catanE2E.socket.close(1000, "observer complete"));
    const ticketsBefore = ticketRequestCounts.get(second)!.count;
    const handBefore = await second.locator(".player-card").filter({ hasText: "Second" }).locator(".resource-strip").innerText();
    await contexts[1].setOffline(true);
    await second.evaluate(() => {
      const observer = (window as any).__catanE2E.socket as WebSocket;
      for (const socket of (window as any).__catanTrackedSockets as WebSocket[]) {
        if (socket !== observer && socket.readyState < WebSocket.CLOSING) socket.close(1000, "offline test");
      }
    });
    await expect(second.locator(".connection-badge")).toHaveText(/Reconnecting|Offline/, { timeout: 12_000 });
    await contexts[1].setOffline(false);
    await expect(second.locator(".connection-badge")).toHaveText("Connected", { timeout: 20_000 });
    await expect.poll(() => ticketRequestCounts.get(second)!.count, { timeout: 20_000 }).toBeGreaterThan(ticketsBefore);
    const serverVersion = Math.max(...(await synchronized([host, third])).map((snapshot) => snapshot.roomVersion));
    await expect.poll(() => productionWireSnapshots.get(second)!.at(-1)?.roomVersion ?? -1, { timeout: 20_000 })
      .toBeGreaterThanOrEqual(serverVersion);
    const recovered = productionWireSnapshots.get(second)!.at(-1)!;
    expect(recovered.privateState.seatId).toBe(initial[1].privateState.seatId);
    expect(await second.locator(".player-card").filter({ hasText: "Second" }).locator(".resource-strip").innerText()).toBe(handBefore);

    const ticketsBeforeReload = ticketRequestCounts.get(second)!.count;
    const snapshotsBeforeReload = productionWireSnapshots.get(second)!.length;
    let createOrJoinRequests = 0;
    const countBootstrap = (request: import("@playwright/test").Request) => {
      const url = new URL(request.url());
      if (request.method() === "POST" &&
        (url.pathname === "/api/rooms" || url.pathname.endsWith("/join"))) {
        createOrJoinRequests += 1;
      }
    };
    second.on("request", countBootstrap);
    await second.reload();
    await expect(second.locator(".online-game-shell")).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => ticketRequestCounts.get(second)!.count, { timeout: 20_000 })
      .toBeGreaterThan(ticketsBeforeReload);
    await expect.poll(() => productionWireSnapshots.get(second)!.length, { timeout: 20_000 })
      .toBeGreaterThan(snapshotsBeforeReload);
    second.off("request", countBootstrap);
    expect(createOrJoinRequests).toBe(0);
    const reloaded = productionWireSnapshots.get(second)!.at(-1)!;
    expect(reloaded.roomVersion).toBeGreaterThanOrEqual(recovered.roomVersion);
    expect(reloaded.privateState.seatId).toBe(initial[1].privateState.seatId);
    expect(reloaded.privateState.resources).toBeTruthy();
    expect(reloaded.privateState.developmentCards).toBeTruthy();
    expect(await second.locator(".player-card").filter({ hasText: "Second" }).locator(".resource-strip").innerText())
      .toBe(handBefore);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test("a real no-token Commerce auction exits without opening sealed bids", async ({ browser }) => {
  test.setTimeout(90_000);
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  try {
    const pages = await Promise.all(contexts.map((context) => openOnline(context)));
    const [host, second, third] = pages;
    await host.getByLabel("Create nickname").fill("ZeroHost");
    await host.getByRole("button", { name: "Create room", exact: true }).click();
    await expect(host.getByRole("heading", { name: "Private online room" })).toBeVisible();
    const roomCode = (await host.locator(".room-code-card strong").textContent())!;

    for (const [page, nickname] of [[second, "ZeroTwo"], [third, "ZeroThree"]] as const) {
      await page.getByLabel("Join room code").fill(roomCode);
      await page.getByLabel("Join nickname").fill(nickname);
      await page.getByRole("button", { name: "Join room", exact: true }).click();
      await expect(page.locator(".room-code-card strong")).toHaveText(roomCode);
    }
    for (let index = 0; index < pages.length; index += 1) {
      await pages[index].getByRole("button", { name: "Set ready" }).click();
      await expect(pages[index].getByRole("button", { name: "Set not ready" })).toBeVisible();
      await expect(host.locator(".seat-state--ready")).toHaveCount(index + 1);
    }
    await host.getByRole("button", { name: "Start online game" }).click();
    await expect(host.locator(".online-game-shell")).toBeVisible();
    await Promise.all(pages.map((page) => connectProtocolClient(page, roomCode)));

    for (let placement = 0; placement < 6; placement += 1) {
      const snapshots = await synchronized(pages);
      const activeIndex = snapshots.findIndex((snapshot) =>
        snapshot.privateState.playerId === snapshot.publicState.game.activePlayerId
      );
      const vertexId = resourceRichSetupTarget(
        snapshots[activeIndex].allowedActions.setup.settlement.targets,
        snapshots[activeIndex].publicState.game.mapSeed
      )!;
      const settlement = await command(pages[activeIndex], { type: "PLACE_SETUP_SETTLEMENT", vertexId });
      await waitForVersion(pages, settlement.roomVersion);
      const edgeId = settlement.allowedActions.setup.road.targets[0];
      const road = await command(pages[activeIndex], { type: "PLACE_SETUP_ROAD", edgeId });
      await waitForVersion(pages, road.roomVersion);
    }

    let snapshots = await synchronized(pages);
    expect(snapshots[0].publicState.game.players.every((player: any) => player.guildTokens === 0)).toBe(true);
    for (let completedTurn = 0; completedTurn < 6; completedTurn += 1) {
      snapshots = await advanceOnlineCleanTurn(pages);
    }
    const activeIndex = snapshots.findIndex((snapshot) =>
      snapshot.privateState.playerId === snapshot.publicState.game.activePlayerId
    );
    const rolled = await command(pages[activeIndex], { type: "ROLL_DICE" });
    await waitForVersion(pages, rolled.roomVersion);
    await resolveSeven(pages);
    snapshots = await synchronized(pages);
    const starter = snapshots.findIndex((snapshot) => snapshot.allowedActions.commerce.startGathering.enabled);
    expect(starter).toBeGreaterThanOrEqual(0);
    const redemption = await command(pages[starter], { type: "START_GATHERING" });
    await waitForVersion(pages, redemption.roomVersion);
    snapshots = await synchronized(pages);
    const opener = snapshots.findIndex((snapshot) => snapshot.allowedActions.commerce.openAuction.enabled);
    const completed = await command(pages[opener], { type: "OPEN_AUCTION" });
    await waitForVersion(pages, completed.roomVersion);

    expect(completed.publicState.guild.gathering.phase).toBe("complete");
    expect(completed.publicState.submittedBidSeatIds).toEqual([]);
    expect(JSON.stringify(completed.publicState.game.log)).toContain("guild.auctionNoEligibleBidders");
    for (const page of pages) {
      const caller = await latestSnapshot(page);
      expect(caller.privateState.ownPendingBid).toBeUndefined();
    }
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
