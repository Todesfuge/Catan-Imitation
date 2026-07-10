import React, { useEffect, useState } from "react";
import type { GameCommand } from "../app/gameReducer";
import { emptyResources, resources, type GameState, type ResourceMap } from "../domain/types";
import { useI18n } from "./i18n";

export function TurnFlowPanel({
  game,
  dispatch
}: {
  game: GameState;
  dispatch: (command: GameCommand) => void;
}) {
  const { locale, t } = useI18n();
  const pendingPlayerId = Object.keys(game.turnState.pendingDiscards).find(
    (playerId) => (game.turnState.pendingDiscards[playerId] ?? 0) > 0
  );
  const [discarded, setDiscarded] = useState<ResourceMap>(emptyResources);

  useEffect(() => {
    setDiscarded(emptyResources());
  }, [pendingPlayerId]);

  if (game.turnState.phase === "awaitingDiscards" && pendingPlayerId) {
    const player = game.players.find((candidate) => candidate.id === pendingPlayerId);
    const required = game.turnState.pendingDiscards[pendingPlayerId] ?? 0;
    const selectedTotal = resources.reduce((total, resource) => total + discarded[resource], 0);
    const validSelection =
      selectedTotal === required &&
      resources.every(
        (resource) =>
          Number.isInteger(discarded[resource]) &&
          discarded[resource] >= 0 &&
          discarded[resource] <= (player?.resources[resource] ?? 0)
      );

    return (
      <section className="turn-flow-panel" data-turn-flow="discard">
        <strong>{t("turn.discardRequired", { name: player?.name ?? pendingPlayerId, count: required })}</strong>
        <span>{t("turn.selected", { selected: selectedTotal, required })}</span>
        <div className="turn-flow-resources">
          {resources.map((resource) => (
            <label key={resource}>
              {t(`resource.${resource}`)}
              <input
                aria-label={locale === "en" ? `${player?.name ?? pendingPlayerId} ${resource} discard` : `${player?.name ?? pendingPlayerId} ${t(`resource.${resource}`)}弃牌`}
                max={player?.resources[resource] ?? 0}
                min={0}
                onChange={(event) =>
                  setDiscarded((current) => ({
                    ...current,
                    [resource]: Number(event.currentTarget.value)
                  }))
                }
                step={1}
                type="number"
                value={discarded[resource]}
              />
            </label>
          ))}
        </div>
        <button
          disabled={!validSelection}
          onClick={() =>
            dispatch({ type: "DISCARD_FOR_SEVEN", playerId: pendingPlayerId, resources: discarded })
          }
          type="button"
        >
          {t("turn.submitDiscard")}
        </button>
      </section>
    );
  }

  if (game.turnState.phase === "awaitingRobberPlacement") {
    return (
      <section className="turn-flow-panel" data-turn-flow="robber-placement">
        <strong>{t("turn.moveRobber")}</strong>
        <span>{t("turn.selectHex")}</span>
      </section>
    );
  }

  if (game.turnState.phase === "awaitingRobberVictim" && game.turnState.pendingRobber) {
    return (
      <section className="turn-flow-panel" data-turn-flow="robber-victim">
        <strong>{t("turn.chooseVictim")}</strong>
        <div className="robber-victim-buttons">
          {game.turnState.pendingRobber.eligibleVictimIds.map((victimId) => {
            const victim = game.players.find((player) => player.id === victimId);
            return (
              <button
                key={victimId}
                onClick={() =>
                  dispatch({
                    type: "STEAL_ROBBER_RESOURCE",
                    playerId: game.activePlayerId,
                    victimId
                  })
                }
                type="button"
              >
                {victim?.name ?? victimId}
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  return null;
}
