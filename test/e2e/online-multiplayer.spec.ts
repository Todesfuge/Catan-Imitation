import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createStandardBoardData } from "../../src/domain/board";

type Snapshot = {
  type: "room.snapshot";
  roomVersion: number;
  lifecycle: "lobby" | "playing" | "finished";
  publicState: any;
  privateState: any;
  allowedActions: any;
  acknowledgedCommandId?: string;
};

const board = createStandardBoardData().board;

function resourceRichSetupTarget(targets: string[]): string | undefined {
  return [...targets].sort((left, right) => {
    const score = (vertexId: string) => board
      .filter((hex) => hex.vertexIds.includes(vertexId))
      .reduce((total, hex) => total + (hex.resource === "brick" || hex.resource === "wood" ? 20 : hex.resource ? 8 : 0), 0);
    return score(right) - score(left);
  })[0];
}

async function openOnline(context: BrowserContext, mobile = false): Promise<Page> {
  const page = await context.newPage();
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

async function resolveSeven(pages: Page[]): Promise<boolean> {
  let sawRobber = false;
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
      await command(pages[index], { type: "DISCARD_FOR_SEVEN", resources: discarded });
      continue;
    }
    if (phase === "awaitingRobberPlacement") {
      sawRobber = true;
      const index = snapshots.findIndex((snapshot) => snapshot.allowedActions.decisions.robberHex.enabled);
      const hexId = snapshots[index].allowedActions.decisions.robberHex.targets[0];
      await command(pages[index], { type: "PLACE_ROBBER", hexId });
      continue;
    }
    if (phase === "awaitingRobberVictim") {
      sawRobber = true;
      const index = snapshots.findIndex((snapshot) => snapshot.allowedActions.decisions.robberVictim.enabled);
      const victimId = snapshots[index].allowedActions.decisions.robberVictim.targets[0];
      await command(pages[index], { type: "STEAL_ROBBER_RESOURCE", victimId });
      continue;
    }
    return sawRobber;
  }
  throw new Error("seven flow did not converge");
}

async function submitAuctionRound(pages: Page[], preferPositive: boolean): Promise<boolean> {
  let submittedPositive = false;
  for (let index = 0; index < pages.length; index += 1) {
    const snapshots = await synchronized(pages);
    if (snapshots[0].publicState.guild.gathering.phase !== "auction") break;
    const own = snapshots[index];
    const max = own.allowedActions.sealedBid.maxAmount as number;
    const amount: number = preferPositive && !submittedPositive && max > 0 ? 1 : 0;
    const updated = await send(pages[index], {
      type: "auction.submitBid",
      commandId: crypto.randomUUID(),
      expectedVersion: own.roomVersion,
      amount
    });
    await waitForVersion(pages, updated.roomVersion);
    const projected = await synchronized(pages);
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

test("three real browsers play an authoritative private room and reconnect", async ({ browser }) => {
  test.setTimeout(180_000);
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);

  try {
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
    expect(await third.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    const initial = await Promise.all(pages.map((page) => connectProtocolClient(page, roomCode)));
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
      const settlement = resourceRichSetupTarget(snapshots[activeIndex].allowedActions.setup.settlement.targets);
      expect(settlement).toBeTruthy();
      const afterSettlement = await command(pages[activeIndex], { type: "PLACE_SETUP_SETTLEMENT", vertexId: settlement });
      await waitForVersion(pages, afterSettlement.roomVersion);
      const road = afterSettlement.allowedActions.setup.road.targets[0];
      expect(road).toBeTruthy();
      const afterRoad = await command(pages[activeIndex], { type: "PLACE_SETUP_ROAD", edgeId: road });
      await waitForVersion(pages, afterRoad.roomVersion);
    }

    const ready = await Promise.all(pages.map(latestSnapshot));
    expect(ready[0].publicState.game.phase).toBe("playing");
    const activeIndex = ready.findIndex((snapshot) => snapshot.privateState.playerId === snapshot.publicState.game.activePlayerId);
    const rolled = await command(pages[activeIndex], { type: "ROLL_DICE" });
    expect(rolled.publicState.game.lastDice.first).toBeGreaterThanOrEqual(1);
    expect(rolled.publicState.game.lastDice.second).toBeGreaterThanOrEqual(1);
    expect(rolled.acknowledgedCommandId).toMatch(/^[0-9a-f-]{36}$/i);
    const diceLog = rolled.publicState.game.log.find((entry: any) => entry.messageKey === "dice.rolled");
    expect(diceLog.id).toMatch(/^[0-9a-f]{8}-[0-9a-f-]{27}$/i);

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
        await command(pages[auctionOpener], { type: "OPEN_AUCTION" });
        snapshots = await synchronized(pages);
        expect(tokensBefore).toBeGreaterThan(0);
        while (snapshots[0].publicState.guild.gathering.phase === "auction") {
          const usedPositive = await submitAuctionRound(pages, !positiveAuction);
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
          await command(pages[playerIndex], { type: "BUILD_ROAD", edgeId: actions.road.targets[0] });
          builtPiece = true;
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
          await command(pages[playerIndex], { type: "MARITIME_TRADE", give: trade.give, receive: trade.receives[0] });
          maritimeTrade = true;
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
            const empty = { wood: 0, brick: 0, grain: 0, wool: 0, ore: 0 };
            await command(pages[playerIndex], {
              type: "PUBLISH_PLAYER_TRADE",
              offered: { ...empty, [offered]: 1 },
              requested: { ...empty, [requested]: 1 }
            });
            snapshots = await synchronized(pages);
            if (snapshots[recipientIndex].allowedActions.publicTrade.accept.enabled) {
              await command(pages[recipientIndex], { type: "ACCEPT_PLAYER_TRADE" });
              publicTrade = true;
              snapshots = await synchronized(pages);
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
        await command(pages[playerIndex], { type: "START_GATHERING" });
        snapshots = await synchronized(pages);
      }
      snapshots = await synchronized(pages);
      if (snapshots[playerIndex].allowedActions.turn.endTurn.enabled) {
        await command(pages[playerIndex], { type: "END_TURN" });
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

    const privateViews = await synchronized(pages);
    for (let owner = 0; owner < privateViews.length; owner += 1) {
      for (const card of privateViews[owner].privateState.developmentCards as Array<{ id: string }>) {
        for (let opponent = 0; opponent < privateViews.length; opponent += 1) {
          if (opponent === owner) continue;
          expect(JSON.stringify(privateViews[opponent])).not.toContain(card.id);
        }
      }
    }

    const retainedCredential = await second.evaluate((code) => localStorage.getItem(`catan.online.seat.v1:${code}`), roomCode);
    expect(retainedCredential).toContain("seatToken");
    await second.close();
    const rebuilt = await contexts[1].newPage();
    await rebuilt.goto("/");
    const recovered = await connectProtocolClient(rebuilt, roomCode);
    expect(recovered.privateState.seatId).toBe(initial[1].privateState.seatId);
    expect(recovered.roomVersion).toBeGreaterThanOrEqual(rolled.roomVersion);
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
      const vertexId = resourceRichSetupTarget(snapshots[activeIndex].allowedActions.setup.settlement.targets)!;
      const settlement = await command(pages[activeIndex], { type: "PLACE_SETUP_SETTLEMENT", vertexId });
      await waitForVersion(pages, settlement.roomVersion);
      const edgeId = settlement.allowedActions.setup.road.targets[0];
      const road = await command(pages[activeIndex], { type: "PLACE_SETUP_ROAD", edgeId });
      await waitForVersion(pages, road.roomVersion);
    }

    let snapshots = await synchronized(pages);
    expect(snapshots[0].publicState.game.players.every((player: any) => player.guildTokens === 0)).toBe(true);
    const starter = snapshots.findIndex((snapshot) => snapshot.allowedActions.commerce.startGathering.enabled);
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
