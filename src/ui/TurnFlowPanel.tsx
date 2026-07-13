import React, { useEffect, useState } from "react";
import { emptyResources, resources, type ResourceMap } from "../domain/types";
import { useI18n } from "./i18n";
import type { GameTableDispatch, GameTableGameView, GameTableView } from "./GameTable";

export function TurnFlowPanel({
  game,
  gameControls,
  decisionPolicy,
  dispatch
}: {
  game: GameTableGameView;
  gameControls: GameTableView["controlledPlayers"];
  decisionPolicy: GameTableView["decisionPolicy"];
  dispatch: GameTableDispatch;
}) {
  const { locale, t } = useI18n();
  const pendingControl = gameControls.find((control) => control.decision?.kind === "discard");
  const discardPolicy = decisionPolicy.discard;
  const pendingPlayerId = pendingControl?.controlId;
  const [discarded, setDiscarded] = useState<ResourceMap>(emptyResources);

  useEffect(() => {
    setDiscarded(emptyResources());
  }, [pendingPlayerId]);

  if (game.turnState.phase === "awaitingDiscards" && pendingPlayerId) {
    const playerName = pendingControl.displayName;
    const required = discardPolicy.exactCount;
    const selectedTotal = resources.reduce((total, resource) => total + discarded[resource], 0);
    const validSelection =
      selectedTotal === required &&
      resources.every(
        (resource) =>
          Number.isInteger(discarded[resource]) &&
          discarded[resource] >= 0 &&
          discarded[resource] <= discardPolicy.maxByResource[resource]
      );

    return (
      <section className="turn-flow-panel" data-turn-flow="discard">
        <strong>{t("turn.discardRequired", { name: playerName, count: required })}</strong>
        <span>{t("turn.selected", { selected: selectedTotal, required })}</span>
        <div className="turn-flow-resources">
          {resources.map((resource) => (
            <label key={resource}>
              {t(`resource.${resource}`)}
              <input
                aria-label={locale === "en" ? `${playerName} ${resource} discard` : `${playerName} ${t(`resource.${resource}`)}弃牌`}
                disabled={!discardPolicy.enabled}
                max={discardPolicy.maxByResource[resource]}
                min={0}
                onChange={(event) => {
                  const value = Number(event.currentTarget.value);
                  setDiscarded((current) => ({
                    ...current,
                    [resource]: value
                  }));
                }}
                step={1}
                type="number"
                value={discarded[resource]}
              />
            </label>
          ))}
        </div>
        <button
          disabled={!discardPolicy.enabled || !validSelection}
          onClick={() =>
            dispatch({ type: "decision.discard", controlId: pendingPlayerId, resources: discarded })
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
          {decisionPolicy.robberVictim.targets.map((victimId) => {
            const victim = game.players.find((player) => player.id === victimId);
            return (
              <button
                disabled={!decisionPolicy.robberVictim.enabled}
                key={victimId}
                onClick={() =>
                  dispatch({
                    type: "robber.steal",
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
