import React, { useEffect, useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { resources, type Resource } from "../domain/types";
import type { GameTableDispatch, GameTableView } from "./GameTable";
import { ResourceBadge } from "./ResourceBadge";
import { translateRuleText, useI18n } from "./i18n";

export function MaritimeTradePanel({ state, dispatch }: {
  state: GameTableView;
  dispatch: GameTableDispatch;
}) {
  const { locale, t } = useI18n();
  const activePlayer = state.game.players.find((player) => player.id === state.game.activePlayerId);
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

  return (
    <section className="maritime-trade-panel">
      <h2>{t("trade.maritimeTab")}</h2>
      <div className="maritime-action-group">
        <div className="maritime-ratio-guide" aria-label={t("action.maritimeRatiosLabel")}>
          {resources.map((resource) => (
            <span
              aria-label={`${t(`resource.${resource}`)} ${availability.maritime.ratios[resource]}:1`}
              key={resource}
            >
              <ResourceBadge compact decorative quantity={availability.maritime.ratios[resource]} resource={resource} />
              <span aria-hidden="true">:1</span>
            </span>
          ))}
        </div>
        <div className="maritime-selectors">
          <div
            aria-label={t("action.maritimeGiveLabel")}
            className="resource-choice-group"
            role="group"
          >
            {resources.map((resource) => {
              const trade = availability.maritime.trades.find(
                (candidate) => candidate.give === resource
              );
              const label = `${t("action.giveResource")}: ${t(`resource.${resource}`)} ${availability.maritime.ratios[resource]}:1`;
              return (
                <button
                  aria-describedby="maritime-unavailable-reason"
                  aria-label={label}
                  aria-pressed={maritimeGive === resource}
                  data-maritime-give={resource}
                  disabled={!trade}
                  key={resource}
                  onClick={() => {
                    setMaritimeGive(resource);
                    setMaritimeReceive("");
                  }}
                  title={label}
                  type="button"
                >
                  <ResourceBadge compact decorative quantity={availability.maritime.ratios[resource]} resource={resource} />
                  <span aria-hidden="true">:1</span>
                </button>
              );
            })}
          </div>
          <div
            aria-label={t("action.maritimeReceiveLabel")}
            className="resource-choice-group"
            role="group"
          >
            {resources.map((resource) => {
              const label = `${t("action.receiveResource")}: ${t(`resource.${resource}`)} (${t("commerce.bank", { count: state.game.bank.resources[resource] })})`;
              return (
                <button
                  aria-describedby="maritime-unavailable-reason"
                  aria-label={label}
                  aria-pressed={maritimeReceive === resource}
                  data-maritime-receive={resource}
                  disabled={!selectedTrade?.receives.includes(resource)}
                  key={resource}
                  onClick={() => setMaritimeReceive(resource)}
                  title={label}
                  type="button"
                >
                  <ResourceBadge compact decorative quantity={state.game.bank.resources[resource]} resource={resource} />
                </button>
              );
            })}
          </div>
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
      <p id="maritime-unavailable-reason">{translateRuleText(locale, availability.maritime.reason)}</p>
    </section>
  );
}
