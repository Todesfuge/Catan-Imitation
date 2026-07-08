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
import { collectProduction } from "../domain/rules/production";
import { advanceTurn } from "../domain/rules/turns";
import { buildCity, buildRoad, buildSettlement } from "../domain/rules/building";
import {
  addResourceMaps,
  resources,
  type GameLogEntry,
  type GameState,
  type HexId,
  type PlayerId
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

function applyProductionToHands(game: GameState, diceTotal: number): GameState {
  const production = collectProduction(game, diceTotal);

  return {
    ...game,
    players: game.players.map((player) => ({
      ...player,
      resources: addResourceMaps(player.resources, production.byPlayer[player.id])
    })),
    log: [
      log(
        `${game.players.find((player) => player.id === game.activePlayerId)?.name ?? "Player"} rolled ${diceTotal}; ${production.events.length} production events resolved.`
      ),
      ...game.log
    ]
  };
}

export function gameReducer(state: AppState, command: GameCommand): AppState {
  switch (command.type) {
    case "ROLL_DICE": {
      const [first, second] = command.dice ?? [rollDie(), rollDie()];
      const total = first + second;
      return {
        ...state,
        game: applyProductionToHands(state.game, total),
        lastDice: { first, second, total }
      };
    }
    case "END_TURN":
      return {
        ...state,
        game: advanceTurn(state.game),
        guild: {
          ...state.guild,
          usedTradePlayerIds: []
        }
      };
    case "BUILD_ROAD":
      return {
        ...state,
        game: buildRoad(state.game, command.playerId, command.edgeId)
      };
    case "BUILD_SETTLEMENT":
      return {
        ...state,
        game: buildSettlement(state.game, command.playerId, command.vertexId)
      };
    case "BUILD_CITY":
      return {
        ...state,
        game: buildCity(state.game, command.playerId, command.buildingId)
      };
    case "PLACE_ROBBER":
      return {
        ...state,
        game: {
          ...state.game,
          robberHexId: command.hexId,
          log: [log(`Robber moved to ${command.hexId}.`), ...state.game.log]
        }
      };
    case "COMPLETE_TRADE_SLOT": {
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
      return {
        ...state,
        guild: startGuildGathering(state.guild),
        game: {
          ...state.game,
          log: [log("The Commerce Guild gathering has started."), ...state.game.log]
        }
      };
    case "OPEN_AUCTION":
      return {
        ...state,
        guild: openGuildAuction(state.guild),
        game: {
          ...state.game,
          log: [log("The Commerce Guild auction phase is open."), ...state.game.log]
        }
      };
    case "REDEEM_GATHERING": {
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
      return {
        ...state,
        game: {
          ...redeemPrizeCards(state.game, command.playerId),
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
