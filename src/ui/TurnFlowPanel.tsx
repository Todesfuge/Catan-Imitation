import React, { useEffect, useState } from "react";
import { emptyResources, resources, type Resource, type ResourceMap } from "../domain/types";
import { translateRuleText, useI18n } from "./i18n";
import type { GameTableDispatch, GameTableGameView, GameTableView } from "./GameTable";
import { ResourceIcon } from "./ResourceBadge";

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

    function setDiscardAmount(resource: Resource, value: number) {
      if (!discardPolicy.enabled) return;
      setDiscarded((current) => {
        const otherTotal = resources.reduce(
          (total, candidate) => total + (candidate === resource ? 0 : current[candidate]),
          0
        );
        const maximum = Math.min(discardPolicy.maxByResource[resource], required - otherTotal);
        return {
          ...current,
          [resource]: Math.max(0, Math.min(maximum, Number.isFinite(value) ? Math.trunc(value) : 0))
        };
      });
    }

    return (
      <section className="turn-flow-panel turn-flow-panel--discard" data-turn-flow="discard">
        <strong>{t("turn.discardRequired", { name: playerName, count: required })}</strong>
        <div className="discard-progress" role="status">
          <span>{t("turn.selected", { selected: selectedTotal, required })}</span>
          <span>{t(selectedTotal === required ? "turn.discardReady" : "turn.discardRemaining", {
            count: required - selectedTotal
          })}</span>
        </div>
        <div className="turn-flow-resources">
          {resources.map((resource) => {
            const resourceName = t(`resource.${resource}`);
            const owned = discardPolicy.maxByResource[resource];
            return (
              <div className="discard-resource" data-discard-resource={resource} key={resource}>
                <div className="discard-resource-info">
                  <ResourceIcon decorative resource={resource} size={24} />
                  <span className="discard-resource-name">{resourceName}</span>
                  <span className="discard-owned" id={`discard-owned-${resource}`}>
                    {t("turn.discardOwned", { count: owned })}
                  </span>
                </div>
                <div className="discard-stepper">
                  <button
                    aria-label={t("turn.discardDecrease", { resource: resourceName })}
                    disabled={!discardPolicy.enabled || discarded[resource] === 0}
                    onClick={() => setDiscardAmount(resource, discarded[resource] - 1)}
                    type="button"
                  >−</button>
                  <input
                    aria-describedby={`discard-owned-${resource} discard-unavailable-reason`}
                    aria-label={locale === "en" ? `${playerName} ${resource} discard` : `${playerName} ${resourceName}弃牌`}
                    disabled={!discardPolicy.enabled}
                    inputMode="numeric"
                    max={owned}
                    min={0}
                    onChange={(event) => {
                      const value = Number(event.currentTarget.value);
                      setDiscardAmount(resource, value);
                    }}
                    step={1}
                    type="number"
                    value={discarded[resource]}
                  />
                  <button
                    aria-label={t("turn.discardIncrease", { resource: resourceName })}
                    disabled={!discardPolicy.enabled || discarded[resource] >= owned || selectedTotal >= required}
                    onClick={() => setDiscardAmount(resource, discarded[resource] + 1)}
                    type="button"
                  >+</button>
                </div>
              </div>
            );
          })}
        </div>
        <span className="sr-only" id="discard-unavailable-reason">
          {translateRuleText(locale, discardPolicy.reason)}
        </span>
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
