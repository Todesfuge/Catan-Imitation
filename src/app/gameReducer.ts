import {
  completeTradeSlot,
  createCommerceGuild,
  maybeStartGuildGathering,
  openGuildAuction,
  redeemGatheringResources,
  redeemPrizeCards,
  resolveAuctionRound,
  startGuildGathering,
  transferGuildTokens,
  type CommerceGuildState,
  type ResourceCost,
  type TradeSlot
} from "../domain/expansion/commerceGuild";
import { createDemoGame, createSetupGame } from "../domain/setup";
import { applyProduction } from "../domain/rules/production";
import { advanceTurn } from "../domain/rules/turns";
import {
  assertCanRoll,
  assertCanUseTurnAction,
  assertGameInProgress,
  advanceRoadBuildingEffect,
  beginKnightRobber,
  beginPendingDevelopmentEffect,
  beginSevenRoll,
  completePendingDevelopmentEffect,
  enterActionPhase,
  getKnightResumePhase,
  getPendingDevelopmentEffect,
  placePendingRobber,
  resetTurnFlow,
  stealPendingRobberResource,
  submitSevenDiscard
} from "../domain/rules/turnFlow";
import {
  buildCity,
  buildRoad,
  buildSettlement,
  getLegalRoadEdgeIds,
  placeSetupRoad,
  placeSetupSettlement,
  placeFreeRoad
} from "../domain/rules/building";
import {
  buyDevelopmentCard,
  chooseMonopolyResource,
  chooseYearOfPlentyResource,
  playDevelopmentCard,
  playKnightCard
} from "../domain/rules/developmentCards";
import { updateLongestRoadAward } from "../domain/rules/longestRoad";
import { maritimeTrade } from "../domain/rules/maritimeTrade";
import { calculatePlayerScore } from "../domain/rules/scoring";
import {
  resources,
  type GameLogEntry,
  type GameState,
  type HexId,
  type PlayerId,
  type Resource,
  type ResourceMap
} from "../domain/types";
import { RuleViolationError } from "../domain/errors";

export interface DiceRoll {
  first: number;
  second: number;
  total: number;
}

export interface AppState {
  game: GameState;
  guild: CommerceGuildState;
  lastDice: DiceRoll | null;
  selectedDiceTotal: number;
  selectedPlayerId: PlayerId;
  notice: string | null;
}

export type GameCommand =
  | { type: "START_NEW_GAME" }
  | { type: "PLACE_SETUP_SETTLEMENT"; playerId: PlayerId; vertexId: string }
  | { type: "PLACE_SETUP_ROAD"; playerId: PlayerId; edgeId: string }
  | { type: "ROLL_DICE"; playerId: PlayerId; dice?: [number, number] }
  | { type: "END_TURN"; playerId: PlayerId }
  | { type: "BUILD_ROAD"; playerId: PlayerId; edgeId: string }
  | { type: "BUILD_SETTLEMENT"; playerId: PlayerId; vertexId: string }
  | { type: "BUILD_CITY"; playerId: PlayerId; buildingId: string }
  | { type: "BUY_DEVELOPMENT_CARD"; playerId: PlayerId }
  | { type: "PLAY_DEVELOPMENT_CARD"; playerId: PlayerId; cardId: string }
  | { type: "PLAY_KNIGHT_CARD"; playerId: PlayerId; cardId: string }
  | { type: "PLACE_FREE_ROAD"; playerId: PlayerId; edgeId: string }
  | { type: "CHOOSE_YEAR_OF_PLENTY_RESOURCE"; playerId: PlayerId; resource: Resource }
  | { type: "CHOOSE_MONOPOLY_RESOURCE"; playerId: PlayerId; resource: Resource }
  | { type: "MARITIME_TRADE"; playerId: PlayerId; give: Resource; receive: Resource }
  | { type: "DISCARD_FOR_SEVEN"; playerId: PlayerId; resources: ResourceMap }
  | { type: "PLACE_ROBBER"; playerId: PlayerId; hexId: HexId }
  | {
      type: "STEAL_ROBBER_RESOURCE";
      playerId: PlayerId;
      victimId: PlayerId;
      random?: () => number;
    }
  | { type: "COMPLETE_TRADE_SLOT"; playerId: PlayerId; slotId: string }
  | { type: "TRANSFER_TOKENS"; fromPlayerId: PlayerId; toPlayerId: PlayerId; amount: number }
  | { type: "START_GATHERING" }
  | { type: "OPEN_AUCTION" }
  | { type: "REDEEM_GATHERING"; playerId: PlayerId; resources: ResourceCost }
  | { type: "RESOLVE_AUCTION"; bids: Record<PlayerId, number> }
  | { type: "REDEEM_PRIZE"; playerId: PlayerId }
  | { type: "SELECT_DICE_TOTAL"; diceTotal: number }
  | { type: "SELECT_PLAYER"; playerId: PlayerId };

let logCounter = 0;

function log(message: string): GameLogEntry {
  logCounter += 1;
  return {
    id: `log-${logCounter}`,
    message
  };
}

function rollDie(): number {
  return 1 + Math.floor(Math.random() * 6);
}

function generateTradeSlot(seed: number): TradeSlot {
  const first = resources[seed % resources.length];
  const second = resources[(seed + 2) % resources.length];
  const requires: ResourceCost = seed % 2 === 0 ? { [first]: 2 } : { [first]: 1, [second]: 1 };

  return {
    id: `guild-offer-${seed}`,
    requires,
    tokenReward: seed % 2 === 0 ? 2 : 3
  };
}

function withWinnerState(game: GameState, playerId = game.activePlayerId): GameState {
  if (game.phase === "gameOver") {
    return game;
  }

  if (calculatePlayerScore(game, playerId) < game.targetScore) {
    return game;
  }

  return {
    ...game,
    phase: "gameOver",
    winnerId: playerId
  };
}

function getPlayerName(game: GameState, playerId: PlayerId): string {
  return game.players.find((player) => player.id === playerId)?.name ?? playerId;
}

export function createInitialAppState(): AppState {
  const game = createDemoGame();
  return {
    game,
    guild: createCommerceGuild(),
    lastDice: null,
    notice: null,
    selectedDiceTotal: 8,
    selectedPlayerId: game.activePlayerId
  };
}

function applyDiceRoll(game: GameState, diceTotal: number): GameState {
  const production = applyProduction(game, diceTotal);

  return {
    ...production.game,
    log: [
      log(
        `${game.players.find((player) => player.id === game.activePlayerId)?.name ?? "Player"} rolled ${diceTotal}; ${production.events.length} production events resolved.`
      ),
      ...production.game.log
    ]
  };
}

function startDevelopmentCardEffect(
  state: AppState,
  playerId: PlayerId,
  cardId: string
): AppState {
  const played = playDevelopmentCard(state.game, playerId, cardId);
  let effectGame: GameState;

  if (played.card.kind === "knight") {
    effectGame = beginKnightRobber(played.game, played.resumePhase);
  } else {
    effectGame = beginPendingDevelopmentEffect(
      played.game,
      playerId,
      played.card.kind,
      played.resumePhase
    );
    if (
      played.card.kind === "roadBuilding" &&
      getLegalRoadEdgeIds(effectGame, playerId).length === 0
    ) {
      effectGame = completePendingDevelopmentEffect(effectGame);
    }
    if (
      played.card.kind === "yearOfPlenty" &&
      resources.every((resource) => effectGame.bank.resources[resource] === 0)
    ) {
      effectGame = completePendingDevelopmentEffect(effectGame);
    }
  }

  return {
    ...state,
    game: {
      ...effectGame,
      log: [
        log(`${getPlayerName(state.game, playerId)} played ${played.card.kind}.`),
        ...effectGame.log
      ]
    }
  };
}

function executeGameCommand(state: AppState, command: GameCommand): AppState {
  switch (command.type) {
    case "START_NEW_GAME": {
      const game = createSetupGame();
      return {
        game: {
          ...game,
          log: [log("New game setup started."), ...game.log]
        },
        guild: createCommerceGuild(),
        lastDice: null,
        notice: null,
        selectedDiceTotal: 8,
        selectedPlayerId: game.activePlayerId
      };
    }
    case "PLACE_SETUP_SETTLEMENT":
      return {
        ...state,
        game: placeSetupSettlement(state.game, command.playerId, command.vertexId)
      };
    case "PLACE_SETUP_ROAD":
      return {
        ...state,
        game: placeSetupRoad(state.game, command.playerId, command.edgeId)
      };
    case "ROLL_DICE": {
      assertCanRoll(state.game, command.playerId);
      const [first, second] = command.dice ?? [rollDie(), rollDie()];
      const total = first + second;
      const rolledGame =
        total === 7
          ? {
              ...beginSevenRoll(state.game),
              log: [log("A 7 was rolled; resolve discards and the robber."), ...state.game.log]
            }
          : enterActionPhase(applyDiceRoll(state.game, total));
      return {
        ...state,
        game: total === 7 ? rolledGame : withWinnerState(rolledGame),
        lastDice: { first, second, total }
      };
    }
    case "DISCARD_FOR_SEVEN": {
      const discardedGame = submitSevenDiscard(state.game, command.playerId, command.resources);
      return {
        ...state,
        game: {
          ...discardedGame,
          log: [log(`${getPlayerName(state.game, command.playerId)} completed a seven-roll discard.`), ...discardedGame.log]
        }
      };
    }
    case "END_TURN":
      assertCanUseTurnAction(state.game, command.playerId);
      {
        const nextGame = resetTurnFlow(advanceTurn(state.game));
        const resetGuild = {
          ...state.guild,
          usedTradePlayerIds: []
        };
        const nextGuild =
          nextGame.round > state.game.round
            ? maybeStartGuildGathering(nextGame, resetGuild)
            : resetGuild;
        const gatheringStarted =
          resetGuild.gathering.phase === "idle" && nextGuild.gathering.phase === "redemption";

        return {
          ...state,
          game: {
            ...nextGame,
            log: gatheringStarted
              ? [log("The Commerce Guild gathering has started automatically."), ...nextGame.log]
              : nextGame.log
          },
          guild: nextGuild,
          lastDice: null
        };
      }
    case "BUILD_ROAD":
      assertCanUseTurnAction(state.game, command.playerId);
      return {
        ...state,
        game: withWinnerState(
          updateLongestRoadAward(buildRoad(state.game, command.playerId, command.edgeId)),
          command.playerId
        )
      };
    case "BUILD_SETTLEMENT":
      assertCanUseTurnAction(state.game, command.playerId);
      return {
        ...state,
        game: withWinnerState(
          updateLongestRoadAward(buildSettlement(state.game, command.playerId, command.vertexId)),
          command.playerId
        )
      };
    case "BUILD_CITY":
      assertCanUseTurnAction(state.game, command.playerId);
      return {
        ...state,
        game: withWinnerState(buildCity(state.game, command.playerId, command.buildingId), command.playerId)
      };
    case "BUY_DEVELOPMENT_CARD": {
      assertCanUseTurnAction(state.game, command.playerId);
      const result = buyDevelopmentCard(state.game, command.playerId);
      return {
        ...state,
        game: {
          ...withWinnerState(result.game, command.playerId),
          log: [log(`${command.playerId} bought a development card.`), ...result.game.log]
        }
      };
    }
    case "PLAY_KNIGHT_CARD":
      {
        const resumePhase = getKnightResumePhase(state.game, command.playerId);
        const knightGame = beginKnightRobber(
          playKnightCard(state.game, command.playerId, command.cardId),
          resumePhase
        );
        return {
          ...state,
          game: {
            ...knightGame,
            log: [log(`${command.playerId} played a knight card; move the robber.`), ...knightGame.log]
          }
        };
      }
    case "PLAY_DEVELOPMENT_CARD":
      return startDevelopmentCardEffect(state, command.playerId, command.cardId);
    case "PLACE_FREE_ROAD": {
      getPendingDevelopmentEffect(state.game, command.playerId, "roadBuilding");
      const placedGame = updateLongestRoadAward(
        placeFreeRoad(state.game, command.playerId, command.edgeId)
      );
      const progressedGame = advanceRoadBuildingEffect(
        placedGame,
        command.playerId,
        getLegalRoadEdgeIds(placedGame, command.playerId).length > 0
      );
      return {
        ...state,
        game: {
          ...withWinnerState(progressedGame, command.playerId),
          log: [
            log(`${getPlayerName(state.game, command.playerId)} placed a free road.`),
            ...progressedGame.log
          ]
        }
      };
    }
    case "CHOOSE_YEAR_OF_PLENTY_RESOURCE": {
      const result = chooseYearOfPlentyResource(
        state.game,
        command.playerId,
        command.resource
      );
      return {
        ...state,
        game: {
          ...result,
          log: [log(`Year of Plenty supplied ${command.resource}.`), ...result.log]
        }
      };
    }
    case "CHOOSE_MONOPOLY_RESOURCE": {
      const result = chooseMonopolyResource(state.game, command.playerId, command.resource);
      return {
        ...state,
        game: {
          ...result,
          log: [log(`Monopoly collected all opponent ${command.resource}.`), ...result.log]
        }
      };
    }
    case "MARITIME_TRADE":
      assertCanUseTurnAction(state.game, command.playerId);
      return {
        ...state,
        game: {
          ...maritimeTrade(state.game, command.playerId, command.give, command.receive),
          log: [
            log(`${command.playerId} completed a maritime trade: ${command.give} for ${command.receive}.`),
            ...state.game.log
          ]
        }
      };
    case "PLACE_ROBBER": {
      const robberGame = placePendingRobber(state.game, command.playerId, command.hexId);
      const resolvedGame =
        robberGame.turnState.phase === "awaitingRobberVictim"
          ? robberGame
          : withWinnerState(robberGame, command.playerId);
      return {
        ...state,
        game: {
          ...resolvedGame,
          log: [log(`Robber moved to ${command.hexId}.`), ...resolvedGame.log]
        }
      };
    }
    case "STEAL_ROBBER_RESOURCE": {
      const stolenGame = stealPendingRobberResource(
        state.game,
        command.playerId,
        command.victimId,
        command.random
      );
      const resolvedGame = withWinnerState(stolenGame, command.playerId);
      return {
        ...state,
        game: {
          ...resolvedGame,
          log: [
            log(
              `${getPlayerName(state.game, command.playerId)} stole one random resource from ${getPlayerName(state.game, command.victimId)}.`
            ),
            ...resolvedGame.log
          ]
        }
      };
    }
    case "COMPLETE_TRADE_SLOT": {
      assertCanUseTurnAction(state.game, command.playerId);
      const result = completeTradeSlot(
        state.game,
        state.guild,
        command.playerId,
        command.slotId,
        generateTradeSlot(state.game.turn + state.guild.tradeSlots.length + state.guild.usedTradePlayerIds.length)
      );
      return {
        ...state,
        game: {
          ...result.game,
          log: [log("Commerce Guild trade completed and the slot refreshed."), ...result.game.log]
        },
        guild: result.guild
      };
    }
    case "TRANSFER_TOKENS":
      assertCanUseTurnAction(state.game, command.fromPlayerId);
      return {
        ...state,
        game: {
          ...transferGuildTokens(
            state.game,
            command.fromPlayerId,
            command.toPlayerId,
            command.amount
          ),
          log: [
            log(
              `${getPlayerName(state.game, command.fromPlayerId)} transferred ${command.amount} guild token(s) to ${getPlayerName(state.game, command.toPlayerId)}.`
            ),
            ...state.game.log
          ]
        }
      };
    case "START_GATHERING":
      assertGameInProgress(state.game);
      return {
        ...state,
        guild: startGuildGathering(state.guild),
        game: {
          ...state.game,
          log: [log("The Commerce Guild gathering has started."), ...state.game.log]
        }
      };
    case "OPEN_AUCTION":
      assertGameInProgress(state.game);
      return {
        ...state,
        guild: openGuildAuction(state.guild),
        game: {
          ...state.game,
          log: [log("The Commerce Guild auction phase is open."), ...state.game.log]
        }
      };
    case "REDEEM_GATHERING": {
      assertGameInProgress(state.game);
      const result = redeemGatheringResources(state.game, state.guild, command.playerId, command.resources);
      return {
        ...state,
        game: {
          ...result.game,
          log: [log(`${command.playerId} redeemed guild tokens for resources.`), ...result.game.log]
        },
        guild: result.guild
      };
    }
    case "RESOLVE_AUCTION": {
      assertGameInProgress(state.game);
      const result = resolveAuctionRound(state.game, state.guild, command.bids);
      return {
        ...state,
        game: {
          ...result.game,
          log: [
            log(
              result.summary
            ),
            ...result.game.log
          ]
        },
        guild: result.guild
      };
    }
    case "REDEEM_PRIZE":
      assertCanUseTurnAction(state.game, command.playerId);
      return {
        ...state,
        game: {
          ...withWinnerState(redeemPrizeCards(state.game, command.playerId), command.playerId),
          log: [log(`${command.playerId} redeemed vouchers for prize cards.`), ...state.game.log]
        }
      };
    case "SELECT_DICE_TOTAL":
      return {
        ...state,
        selectedDiceTotal: command.diceTotal
      };
    case "SELECT_PLAYER":
      return {
        ...state,
        selectedPlayerId: command.playerId
      };
  }
}

export function gameReducer(state: AppState, command: GameCommand): AppState {
  try {
    return {
      ...executeGameCommand(state, command),
      notice: null
    };
  } catch (error) {
    if (!(error instanceof RuleViolationError)) {
      throw error;
    }
    return {
      ...state,
      notice: error instanceof Error ? error.message : "Action failed."
    };
  }
}

/** Throwing command executor for domain-focused tests. Production UI must use gameReducer. */
export const unsafeExecuteGameCommandForTests = executeGameCommand;
