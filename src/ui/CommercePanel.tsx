import React, { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, Landmark } from "lucide-react";
import { getActionAvailability } from "../app/actionAvailability";
import type { AppState, GameCommand } from "../app/gameReducer";
import { resources } from "../domain/types";
import { formatResourceMap, resourceLabels } from "./resourceLabels";

export function CommercePanel({
  state,
  dispatch
}: {
  state: AppState;
  dispatch: (command: GameCommand) => void;
}) {
  const activePlayer = state.game.players.find(
    (player) => player.id === state.game.activePlayerId
  );
  const availability = useMemo(
    () => getActionAvailability(state, state.game.activePlayerId),
    [state]
  );
  const validRecipients = useMemo(
    () =>
      state.game.players.filter((player) =>
        availability.commerce.transfer.recipientIds.includes(player.id)
      ),
    [availability.commerce.transfer.recipientIds, state.game.players]
  );
  const [recipientId, setRecipientId] = useState(validRecipients[0]?.id ?? "");
  const [tokenAmount, setTokenAmount] = useState(1);
  const [gatheringPlayerId, setGatheringPlayerId] = useState(state.game.activePlayerId);
  const [bids, setBids] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!validRecipients.some((player) => player.id === recipientId)) {
      setRecipientId(validRecipients[0]?.id ?? "");
    }
  }, [recipientId, validRecipients]);

  useEffect(() => {
    if (!state.game.players.some((player) => player.id === gatheringPlayerId)) {
      setGatheringPlayerId(state.game.activePlayerId);
    }
  }, [gatheringPlayerId, state.game.activePlayerId, state.game.players]);

  const gatheringPlayer = state.game.players.find(
    (player) => player.id === gatheringPlayerId
  );
  const gatheringAvailability = availability.commerce.gatheringPlayers.find(
    (player) => player.id === gatheringPlayerId
  );
  const recipientIsValid = validRecipients.some((player) => player.id === recipientId);
  const canSendTokens =
    availability.commerce.transfer.enabled &&
    Boolean(activePlayer) &&
    recipientIsValid &&
    Number.isInteger(tokenAmount) &&
    tokenAmount > 0 &&
    tokenAmount <= availability.commerce.transfer.maxAmount;

  return (
    <section className="tool-panel commerce-panel">
      <div className="panel-header">
        <h2>Commerce Guild</h2>
        <span>Round {state.game.round}</span>
      </div>
      <div className="trade-slots">
        {state.guild.tradeSlots.map((slot) => (
          <article className="trade-slot" key={slot.id}>
            <strong>{formatResourceMap(slot.requires)}</strong>
            <span>
              <ArrowRightLeft size={14} /> {slot.tokenReward} tokens
            </span>
            <button
              aria-describedby={`trade-${slot.id}-unavailable-reason`}
              disabled={
                !availability.commerce.tradeSlots.find((entry) => entry.id === slot.id)?.enabled
              }
              onClick={() =>
                activePlayer &&
                dispatch({
                  type: "COMPLETE_TRADE_SLOT",
                  playerId: activePlayer.id,
                  slotId: slot.id
                })
              }
              type="button"
            >
              Trade
            </button>
          </article>
        ))}
      </div>
      <div className="token-transfer">
        <select
          aria-label="Token recipient"
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
          aria-label="Token amount"
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
              type: "TRANSFER_TOKENS",
              fromPlayerId: activePlayer.id,
              toPlayerId: recipientId,
              amount: tokenAmount
            })
          }
          type="button"
        >
          Send
        </button>
      </div>
      <div className="gathering">
        <div className="phase-line">
          <Landmark size={16} />
          <strong>{state.guild.gathering.phase}</strong>
        </div>
        {state.guild.gathering.phase === "idle" ? (
          <button
            aria-describedby="gathering-start-unavailable-reason"
            disabled={!availability.commerce.startGathering.enabled}
            onClick={() => dispatch({ type: "START_GATHERING" })}
            type="button"
          >
            Start Gathering
          </button>
        ) : null}
        {state.guild.gathering.phase === "redemption" ? (
          <>
            <select
              aria-label="Gathering player"
              onChange={(event) => setGatheringPlayerId(event.currentTarget.value)}
              value={gatheringPlayerId}
            >
              {state.game.players.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.name} ({player.guildTokens} tokens)
                </option>
              ))}
            </select>
            <p aria-live="polite" className="gathering-summary" role="status">
              {gatheringPlayer?.name ?? "Player"}: {gatheringAvailability?.tokens ?? 0} tokens ·{
                " "
              }
              {gatheringAvailability?.remainingAllowance ?? 0} redemptions remaining
            </p>
            <div className="resource-buttons">
              {resources.map((resource) => (
                <button
                  disabled={
                    !gatheringPlayer ||
                    gatheringPlayer.guildTokens === 0 ||
                    (gatheringAvailability?.remainingAllowance ?? 0) === 0 ||
                    (gatheringAvailability?.bankStock[resource] ?? 0) === 0
                  }
                  key={resource}
                  onClick={() =>
                    dispatch({
                      type: "REDEEM_GATHERING",
                      playerId: gatheringPlayerId,
                      resources: { [resource]: 1 }
                    })
                  }
                  type="button"
                >
                  +{resourceLabels[resource]} ({gatheringAvailability?.bankStock[resource] ?? 0} bank)
                </button>
              ))}
            </div>
            <button
              aria-describedby="auction-open-unavailable-reason"
              disabled={!availability.commerce.openAuction.enabled}
              onClick={() => dispatch({ type: "OPEN_AUCTION" })}
              type="button"
            >
              Open Auctions
            </button>
          </>
        ) : null}
        {state.guild.gathering.phase === "auction" ? (
          <div className="auction-grid">
            <strong>Round {state.guild.gathering.auctionRound} / 3</strong>
            {state.game.players.map((player) => (
              <label key={player.id}>
                {player.name}
                <input
                  min={0}
                  type="number"
                  value={bids[player.id] ?? 0}
                  onChange={(event) =>
                    setBids({ ...bids, [player.id]: Number(event.currentTarget.value) })
                  }
                />
              </label>
            ))}
            <button onClick={() => dispatch({ type: "RESOLVE_AUCTION", bids })} type="button">
              Resolve Blind Box
            </button>
          </div>
        ) : null}
        {state.guild.gathering.lastAuctionSummary ? (
          <p className="auction-result">{state.guild.gathering.lastAuctionSummary}</p>
        ) : null}
        <button
          aria-describedby="prize-unavailable-reason"
          disabled={!availability.commerce.redeemPrize.enabled}
          onClick={() =>
            activePlayer && dispatch({ type: "REDEEM_PRIZE", playerId: activePlayer.id })
          }
          type="button"
        >
          Redeem Prize
        </button>
        <div className="sr-only">
          {availability.commerce.tradeSlots.map((slot) => (
            <span id={`trade-${slot.id}-unavailable-reason`} key={slot.id}>
              {slot.reason}
            </span>
          ))}
          <span id="transfer-unavailable-reason">
            {availability.commerce.transfer.reason}
          </span>
          <span id="gathering-start-unavailable-reason">
            {availability.commerce.startGathering.reason}
          </span>
          <span id="auction-open-unavailable-reason">
            {availability.commerce.openAuction.reason}
          </span>
          <span id="prize-unavailable-reason">
            {availability.commerce.redeemPrize.reason}
          </span>
        </div>
      </div>
    </section>
  );
}
