import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowRightLeft,
  Castle,
  Dices,
  Hammer,
  Home,
  ScrollText,
  Timer
} from "lucide-react";
import { resources, type Resource } from "../domain/types";
import { DevelopmentCardPanel } from "./DevelopmentCardPanel";
import type { GameTableDispatch, GameTableView } from "./GameTable";
import { translate, translateRuleText, useI18n, type Locale } from "./i18n";

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
  onInteractionModeChange
}: {
  state: GameTableView;
  dispatch: GameTableDispatch;
  interactionMode: BoardInteractionMode;
  onInteractionModeChange: (mode: BoardInteractionMode) => void;
}) {
  const { locale, t } = useI18n();
  const activePlayer = state.game.players.find(
    (player) => player.id === state.game.activePlayerId
  );
  const availability = state.legality.actions;
  const [maritimeGive, setMaritimeGive] = useState<Resource | "">("");
  const [maritimeReceive, setMaritimeReceive] = useState<Resource | "">("");

  useEffect(() => {
    setMaritimeGive("");
    setMaritimeReceive("");
  }, [state.game.activePlayerId, state.game.turn, state.game.turnState.phase]);

  const selectedTrade = availability.maritime.trades.find(
    (trade) => trade.give === maritimeGive
  );
  const canSubmitMaritime =
    availability.maritime.enabled &&
    Boolean(selectedTrade) &&
    Boolean(maritimeReceive) &&
    selectedTrade!.receives.includes(maritimeReceive as Resource);

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
      <button
        aria-describedby="roll-unavailable-reason"
        data-action="roll-dice"
        disabled={!availability.roll.enabled}
        onClick={() => activePlayer && dispatch({ type: "turn.roll" })}
        type="button"
      >
        <Dices size={20} /> {t("action.rollDice")}
      </button>
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
      </button>
      <DevelopmentCardPanel state={state} dispatch={dispatch} />
      <div className="maritime-action-group">
        <div className="maritime-ratio-guide" aria-label="Effective maritime trade ratios">
          {resources.map((resource) => (
            <span key={resource}>
              {t(`resource.${resource}`)} {availability.maritime.ratios[resource]}:1
            </span>
          ))}
        </div>
        <div className="maritime-selectors">
          <select
            aria-label={t("action.maritimeGiveLabel")}
            onChange={(event) => {
              setMaritimeGive(event.currentTarget.value as Resource | "");
              setMaritimeReceive("");
            }}
            value={maritimeGive}
          >
            <option value="">{t("action.giveResource")}</option>
            {resources.map((resource) => {
              const trade = availability.maritime.trades.find(
                (candidate) => candidate.give === resource
              );
              return (
                <option disabled={!trade} key={resource} value={resource}>
                  {t(`resource.${resource}`)} {trade ? `${trade.ratio}:1` : t("action.unavailable")}
                </option>
              );
            })}
          </select>
          <select
            aria-label={t("action.maritimeReceiveLabel")}
            disabled={!selectedTrade}
            onChange={(event) =>
              setMaritimeReceive(event.currentTarget.value as Resource | "")
            }
            value={maritimeReceive}
          >
            <option value="">{t("action.receiveResource")}</option>
            {(selectedTrade?.receives ?? []).map((resource) => (
              <option key={resource} value={resource}>
                {t(`resource.${resource}`)} ({state.game.bank.resources[resource]})
              </option>
            ))}
          </select>
        </div>
        <button
          aria-describedby="maritime-unavailable-reason"
          data-action="maritime"
          disabled={!canSubmitMaritime}
          onClick={() => {
            if (activePlayer && maritimeGive && maritimeReceive) {
              dispatch({
                type: "trade.maritime",
                give: maritimeGive,
                receive: maritimeReceive
              });
              setMaritimeGive("");
              setMaritimeReceive("");
            }
          }}
          title={translateRuleText(locale, availability.maritime.reason)}
          type="button"
        >
          <ArrowRightLeft size={20} /> {t("action.maritime")}
        </button>
      </div>
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
      <div className="dice-readout">
        {state.lastDice
          ? `${state.lastDice.first} + ${state.lastDice.second} = ${state.lastDice.total}`
          : t("action.noRoll")}
      </div>
      {state.game.phase === "gameOver" ? (
        <button data-action="new-game" disabled={state.newGameEnabled === false} onClick={() => dispatch({ type: "game.new" })} type="button">
          {t("action.newGame")}
        </button>
      ) : null}
      <div className="sr-only">
        <span id="roll-unavailable-reason">{translateRuleText(locale, availability.roll.reason)}</span>
        <span id="road-unavailable-reason">{translateRuleText(locale, availability.road.reason)}</span>
        <span id="settlement-unavailable-reason">{translateRuleText(locale, availability.settlement.reason)}</span>
        <span id="city-unavailable-reason">{translateRuleText(locale, availability.city.reason)}</span>
        <span id="development-buy-unavailable-reason">
          {translateRuleText(locale, availability.buyDevelopmentCard.reason)}
        </span>
        <span id="maritime-unavailable-reason">{translateRuleText(locale, availability.maritime.reason)}</span>
        <span id="end-turn-unavailable-reason">{translateRuleText(locale, availability.endTurn.reason)}</span>
      </div>
    </footer>
  );
}
