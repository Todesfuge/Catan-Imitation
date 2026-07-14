import React, { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, Landmark, Layers3, TimerReset } from "lucide-react";
import { resources } from "../domain/types";
import type { GameTableDispatch, GameTableView } from "./GameTable";
import { translateRuleText, useI18n } from "./i18n";
import { ResourceBadge, ResourceBundle } from "./ResourceBadge";

export function CommercePanel({
  state,
  dispatch
}: {
  state: GameTableView;
  dispatch: GameTableDispatch;
}) {
  const { locale, t } = useI18n();
  const activePlayer = state.game.players.find(
    (player) => player.id === state.game.activePlayerId
  );
  const availability = state.legality.actions;
  const validRecipients = useMemo(
    () =>
      state.game.players.filter((player) =>
        availability.commerce.transfer.recipientIds.includes(player.id)
      ),
    [availability.commerce.transfer.recipientIds, state.game.players]
  );
  const [recipientId, setRecipientId] = useState(validRecipients[0]?.id ?? "");
  const [tokenAmount, setTokenAmount] = useState(1);
  const [gatheringControlId, setGatheringControlId] = useState(
    state.controlledPlayers.find((control) => control.isActive)?.controlId ?? state.controlledPlayers[0]?.controlId ?? ""
  );
  const [bids, setBids] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!validRecipients.some((player) => player.id === recipientId)) {
      setRecipientId(validRecipients[0]?.id ?? "");
    }
  }, [recipientId, validRecipients]);

  useEffect(() => {
    if (!state.controlledPlayers.some((control) => control.controlId === gatheringControlId)) {
      setGatheringControlId(state.controlledPlayers.find((control) => control.isActive)?.controlId ?? state.controlledPlayers[0]?.controlId ?? "");
    }
  }, [gatheringControlId, state.controlledPlayers]);

  const gatheringControl = state.controlledPlayers.find((control) => control.controlId === gatheringControlId);
  const recipientIsValid = validRecipients.some((player) => player.id === recipientId);
  const canSendTokens =
    availability.commerce.transfer.enabled &&
    Boolean(activePlayer) &&
    recipientIsValid &&
    Number.isInteger(tokenAmount) &&
    tokenAmount > 0 &&
    tokenAmount <= availability.commerce.transfer.maxAmount;
  const gatheringCooldownStatus = state.guild.gathering.cooldownRemaining === 0
    ? t("commerce.gatheringReady")
    : t("commerce.gatheringCooldownRemaining", {
        count: state.guild.gathering.cooldownRemaining
      });
  const gatheringCooldownLabel = `${t("commerce.gatheringCooldown")}: ${gatheringCooldownStatus}`;

  return (
    <section className="commerce-panel">
      <div className="panel-header">
        <h2>{t("trade.commerceTab")}</h2>
        <span>{t("commerce.round", { round: state.game.round })}</span>
      </div>
      <div className="trade-slots">
        {state.guild.tradeSlots.map((slot) => (
          <article className="trade-slot" key={slot.id}>
            <strong><ResourceBundle compact resources={slot.requires} /></strong>
            <span>
              <ArrowRightLeft size={14} /> {t("commerce.tokens", { count: slot.tokenReward })}
            </span>
            <button
              aria-describedby={`trade-${slot.id}-unavailable-reason`}
              disabled={
                !availability.commerce.tradeSlots.find((entry) => entry.id === slot.id)?.enabled
              }
              onClick={() =>
                activePlayer &&
                dispatch({
                  type: "commerce.completeSlot",
                  slotId: slot.id
                })
              }
              type="button"
            >
              {t("commerce.trade")}
            </button>
          </article>
        ))}
      </div>
      <div className="token-transfer">
        <select
          aria-label={t("commerce.tokenRecipient")}
          onChange={(event) => setRecipientId(event.currentTarget.value)}
          value={recipientId}
        >
          {validRecipients.map((player) => (
            <option key={player.id} value={player.id}>
              {player.name}
            </option>
          ))}
        </select>
        <input
          aria-label={t("commerce.tokenAmount")}
          min={1}
          type="number"
          value={tokenAmount}
          onChange={(event) => setTokenAmount(Number(event.currentTarget.value))}
        />
        <button
          aria-describedby="transfer-unavailable-reason"
          disabled={!canSendTokens}
          onClick={() =>
            activePlayer &&
            dispatch({
              type: "commerce.transfer",
              recipientId,
              amount: tokenAmount
            })
          }
          type="button"
        >
          {t("commerce.send")}
        </button>
      </div>
      <div className="gathering">
        <div className="phase-line">
          <Landmark size={16} />
          <strong>{t(`commerce.phase.${state.guild.gathering.phase}`)}</strong>
        </div>
        {state.guild.gathering.phase === "idle" ? (
          <div className="gathering-start-row">
            <span
              aria-label={gatheringCooldownLabel}
              className={`gathering-cooldown-badge${state.guild.gathering.cooldownRemaining === 0 ? " ready" : ""}`}
              data-gathering-cooldown={state.guild.gathering.cooldownRemaining}
              role="status"
              title={gatheringCooldownLabel}
            >
              <TimerReset aria-hidden="true" size={16} />
              <strong>{state.guild.gathering.cooldownRemaining}</strong>
              <span>{gatheringCooldownStatus}</span>
            </span>
            <button
              aria-describedby="gathering-start-unavailable-reason"
              disabled={!availability.commerce.startGathering.enabled}
              onClick={() => dispatch({ type: "commerce.startGathering" })}
              type="button"
            >
              {t("commerce.startGathering")}
            </button>
          </div>
        ) : null}
        {state.guild.gathering.phase === "redemption" ? (
          <>
            <select
              aria-label={t("commerce.gatheringPlayer")}
              onChange={(event) => setGatheringControlId(event.currentTarget.value)}
              value={gatheringControlId}
            >
              {state.controlledPlayers.map((control) => (
                <option key={control.controlId} value={control.controlId}>
                  {control.displayName} ({t("commerce.tokens", { count: control.guildTokens })})
                </option>
              ))}
            </select>
            <p aria-live="polite" className="gathering-summary" role="status">
              {gatheringControl?.displayName ?? "Player"}: {t("commerce.tokens", { count: gatheringControl?.guildTokens ?? 0 })} ·{
                " "
              }
              {t("commerce.redemptions", { count: gatheringControl?.gatheringRemainingAllowance ?? 0 })}
            </p>
            <div className="resource-buttons">
              {resources.map((resource) => (
                <button
                  aria-label={t("commerce.redeemResource", {
                    resource: t(`resource.${resource}`),
                    count: gatheringControl?.gatheringBankStock[resource] ?? 0
                  })}
                  disabled={
                    !gatheringControl ||
                    gatheringControl.guildTokens === 0 ||
                    gatheringControl.gatheringRemainingAllowance === 0 ||
                    gatheringControl.gatheringBankStock[resource] === 0
                  }
                  key={resource}
                  onClick={() =>
                    gatheringControl && dispatch({
                        type: "commerce.redeem",
                        controlId: gatheringControl.controlId,
                        resources: { [resource]: 1 }
                      })
                  }
                  title={t("commerce.redeemResource", {
                    resource: t(`resource.${resource}`),
                    count: gatheringControl?.gatheringBankStock[resource] ?? 0
                  })}
                  type="button"
                >
                  <ResourceBadge
                    decorative
                    quantity={gatheringControl?.gatheringBankStock[resource] ?? 0}
                    resource={resource}
                  />
                </button>
              ))}
            </div>
            <button
              aria-describedby="auction-open-unavailable-reason"
              disabled={!availability.commerce.openAuction.enabled}
              onClick={() => dispatch({ type: "commerce.openAuction" })}
              type="button"
            >
              {t("commerce.openAuctions")}
            </button>
          </>
        ) : null}
        {state.guild.gathering.phase === "auction" ? (
          <div className="auction-grid">
            <strong>{t("commerce.auctionRound", { round: state.guild.gathering.auctionRound })}</strong>
            {state.sealedAuction ? (
              <>
                {state.sealedAuction.seats.map((seat) => (
                  <span className="auction-submission-state" key={seat.seatId}>
                    {seat.seatId === state.sealedAuction?.viewerSeatId
                      ? state.sealedAuction.ownPendingBid !== undefined
                        ? t("online.auctionOwnBid", { bid: state.sealedAuction.ownPendingBid })
                        : t("online.auctionYourTurn")
                      : seat.submitted
                        ? t("online.auctionSubmitted", { name: seat.nickname })
                        : t("online.auctionWaiting", { name: seat.nickname })}
                  </span>
                ))}
                <label>
                  {t("online.auctionBidLabel")}
                  <input
                    aria-label={t("online.auctionBidLabel")}
                    disabled={!state.sealedAuction.enabled}
                    max={state.sealedAuction.maxAmount}
                    min={0}
                    onChange={(event) => setBids({ ...bids, [state.sealedAuction!.viewerSeatId]: Number(event.currentTarget.value) })}
                    type="number"
                    value={bids[state.sealedAuction.viewerSeatId] ?? state.sealedAuction.ownPendingBid ?? 0}
                  />
                </label>
                <button
                  disabled={!state.sealedAuction.enabled}
                  onClick={() => dispatch({
                    type: "auction.submitBid",
                    controlId: state.sealedAuction!.viewerSeatId,
                    bid: bids[state.sealedAuction!.viewerSeatId] ?? state.sealedAuction!.ownPendingBid ?? 0
                  })}
                  type="button"
                >
                  {t("online.auctionSubmit")}
                </button>
                {state.sealedAuction.reason ? <span>{translateRuleText(locale, state.sealedAuction.reason)}</span> : null}
              </>
            ) : state.controlledPlayers.map((control) => {
              return <label data-control-id={control.controlId} key={control.controlId}>
                {control.displayName}
                <input
                  min={0}
                  type="number"
                  value={bids[control.controlId] ?? 0}
                  onChange={(event) =>
                    setBids({ ...bids, [control.controlId]: Number(event.currentTarget.value) })
                  }
                />
              </label>;
            })}
            {!state.sealedAuction ? <button onClick={() => state.controlledPlayers.forEach((control) => dispatch({
              type: "auction.submitBid",
              controlId: control.controlId,
              bid: bids[control.controlId] ?? 0
            }))} type="button">
              {t("commerce.resolveBlindBox")}
            </button> : null}
          </div>
        ) : null}
        {state.guild.gathering.lastAuctionResult ? (() => {
          const result = state.guild.gathering.lastAuctionResult;
          const resourceCardCount = result.outcome.resourceCardCount ?? 0;
          const outcome = result.outcome.kind === "voucher"
            ? t("commerce.outcome.voucher")
            : result.outcome.kind === "developmentCard"
              ? state.sealedAuction
                ? t("online.auctionDevelopmentCardGeneric")
                : t("commerce.outcome.developmentCard", { cardKind: t("action.devCard") })
              : t("resource.cardsGeneric", { count: resourceCardCount });
          const summary = t("commerce.auctionResult", {
              winnerName: state.guild.gathering.lastAuctionResult.winnerName,
              round: state.guild.gathering.lastAuctionResult.round,
              bid: state.guild.gathering.lastAuctionResult.winningBid,
              outcome
            });
          return (
            <p className="auction-result">
              {result.outcome.kind === "resources" ? (
                <>
                  <span className="sr-only">{summary}</span>
                  <span aria-hidden="true" className="auction-result-visual">
                    <span>{result.winnerName} · {result.round} · {result.winningBid}</span>
                    <span className="generic-resource-card-count" title={outcome}>
                      <Layers3 aria-hidden="true" size={18} />
                      <strong>{resourceCardCount}</strong>
                    </span>
                  </span>
                </>
              ) : summary}
            </p>
          );
        })() : null}
        <button
          aria-describedby="prize-unavailable-reason"
          disabled={!availability.commerce.redeemPrize.enabled}
          onClick={() =>
            activePlayer && dispatch({ type: "commerce.redeemPrize" })
          }
          type="button"
        >
          {t("commerce.redeemPrize")}
        </button>
        <div className="sr-only">
          {availability.commerce.tradeSlots.map((slot) => (
            <span id={`trade-${slot.id}-unavailable-reason`} key={slot.id}>
              {translateRuleText(locale, slot.reason)}
            </span>
          ))}
          <span id="transfer-unavailable-reason">
            {translateRuleText(locale, availability.commerce.transfer.reason)}
          </span>
          <span id="gathering-start-unavailable-reason">
            {translateRuleText(locale, availability.commerce.startGathering.reason)}
          </span>
          <span id="auction-open-unavailable-reason">
            {translateRuleText(locale, availability.commerce.openAuction.reason)}
          </span>
          <span id="prize-unavailable-reason">
            {translateRuleText(locale, availability.commerce.redeemPrize.reason)}
          </span>
        </div>
      </div>
    </section>
  );
}
