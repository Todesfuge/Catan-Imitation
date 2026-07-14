import { describe, expect, it } from "vitest";
import {
  formatAvailabilityReason,
  getActionAvailabilityFacts
} from "../../src/app/actionAvailability";
import { createLocalGameTableView } from "../../src/app/localGameState";
import {
  createCommerceGuild,
  createInitialGatheringCooldown,
  createPostGatheringCooldown,
  getGatheringCooldownRemaining,
  getGatheringStartBlocker
} from "../../src/domain/expansion/commerceGuild";
import { formatM1MapSeed } from "../../src/domain/mapSeed";
import { applyMatchCommand } from "../../src/domain/match/applyMatchCommand";
import { createSetupMatch } from "../../src/domain/match/createMatch";
import { DeterministicRandomSource } from "../../src/domain/match/random";
import type {
  MatchCommand,
  MatchExecutionContext,
  MatchState
} from "../../src/domain/match/types";
import {
  getLegalSetupRoadEdgeIds,
  getLegalSetupSettlementVertexIds
} from "../../src/domain/rules/building";
import { emptyResources } from "../../src/domain/types";
import { translate, translateRuleText } from "../../src/ui/i18n";
import { createScenarioAppState } from "../fixtures/createScenarioGame";

const testSeed = formatM1MapSeed(0x1234_5678, 0x9abc_def0);

function createContext(): MatchExecutionContext {
  let logId = 0;
  return {
    random: new DeterministicRandomSource(Array.from({ length: 32 }, () => 0)),
    nextMapSeed: () => testSeed,
    nextLogId: () => `gathering-log-${++logId}`,
    now: () => 1_700_000_000_000
  };
}

function apply(state: MatchState, command: MatchCommand): MatchState {
  return applyMatchCommand(state, command, createContext());
}

function actionState(playerCount: 3 | 4 = 4, turn = 10): MatchState {
  const base = createScenarioAppState();
  const game = {
    ...base.game,
    players: base.game.players.slice(0, playerCount),
    turn,
    round: Math.floor((turn - 1) / playerCount) + 1,
    turnState: {
      phase: "action" as const,
      pendingDiscards: {}
    }
  };
  return {
    game,
    guild: {
      ...createCommerceGuild(playerCount, turn),
      gatheringCooldown: {
        availableAtTurn: turn,
        displayDuration: playerCount
      }
    },
    lastDice: { first: 1, second: 1, total: 2 }
  };
}

function withActionPhase(state: MatchState): MatchState {
  return {
    ...state,
    game: {
      ...state.game,
      turnState: {
        phase: "action",
        pendingDiscards: {}
      }
    }
  };
}

describe("Commerce Guild gathering cooldown", () => {
  it("rejects invalid inputs and cooldown-window overflow", () => {
    for (const [playerCount, currentTurn] of [
      [0, 1],
      [4.5, 1],
      [4, 0],
      [4, Number.NaN]
    ]) {
      expect(() => createCommerceGuild(playerCount, currentTurn)).toThrow(/safe integer/i);
    }

    expect(() => createInitialGatheringCooldown(Number.MAX_SAFE_INTEGER, 4)).toThrow(
      /safe integer/i
    );
    expect(() => createPostGatheringCooldown(Number.MAX_SAFE_INTEGER, 4)).toThrow(
      /safe integer/i
    );
  });

  it("localizes the cooldown label, ready state, and disabled reason", () => {
    const englishReason = formatAvailabilityReason({
      code: "GATHERING_COOLDOWN",
      params: { remainingTurns: 4 }
    });
    expect(englishReason).toBe("The gathering is available in 4 turn(s).");
    expect(translateRuleText("zh-CN", englishReason)).toBe("集会还需 4 个回合才能开启。");
    expect(translate("en", "commerce.gatheringCooldown")).toBe("Gathering cooldown");
    expect(translate("zh-CN", "commerce.gatheringReady")).toBe("可开启");
  });

  it.each([
    [3, 6],
    [4, 8]
  ] as const)("starts a %i-player new and restarted match at %i turns", (playerCount, expected) => {
    const seats = Array.from({ length: playerCount }, (_, index) => ({
      nickname: `Player ${index + 1}`
    }));
    const match = createSetupMatch(seats, { kind: "seed", seed: testSeed }, createContext());

    expect(
      getGatheringCooldownRemaining(match.guild.gatheringCooldown, match.game.turn)
    ).toBe(expected);

    const vertexId = getLegalSetupSettlementVertexIds(
      match.game,
      match.game.activePlayerId
    )[0];
    const withSettlement = apply(match, {
      type: "PLACE_SETUP_SETTLEMENT",
      playerId: match.game.activePlayerId,
      vertexId
    });
    const edgeId = getLegalSetupRoadEdgeIds(
      withSettlement.game,
      withSettlement.game.activePlayerId
    )[0];
    const withRoad = apply(withSettlement, {
      type: "PLACE_SETUP_ROAD",
      playerId: withSettlement.game.activePlayerId,
      edgeId
    });

    expect(withRoad.game.turn).toBe(match.game.turn);
    expect(
      getGatheringCooldownRemaining(withRoad.guild.gatheringCooldown, withRoad.game.turn)
    ).toBe(expected);

    for (const mode of ["sameMap", "fresh"] as const) {
      const restarted = apply(withRoad, { type: "START_NEW_GAME", mode });
      expect(
        getGatheringCooldownRemaining(
          restarted.guild.gatheringCooldown,
          restarted.game.turn
        )
      ).toBe(expected);
    }
  });

  it.each([3, 4] as const)(
    "excludes the initiating turn and reaches zero after %i subsequent turns",
    (playerCount) => {
      const ready = actionState(playerCount);
      const started = apply(ready, {
        type: "START_GATHERING",
        playerId: ready.game.activePlayerId
      });

      expect(started.guild.gathering.phase).toBe("redemption");
      expect(
        getGatheringCooldownRemaining(
          started.guild.gatheringCooldown,
          started.game.turn
        )
      ).toBe(playerCount);

      let progressed = apply(
        {
          ...started,
          guild: {
            ...started.guild,
            gathering: {
              ...started.guild.gathering,
              phase: "complete"
            }
          }
        },
        { type: "END_TURN", playerId: started.game.activePlayerId }
      );
      expect(
        getGatheringCooldownRemaining(
          progressed.guild.gatheringCooldown,
          progressed.game.turn
        )
      ).toBe(playerCount);

      for (let completedTurns = 1; completedTurns <= playerCount; completedTurns += 1) {
        progressed = withActionPhase(progressed);
        progressed = apply(progressed, {
          type: "END_TURN",
          playerId: progressed.game.activePlayerId
        });
        expect(
          getGatheringCooldownRemaining(
            progressed.guild.gatheringCooldown,
            progressed.game.turn
          )
        ).toBe(playerCount - completedTurns);
      }
    }
  );

  it("shares one prioritized blocker between availability and authoritative rejection", () => {
    const ready = actionState();
    const cases: Array<{
      expected: ReturnType<typeof getGatheringStartBlocker>;
      expectedReason: string;
      state: MatchState;
      playerId: string;
    }> = [
      {
        expected: "notPlaying",
        expectedReason: "GATHERING_ONLY_DURING_PLAY",
        playerId: "p2",
        state: {
          ...ready,
          game: {
            ...ready.game,
            phase: "gameOver",
            turnState: { phase: "awaitingRoll", pendingDiscards: {} }
          }
        }
      },
      {
        expected: "unresolvedAction",
        expectedReason: "ROLL_REQUIRED",
        playerId: "p2",
        state: {
          ...ready,
          game: {
            ...ready.game,
            turnState: { phase: "awaitingRoll", pendingDiscards: {} }
          }
        }
      },
      {
        expected: "notCurrentPlayer",
        expectedReason: "NOT_YOUR_TURN",
        playerId: "p2",
        state: ready
      },
      {
        expected: "pendingTrade",
        expectedReason: "PLAYER_TRADE_ALREADY_OPEN",
        playerId: "p1",
        state: {
          ...ready,
          pendingPlayerTrade: {
            proposerId: "p1",
            offered: { ...emptyResources(), wood: 1 },
            requested: { ...emptyResources(), brick: 1 }
          }
        }
      },
      {
        expected: "gatheringInProgress",
        expectedReason: "GATHERING_IN_PROGRESS",
        playerId: "p1",
        state: {
          ...ready,
          guild: {
            ...ready.guild,
            gathering: { ...ready.guild.gathering, phase: "redemption" }
          }
        }
      },
      {
        expected: "cooldown",
        expectedReason: "GATHERING_COOLDOWN",
        playerId: "p1",
        state: {
          ...ready,
          guild: createCommerceGuild(4, ready.game.turn)
        }
      }
    ];

    for (const blocked of cases) {
      expect(
        getGatheringStartBlocker(
          blocked.state.game,
          blocked.state.guild,
          blocked.playerId,
          blocked.state.pendingPlayerTrade !== undefined
        )
      ).toBe(blocked.expected);
      expect(
        getActionAvailabilityFacts(blocked.state, blocked.playerId)
          .commerce.startGathering.disabledReason?.code
      ).toBe(blocked.expectedReason);

      const before = structuredClone(blocked.state);
      expect(() =>
        apply(blocked.state, {
          type: "START_GATHERING",
          playerId: blocked.playerId
        })
      ).toThrow();
      expect(blocked.state).toEqual(before);
    }

    const cooldownFacts = getActionAvailabilityFacts(
      cases.at(-1)!.state,
      "p1"
    );
    expect(cooldownFacts.commerce.startGathering).toEqual({
      enabled: false,
      disabledReason: {
        code: "GATHERING_COOLDOWN",
        params: { remainingTurns: 8 }
      },
      targets: []
    });
  });

  it("starts once when ready and projects the same derived table value", () => {
    const ready = actionState();
    const started = apply(ready, {
      type: "START_GATHERING",
      playerId: ready.game.activePlayerId
    });

    expect(started.guild.gathering.phase).toBe("redemption");
    expect(started.game.log[0]).toMatchObject({
      messageKey: "guild.gatheringStarted"
    });
    expect(
      getGatheringCooldownRemaining(
        started.guild.gatheringCooldown,
        started.game.turn
      )
    ).toBe(4);

    const localState = createScenarioAppState();
    expect(createLocalGameTableView(localState).guild.gathering.cooldownRemaining).toBe(8);
  });

  it("never starts automatically after crossing the old six-round boundary", () => {
    let state = actionState(4, 1);

    for (let completedTurns = 0; completedTurns < 28; completedTurns += 1) {
      state = withActionPhase(state);
      state = apply(state, {
        type: "END_TURN",
        playerId: state.game.activePlayerId
      });
      expect(state.guild.gathering.phase).toBe("idle");
    }

    expect(state.game.log.some(
      (entry) => (entry.messageKey as string | undefined) === "guild.gatheringAutoStarted"
    )).toBe(false);
  });

  it("returns a complete gathering to idle on end turn without clearing its result", () => {
    const ready = actionState();
    const completed: MatchState = {
      ...ready,
      guild: {
        ...ready.guild,
        gathering: {
          ...ready.guild.gathering,
          phase: "complete",
          lastAuctionResult: {
            winnerId: "p1",
            winnerName: ready.game.players[0].name,
            round: 1,
            winningBid: 1,
            outcome: { kind: "voucher" }
          }
        }
      }
    };
    const windowBefore = completed.guild.gatheringCooldown;
    const resultBefore = completed.guild.gathering.lastAuctionResult;

    const rejected = {
      ...completed,
      game: {
        ...completed.game,
        turnState: { phase: "awaitingRoll" as const, pendingDiscards: {} }
      }
    };
    const rejectedBefore = structuredClone(rejected);
    expect(() => apply(rejected, {
      type: "END_TURN",
      playerId: rejected.game.activePlayerId
    })).toThrow();
    expect(rejected).toEqual(rejectedBefore);
    expect(rejected.guild.gathering.phase).toBe("complete");

    const ended = apply(completed, {
      type: "END_TURN",
      playerId: completed.game.activePlayerId
    });

    expect(ended.guild.gathering.phase).toBe("idle");
    expect(ended.guild.gatheringCooldown).toEqual(windowBefore);
    expect(ended.guild.gathering.lastAuctionResult).toEqual(resultBefore);
  });
});
