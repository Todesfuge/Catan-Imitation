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
import { getActionAvailability } from "../app/actionAvailability";
import type { AppState, GameCommand } from "../app/gameReducer";
import { resources, type Resource } from "../domain/types";
import { DevelopmentCardPanel } from "./DevelopmentCardPanel";
import { resourceLabels } from "./resourceLabels";

export type BoardInteractionMode =
  | { kind: "road" }
  | { kind: "settlement" }
  | { kind: "city" }
  | { kind: "setupSettlement" }
  | { kind: "setupRoad" }
  | null;

function phaseGuidance(state: AppState): string {
  const activePlayer = state.game.players.find(
    (player) => player.id === state.game.activePlayerId
  );

  if (state.game.phase === "gameOver") {
    const winner = state.game.players.find((player) => player.id === state.game.winnerId);
    return `${winner?.name ?? "A player"} has won the game`;
  }
  if (state.game.phase === "setup") {
    return state.game.setup?.stage === "road"
      ? "Place the connected setup road"
      : "Place the next settlement";
  }
  if (state.guild.gathering.phase === "redemption") {
    return "Guild redemption is open: choose a player and spend tokens";
  }
  if (state.guild.gathering.phase === "auction") {
    return `Resolve Commerce Guild auction round ${state.guild.gathering.auctionRound}`;
  }
  if (state.game.turnState.phase === "awaitingRoll") {
    return `${activePlayer?.name ?? "Player"} must roll or play a development card`;
  }
  if (state.game.turnState.phase === "awaitingDiscards") {
    return "Players with more than seven cards must choose their discards";
  }
  if (state.game.turnState.phase === "awaitingRobberPlacement") {
    return `${activePlayer?.name ?? "Player"} must move the robber`;
  }
  if (state.game.turnState.phase === "awaitingRobberVictim") {
    return `${activePlayer?.name ?? "Player"} must choose a robber victim`;
  }
  if (state.game.turnState.phase === "awaitingDevelopmentEffect") {
    const effect = state.game.turnState.pendingDevelopmentEffect;
    return effect?.kind === "roadBuilding"
      ? "Choose the next free road"
      : effect?.kind === "yearOfPlenty"
        ? "Choose resources from the bank"
        : "Choose a resource for Monopoly";
  }
  return "Choose an action or end the turn";
}

export function ActionDock({
  state,
  dispatch,
  interactionMode,
  onInteractionModeChange
}: {
  state: AppState;
  dispatch: (command: GameCommand) => void;
  interactionMode: BoardInteractionMode;
  onInteractionModeChange: (mode: BoardInteractionMode) => void;
}) {
  const activePlayer = state.game.players.find(
    (player) => player.id === state.game.activePlayerId
  );
  const availability = useMemo(
    () => getActionAvailability(state, state.game.activePlayerId),
    [state]
  );
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
          <span>Turn {state.game.turn} · Round {state.game.round}</span>
          <span className="phase-guidance">{phaseGuidance(state)}</span>
        </div>
      </div>
      <button
        aria-describedby="roll-unavailable-reason"
        data-action="roll-dice"
        disabled={!availability.roll.enabled}
        onClick={() => activePlayer && dispatch({ type: "ROLL_DICE", playerId: activePlayer.id })}
        type="button"
      >
        <Dices size={20} /> Roll Dice
      </button>
      <button
        aria-describedby="road-unavailable-reason"
        aria-pressed={interactionMode?.kind === "road"}
        data-action="build-road"
        data-action-mode="road"
        disabled={!availability.road.enabled}
        onClick={() => toggleMode("road")}
        title={availability.road.reason}
        type="button"
      >
        <Hammer size={20} /> Road
      </button>
      <button
        aria-describedby="settlement-unavailable-reason"
        aria-pressed={interactionMode?.kind === "settlement"}
        data-action="build-settlement"
        data-action-mode="settlement"
        disabled={!availability.settlement.enabled}
        onClick={() => toggleMode("settlement")}
        title={availability.settlement.reason}
        type="button"
      >
        <Home size={20} /> Settlement
      </button>
      <button
        aria-describedby="city-unavailable-reason"
        aria-pressed={interactionMode?.kind === "city"}
        data-action="build-city"
        data-action-mode="city"
        disabled={!availability.city.enabled}
        onClick={() => toggleMode("city")}
        title={availability.city.reason}
        type="button"
      >
        <Castle size={20} /> City
      </button>
      <button
        aria-describedby="development-buy-unavailable-reason"
        data-action="buy-development"
        disabled={!availability.buyDevelopmentCard.enabled}
        onClick={() =>
          activePlayer && dispatch({ type: "BUY_DEVELOPMENT_CARD", playerId: activePlayer.id })
        }
        type="button"
      >
        <ScrollText size={20} /> Dev Card
      </button>
      <DevelopmentCardPanel state={state} dispatch={dispatch} />
      <div className="maritime-action-group">
        <div className="maritime-ratio-guide" aria-label="Effective maritime trade ratios">
          {resources.map((resource) => (
            <span key={resource}>
              {resourceLabels[resource]} {availability.maritime.ratios[resource]}:1
            </span>
          ))}
        </div>
        <div className="maritime-selectors">
          <select
            aria-label="Maritime give resource"
            onChange={(event) => {
              setMaritimeGive(event.currentTarget.value as Resource | "");
              setMaritimeReceive("");
            }}
            value={maritimeGive}
          >
            <option value="">Give resource</option>
            {resources.map((resource) => {
              const trade = availability.maritime.trades.find(
                (candidate) => candidate.give === resource
              );
              return (
                <option disabled={!trade} key={resource} value={resource}>
                  {resourceLabels[resource]} {trade ? `${trade.ratio}:1` : "unavailable"}
                </option>
              );
            })}
          </select>
          <select
            aria-label="Maritime receive resource"
            disabled={!selectedTrade}
            onChange={(event) =>
              setMaritimeReceive(event.currentTarget.value as Resource | "")
            }
            value={maritimeReceive}
          >
            <option value="">Receive resource</option>
            {(selectedTrade?.receives ?? []).map((resource) => (
              <option key={resource} value={resource}>
                {resourceLabels[resource]} ({state.game.bank.resources[resource]} in bank)
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
                type: "MARITIME_TRADE",
                playerId: activePlayer.id,
                give: maritimeGive,
                receive: maritimeReceive
              });
              setMaritimeGive("");
              setMaritimeReceive("");
            }
          }}
          title={availability.maritime.reason}
          type="button"
        >
          <ArrowRightLeft size={20} /> Maritime
        </button>
      </div>
      <button
        aria-describedby="end-turn-unavailable-reason"
        className="primary"
        data-action="end-turn"
        disabled={!availability.endTurn.enabled}
        onClick={() => activePlayer && dispatch({ type: "END_TURN", playerId: activePlayer.id })}
        type="button"
      >
        End Turn
      </button>
      <div className="dice-readout">
        {state.lastDice
          ? `${state.lastDice.first} + ${state.lastDice.second} = ${state.lastDice.total}`
          : "No roll"}
      </div>
      {state.game.phase === "gameOver" ? (
        <button data-action="new-game" onClick={() => dispatch({ type: "START_NEW_GAME" })} type="button">
          New Game
        </button>
      ) : null}
      <div className="sr-only">
        <span id="roll-unavailable-reason">{availability.roll.reason}</span>
        <span id="road-unavailable-reason">{availability.road.reason}</span>
        <span id="settlement-unavailable-reason">{availability.settlement.reason}</span>
        <span id="city-unavailable-reason">{availability.city.reason}</span>
        <span id="development-buy-unavailable-reason">
          {availability.buyDevelopmentCard.reason}
        </span>
        <span id="maritime-unavailable-reason">{availability.maritime.reason}</span>
        <span id="end-turn-unavailable-reason">{availability.endTurn.reason}</span>
      </div>
    </footer>
  );
}
