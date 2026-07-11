import React, { useEffect, useMemo, useState } from "react";
import {
  emptyResources,
  resources,
  type Resource,
  type ResourceMap
} from "../domain/types";
import { translateRuleText, useI18n } from "./i18n";
import type { GameTableDispatch, GameTableView } from "./GameTable";
import { resourceShortLabels } from "./resourceLabels";

function formatTradeBundle(bundle: ResourceMap, labels: Record<Resource, string>): string {
  return resources
    .filter((resource) => bundle[resource] > 0)
    .map((resource) => `${bundle[resource]} ${labels[resource]}`)
    .join(", ");
}

function ResourceBundleEditor({
  displayLabel,
  labels,
  visibleLabels,
  value,
  onChange
}: {
  displayLabel: string;
  labels: Record<Resource, string>;
  visibleLabels: Record<Resource, string>;
  value: ResourceMap;
  onChange: (value: ResourceMap) => void;
}) {
  return (
    <fieldset className="player-trade-bundle">
      <legend>{displayLabel}</legend>
      {resources.map((resource) => (
        <label key={resource}>
          <span title={labels[resource]}>{visibleLabels[resource]}</span>
          <input
            aria-label={`${displayLabel} ${labels[resource]}`}
            min={0}
            onChange={(event) =>
              onChange({
                ...value,
                [resource]: Number(event.currentTarget.value)
              })
            }
            step={1}
            type="number"
            value={value[resource]}
          />
        </label>
      ))}
    </fieldset>
  );
}

export function PlayerTradePanel({
  state,
  dispatch
}: {
  state: GameTableView;
  dispatch: GameTableDispatch;
}) {
  const { locale, t } = useI18n();
  const [offered, setOffered] = useState<ResourceMap>(() => emptyResources());
  const [requested, setRequested] = useState<ResourceMap>(() => emptyResources());
  const activePlayer = state.game.players.find(
    (player) => player.id === state.game.activePlayerId
  );
  const localizedResourceLabels = useMemo(
    () => Object.fromEntries(resources.map((resource) => [resource, t(`resource.${resource}`)])) as Record<Resource, string>,
    [t]
  );
  const visibleResourceLabels = locale === "en" ? resourceShortLabels : localizedResourceLabels;
  const publishReason = useMemo(
    () =>
      activePlayer
        ? state.tradePolicy.publishReason(offered, requested)
        : "No active player is available.",
    [activePlayer, offered, requested, state.tradePolicy]
  );

  useEffect(() => {
    if (state.pendingPlayerTrade) {
      setOffered(emptyResources());
      setRequested(emptyResources());
    }
  }, [state.pendingPlayerTrade]);

  if (state.pendingPlayerTrade) {
    const offer = state.pendingPlayerTrade;
    const proposer = state.game.players.find((player) => player.id === offer.proposerId);
    return (
      <section className="player-trade-panel">
        <p className="player-trade-summary">
          {t("trade.summary", {
            name: proposer?.name ?? offer.proposerId,
            offered: formatTradeBundle(offer.offered, localizedResourceLabels),
            requested: formatTradeBundle(offer.requested, localizedResourceLabels)
          })}
        </p>
        <div className="player-trade-responses">
          {state.game.players
            .filter((player) => player.id !== offer.proposerId)
            .map((player) => {
              const reason = state.tradePolicy.acceptanceReasons[player.id];
              return (
                <div className="player-trade-response" key={player.id}>
                  <button
                    aria-describedby={`player-trade-${player.id}-reason`}
                    disabled={Boolean(reason)}
                    onClick={() =>
                      dispatch({ type: "ACCEPT_PLAYER_TRADE", playerId: player.id })
                    }
                    type="button"
                  >
                    {t("trade.acceptAs", { name: player.name })}
                  </button>
                  {reason ? <span id={`player-trade-${player.id}-reason`}>{translateRuleText(locale, reason)}</span> : null}
                </div>
              );
            })}
        </div>
        {state.game.activePlayerId === offer.proposerId ? (
          <button
            className="secondary"
            onClick={() =>
              dispatch({ type: "CANCEL_PLAYER_TRADE", playerId: offer.proposerId })
            }
            type="button"
          >
            {t("trade.cancel")}
          </button>
        ) : null}
      </section>
    );
  }

  return (
    <section className="player-trade-panel">
      <div className="player-trade-publish-row">
        <p className="player-trade-empty">{t("trade.noOffer")}</p>
        <button
          aria-describedby="player-trade-publish-reason"
          disabled={Boolean(publishReason)}
          onClick={() => {
            if (!activePlayer) return;
            dispatch({
              type: "PUBLISH_PLAYER_TRADE",
              playerId: activePlayer.id,
              offered,
              requested
            });
          }}
          type="button"
        >
          {t("trade.publish")}
        </button>
      </div>
      <div className="player-trade-editor">
        <ResourceBundleEditor displayLabel={t("trade.offer")} labels={localizedResourceLabels} visibleLabels={visibleResourceLabels} onChange={setOffered} value={offered} />
        <ResourceBundleEditor displayLabel={t("trade.request")} labels={localizedResourceLabels} visibleLabels={visibleResourceLabels} onChange={setRequested} value={requested} />
      </div>
      <span className="sr-only" id="player-trade-publish-reason">
        {translateRuleText(locale, publishReason)}
      </span>
    </section>
  );
}
