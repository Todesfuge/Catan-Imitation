import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { gameReducer } from "../../src/app/gameReducer";
import {
  createInitialAppState,
  createLocalGameTableController,
  createLocalGameTableView
} from "../../src/app/localGameState";
import { parseMapSeed } from "../../src/domain/mapSeed";
import { GameTable, type GameTableView } from "../../src/ui/GameTable";
import { createScenarioAppState } from "../fixtures/createScenarioGame";

const noResources = { wood: 0, brick: 0, wool: 0, grain: 0, ore: 0 } as const;
const unavailable = { enabled: false, reason: "Unavailable", targets: [] } as const;

function callerOnlyFixture(): GameTableView {
  return {
    game: {
      mapSeed: parseMapSeed("M1-0123456789ABCDEF"),
      phase: "playing",
      players: [
        { id: "public-caller", name: "Caller", color: "#fff", visibleScore: 2, resourceCardCount: 1, developmentCardCount: 0, guildTokens: 0, vouchers: 0, prizeCards: 0, knightsPlayed: 0 },
        { id: "public-opponent", name: "Opponent", color: "#f00", visibleScore: 1, resourceCardCount: 4, developmentCardCount: 2, guildTokens: 0, vouchers: 0, prizeCards: 0, knightsPlayed: 0 }
      ],
      activePlayerId: "public-caller",
      turn: 1,
      round: 1,
      turnState: { phase: "awaitingRoll", awaitedPlayerIds: [] },
      targetScore: 10,
      board: [], edges: [], ports: [], buildings: [], roads: [], robberHexId: "none",
      bank: { resources: noResources },
      log: [{ id: "safe-log", fallbackText: "Safe public event." }],
      developmentDeckCount: 20
    },
    guild: { tradeSlots: [], gathering: { phase: "idle", auctionRound: 1, cooldownRemaining: 0 } },
    controlledPlayers: [{
      controlId: "caller-control",
      displaySlot: 0,
      displayName: "Caller",
      isActive: true,
      resources: { ...noResources, wood: 1 },
      developmentCards: [],
      guildTokens: 0,
      gatheringRemainingAllowance: 0,
      gatheringBankStock: noResources
    }],
    lastDice: null,
    selectedDiceTotal: 8,
    selectedPlayerId: "public-caller",
    notice: null,
    statistics: {
      playerRows: { "public-caller": [], "public-opponent": [] },
      diceIncome: { 8: { players: { "public-caller": noResources, "public-opponent": noResources } } },
      matrix: { totals: { "public-caller": noResources, "public-opponent": noResources } }
    },
    legality: {
      actions: {
        roll: { enabled: true, targets: [] }, endTurn: unavailable,
        road: unavailable, settlement: unavailable, city: unavailable,
        buyDevelopmentCard: unavailable, developmentCards: [],
        maritime: { enabled: false, reason: "Unavailable", ratios: { wood: 4, brick: 4, wool: 4, grain: 4, ore: 4 }, trades: [] },
        commerce: { tradeSlots: [], transfer: { ...unavailable, maxAmount: 0, recipientIds: [] }, startGathering: unavailable, openAuction: unavailable, redeemPrize: unavailable, gatheringPlayers: [] }
      },
      setupRoadEdgeIds: [], setupSettlementVertexIds: [], freeRoadEdgeIds: []
    },
    decisionPolicy: {
      discard: { ...unavailable, exactCount: 0, maxByResource: noResources },
      robberHex: unavailable,
      robberVictim: unavailable,
      freeRoad: { ...unavailable, remainingRoads: 0 },
      yearOfPlenty: { ...unavailable, remainingPicks: 0 },
      monopoly: unavailable
    },
    tradePolicy: { publishEnabled: false, publishReason: "Unavailable", maxOfferResources: noResources }
  };
}

describe("shared game-table presentation boundary", () => {
  it("boots Local Game directly into an empty four-seat setup on a canonical M1 map", () => {
    const state = createInitialAppState();

    expect(state.game.phase).toBe("setup");
    expect(state.game.players.map((player) => player.name)).toEqual([
      "Earnest",
      "Loss",
      "Kay",
      "Amias"
    ]);
    expect(state.game.mapSeed).toMatch(/^M1-[0-9A-F]{16}$/);
    expect(parseMapSeed(state.game.mapSeed)).toBe(state.game.mapSeed);
    expect(state.game.buildings).toEqual([]);
    expect(state.game.roads).toEqual([]);
    expect(
      state.game.players.every(
        (player) =>
          Object.values(player.resources).every((amount) => amount === 0) &&
          player.developmentCards.length === 0
      )
    ).toBe(true);
    expect(state.pendingPlayerTrade).toBeUndefined();
    expect(state.game.turnState).toEqual({
      phase: "awaitingRoll",
      pendingDiscards: {},
      developmentCardPlayed: false
    });
  });

  it.each(["fresh", "sameMap"] as const)(
    "applies a mode-bearing %s Local restart and resets transient UI state",
    (mode) => {
      const initial = createInitialAppState();
      const restarted = gameReducer(
        {
          ...initial,
          selectedDiceTotal: 6,
          selectedPlayerId: "p3",
          notice: "Previous notice"
        },
        { type: "START_NEW_GAME", mode }
      );

      expect(restarted.game.phase).toBe("setup");
      expect(restarted.game.buildings).toEqual([]);
      expect(restarted.game.roads).toEqual([]);
      expect(restarted.game.mapSeed).toMatch(/^M1-[0-9A-F]{16}$/);
      expect(restarted.game.mapSeed === initial.game.mapSeed).toBe(mode === "sameMap");
      expect(restarted.selectedDiceTotal).toBe(8);
      expect(restarted.selectedPlayerId).toBe("p1");
      expect(restarted.notice).toBeNull();
    }
  );

  it.each(["accept", "cancel"] as const)(
    "removes a pending Local player trade after %s",
    (resolution) => {
      const scenario = createScenarioAppState();
      const active = {
        ...scenario,
        game: {
          ...scenario.game,
          turnState: { phase: "action" as const, pendingDiscards: {}, developmentCardPlayed: false },
          players: scenario.game.players.map((player) => ({
            ...player,
            resources: player.id === "p1"
              ? { ...noResources, wool: 1 }
              : player.id === "p2"
                ? { ...noResources, ore: 1 }
                : { ...noResources }
          }))
        }
      };
      const published = gameReducer(active, {
        type: "PUBLISH_PLAYER_TRADE",
        playerId: "p1",
        offered: { ...noResources, wool: 1 },
        requested: { ...noResources, ore: 1 }
      });

      const resolved = gameReducer(
        published,
        resolution === "accept"
          ? { type: "ACCEPT_PLAYER_TRADE", playerId: "p2" }
          : { type: "CANCEL_PLAYER_TRADE", playerId: "p1" }
      );

      expect(published.pendingPlayerTrade).toBeDefined();
      expect(resolved.pendingPlayerTrade).toBeUndefined();
      expect(Object.hasOwn(resolved, "pendingPlayerTrade")).toBe(false);
    }
  );

  it.each(["fresh", "sameMap"] as const)(
    "projects and dispatches the Local %s restart mode without confirmation",
    (mode) => {
      const state = createInitialAppState();
      const commands: unknown[] = [];
      const view = createLocalGameTableView(state) as GameTableView & {
        restart?: { enabled: boolean; requiresConfirmation: boolean };
      };
      const controller = createLocalGameTableController(
        () => state,
        (command) => commands.push(command)
      );

      controller.dispatch({ type: "game.restart", mode } as never);

      expect(view.game.mapSeed).toBe(state.game.mapSeed);
      expect(view.restart).toEqual({ enabled: true, requiresConfirmation: false });
      expect(commands).toEqual([{ type: "START_NEW_GAME", mode }]);
    }
  );

  it("renders the existing local table from an explicit local view adapter", () => {
    const state = createInitialAppState();
    const view = createLocalGameTableView(state);
    const html = renderToString(
      createElement(GameTable, { view, dispatch: () => undefined })
    );

    expect(view.game).not.toHaveProperty("developmentDeck");
    expect(view.guild).not.toHaveProperty("gathering.auctionResults");
    expect(view.game.players.every((player) => !("resources" in player))).toBe(true);
    expect(view.controlledPlayers).toHaveLength(state.game.players.length);
    expect(view.controlledPlayers[0]?.resources).not.toBe(state.game.players[0]?.resources);
    expect(view.game.players.every((player) => !("privateResources" in player))).toBe(true);
    expect(html).toContain('class="game-shell"');
    expect(html).toContain('class="avatar avatar-slot-1"');
    expect(html).not.toContain('style="border-color:');
    expect(html).toContain('aria-label="Catan board"');
    expect(html).toContain('data-action="roll-dice"');
  });

  it("maps actorless and opaque-control intents only in the local adapter", () => {
    const state = createInitialAppState();
    const commands: unknown[] = [];
    const controller = createLocalGameTableController(() => state, (command) => commands.push(command));
    const view = createLocalGameTableView(state);

    controller.dispatch({ type: "turn.roll" });
    controller.dispatch({
      type: "decision.discard",
      controlId: view.controlledPlayers[1]!.controlId,
      resources: { wood: 0, brick: 0, wool: 0, grain: 0, ore: 0 }
    });

    expect(commands).toEqual([
      { type: "ROLL_DICE", playerId: state.game.activePlayerId },
      {
        type: "DISCARD_FOR_SEVEN",
        playerId: state.game.players[1]!.id,
        resources: { wood: 0, brick: 0, wool: 0, grain: 0, ore: 0 }
      }
    ]);
  });

  it("renders a caller-only projection without opponent private controls", () => {
    const callerOnly = callerOnlyFixture();
    const html = renderToString(
      createElement(GameTable, { view: callerOnly, dispatch: () => undefined })
    );

    expect(html).toContain("Caller");
    expect(html).toContain("Opponent");
    expect(html).toContain("Wd 1");
    expect(html).not.toContain("opponent-secret-ore-4");
  });

  it("accumulates replaceable local sealed bids by round and resolves only after all controls submit", () => {
    let state = createInitialAppState();
    state = {
      ...state,
      game: {
        ...state.game,
        players: state.game.players.map((player) => ({ ...player, guildTokens: 3 }))
      },
      guild: {
        ...state.guild,
        gathering: { ...state.guild.gathering, phase: "auction", auctionRound: 1 }
      }
    };
    const commands: unknown[] = [];
    const controller = createLocalGameTableController(() => state, (command) => commands.push(command));
    const controls = createLocalGameTableView(state).controlledPlayers;

    controller.dispatch({ type: "auction.submitBid", controlId: controls[0]!.controlId, bid: 1 });
    controller.dispatch({ type: "auction.submitBid", controlId: controls[0]!.controlId, bid: 2 });
    controller.dispatch({ type: "auction.submitBid", controlId: controls[1]!.controlId, bid: 0 });
    controller.dispatch({ type: "auction.submitBid", controlId: controls[2]!.controlId, bid: 0 });
    expect(commands).toHaveLength(0);
    controller.dispatch({ type: "auction.submitBid", controlId: controls[3]!.controlId, bid: 0 });
    expect(commands).toEqual([{ type: "RESOLVE_AUCTION", bids: { p1: 2, p2: 0, p3: 0, p4: 0 } }]);

    commands.length = 0;
    state = { ...state, guild: { ...state.guild, gathering: { ...state.guild.gathering, auctionRound: 2 } } };
    for (const control of controls) {
      controller.dispatch({ type: "auction.submitBid", controlId: control.controlId, bid: 0 });
    }
    expect(commands).toEqual([{ type: "RESOLVE_AUCTION", bids: { p1: 0, p2: 0, p3: 0, p4: 0 } }]);
  });

  it("clears partial sealed bids when a new game starts even if the round key repeats", () => {
    const state = createInitialAppState();
    const commands: unknown[] = [];
    const controller = createLocalGameTableController(() => state, (command) => commands.push(command));
    const controls = createLocalGameTableView(state).controlledPlayers;

    controller.dispatch({ type: "auction.submitBid", controlId: controls[0]!.controlId, bid: 1 });
    controller.dispatch({ type: "game.restart", mode: "fresh" } as never);
    commands.length = 0;
    for (const control of controls.slice(1)) {
      controller.dispatch({ type: "auction.submitBid", controlId: control.controlId, bid: 0 });
    }

    expect(commands).toHaveLength(0);
  });

  it("keeps raw authoritative and Worker owners outside the presentation modules", () => {
    const files = [
      "src/ui/GameTable.tsx",
      "src/ui/ActionDock.tsx",
      "src/ui/BoardActionTargets.tsx",
      "src/ui/CommercePanel.tsx",
      "src/ui/DevelopmentCardPanel.tsx",
      "src/ui/PlayerTradePanel.tsx",
      "src/ui/TurnFlowPanel.tsx"
    ];
    const source = files.map((file) => readFileSync(file, "utf8")).join("\n");

    expect(source).not.toMatch(/PersistedRoom|MatchCommand|MatchState|CommerceGuildState|\bGameState\b|\bPlayer\b\s*[>,]/);
    expect(source).not.toMatch(/type:\s*"(?:RESOLVE_AUCTION|ROLL_DICE|DISCARD_FOR_SEVEN|ACCEPT_PLAYER_TRADE)"/);
    expect(source).not.toMatch(/\.\.\/online\/|worker\//i);
  });
});
