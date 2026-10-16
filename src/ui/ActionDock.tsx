import React from "react";
import {
  ArrowRightLeft,
  Castle,
  Dice1,
  Dice2,
  Dice3,
  Dice4,
  Dice5,
  Dice6,
  Dices,
  Hammer,
  Home,
  ScrollText,
  Square,
  Timer
} from "lucide-react";
import { DevelopmentCardPanel } from "./DevelopmentCardPanel";
import type { GameTableDispatch, GameTableView } from "./GameTable";
import { translate, translateRuleText, useI18n, type Locale } from "./i18n";
import { ResourceBundle } from "./ResourceBadge";

const diceFaces = [Dice1, Dice2, Dice3, Dice4, Dice5, Dice6] as const;

export type BoardInteractionMode =
  | { kind: "road" }
  | { kind: "settlement" }
  | { kind: "city" }
  | { kind: "setupSettlement" }
  | { kind: "setupRoad" }
  | null;

function phaseGuidance(state: GameTableView, locale: Locale): string {
  const activePlayer = state.game.players.find(
    (player) => player.id === state.game.activePlayerId
  );

  if (state.game.phase === "gameOver") {
    const winner = state.game.players.find((player) => player.id === state.game.winnerId);
    return translate(locale, "turn.gameWon", { name: winner?.name ?? "A player" });
  }
  if (state.game.phase === "setup") {
    return state.game.setup?.stage === "road"
      ? translate(locale, "turn.setupRoad")
      : translate(locale, "turn.setupSettlement");
  }
  if (state.guild.gathering.phase === "redemption") {
    return translate(locale, "turn.guildRedemption");
  }
  if (state.guild.gathering.phase === "auction") {
    return translate(locale, "turn.guildAuction", { round: state.guild.gathering.auctionRound });
  }
  if (state.game.turnState.phase === "awaitingRoll") {
    return translate(locale, "turn.awaitingRoll", { name: activePlayer?.name ?? "Player" });
  }
  if (state.game.turnState.phase === "awaitingDiscards") {
    return translate(locale, "turn.awaitingDiscards");
  }
  if (state.game.turnState.phase === "awaitingRobberPlacement") {
    return translate(locale, "turn.awaitingRobber", { name: activePlayer?.name ?? "Player" });
  }
  if (state.game.turnState.phase === "awaitingRobberVictim") {
    return translate(locale, "turn.awaitingVictim", { name: activePlayer?.name ?? "Player" });
  }
  if (state.game.turnState.phase === "awaitingDevelopmentEffect") {
    const effect = state.game.turnState.pendingDevelopmentEffect;
    return effect?.kind === "roadBuilding"
      ? translate(locale, "turn.freeRoad")
      : effect?.kind === "yearOfPlenty"
        ? translate(locale, "turn.bankResources")
        : translate(locale, "turn.monopolyResource");
  }
  return translate(locale, "turn.action");
}

export function ActionDock({
  state,
  dispatch,
  interactionMode,
  onInteractionModeChange,
  onTradeOpen
}: {
  state: GameTableView;
  dispatch: GameTableDispatch;
  interactionMode: BoardInteractionMode;
  onInteractionModeChange: (mode: BoardInteractionMode) => void;
  onTradeOpen: () => void;
}) {
  const { locale, t } = useI18n();
  const activePlayer = state.game.players.find(
    (player) => player.id === state.game.activePlayerId
  );
  const availability = state.legality.actions;
  const diceLabel = state.lastDice
    ? t("action.diceResult", { ...state.lastDice })
    : t("action.noRoll");
  const tradeStatus = state.pendingPlayerTrade
    ? t("trade.offerPending")
    : state.guild.gathering.phase === "redemption" || state.guild.gathering.phase === "auction"
      ? t(`commerce.phase.${state.guild.gathering.phase}`)
      : null;

  const toggleMode = (kind: "road" | "settlement" | "city") => {
    onInteractionModeChange(interactionMode?.kind === kind ? null : { kind });
  };

  return (
    <footer className="action-bar">
      <div className="turn-status">
        <Timer size={26} />
        <div>
          <strong>{activePlayer?.name ?? "Player"}</strong>
          <span>{t("turn.number", { turn: state.game.turn, round: state.game.round })}</span>
          <span className="phase-guidance">{phaseGuidance(state, locale)}</span>
        </div>
      </div>
      <div className="roll-action-group">
        <button
          aria-describedby="roll-unavailable-reason"
          data-action="roll-dice"
          disabled={!availability.roll.enabled}
          onClick={() => activePlayer && dispatch({ type: "turn.roll" })}
          type="button"
        >
          <Dices size={20} /> {t("action.rollDice")}
        </button>
        <div aria-label={diceLabel} className="dice-readout" role="img" title={diceLabel}>
          {[state.lastDice?.first, state.lastDice?.second].map((value, index) => {
            const Face = value ? diceFaces[value - 1] : Square;
            return <Face aria-hidden="true" focusable="false" key={index} size={24} />;
          })}
          <strong aria-hidden="true">{state.lastDice?.total ?? t("action.noRoll")}</strong>
        </div>
      </div>
      <button
        aria-describedby="road-unavailable-reason"
        aria-pressed={interactionMode?.kind === "road"}
        data-action="build-road"
        data-action-mode="road"
        disabled={!availability.road.enabled}
        onClick={() => toggleMode("road")}
        title={translateRuleText(locale, availability.road.reason)}
        type="button"
      >
        <Hammer size={20} /> {t("action.road")}
        <span data-action-cost="road"><ResourceBundle className="action-cost" compact resources={availability.road.cost} /></span>
      </button>
      <button
        aria-describedby="settlement-unavailable-reason"
        aria-pressed={interactionMode?.kind === "settlement"}
        data-action="build-settlement"
        data-action-mode="settlement"
        disabled={!availability.settlement.enabled}
        onClick={() => toggleMode("settlement")}
        title={translateRuleText(locale, availability.settlement.reason)}
        type="button"
      >
        <Home size={20} /> {t("action.settlement")}
        <span data-action-cost="settlement"><ResourceBundle className="action-cost" compact resources={availability.settlement.cost} /></span>
      </button>
      <button
        aria-describedby="city-unavailable-reason"
        aria-pressed={interactionMode?.kind === "city"}
        data-action="build-city"
        data-action-mode="city"
        disabled={!availability.city.enabled}
        onClick={() => toggleMode("city")}
        title={translateRuleText(locale, availability.city.reason)}
        type="button"
      >
        <Castle size={20} /> {t("action.city")}
        <span data-action-cost="city"><ResourceBundle className="action-cost" compact resources={availability.city.cost} /></span>
      </button>
      <button
        aria-describedby="development-buy-unavailable-reason"
        data-action="buy-development"
        disabled={!availability.buyDevelopmentCard.enabled}
        onClick={() =>
          activePlayer && dispatch({ type: "development.buy" })
        }
        type="button"
      >
        <ScrollText size={20} /> {t("action.devCard")}
        <span data-action-cost="development-card"><ResourceBundle className="action-cost" compact resources={availability.buyDevelopmentCard.cost} /></span>
      </button>
      <DevelopmentCardPanel state={state} dispatch={dispatch} />
      <button
        aria-describedby={tradeStatus ? "trade-status" : undefined}
        aria-haspopup="dialog"
        aria-label={t("nav.openTrade")}
        data-action="open-trade"
        onClick={onTradeOpen}
        type="button"
      >
        <ArrowRightLeft size={20} /> {t("action.trade")}
        {tradeStatus ? <span aria-live="polite" className="trade-attention" id="trade-status">{tradeStatus}</span> : null}
      </button>
      <button
        aria-describedby="end-turn-unavailable-reason"
        className="primary"
        data-action="end-turn"
        disabled={!availability.endTurn.enabled}
        onClick={() => activePlayer && dispatch({ type: "turn.end" })}
        type="button"
      >
        {t("action.endTurn")}
      </button>
      <div className="sr-only">
        <span id="roll-unavailable-reason">{translateRuleText(locale, availability.roll.reason)}</span>
        <span id="road-unavailable-reason">{translateRuleText(locale, availability.road.reason)}</span>
        <span id="settlement-unavailable-reason">{translateRuleText(locale, availability.settlement.reason)}</span>
        <span id="city-unavailable-reason">{translateRuleText(locale, availability.city.reason)}</span>
        <span id="development-buy-unavailable-reason">
          {translateRuleText(locale, availability.buyDevelopmentCard.reason)}
        </span>
        <span id="end-turn-unavailable-reason">{translateRuleText(locale, availability.endTurn.reason)}</span>
      </div>
    </footer>
  );
}
