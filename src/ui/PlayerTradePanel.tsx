import React, { useEffect, useMemo, useState } from "react";
import { Coins } from "lucide-react";
import { getPlayerTradeBundleReason } from "../domain/rules/playerTrade";
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
  separator: string,
  tokenDescription: string,
  tokens = 0
): string {
  const parts = resources
    .filter((resource) => bundle[resource] > 0)
    .map((resource) => `${bundle[resource]} ${labels[resource]}`);
  if (tokens > 0) parts.push(tokenDescription);
  return parts.join(separator);
}

function TradeBundleEditor({
  displayLabel,
  labels,
  value,
  onChange,
  tokens,
  maxTokens,
  onTokensChange
}: {
  displayLabel: string;
  labels: Record<Resource, string>;
  value: ResourceMap;
  onChange: (value: ResourceMap) => void;
  tokens: number;
  maxTokens?: number;
  onTokensChange: (value: number) => void;
}) {
  const { t } = useI18n();
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
      <label className="player-trade-tokens">
        <span className="player-trade-token-label">
          <Coins aria-hidden="true" size={18} />
          <span>
            {t("trade.tokens")}
            {maxTokens !== undefined ? <small>{t("trade.tokensOwned", { count: maxTokens })}</small> : null}
          </span>
        </span>
        <input
          aria-label={`${displayLabel} ${t("trade.tokens")}`}
          inputMode="numeric"
          max={maxTokens ?? Number.MAX_SAFE_INTEGER}
          min={0}
          onChange={(event) => {
            const value = Math.trunc(Number(event.currentTarget.value)) || 0;
            onTokensChange(Math.max(0, Math.min(maxTokens ?? Number.MAX_SAFE_INTEGER, value)));
          }}
          step={1}
          type="number"
          value={tokens}
        />
      </label>
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
  const [offeredTokens, setOfferedTokens] = useState(0);
  const [requestedTokens, setRequestedTokens] = useState(0);
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
      const invalidBundle = getPlayerTradeBundleReason(offered, "Offered", offeredTokens) ??
        getPlayerTradeBundleReason(requested, "Requested", requestedTokens);
      if (invalidBundle) return invalidBundle;
      if (offeredTokens > activePlayer.guildTokens) return "The active player cannot afford the offered tokens.";
      return resources.some((resource) => offered[resource] > state.tradePolicy.maxOfferResources[resource])
        ? "The active player cannot afford the offered resources."
        : null;
    },
    [activePlayer, offered, requested, offeredTokens, requestedTokens, state.tradePolicy]
  );

  useEffect(() => {
    setOffered(emptyResources());
    setRequested(emptyResources());
    setOfferedTokens(0);
    setRequestedTokens(0);
  }, [state.pendingPlayerTrade, state.game.activePlayerId]);

  if (state.pendingPlayerTrade) {
    const offer = state.pendingPlayerTrade;
    const proposer = state.game.players.find((player) => player.id === offer.proposerId);
    const summary = t("trade.summary", {
      name: proposer?.name ?? offer.proposerId,
      offered: formatTradeBundle(
        offer.offered,
        localizedResourceLabels,
        t("resource.bundleSeparator"),
        t(offer.offeredTokens === 1 ? "trade.tokenQuantity.one" : "trade.tokenQuantity", { count: offer.offeredTokens ?? 0 }),
        offer.offeredTokens
      ),
      requested: formatTradeBundle(
        offer.requested,
        localizedResourceLabels,
        t("resource.bundleSeparator"),
        t(offer.requestedTokens === 1 ? "trade.tokenQuantity.one" : "trade.tokenQuantity", { count: offer.requestedTokens ?? 0 }),
        offer.requestedTokens
      )
    });
    return (
      <section className="player-trade-panel">
        <p className="player-trade-summary">
          <span className="sr-only">{summary}</span>
          <span aria-hidden="true" className="player-trade-summary-visual">
            <span className="player-trade-summary-side">
              <span>{proposer?.name ?? offer.proposerId} · {t("trade.offer")}</span>
              <ResourceBundle compact resources={offer.offered} />
              {(offer.offeredTokens ?? 0) > 0 ? (
                <span className="trade-token-badge" data-trade-tokens="offered" title={t("trade.tokens")}>
                  <Coins size={18} /> {offer.offeredTokens}
                </span>
              ) : null}
            </span>
            <span className="player-trade-summary-side">
              <span>{t("trade.request")}</span>
              <ResourceBundle compact resources={offer.requested} />
              {(offer.requestedTokens ?? 0) > 0 ? (
                <span className="trade-token-badge" data-trade-tokens="requested" title={t("trade.tokens")}>
                  <Coins size={18} /> {offer.requestedTokens}
                </span>
              ) : null}
            </span>
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
                    disabled={!control.tradeResponse?.enabled || Boolean(reason)}
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
            disabled={!state.controlledPlayers.some((control) => control.tradeResponse?.kind === "cancel" && control.tradeResponse.enabled)}
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
              requested,
              ...(offeredTokens > 0 ? { offeredTokens } : {}),
              ...(requestedTokens > 0 ? { requestedTokens } : {})
            });
          }}
          type="button"
        >
          {t("trade.publish")}
        </button>
      </div>
      <div className="player-trade-editor">
        <TradeBundleEditor displayLabel={t("trade.offer")} labels={localizedResourceLabels} onChange={setOffered} value={offered}
          tokens={offeredTokens} maxTokens={activePlayer?.guildTokens ?? 0} onTokensChange={setOfferedTokens} />
        <TradeBundleEditor displayLabel={t("trade.request")} labels={localizedResourceLabels} onChange={setRequested} value={requested}
          tokens={requestedTokens} onTokensChange={setRequestedTokens} />
      </div>
      <span className="sr-only" id="player-trade-publish-reason">
        {translateRuleText(locale, publishReason)}
      </span>
    </section>
  );
}
