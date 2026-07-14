import React, { useEffect, useMemo, useState } from "react";
import {
  emptyResources,
  resources,
  type Resource,
  type ResourceMap
} from "../domain/types";
import { translateRuleText, useI18n } from "./i18n";
import type { GameTableDispatch, GameTableView } from "./GameTable";
import { ResourceBundle, ResourceIcon } from "./ResourceBadge";

function formatTradeBundle(
  bundle: ResourceMap,
  labels: Record<Resource, string>,
  separator: string
): string {
  return resources
    .filter((resource) => bundle[resource] > 0)
    .map((resource) => `${bundle[resource]} ${labels[resource]}`)
    .join(separator);
}

function bundleReason(bundle: ResourceMap, label: "Offered" | "Requested"): string | null {
  if (resources.some((resource) => !Number.isInteger(bundle[resource]) || bundle[resource] < 0)) {
    return "Player trade quantities must be non-negative whole numbers.";
  }
  return resources.every((resource) => bundle[resource] === 0)
    ? `${label} bundle must contain at least one resource.`
    : null;
}

function ResourceBundleEditor({
  displayLabel,
  labels,
  value,
  onChange
}: {
  displayLabel: string;
  labels: Record<Resource, string>;
  value: ResourceMap;
  onChange: (value: ResourceMap) => void;
}) {
  return (
    <fieldset className="player-trade-bundle">
      <legend>{displayLabel}</legend>
      {resources.map((resource) => (
        <label data-player-trade-resource={resource} key={resource}>
          <ResourceIcon resource={resource} />
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
  const publishReason = useMemo(
    () => {
      if (!activePlayer) return "No active player is available.";
      if (!state.tradePolicy.publishEnabled) return state.tradePolicy.publishReason ?? "Player trade is unavailable.";
      const invalidBundle = bundleReason(offered, "Offered") ?? bundleReason(requested, "Requested");
      if (invalidBundle) return invalidBundle;
      return resources.some((resource) => offered[resource] > state.tradePolicy.maxOfferResources[resource])
        ? "The active player cannot afford the offered resources."
        : null;
    },
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
    const summary = t("trade.summary", {
      name: proposer?.name ?? offer.proposerId,
      offered: formatTradeBundle(
        offer.offered,
        localizedResourceLabels,
        t("resource.bundleSeparator")
      ),
      requested: formatTradeBundle(
        offer.requested,
        localizedResourceLabels,
        t("resource.bundleSeparator")
      )
    });
    return (
      <section className="player-trade-panel">
        <p className="player-trade-summary">
          <span className="sr-only">{summary}</span>
          <span aria-hidden="true" className="player-trade-summary-visual">
            <span>{proposer?.name ?? offer.proposerId} · {t("trade.offer")}</span>
            <ResourceBundle compact resources={offer.offered} />
            <span>{t("trade.request")}</span>
            <ResourceBundle compact resources={offer.requested} />
          </span>
        </p>
        <div className="player-trade-responses">
          {state.controlledPlayers
            .filter((control) => control.tradeResponse?.kind === "accept")
            .map((control) => {
              const reason = control.tradeResponse?.reason;
              return (
                <div className="player-trade-response" data-control-id={control.controlId} key={control.controlId}>
                  <button
                    aria-describedby={`player-trade-${control.controlId}-reason`}
                    disabled={Boolean(reason)}
                    onClick={() =>
                      dispatch({ type: "trade.respond", controlId: control.controlId, response: "accept" })
                    }
                    type="button"
                  >
                    {t("trade.acceptAs", { name: control.displayName })}
                  </button>
                  {reason ? <span id={`player-trade-${control.controlId}-reason`}>{translateRuleText(locale, reason)}</span> : null}
                </div>
              );
            })}
        </div>
        {state.controlledPlayers.some((control) => control.tradeResponse?.kind === "cancel") ? (
          <button
            className="secondary"
            onClick={() =>
              state.controlledPlayers
                .filter((control) => control.tradeResponse?.kind === "cancel")
                .forEach((control) => dispatch({ type: "trade.respond", controlId: control.controlId, response: "cancel" }))
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
              type: "trade.publish",
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
        <ResourceBundleEditor displayLabel={t("trade.offer")} labels={localizedResourceLabels} onChange={setOffered} value={offered} />
        <ResourceBundleEditor displayLabel={t("trade.request")} labels={localizedResourceLabels} onChange={setRequested} value={requested} />
      </div>
      <span className="sr-only" id="player-trade-publish-reason">
        {translateRuleText(locale, publishReason)}
      </span>
    </section>
  );
}
