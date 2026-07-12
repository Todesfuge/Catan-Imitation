import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createInitialAppState, createLocalGameTableView } from "../../src/app/localGameState";
import { createStandardBoardData } from "../../src/domain/board";
import { resources } from "../../src/domain/types";
import type { OnlineAllowedActions } from "../../src/online/allowedActions";
import {
  OnlineGame,
  createOnlineGameTableController,
  createOnlineGameTableView
} from "../../src/online/OnlineGame";
import type { OnlineClientState } from "../../src/online/onlineReducer";
import { MAX_WIRE_BYTES, parseServerWebSocketMessage, type ClientWebSocketMessage, type RoomSnapshotMessage } from "../../src/online/protocol";
import type { PrivateSeatState, PublicGameView, PublicGuildView, PublicRoomState } from "../../src/online/view";
import { projectRoomView } from "../../src/online/projectRoomView";
import { I18nProvider } from "../../src/ui/i18n";

const zero = { wood: 0, brick: 0, wool: 0, grain: 0, ore: 0 } as const;
const callerResources = { wood: 7, brick: 2, wool: 3, grain: 4, ore: 5 } as const;

function available<T extends string = never>(targets: T[] = []) {
  return { enabled: true, targets };
}

function unavailable<T extends string = never>(code = "NOT_YOUR_TURN") {
  return { enabled: false, disabledReason: { code: code as "NOT_YOUR_TURN" }, targets: [] as T[] };
}

function actions(overrides: Partial<OnlineAllowedActions> = {}): OnlineAllowedActions {
  return {
    turn: {
      roll: available(), endTurn: available(),
      road: { ...available(), cost: zero },
      settlement: { ...available(), cost: zero },
      city: { ...available(), cost: zero },
      buyDevelopmentCard: { ...available(), cost: zero },
      developmentCards: [{ cardId: "caller-knight", count: 1, enabled: true, kind: "knight" }]
    },
    maritime: {
      enabled: true,
      ratios: { wood: 3, brick: 4, wool: 4, grain: 4, ore: 4 },
      trades: [{ give: "wood", ratio: 3, receives: ["ore"] }]
    },
    commerce: {
      tradeSlots: [{ id: "slot-1", ...available() }],
      transfer: { ...available(), maxAmount: 2, recipientIds: ["p2", "p3", "p4"] },
      startGathering: available(), openAuction: available(),
      redeemGathering: { ...available(["wood"]), maxAmount: 2, bankStock: callerResources },
      redeemPrize: available()
    },
    setup: { settlement: available(), road: available() },
    decisions: {
      discard: { ...unavailable(), exactCount: 0, maxByResource: zero },
      robberHex: unavailable(), robberVictim: unavailable(),
      freeRoad: { ...unavailable(), remainingRoads: 0 },
      yearOfPlenty: { ...unavailable(), remainingPicks: 0 }, monopoly: unavailable()
    },
    publicTrade: {
      publish: { ...available(), maxOfferResources: callerResources },
      cancel: unavailable(), accept: unavailable()
    },
    sealedBid: { enabled: false, round: 1, maxAmount: 2, submitted: false, disabledReason: { code: "AUCTION_NOT_OPEN" } },
    ...overrides
  };
}

function publicGame(): PublicGameView {
  const local = createLocalGameTableView(createInitialAppState()).game;
  return {
    phase: local.phase,
    players: [
      { playerId: "p1", color: "#e76f51", visibleScore: 1, resourceCardCount: 21, developmentCardCount: 2, guildTokens: 2, vouchers: 0, prizeCards: 0, knightsPlayed: 0 },
      { playerId: "p2", color: "#2a9d8f", visibleScore: 1, resourceCardCount: 99, developmentCardCount: 3, guildTokens: 1, vouchers: 0, prizeCards: 0, knightsPlayed: 0 },
      { playerId: "p3", color: "#e9c46a", visibleScore: 1, resourceCardCount: 8, developmentCardCount: 0, guildTokens: 0, vouchers: 0, prizeCards: 0, knightsPlayed: 0 },
      { playerId: "p4", color: "#264653", visibleScore: 1, resourceCardCount: 6, developmentCardCount: 1, guildTokens: 0, vouchers: 0, prizeCards: 0, knightsPlayed: 0 }
    ],
    activePlayerId: "p1", turn: 2, round: 1,
    turnState: { phase: "action", awaitedPlayerIds: [] }, targetScore: local.targetScore,
    boardLayout: "standard-v1",
    buildings: local.buildings.map((value) => ({ ...value })), roads: local.roads.map(({ ownerId, edgeId }) => ({ ownerId, edgeId })),
    robberHexId: local.robberHexId, bank: { resources: { ...local.bank.resources } },
    log: [{ id: "safe-log", messageKey: "game.welcome" }], developmentDeckCount: 19, lastDice: { first: 3, second: 4, total: 7 }
  };
}

function guild(): PublicGuildView {
  return { tradeSlots: [{ id: "slot-1", requires: { wood: 1 }, tokenReward: 1 }], usedTradePlayerIds: [], gathering: { phase: "idle", auctionRound: 1, auctionResults: [] } };
}

function snapshotFor(seatIndex = 0, overrides: { game?: Partial<PublicGameView>; privateState?: Partial<PrivateSeatState>; allowedActions?: OnlineAllowedActions; lifecycle?: "playing" | "finished" } = {}): RoomSnapshotMessage {
  const playerId = `p${seatIndex + 1}`;
  const seatId = `seat-${seatIndex + 1}`;
  const game = { ...publicGame(), ...overrides.game } as PublicGameView;
  const publicState: PublicRoomState = {
    roomCode: "234567", lifecycle: overrides.lifecycle ?? "playing", roomVersion: 41,
    seats: game.players.map((player, index) => ({ seatId: `seat-${index + 1}`, playerId: player.playerId, nickname: ["Caller", "North", "East", "West"][index]!, ready: true })),
    game, guild: guild(), submittedBidSeatIds: []
  };
  const baseActions = overrides.allowedActions ?? actions();
  const callerActions = overrides.allowedActions ? baseActions : {
    ...baseActions,
    turn: { ...baseActions.turn, developmentCards: baseActions.turn.developmentCards.map((card) => ({
      ...card, cardId: seatIndex === 0 ? "caller-knight" : `private-card-seat-${seatIndex + 1}`
    })) }
  };
  return {
    type: "room.snapshot", schemaVersion: 1, roomVersion: 41,
    lifecycle: overrides.lifecycle ?? "playing", publicState: publicState as unknown as Record<string, unknown>, privateState: {
      seatId, playerId, seatTokenPresent: true,
      resources: seatIndex === 0 ? { ...callerResources } : { ...zero, wood: seatIndex + 1 },
      developmentCards: [{ id: seatIndex === 0 ? "caller-knight" : `private-card-seat-${seatIndex + 1}`, kind: "knight", purchasedTurn: 0, revealed: false }],
      ...overrides.privateState
    },
    allowedActions: callerActions as unknown as Record<string, unknown>,
    presence: game.players.map((_, index) => ({ seatId: `seat-${index + 1}`, connectionCount: index === 2 ? 0 : 1, online: index !== 2 }))
  };
}

function setupSnapshot(stage: "settlement" | "road" = "settlement", playerCount: 3 | 4 = 4): RoomSnapshotMessage {
  const snapshot = snapshotFor();
  const publicState = snapshot.publicState as unknown as PublicRoomState;
  const game = snapshot.publicState.game as unknown as PublicGameView;
  game.players = game.players.slice(0, playerCount);
  publicState.seats = publicState.seats.slice(0, playerCount);
  snapshot.presence = snapshot.presence.slice(0, playerCount);
  const allowed = snapshot.allowedActions as unknown as OnlineAllowedActions;
  allowed.commerce.transfer.recipientIds = allowed.commerce.transfer.recipientIds.filter((id) => game.players.some((player) => player.playerId === id));
  const firstPass = game.players.map((player) => player.playerId);
  const order = [...firstPass, ...firstPass.slice().reverse()];
  game.phase = "setup";
  if (stage === "settlement") {
    game.activePlayerId = "p1";
    game.setup = { order, placementIndex: 0, stage };
  } else {
    const pendingBuilding = game.buildings.find((building) => building.ownerId === "p2" && building.kind === "settlement")!;
    game.activePlayerId = "p2";
    game.setup = {
      order,
      placementIndex: 1,
      stage,
      pendingSettlement: { playerId: "p2", vertexId: pendingBuilding.vertexId }
    };
  }
  return snapshot;
}

function state(snapshot = snapshotFor(), status: OnlineClientState["status"] = "connected"): OnlineClientState {
  return { status, snapshot, retryAttempt: status === "reconnecting" ? 2 : 0 };
}

function expectIncompatibleProjection(snapshot: RoomSnapshotMessage) {
  const send = vi.fn(() => true);
  expect(() => createOnlineGameTableView(state(snapshot))).toThrow("Invalid online game projection");
  expect(createOnlineGameTableController(() => state(snapshot), send, crypto.randomUUID).dispatch({ type: "turn.roll" })).toBe(false);
  expect(send).not.toHaveBeenCalled();
  const html = renderToStaticMarkup(React.createElement(I18nProvider, null,
    React.createElement(OnlineGame, { roomCode: "234567", state: state(snapshot), dispatch: send, reconnect: vi.fn(), onExit: vi.fn(), createCommandId: crypto.randomUUID })
  ));
  expect(html).toContain("This game view is incompatible");
}

describe("online game projection adapter", () => {
  it("keeps a complete caller-specific snapshot within the 16 KiB protocol limit", () => {
    const serialized = JSON.stringify(snapshotFor());
    expect(new TextEncoder().encode(serialized).byteLength).toBeLessThanOrEqual(MAX_WIRE_BYTES);
    expect(parseServerWebSocketMessage(serialized).type).toBe("room.snapshot");
  });

  it("bounds recent sanitized logs so a real projected snapshot stays within 16 KiB", () => {
    const local = createInitialAppState();
    const seats = local.game.players.map((player, index) => ({ seatId: `seat-${index + 1}`, playerId: player.id, nickname: player.name, ready: true }));
    const log = [...local.game.log, ...Array.from({ length: 20 }, (_, index) => ({
      id: `bounded-log-${index}`, message: "safe", messageKey: "dice.rolled" as const,
      params: { playerName: local.game.players[0]!.name, total: 8, eventCount: 0 }
    }))];
    const projected = projectRoomView({ roomCode: "234567", lifecycle: "playing", roomVersion: 42, seats,
      matchState: { game: { ...local.game, log }, guild: local.guild, lastDice: local.lastDice } }, "seat-1",
    { connectedSeatIds: seats.map((seat) => seat.seatId) });
    const wire = JSON.stringify({ type: "room.snapshot", schemaVersion: 1, roomVersion: 42, lifecycle: "playing", ...projected,
      presence: seats.map((seat) => ({ seatId: seat.seatId, connectionCount: 1, online: true })) });
    expect(projected.publicState.game?.log).toHaveLength(6);
    expect(projected.publicState.game?.log.map((entry) => entry.id)).toEqual(
      [14, 15, 16, 17, 18, 19].map((index) => `bounded-log-${index}`)
    );
    expect(new TextEncoder().encode(wire).byteLength).toBeLessThanOrEqual(MAX_WIRE_BYTES);
    expect(parseServerWebSocketMessage(wire).type).toBe("room.snapshot");
  });

  it("keeps a legal high-water board, hand, targets, and log snapshot within 16 KiB", () => {
    const local = createInitialAppState();
    const longNames = ["甲".repeat(20), "乙".repeat(20), "丙".repeat(20), "丁".repeat(20)];
    const players = local.game.players.map((player, index) => ({
      ...player,
      resources: { wood: 19, brick: 19, wool: 19, grain: 19, ore: 19 },
      developmentCards: Array.from({ length: index === 0 ? 25 : 12 }, (_, card) => ({
        id: `card-${index}-${card}-${"c".repeat(24)}`, kind: (["victoryPoint", "knight", "roadBuilding", "yearOfPlenty", "monopoly"] as const)[card % 5]!,
        purchasedTurn: 0, revealed: false
      }))
    }));
    const vertexIds = [...new Set(local.game.board.flatMap((hex) => hex.vertexIds))];
    const roads = local.game.edges.slice(0, 60).map((edge, index) => ({ id: `road-${index}-${"r".repeat(64)}`, edgeId: edge.id, ownerId: players[index % 4]!.id }));
    const buildings = vertexIds.slice(0, 20).map((vertexId, index) => ({ id: `building-${index}-${"b".repeat(48)}`, vertexId,
      ownerId: players[index % 4]!.id, kind: index % 2 === 0 ? "city" as const : "settlement" as const }));
    const log = Array.from({ length: 20 }, (_, index) => ({ id: `high-log-${index}`, message: "safe", messageKey: "dice.rolled" as const,
      params: { playerName: longNames[0]!, total: 8, eventCount: 0 } }));
    const game = { ...local.game, players, roads, buildings, log, phase: "playing" as const,
      pendingPlayerTrade: undefined,
      turnState: { ...local.game.turnState, phase: "action" as const, developmentCardPlayed: false } };
    const seats = players.map((player, index) => ({ seatId: `00000000-0000-4000-8000-00000000000${index}`, playerId: player.id, nickname: longNames[index]!, ready: true }));
    const guild = { ...local.guild, usedTradePlayerIds: players.map((player) => player.id), gathering: {
      ...local.guild.gathering, phase: "auction" as const, auctionRound: 3,
      auctionResults: [{ kind: "resources" as const, resources: { ...zero, wood: 5 } }, { kind: "voucher" as const }, { kind: "developmentCard" as const, card: "monopoly" as const }],
      lastAuctionResult: { winnerId: players[0]!.id, winnerName: longNames[0]!, round: 3, winningBid: 9999, outcome: { kind: "voucher" as const } }
    } };
    const pendingPlayerTrade = { proposerId: players[0]!.id, offered: { ...zero, wood: 19 }, requested: { ...zero, ore: 19 } };
    const projected = projectRoomView({ roomCode: "234567", lifecycle: "playing", roomVersion: 999999, seats,
      matchState: { game, guild, lastDice: { first: 6, second: 6, total: 12 }, pendingPlayerTrade },
      pendingAuction: { round: 3, bidsBySeatId: Object.fromEntries(seats.map((seat, index) => [seat.seatId, index + 1])) }
    }, seats[0]!.seatId,
    { connectedSeatIds: seats.map((seat) => seat.seatId) });
    const envelope = { type: "room.snapshot" as const, schemaVersion: 1 as const, roomVersion: 999999, lifecycle: "playing" as const, ...projected,
      presence: seats.map((seat) => ({ seatId: seat.seatId, connectionCount: 9, online: true })),
      acknowledgedCommandId: "00000000-0000-4000-8000-000000000099" };
    const wire = JSON.stringify(envelope);
    expect(new TextEncoder().encode(wire).byteLength).toBeLessThanOrEqual(MAX_WIRE_BYTES);
    expect(parseServerWebSocketMessage(wire).type).toBe("room.snapshot");
    expect(() => createOnlineGameTableView(state(envelope as unknown as RoomSnapshotMessage))).not.toThrow();
  });

  it("keeps a conservative early-game target superset within 16 KiB", () => {
    const local = createInitialAppState();
    const seats = local.game.players.map((player, index) => ({ seatId: `10000000-0000-4000-8000-00000000000${index}`, playerId: player.id, nickname: "界".repeat(20), ready: true }));
    const projected = projectRoomView({ roomCode: "234567", lifecycle: "playing", roomVersion: 1000000, seats,
      matchState: { game: local.game, guild: local.guild, lastDice: null } }, seats[0]!.seatId,
    { connectedSeatIds: seats.map((seat) => seat.seatId) });
    const allowed = projected.allowedActions!;
    const vertices = [...new Set(local.game.board.flatMap((hex) => hex.vertexIds))];
    const edges = local.game.edges.map((edge) => edge.id);
    allowed.turn.road.targets = edges;
    allowed.turn.settlement.targets = vertices;
    allowed.setup.road.targets = edges;
    allowed.setup.settlement.targets = vertices;
    allowed.decisions.robberHex.targets = local.game.board.filter((hex) => hex.id !== local.game.robberHexId).map((hex) => hex.id);
    allowed.decisions.robberVictim.targets = local.game.players.slice(1).map((player) => player.id);
    allowed.decisions.freeRoad.targets = edges;
    allowed.decisions.yearOfPlenty.targets = [...resources];
    allowed.decisions.monopoly.targets = [...resources];
    const envelope = { type: "room.snapshot" as const, schemaVersion: 1 as const, roomVersion: 1000000, lifecycle: "playing" as const, ...projected,
      presence: seats.map((seat) => ({ seatId: seat.seatId, connectionCount: 9, online: true })),
      acknowledgedCommandId: "10000000-0000-4000-8000-000000000099" };
    const wire = JSON.stringify(envelope);
    expect(new TextEncoder().encode(wire).byteLength).toBeLessThanOrEqual(MAX_WIRE_BYTES);
    expect(parseServerWebSocketMessage(wire).type).toBe("room.snapshot");
    expect(() => createOnlineGameTableView(state(envelope as unknown as RoomSnapshotMessage))).not.toThrow();
  });

  it("projects only the caller private hand while retaining opponent public counts", () => {
    const view = createOnlineGameTableView(state());
    expect(view.controlledPlayers).toHaveLength(1);
    expect(view.controlledPlayers[0]).toMatchObject({ controlId: "seat-1", displayName: "Caller", resources: callerResources });
    expect(view.controlledPlayers[0]?.developmentCards.map((card) => card.id)).toEqual(["caller-knight"]);
    expect(view.game.players[1]).toMatchObject({ name: "North", resourceCardCount: 99, developmentCardCount: 3 });
    expect(JSON.stringify(view.game.players[1])).not.toContain("victoryPoint");
  });

  it("keeps all four caller projections isolated from every other seat secret", () => {
    const views = [0, 1, 2, 3].map((index) => createOnlineGameTableView(state(snapshotFor(index, {
      privateState: { resources: { ...zero, wood: 81 + index }, ownPendingBid: 9001 + index }
    }))));
    views.forEach((view, viewerIndex) => {
      expect(view.controlledPlayers).toHaveLength(1);
      expect(view.controlledPlayers[0]?.controlId).toBe(`seat-${viewerIndex + 1}`);
      const serialized = JSON.stringify(view);
      [0, 1, 2, 3].filter((index) => index !== viewerIndex).forEach((index) => {
        expect(serialized).not.toContain(`private-card-seat-${index + 1}`);
        expect(serialized).not.toContain(`\"wood\":${81 + index}`);
        expect(serialized).not.toContain(`\"ownPendingBid\":${9001 + index}`);
      });
    });
  });

  it("uses server decisions and targets for seven, robber, and development effects", () => {
    const freeRoadId = createStandardBoardData().edges[0]!.id;
    const allowed = actions();
    allowed.decisions.discard = { ...available(), exactCount: 3, maxByResource: callerResources };
    allowed.decisions.robberVictim = available(["p2"]);
    allowed.decisions.freeRoad = { ...available([freeRoadId]), remainingRoads: 1 };
    const discard = createOnlineGameTableView(state(snapshotFor(0, {
      game: { turnState: { phase: "awaitingDiscards", awaitedPlayerIds: ["p1"] } },
      privateState: { requiredDecision: { kind: "discardResources", count: 3 } }, allowedActions: allowed
    })));
    expect(discard.controlledPlayers[0]?.decision).toEqual({ kind: "discard", count: 3 });
    expect(discard.legality.freeRoadEdgeIds).toEqual([freeRoadId]);

    const robber = createOnlineGameTableView(state(snapshotFor(0, {
      game: { turnState: { phase: "awaitingRobberVictim", awaitedPlayerIds: ["p1"] } },
      privateState: { requiredDecision: { kind: "chooseRobberVictim", eligiblePlayerIds: ["p2"] } }, allowedActions: allowed
    })));
    expect(robber.game.turnState.pendingRobber?.eligibleVictimIds).toEqual(["p2"]);
  });

  it("exposes a complete server-owned decision policy and clears it while reconnecting", () => {
    const geometry = createStandardBoardData();
    const robberHexId = geometry.board.find((hex) => hex.id !== publicGame().robberHexId)!.id;
    const freeRoadId = geometry.edges[0]!.id;
    const allowed = actions();
    allowed.decisions.discard = { ...available(), exactCount: 3, maxByResource: callerResources };
    allowed.decisions.robberHex = available([robberHexId]);
    allowed.decisions.robberVictim = available(["p2"]);
    allowed.decisions.freeRoad = { ...available([freeRoadId]), remainingRoads: 1 };
    allowed.decisions.yearOfPlenty = { ...available(["grain"]), remainingPicks: 2 };
    allowed.decisions.monopoly = available(["ore"]);
    const connected = createOnlineGameTableView(state(snapshotFor(0, { allowedActions: allowed })));
    const policy = (connected as unknown as { decisionPolicy?: OnlineAllowedActions["decisions"] }).decisionPolicy;
    expect(policy).toMatchObject({
      discard: { enabled: true, exactCount: 3 },
      robberHex: { enabled: true, targets: [robberHexId] },
      robberVictim: { enabled: true, targets: ["p2"] },
      freeRoad: { enabled: true, targets: [freeRoadId] },
      yearOfPlenty: { enabled: true, targets: ["grain"] },
      monopoly: { enabled: true, targets: ["ore"] }
    });
    const reconnecting = createOnlineGameTableView(state(snapshotFor(0, { allowedActions: allowed }), "reconnecting"));
    const disabled = (reconnecting as unknown as { decisionPolicy?: OnlineAllowedActions["decisions"] }).decisionPolicy;
    expect(Object.values(disabled ?? {}).every((entry) => !entry.enabled && entry.targets.length === 0)).toBe(true);
  });

  it("renders only server decision targets and removes them while reconnecting", () => {
    const geometry = createStandardBoardData();
    const targetHex = geometry.board.find((hex) => hex.id !== publicGame().robberHexId)!.id;
    const allowed = actions();
    allowed.decisions.robberHex = available([targetHex]);
    const robberSnapshot = snapshotFor(0, {
      game: { turnState: { phase: "awaitingRobberPlacement", awaitedPlayerIds: ["p1"] } },
      privateState: { requiredDecision: { kind: "placeRobber" } },
      allowedActions: allowed
    });
    const renderGame = (clientState: OnlineClientState) => renderToStaticMarkup(React.createElement(I18nProvider, null,
      React.createElement(OnlineGame, { roomCode: "234567", state: clientState, dispatch: vi.fn(), reconnect: vi.fn(), onExit: vi.fn(), createCommandId: crypto.randomUUID })
    ));
    const connectedHtml = renderGame(state(robberSnapshot));
    expect(connectedHtml).toContain(`data-robber-target="${targetHex}"`);
    expect((connectedHtml.match(/data-robber-target=/g) ?? [])).toHaveLength(1);
    expect(renderGame(state(robberSnapshot, "reconnecting"))).not.toContain("data-robber-target=");

    const developmentAllowed = actions();
    developmentAllowed.decisions.yearOfPlenty = { ...available(["grain"]), remainingPicks: 2 };
    const developmentSnapshot = snapshotFor(0, {
      game: { turnState: { phase: "awaitingDevelopmentEffect", awaitedPlayerIds: ["p1"] } },
      privateState: { requiredDecision: { kind: "chooseYearOfPlentyResource", remainingPicks: 2 } },
      allowedActions: developmentAllowed
    });
    const developmentHtml = renderGame(state(developmentSnapshot));
    expect(developmentHtml).toContain('data-resource-choice="grain"');
    expect(developmentHtml).not.toContain('data-resource-choice="ore"');
    expect(renderGame(state(developmentSnapshot, "reconnecting"))).not.toContain("data-resource-choice=");
  });

  it("uses only server allowed actions and disables every command while disconnected", () => {
    const serverDenied = actions();
    serverDenied.turn.roll = unavailable("REQUIRED_PLAYER_OFFLINE");
    expect(createOnlineGameTableView(state(snapshotFor(0, { allowedActions: serverDenied })))).toMatchObject({
      legality: { actions: { roll: { enabled: false } } }
    });
    const offline = createOnlineGameTableView(state(snapshotFor(), "reconnecting"));
    expect(offline.legality.actions.roll.enabled).toBe(false);
    expect(offline.legality.actions.maritime.enabled).toBe(false);
    expect(offline.tradePolicy.publishEnabled).toBe(false);
  });

  it("maps every actorless table intent to versioned protocol commands without local mutation", () => {
    const sent: ClientWebSocketMessage[] = [];
    const getState = () => state();
    const controller = createOnlineGameTableController(getState, (message) => { sent.push(message); return true; }, () => "11111111-1111-4111-8111-111111111111");
    controller.dispatch({ type: "turn.roll" });
    controller.dispatch({ type: "turn.end" });
    controller.dispatch({ type: "build.road", edgeId: "edge-0" });
    controller.dispatch({ type: "build.settlement", vertexId: "vertex-0" });
    controller.dispatch({ type: "build.city", buildingId: "building-0" });
    controller.dispatch({ type: "setup.settlement", controlId: "seat-1", vertexId: "vertex-0" });
    controller.dispatch({ type: "setup.road", controlId: "seat-1", edgeId: "edge-0" });
    controller.dispatch({ type: "development.buy" });
    controller.dispatch({ type: "development.play", cardId: "caller-knight" });
    controller.dispatch({ type: "trade.maritime", give: "wood", receive: "ore" });
    controller.dispatch({ type: "trade.publish", offered: callerResources, requested: { ...zero, ore: 1 } });
    controller.dispatch({ type: "trade.respond", controlId: "seat-1", response: "accept" });
    controller.dispatch({ type: "trade.respond", controlId: "seat-1", response: "cancel" });
    controller.dispatch({ type: "decision.discard", controlId: "seat-1", resources: { ...zero, wood: 3 } });
    controller.dispatch({ type: "robber.place", hexId: "hex-0" });
    controller.dispatch({ type: "robber.steal", victimId: "p2" });
    controller.dispatch({ type: "development.chooseResource", choice: "yearOfPlenty", resource: "grain" });
    controller.dispatch({ type: "development.chooseResource", choice: "monopoly", resource: "ore" });
    controller.dispatch({ type: "development.placeRoad", edgeId: "edge-1" });
    controller.dispatch({ type: "commerce.completeSlot", slotId: "slot-1" });
    controller.dispatch({ type: "commerce.transfer", recipientId: "p2", amount: 1 });
    controller.dispatch({ type: "commerce.startGathering" });
    controller.dispatch({ type: "commerce.redeem", controlId: "seat-1", resources: { ore: 1 } });
    controller.dispatch({ type: "commerce.openAuction" });
    controller.dispatch({ type: "commerce.redeemPrize" });
    controller.dispatch({ type: "auction.submitBid", controlId: "seat-1", bid: 2 });
    expect(sent).toHaveLength(26);
    expect(sent.every((message) => message.type === "auction.submitBid" || ("expectedVersion" in message && message.expectedVersion === 41))).toBe(true);
    expect(sent.map((message) => message.type === "match.command" ? message.command.type : message.type)).toEqual([
      "ROLL_DICE", "END_TURN", "BUILD_ROAD", "BUILD_SETTLEMENT", "BUILD_CITY", "PLACE_SETUP_SETTLEMENT",
      "PLACE_SETUP_ROAD", "BUY_DEVELOPMENT_CARD", "PLAY_DEVELOPMENT_CARD", "MARITIME_TRADE",
      "PUBLISH_PLAYER_TRADE", "ACCEPT_PLAYER_TRADE", "CANCEL_PLAYER_TRADE", "DISCARD_FOR_SEVEN",
      "PLACE_ROBBER", "STEAL_ROBBER_RESOURCE", "CHOOSE_YEAR_OF_PLENTY_RESOURCE",
      "CHOOSE_MONOPOLY_RESOURCE", "PLACE_FREE_ROAD",
      "COMPLETE_TRADE_SLOT", "TRANSFER_TOKENS", "START_GATHERING", "REDEEM_GATHERING", "OPEN_AUCTION",
      "REDEEM_PRIZE", "auction.submitBid"
    ]);
    expect(sent.every((message) => !JSON.stringify(message).includes("playerId"))).toBe(true);
    expect(sent.every((message) => "commandId" in message && message.commandId === "11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(getState().snapshot?.roomVersion).toBe(41);
  });

  it("refuses dispatch while offline, reconnecting, expired, incompatible, or finished", () => {
    for (const clientState of [
      state(snapshotFor(), "offline"), state(snapshotFor(), "reconnecting"), state(snapshotFor(), "expired"),
      state(snapshotFor(), "incompatible"), state(snapshotFor(0, { lifecycle: "finished" }), "connected")
    ]) {
      const send = vi.fn(() => true);
      const controller = createOnlineGameTableController(() => clientState, send, crypto.randomUUID);
      controller.dispatch({ type: "turn.roll" });
      controller.dispatch({ type: "robber.place", hexId: "hex" });
      controller.dispatch({ type: "robber.steal", victimId: "p2" });
      controller.dispatch({ type: "decision.discard", controlId: "seat-1", resources: zero });
      controller.dispatch({ type: "development.chooseResource", choice: "yearOfPlenty", resource: "grain" });
      controller.dispatch({ type: "development.placeRoad", edgeId: "edge" });
      controller.dispatch({ type: "auction.submitBid", controlId: "seat-1", bid: 0 });
      expect(send).not.toHaveBeenCalled();
    }
  });

  it("shows room, connection, presence, wait/privacy state, sealed-bid privacy, and game over bilingually", () => {
    const allowed = actions();
    allowed.sealedBid = { enabled: false, round: 2, maxAmount: 2, submitted: true, disabledReason: { code: "BID_ALREADY_SUBMITTED" } };
    const snapshot = snapshotFor(0, {
      game: { phase: "gameOver", winnerId: "p1", turnState: { phase: "awaitingDiscards", awaitedPlayerIds: ["p3"] } },
      privateState: { ownPendingBid: 2 }, allowedActions: allowed, lifecycle: "finished"
    });
    (snapshot.publicState as unknown as PublicRoomState).submittedBidSeatIds = ["seat-1", "seat-2"];
    (snapshot.publicState as unknown as PublicRoomState).guild!.gathering.phase = "auction";
    const game = React.createElement(OnlineGame, { roomCode: "234567", state: state(snapshot), dispatch: vi.fn(), reconnect: vi.fn(), onExit: vi.fn(), createCommandId: crypto.randomUUID });
    const html = renderToStaticMarkup(React.createElement(I18nProvider, { initialLocale: "en" }, game));
    expect(html).toContain("Room 234567");
    expect(html).toContain("Connected");
    expect(html).toContain("East is offline");
    expect(html).toContain("Only you can see your cards and resource types");
    expect(html).toContain("Your sealed bid: 2");
    expect(html).toContain("North submitted");
    expect(html).not.toContain("North bid");
    expect(html).toContain("Caller won the game");
    expect(html).toMatch(/data-action="new-game"[^>]*disabled/);
    const waitingSnapshot = snapshotFor(0, { game: { turnState: { phase: "awaitingDiscards", awaitedPlayerIds: ["p3"] } } });
    const waitingHtml = renderToStaticMarkup(React.createElement(I18nProvider, null,
      React.createElement(OnlineGame, { roomCode: "234567", state: state(waitingSnapshot), dispatch: vi.fn(), reconnect: vi.fn(), onExit: vi.fn(), createCommandId: crypto.randomUUID })
    ));
    expect(waitingHtml).toContain("Waiting for East");
    const zh = renderToStaticMarkup(React.createElement(I18nProvider, { initialLocale: "zh-CN" }, game));
    expect(zh).toContain("房间 234567");
    expect(zh).toContain("仅你可查看自己的卡牌与资源类型");
  });

  it("renders a generic public blind-box result and never a fabricated opponent card identity", () => {
    const snapshot = snapshotFor();
    const room = snapshot.publicState as unknown as PublicRoomState;
    room.guild!.gathering.lastAuctionResult = { winnerId: "p2", winnerName: "North", round: 1, winningBid: 2, outcome: { kind: "developmentCard" } };
    const html = renderToStaticMarkup(React.createElement(I18nProvider, null,
      React.createElement(OnlineGame, { roomCode: "234567", state: state(snapshot), dispatch: vi.fn(), reconnect: vi.fn(), onExit: vi.fn(), createCommandId: crypto.randomUUID })
    ));
    expect(html).toContain("one development card");
    expect(html).not.toContain("private-card-seat-2");
    expect(html).not.toContain("victoryPoint");
  });

  it("rejects malformed nested projections without rendering or sending commands", () => {
    const malformed = snapshotFor();
    malformed.publicState = { ...malformed.publicState, game: { players: [{ resources: callerResources }] } };
    const send = vi.fn(() => true);
    expect(() => createOnlineGameTableView(state(malformed))).toThrow("Invalid online game projection");
    expect(createOnlineGameTableController(() => state(malformed), send, crypto.randomUUID).dispatch({ type: "turn.roll" })).toBe(false);
    expect(send).not.toHaveBeenCalled();
    const html = renderToStaticMarkup(React.createElement(I18nProvider, null,
      React.createElement(OnlineGame, { roomCode: "234567", state: state(malformed), dispatch: send, reconnect: vi.fn(), onExit: vi.fn(), createCommandId: crypto.randomUUID })
    ));
    expect(html).toContain("This game view is incompatible");

    const unknownLayout = snapshotFor();
    (unknownLayout.publicState.game as Record<string, unknown>).boardLayout = "future-v2";
    const unknownSend = vi.fn(() => true);
    expect(() => createOnlineGameTableView(state(unknownLayout))).toThrow("Invalid online game projection");
    expect(createOnlineGameTableController(() => state(unknownLayout), unknownSend, crypto.randomUUID).dispatch({ type: "turn.roll" })).toBe(false);
    expect(unknownSend).not.toHaveBeenCalled();
  });

  it.each([
    ["future phase", (snapshot: RoomSnapshotMessage) => { (snapshot.publicState.game as Record<string, unknown>).phase = "future"; }],
    ["future reason", (snapshot: RoomSnapshotMessage) => { ((snapshot.allowedActions.turn as Record<string, unknown>).roll as Record<string, unknown>).disabledReason = { code: "FUTURE_CODE" }; }],
    ["future development kind", (snapshot: RoomSnapshotMessage) => { ((snapshot.privateState.developmentCards as unknown[])![0] as Record<string, unknown>).kind = "futureCard"; }],
    ["negative public count", (snapshot: RoomSnapshotMessage) => { (((snapshot.publicState.game as Record<string, unknown>).players as unknown[])[1] as Record<string, unknown>).resourceCardCount = -1; }],
    ["unknown resource key", (snapshot: RoomSnapshotMessage) => { (snapshot.privateState.resources as Record<string, unknown>).gold = 1; }],
    ["oversize target list", (snapshot: RoomSnapshotMessage) => { ((snapshot.allowedActions.decisions as Record<string, unknown>).robberHex as Record<string, unknown>).targets = Array.from({ length: 129 }, (_, index) => `hex-${index}`); }],
    ["oversize id", (snapshot: RoomSnapshotMessage) => { snapshot.privateState.seatId = "s".repeat(129); }],
    ["public secret field", (snapshot: RoomSnapshotMessage) => { (((snapshot.publicState.game as Record<string, unknown>).players as unknown[])[1] as Record<string, unknown>).resources = callerResources; }]
  ])("rejects malformed nested projection: %s", (_name, mutate) => {
    const malformed = snapshotFor();
    mutate(malformed);
    const send = vi.fn(() => true);
    expect(() => createOnlineGameTableView(state(malformed))).toThrow("Invalid online game projection");
    expect(createOnlineGameTableController(() => state(malformed), send, crypto.randomUUID).dispatch({ type: "turn.roll" })).toBe(false);
    expect(send).not.toHaveBeenCalled();
    const html = renderToStaticMarkup(React.createElement(I18nProvider, null,
      React.createElement(OnlineGame, { roomCode: "234567", state: state(malformed), dispatch: send, reconnect: vi.fn(), onExit: vi.fn(), createCommandId: crypto.randomUUID })
    ));
    expect(html).toContain("This game view is incompatible");
  });

  it.each([
    ["duplicate advertised kind", (snapshot: RoomSnapshotMessage) => {
      const allowed = snapshot.allowedActions as unknown as OnlineAllowedActions;
      allowed.turn.developmentCards.push({ count: 1, enabled: false, kind: "knight" });
    }],
    ["duplicate advertised card id", (snapshot: RoomSnapshotMessage) => {
      const allowed = snapshot.allowedActions as unknown as OnlineAllowedActions;
      const privateState = snapshot.privateState as unknown as PrivateSeatState;
      privateState.developmentCards!.push({ id: "caller-knight", kind: "roadBuilding", purchasedTurn: 0, revealed: false });
      allowed.turn.developmentCards.push({ cardId: "caller-knight", count: 1, enabled: true, kind: "roadBuilding" });
    }],
    ["advertised card kind does not match private card", (snapshot: RoomSnapshotMessage) => {
      const allowed = snapshot.allowedActions as unknown as OnlineAllowedActions;
      allowed.turn.developmentCards[0] = { cardId: "caller-knight", count: 1, enabled: true, kind: "roadBuilding" };
    }],
    ["zero advertised count", (snapshot: RoomSnapshotMessage) => {
      const allowed = snapshot.allowedActions as unknown as OnlineAllowedActions;
      allowed.turn.developmentCards[0]!.count = 0;
    }],
    ["enabled card without an advertised card id", (snapshot: RoomSnapshotMessage) => {
      const allowed = snapshot.allowedActions as unknown as OnlineAllowedActions;
      allowed.turn.developmentCards[0] = { count: 1, enabled: true, kind: "knight" };
    }]
  ])("rejects inconsistent development-card availability: %s", (_name, mutate) => {
    const malformed = snapshotFor();
    mutate(malformed);
    expectIncompatibleProjection(malformed);
  });

  it("accepts disabled development-card availability without a card id", () => {
    const snapshot = snapshotFor();
    const allowed = snapshot.allowedActions as unknown as OnlineAllowedActions;
    allowed.turn.developmentCards = [{ count: 1, enabled: false, kind: "knight", disabledReason: { code: "DEVELOPMENT_CARD_PHASE" } }];
    expect(() => createOnlineGameTableView(state(snapshot))).not.toThrow();
  });

  it.each([3, 4] as const)("accepts legal settlement- and road-stage snake setup projections for %s players", (playerCount) => {
    expect(() => createOnlineGameTableView(state(setupSnapshot("settlement", playerCount)))).not.toThrow();
    expect(() => createOnlineGameTableView(state(setupSnapshot("road", playerCount)))).not.toThrow();
  });

  it.each([
    ["unknown key", (snapshot: RoomSnapshotMessage) => { ((snapshot.publicState.game as unknown as PublicGameView).setup as unknown as Record<string, unknown>).future = true; }],
    ["invalid stage", (snapshot: RoomSnapshotMessage) => { ((snapshot.publicState.game as unknown as PublicGameView).setup as unknown as Record<string, unknown>).stage = "city"; }],
    ["unknown player in order", (snapshot: RoomSnapshotMessage) => { (snapshot.publicState.game as unknown as PublicGameView).setup!.order[2] = "p9"; }],
    ["permuted unique first pass", (snapshot: RoomSnapshotMessage) => {
      const game = snapshot.publicState.game as unknown as PublicGameView;
      game.setup!.order = ["p3", "p2", "p1", "p4", "p4", "p1", "p2", "p3"];
    }],
    ["out-of-range placement index", (snapshot: RoomSnapshotMessage) => { (snapshot.publicState.game as unknown as PublicGameView).setup!.placementIndex = 8; }],
    ["pending settlement without matching public settlement", (snapshot: RoomSnapshotMessage) => {
      const game = snapshot.publicState.game as unknown as PublicGameView;
      const vertexId = createStandardBoardData().board.flatMap((hex) => hex.vertexIds).find((id) => !game.buildings.some((building) => building.vertexId === id))!;
      game.setup!.pendingSettlement = { playerId: "p2", vertexId };
    }]
  ])("rejects malformed setup projection: %s", (_name, mutate) => {
    const malformed = setupSnapshot("road");
    mutate(malformed);
    expectIncompatibleProjection(malformed);
  });

  it.each([
    ["setup phase without setup state", (snapshot: RoomSnapshotMessage) => { (snapshot.publicState.game as unknown as PublicGameView).setup = undefined; }],
    ["playing phase with setup state", (snapshot: RoomSnapshotMessage) => { (snapshot.publicState.game as unknown as PublicGameView).phase = "playing"; }]
  ])("rejects an invalid game/setup phase boundary: %s", (_name, mutate) => {
    const malformed = setupSnapshot();
    mutate(malformed);
    expectIncompatibleProjection(malformed);
  });

  it("labels only the exact deterministic standard-v1 geometry", () => {
    const local = createInitialAppState();
    expect({ board: local.game.board, edges: local.game.edges, ports: local.game.ports }).toEqual(createStandardBoardData());
    const seats = local.game.players.map((player, index) => ({ seatId: `seat-${index + 1}`, playerId: player.id, nickname: player.name, ready: true }));
    const nonstandard = { ...local.game, board: local.game.board.map((hex, index) => index === 0 ? { ...hex, id: "different-hex" } : hex) };
    expect(() => projectRoomView({ roomCode: "234567", lifecycle: "playing", roomVersion: 1, seats,
      matchState: { game: nonstandard, guild: local.guild, lastDice: null } }, "seat-1")).toThrow("standard-v1");
  });
});
