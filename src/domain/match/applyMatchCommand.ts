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
  type ResourceCost,
  type TradeSlot
} from "../expansion/commerceGuild";
import { RuleViolationError } from "../errors";
import { createSetupGame } from "../setup";
import {
  buildCity,
  buildRoad,
  buildSettlement,
  getLegalRoadEdgeIds,
  placeFreeRoad,
  placeSetupRoad,
  placeSetupSettlement
} from "../rules/building";
import {
  buyDevelopmentCard,
  chooseMonopolyResource,
  chooseYearOfPlentyResource,
  playDevelopmentCard,
  playKnightCard
} from "../rules/developmentCards";
import { updateLongestRoadAward } from "../rules/longestRoad";
import { maritimeTrade } from "../rules/maritimeTrade";
import {
  acceptPlayerTrade,
  createPlayerTradeOffer
} from "../rules/playerTrade";
import { applyProduction } from "../rules/production";
import { calculatePlayerScore } from "../rules/scoring";
import {
  advanceRoadBuildingEffect,
  assertCanRoll,
  assertCanUseTurnAction,
  assertGameInProgress,
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
} from "../rules/turnFlow";
import { advanceTurn } from "../rules/turns";
import {
  resources,
  type GameLogEntry,
  type GameMessageKey,
  type GameState,
  type PlayerId
} from "../types";
import type { MatchCommand, MatchExecutionContext, MatchState } from "./types";

function log(
  context: MatchExecutionContext,
  message: string,
  messageKey?: GameMessageKey,
  params?: Record<string, string | number>
): GameLogEntry {
  return {
    id: context.nextLogId(),
    message,
    messageKey,
    params
  };
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
  if (game.phase === "gameOver" || calculatePlayerScore(game, playerId) < game.targetScore) {
    return game;
  }
  return { ...game, phase: "gameOver", winnerId: playerId };
}

function getPlayerName(game: GameState, playerId: PlayerId): string {
  return game.players.find((player) => player.id === playerId)?.name ?? playerId;
}

function applyDiceRoll(
  game: GameState,
  diceTotal: number,
  context: MatchExecutionContext
): GameState {
  const production = applyProduction(game, diceTotal);
  const playerName = getPlayerName(game, game.activePlayerId);
  return {
    ...production.game,
    log: [
      log(
        context,
        `${playerName} rolled ${diceTotal}; ${production.events.length} production events resolved.`,
        "dice.rolled",
        { playerName, total: diceTotal, eventCount: production.events.length }
      ),
      ...production.game.log
    ]
  };
}

function startDevelopmentCardEffect(
  state: MatchState,
  playerId: PlayerId,
  cardId: string,
  context: MatchExecutionContext
): MatchState {
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
        log(
          context,
          `${getPlayerName(state.game, playerId)} played ${played.card.kind}.`,
          "development.played",
          { playerName: getPlayerName(state.game, playerId), cardKind: played.card.kind }
        ),
        ...effectGame.log
      ]
    }
  };
}

/** The single authoritative transition boundary for synchronized match state. */
export function applyMatchCommand(
  state: MatchState,
  command: MatchCommand,
  context: MatchExecutionContext
): MatchState {
  switch (command.type) {
    case "START_NEW_GAME": {
      const game = createSetupGame();
      return {
        game: {
          ...game,
          log: [
            log(context, "New game setup started.", "setup.newGameStarted"),
            ...game.log
          ]
        },
        guild: createCommerceGuild(),
        lastDice: null
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
      const first = context.random.nextInt(6) + 1;
      const second = context.random.nextInt(6) + 1;
      const total = first + second;
      const rolledGame =
        total === 7
          ? {
              ...beginSevenRoll(state.game),
              log: [
                log(
                  context,
                  "A 7 was rolled; resolve discards and the robber.",
                  "robber.sevenRolled"
                ),
                ...state.game.log
              ]
            }
          : enterActionPhase(applyDiceRoll(state.game, total, context));
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
          log: [
            log(
              context,
              `${getPlayerName(state.game, command.playerId)} completed a seven-roll discard.`,
              "robber.discardCompleted",
              { playerName: getPlayerName(state.game, command.playerId) }
            ),
            ...discardedGame.log
          ]
        }
      };
    }
    case "END_TURN": {
      assertCanUseTurnAction(state.game, command.playerId);
      const nextGame = resetTurnFlow(advanceTurn(state.game));
      const resetGuild = { ...state.guild, usedTradePlayerIds: [] };
      const nextGuild =
        nextGame.round > state.game.round
          ? maybeStartGuildGathering(nextGame, resetGuild)
          : resetGuild;
      const gatheringStarted =
        resetGuild.gathering.phase === "idle" &&
        nextGuild.gathering.phase === "redemption";
      return {
        ...state,
        game: {
          ...nextGame,
          log: gatheringStarted
            ? [
                log(
                  context,
                  "The Commerce Guild gathering has started automatically.",
                  "guild.gatheringAutoStarted"
                ),
                ...nextGame.log
              ]
            : nextGame.log
        },
        guild: nextGuild,
        lastDice: null,
        pendingPlayerTrade: undefined
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
          updateLongestRoadAward(
            buildSettlement(state.game, command.playerId, command.vertexId)
          ),
          command.playerId
        )
      };
    case "BUILD_CITY":
      assertCanUseTurnAction(state.game, command.playerId);
      return {
        ...state,
        game: withWinnerState(
          buildCity(state.game, command.playerId, command.buildingId),
          command.playerId
        )
      };
    case "BUY_DEVELOPMENT_CARD": {
      assertCanUseTurnAction(state.game, command.playerId);
      const result = buyDevelopmentCard(state.game, command.playerId);
      return {
        ...state,
        game: {
          ...withWinnerState(result.game, command.playerId),
          log: [
            log(
              context,
              `${getPlayerName(state.game, command.playerId)} bought a development card.`,
              "development.bought",
              { playerName: getPlayerName(state.game, command.playerId) }
            ),
            ...result.game.log
          ]
        }
      };
    }
    case "PLAY_KNIGHT_CARD": {
      const resumePhase = getKnightResumePhase(state.game, command.playerId);
      const knightGame = beginKnightRobber(
        playKnightCard(state.game, command.playerId, command.cardId),
        resumePhase
      );
      return {
        ...state,
        game: {
          ...knightGame,
          log: [
            log(
              context,
              `${getPlayerName(state.game, command.playerId)} played a knight card; move the robber.`,
              "development.knightPlayed",
              { playerName: getPlayerName(state.game, command.playerId) }
            ),
            ...knightGame.log
          ]
        }
      };
    }
    case "PLAY_DEVELOPMENT_CARD":
      return startDevelopmentCardEffect(state, command.playerId, command.cardId, context);
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
            log(
              context,
              `${getPlayerName(state.game, command.playerId)} placed a free road.`,
              "development.freeRoadPlaced",
              { playerName: getPlayerName(state.game, command.playerId) }
            ),
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
          log: [
            log(
              context,
              `Year of Plenty supplied ${command.resource}.`,
              "development.yearOfPlentyLog",
              { resource: command.resource }
            ),
            ...result.log
          ]
        }
      };
    }
    case "CHOOSE_MONOPOLY_RESOURCE": {
      const result = chooseMonopolyResource(state.game, command.playerId, command.resource);
      return {
        ...state,
        game: {
          ...result,
          log: [
            log(
              context,
              `Monopoly collected all opponent ${command.resource}.`,
              "development.monopolyLog",
              { resource: command.resource }
            ),
            ...result.log
          ]
        }
      };
    }
    case "MARITIME_TRADE":
      assertCanUseTurnAction(state.game, command.playerId);
      {
        const tradedGame = maritimeTrade(
          state.game,
          command.playerId,
          command.give,
          command.receive
        );
        return {
          ...state,
          game: {
            ...tradedGame,
            log: [
              log(
                context,
                `${getPlayerName(state.game, command.playerId)} completed a maritime trade: ${command.give} for ${command.receive}.`,
                "trade.maritime",
                {
                  playerName: getPlayerName(state.game, command.playerId),
                  give: command.give,
                  receive: command.receive
                }
              ),
              ...tradedGame.log
            ]
          }
        };
      }
    case "PUBLISH_PLAYER_TRADE": {
      if (state.pendingPlayerTrade) {
        throw new RuleViolationError("Only one public player trade may be active at a time.");
      }
      const pendingPlayerTrade = createPlayerTradeOffer(
        state.game,
        command.playerId,
        command.offered,
        command.requested
      );
      const proposerName = getPlayerName(state.game, command.playerId);
      return {
        ...state,
        pendingPlayerTrade,
        game: {
          ...state.game,
          log: [
            log(
              context,
              `${proposerName} published a public player trade.`,
              "trade.player.published",
              { proposerName }
            ),
            ...state.game.log
          ]
        }
      };
    }
    case "CANCEL_PLAYER_TRADE": {
      assertCanUseTurnAction(state.game, command.playerId);
      if (!state.pendingPlayerTrade) {
        throw new RuleViolationError("There is no public player trade to cancel.");
      }
      if (state.pendingPlayerTrade.proposerId !== command.playerId) {
        throw new RuleViolationError(
          "Only the active player who published the offer may cancel it."
        );
      }
      const proposerName = getPlayerName(state.game, command.playerId);
      return {
        ...state,
        pendingPlayerTrade: undefined,
        game: {
          ...state.game,
          log: [
            log(
              context,
              `${proposerName} cancelled the public player trade.`,
              "trade.player.cancelled",
              { proposerName }
            ),
            ...state.game.log
          ]
        }
      };
    }
    case "ACCEPT_PLAYER_TRADE": {
      if (!state.pendingPlayerTrade) {
        throw new RuleViolationError("There is no public player trade to accept.");
      }
      const acceptingPlayerName = getPlayerName(state.game, command.playerId);
      const proposerName = getPlayerName(state.game, state.pendingPlayerTrade.proposerId);
      const acceptedGame = acceptPlayerTrade(
        state.game,
        state.pendingPlayerTrade,
        command.playerId
      );
      return {
        ...state,
        pendingPlayerTrade: undefined,
        game: {
          ...acceptedGame,
          log: [
            log(
              context,
              `${acceptingPlayerName} accepted ${proposerName}'s public player trade.`,
              "trade.player.accepted",
              { acceptingPlayerName, proposerName }
            ),
            ...acceptedGame.log
          ]
        }
      };
    }
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
          log: [
            log(context, `Robber moved to ${command.hexId}.`, "robber.moved", {
              hexId: command.hexId
            }),
            ...resolvedGame.log
          ]
        }
      };
    }
    case "STEAL_ROBBER_RESOURCE": {
      const stolenGame = stealPendingRobberResource(
        state.game,
        command.playerId,
        command.victimId,
        () => context.random.nextInt(0x1_0000_0000) / 0x1_0000_0000
      );
      const resolvedGame = withWinnerState(stolenGame, command.playerId);
      return {
        ...state,
        game: {
          ...resolvedGame,
          log: [
            log(
              context,
              `${getPlayerName(state.game, command.playerId)} stole one random resource from ${getPlayerName(state.game, command.victimId)}.`,
              "robber.stolen",
              {
                playerName: getPlayerName(state.game, command.playerId),
                victimName: getPlayerName(state.game, command.victimId)
              }
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
        generateTradeSlot(
          state.game.turn +
            state.guild.tradeSlots.length +
            state.guild.usedTradePlayerIds.length
        )
      );
      return {
        ...state,
        game: {
          ...result.game,
          log: [
            log(
              context,
              "Commerce Guild trade completed and the slot refreshed.",
              "guild.slotCompleted"
            ),
            ...result.game.log
          ]
        },
        guild: result.guild
      };
    }
    case "TRANSFER_TOKENS":
      assertCanUseTurnAction(state.game, command.fromPlayerId);
      {
        const transferredGame = transferGuildTokens(
          state.game,
          command.fromPlayerId,
          command.toPlayerId,
          command.amount
        );
        return {
          ...state,
          game: {
            ...transferredGame,
            log: [
              log(
                context,
                `${getPlayerName(state.game, command.fromPlayerId)} transferred ${command.amount} guild token(s) to ${getPlayerName(state.game, command.toPlayerId)}.`,
                "guild.tokensTransferred",
                {
                  fromName: getPlayerName(state.game, command.fromPlayerId),
                  amount: command.amount,
                  toName: getPlayerName(state.game, command.toPlayerId)
                }
              ),
              ...transferredGame.log
            ]
          }
        };
      }
    case "START_GATHERING":
      assertGameInProgress(state.game);
      return {
        ...state,
        guild: startGuildGathering(state.guild),
        game: {
          ...state.game,
          log: [
            log(
              context,
              "The Commerce Guild gathering has started.",
              "guild.gatheringStarted"
            ),
            ...state.game.log
          ]
        }
      };
    case "OPEN_AUCTION": {
      assertGameInProgress(state.game);
      const guild = openGuildAuction(state.game, state.guild);
      const noEligibleBidders = guild.gathering.phase === "complete";
      return {
        ...state,
        guild,
        game: {
          ...state.game,
          log: [
            noEligibleBidders
              ? log(
                  context,
                  "The Commerce Guild auction ended because no player has guild tokens.",
                  "guild.auctionNoEligibleBidders",
                  { round: guild.gathering.auctionRound }
                )
              : log(
                  context,
                  "The Commerce Guild auction phase is open.",
                  "guild.auctionOpened"
                ),
            ...state.game.log
          ]
        }
      };
    }
    case "REDEEM_GATHERING": {
      assertGameInProgress(state.game);
      const result = redeemGatheringResources(
        state.game,
        state.guild,
        command.playerId,
        command.resources
      );
      return {
        ...state,
        game: {
          ...result.game,
          log: [
            log(
              context,
              `${getPlayerName(state.game, command.playerId)} redeemed guild tokens for resources.`,
              "guild.redeemedResources",
              { playerName: getPlayerName(state.game, command.playerId) }
            ),
            ...result.game.log
          ]
        },
        guild: result.guild
      };
    }
    case "RESOLVE_AUCTION": {
      assertGameInProgress(state.game);
      const result = resolveAuctionRound(state.game, state.guild, command.bids);
      if (result.kind === "noBid") {
        return {
          ...state,
          game: {
            ...result.game,
            log: [
              log(context, result.summary, "guild.auctionRoundNoBids", {
                round: result.round
              }),
              ...result.game.log
            ]
          },
          guild: result.guild
        };
      }
      const outcomeParams: Record<string, string | number> =
        result.outcome.kind === "resources"
          ? { outcomeKind: result.outcome.kind, ...result.outcome.resources }
          : result.outcome.kind === "developmentCard"
            ? { outcomeKind: result.outcome.kind, cardKind: result.outcome.card }
            : { outcomeKind: result.outcome.kind };
      return {
        ...state,
        game: {
          ...result.game,
          log: [
            log(context, result.summary, "guild.auctionResolved", {
              summary: result.summary,
              winnerName: getPlayerName(state.game, result.winnerId),
              bid: result.winningBid,
              round: state.guild.gathering.auctionRound,
              ...outcomeParams
            }),
            ...result.game.log
          ]
        },
        guild: result.guild
      };
    }
    case "REDEEM_PRIZE":
      assertCanUseTurnAction(state.game, command.playerId);
      {
        const redeemedGame = redeemPrizeCards(state.game, command.playerId);
        return {
          ...state,
          game: {
            ...withWinnerState(redeemedGame, command.playerId),
            log: [
              log(
                context,
                `${getPlayerName(state.game, command.playerId)} redeemed vouchers for prize cards.`,
                "guild.prizeRedeemed",
                { playerName: getPlayerName(state.game, command.playerId) }
              ),
              ...redeemedGame.log
            ]
          }
        };
      }
  }
}
