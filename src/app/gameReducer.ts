import {
  completeTradeSlot,
  createCommerceGuild,
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
import { createDemoGame } from "../domain/setup";
import { applyProduction, resolveSevenRoll } from "../domain/rules/production";
import { advanceTurn } from "../domain/rules/turns";
import { buildCity, buildRoad, buildSettlement } from "../domain/rules/building";
import { buyDevelopmentCard, playKnightCard } from "../domain/rules/developmentCards";
import { updateLongestRoadAward } from "../domain/rules/longestRoad";
import { maritimeTrade } from "../domain/rules/maritimeTrade";
import { calculatePlayerScore } from "../domain/rules/scoring";
import {
  resources,
  type GameLogEntry,
  type GameState,
  type HexId,
  type PlayerId,
  type Resource
} from "../domain/types";

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
}

export type GameCommand =
  | { type: "ROLL_DICE"; dice?: [number, number] }
  | { type: "END_TURN" }
  | { type: "BUILD_ROAD"; playerId: PlayerId; edgeId: string }
  | { type: "BUILD_SETTLEMENT"; playerId: PlayerId; vertexId: string }
  | { type: "BUILD_CITY"; playerId: PlayerId; buildingId: string }
  | { type: "BUY_DEVELOPMENT_CARD"; playerId: PlayerId }
  | { type: "PLAY_KNIGHT_CARD"; playerId: PlayerId; cardId: string; targetHexId: HexId }
  | { type: "MARITIME_TRADE"; playerId: PlayerId; give: Resource; receive: Resource }
  | { type: "PLACE_ROBBER"; hexId: HexId }
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

function assertCanUseNormalAction(game: GameState): void {
  if (game.phase === "setup") {
    throw new Error("This action is unavailable during setup.");
  }

  if (game.phase === "gameOver") {
    throw new Error("The game is already over.");
  }
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

export function createInitialAppState(): AppState {
  const game = createDemoGame();
  return {
    game,
    guild: createCommerceGuild(),
    lastDice: null,
    selectedDiceTotal: 8,
    selectedPlayerId: game.activePlayerId
  };
}

function applyDiceRoll(game: GameState, diceTotal: number): GameState {
  if (diceTotal === 7) {
    const robberGame = resolveSevenRoll(game, game.robberHexId);
    return {
      ...robberGame,
      log: [log("A 7 was rolled; robber pressure resolved."), ...robberGame.log]
    };
  }

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

export function gameReducer(state: AppState, command: GameCommand): AppState {
  switch (command.type) {
    case "ROLL_DICE": {
      assertCanUseNormalAction(state.game);
      const [first, second] = command.dice ?? [rollDie(), rollDie()];
      const total = first + second;
      return {
        ...state,
        game: withWinnerState(applyDiceRoll(state.game, total)),
        lastDice: { first, second, total }
      };
    }
    case "END_TURN":
      assertCanUseNormalAction(state.game);
      return {
        ...state,
        game: advanceTurn(state.game),
        guild: {
          ...state.guild,
          usedTradePlayerIds: []
        }
      };
    case "BUILD_ROAD":
      assertCanUseNormalAction(state.game);
      return {
        ...state,
        game: withWinnerState(
          updateLongestRoadAward(buildRoad(state.game, command.playerId, command.edgeId)),
          command.playerId
        )
      };
    case "BUILD_SETTLEMENT":
      assertCanUseNormalAction(state.game);
      return {
        ...state,
        game: withWinnerState(buildSettlement(state.game, command.playerId, command.vertexId), command.playerId)
      };
    case "BUILD_CITY":
      assertCanUseNormalAction(state.game);
      return {
        ...state,
        game: withWinnerState(buildCity(state.game, command.playerId, command.buildingId), command.playerId)
      };
    case "BUY_DEVELOPMENT_CARD": {
      assertCanUseNormalAction(state.game);
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
      assertCanUseNormalAction(state.game);
      return {
        ...state,
        game: {
          ...withWinnerState(
            playKnightCard(state.game, command.playerId, command.cardId, command.targetHexId),
            command.playerId
          ),
          log: [log(`${command.playerId} played a knight card.`), ...state.game.log]
        }
      };
    case "MARITIME_TRADE":
      assertCanUseNormalAction(state.game);
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
    case "PLACE_ROBBER":
      assertCanUseNormalAction(state.game);
      return {
        ...state,
        game: {
          ...state.game,
          robberHexId: command.hexId,
          log: [log(`Robber moved to ${command.hexId}.`), ...state.game.log]
        }
      };
    case "COMPLETE_TRADE_SLOT": {
      assertCanUseNormalAction(state.game);
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
      assertCanUseNormalAction(state.game);
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
              `${command.fromPlayerId} transferred ${command.amount} guild token(s) to ${command.toPlayerId}.`
            ),
            ...state.game.log
          ]
        }
      };
    case "START_GATHERING":
      assertCanUseNormalAction(state.game);
      return {
        ...state,
        guild: startGuildGathering(state.guild),
        game: {
          ...state.game,
          log: [log("The Commerce Guild gathering has started."), ...state.game.log]
        }
      };
    case "OPEN_AUCTION":
      assertCanUseNormalAction(state.game);
      return {
        ...state,
        guild: openGuildAuction(state.guild),
        game: {
          ...state.game,
          log: [log("The Commerce Guild auction phase is open."), ...state.game.log]
        }
      };
    case "REDEEM_GATHERING": {
      assertCanUseNormalAction(state.game);
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
      assertCanUseNormalAction(state.game);
      const result = resolveAuctionRound(state.game, state.guild, command.bids);
      return {
        ...state,
        game: {
          ...result.game,
          log: [
            log(
              `${result.winnerId} won auction round ${state.guild.gathering.auctionRound} with ${result.winningBid} token(s).`
            ),
            ...result.game.log
          ]
        },
        guild: result.guild
      };
    }
    case "REDEEM_PRIZE":
      assertCanUseNormalAction(state.game);
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
