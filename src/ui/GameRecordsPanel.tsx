import React, { useRef, useState } from "react";
import { resources } from "../domain/types";
import type { GameTableDispatch, GameTableView } from "./GameTable";
import { ResourceBundle, ResourceIcon } from "./ResourceBadge";
import { formatGameLogEntry, useI18n } from "./i18n";

type StatsMode = "player" | "dice" | "matrix";
type RecordsTab = "log" | "statistics";

export function GameRecordsPanel({ state, dispatch }: {
  state: GameTableView;
  dispatch: GameTableDispatch;
}) {
  const { locale, t } = useI18n();
  const [tab, setTab] = useState<RecordsTab>("log");
  const logTabRef = useRef<HTMLButtonElement>(null);
  const statsTabRef = useRef<HTMLButtonElement>(null);

  function handleTabKey(event: React.KeyboardEvent<HTMLButtonElement>) {
    let nextTab: RecordsTab;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      nextTab = tab === "log" ? "statistics" : "log";
    } else if (event.key === "Home" || event.key === "End") {
      nextTab = event.key === "Home" ? "log" : "statistics";
    } else {
      return;
    }
    event.preventDefault();
    setTab(nextTab);
    (nextTab === "log" ? logTabRef : statsTabRef).current?.focus();
  }

  return (
    <div className="game-records">
      <div aria-label={t("dialog.records")} className="records-tabs" role="tablist">
        {(["log", "statistics"] as const).map((item) => (
          <button
            aria-controls={`records-panel-${item}`}
            aria-selected={tab === item}
            id={`records-tab-${item}`}
            key={item}
            onClick={() => setTab(item)}
            onKeyDown={handleTabKey}
            ref={item === "log" ? logTabRef : statsTabRef}
            role="tab"
            tabIndex={tab === item ? 0 : -1}
            type="button"
          >
            {t(item === "log" ? "log.title" : "stats.title")}
          </button>
        ))}
      </div>
      <div
        aria-labelledby="records-tab-log"
        className="records-content"
        hidden={tab !== "log"}
        id="records-panel-log"
        role="tabpanel"
      >
        <section className="log-panel">
          <div className="panel-header">
            <h3 id="game-log-title">{t("log.title")}</h3>
            <span className="log-count">{t("log.count", { count: state.game.log.length })}</span>
          </div>
          <div aria-labelledby="game-log-title" aria-live="polite" className="log-list" role="log" tabIndex={0}>
            {state.game.log.map((entry) => (
              <p key={entry.id}>{formatGameLogEntry({
                id: entry.id,
                message: entry.fallbackText,
                ...(entry.messageKey ? { messageKey: entry.messageKey as never } : {}),
                ...(entry.params ? { params: { ...entry.params } } : {})
              }, locale)}</p>
            ))}
          </div>
        </section>
      </div>
      <div
        aria-labelledby="records-tab-statistics"
        className="records-content"
        hidden={tab !== "statistics"}
        id="records-panel-statistics"
        role="tabpanel"
      >
        <StatsPanel state={state} dispatch={dispatch} />
      </div>
    </div>
  );
}

export function StatsPanel({
  state,
  dispatch
}: {
  state: GameTableView;
  dispatch: GameTableDispatch;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<StatsMode>("player");
  if (!state.statistics) {
    return (
      <section className="tool-panel stats-panel">
        <div className="panel-header"><h3>{t("stats.title")}</h3></div>
        <p>{t("online.statisticsUnavailable")}</p>
      </section>
    );
  }
  const playerRows = state.statistics.playerRows[state.selectedPlayerId] ?? [];
  const diceIncome = state.statistics.diceIncome[state.selectedDiceTotal];
  const matrix = state.statistics.matrix;

  return (
    <section className="tool-panel stats-panel">
      <div className="panel-header">
        <h3>{t("stats.title")}</h3>
        <div className="segmented">
          {(["player", "dice", "matrix"] as const).map((nextMode) => (
            <button
              aria-pressed={mode === nextMode}
              className={mode === nextMode ? "selected" : ""}
              key={nextMode}
              onClick={() => setMode(nextMode)}
              type="button"
            >
              {t(`stats.${nextMode}`)}
            </button>
          ))}
        </div>
      </div>
      {mode === "player" ? (
        <>
          <select
            aria-label={t("stats.playerLabel")}
            value={state.selectedPlayerId}
            onChange={(event) =>
              dispatch({ type: "ui.selectPlayer", playerId: event.currentTarget.value })
            }
          >
            {state.game.players.map((player) => (
              <option key={player.id} value={player.id}>
                {player.name}
              </option>
            ))}
          </select>
          <div aria-label={t("stats.title")} className="table-scroll" role="region" tabIndex={0}>
            <table>
              <thead>
                <tr>
                  <th>{t("stats.diceHeader")}</th>
                  <th>{t("stats.chance")}</th>
                  <th>{t("stats.gainNow")}</th>
                  <th>{t("stats.expected")}</th>
                </tr>
              </thead>
              <tbody>
                {playerRows.map((row) => (
                  <tr key={row.diceTotal}>
                    <td>{row.diceTotal}</td>
                    <td>{Math.round(row.probability * 1000) / 10}%</td>
                    <td data-stat-resource-bundle="gain">
                      {resources.some((resource) => row.resources[resource] > 0)
                        ? <ResourceBundle compact resources={row.resources} />
                        : t("stats.noGain")}
                    </td>
                    <td data-stat-resource-bundle="expected">
                      {resources.some((resource) => row.expected[resource] > 0)
                        ? <ResourceBundle compact resources={row.expected} />
                        : t("stats.noGain")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
      {mode === "dice" ? (
        <>
          <select
            aria-label={t("stats.diceLabel")}
            value={state.selectedDiceTotal}
            onChange={(event) =>
              dispatch({ type: "ui.selectDiceTotal", diceTotal: Number(event.currentTarget.value) })
            }
          >
            {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((diceTotal) => (
              <option key={diceTotal} value={diceTotal}>
                {diceTotal}
              </option>
            ))}
          </select>
          <div
            aria-label={t("stats.incomeList")}
            className="dice-income-list"
            tabIndex={0}
          >
            {state.game.players.map((player) => (
              <p key={player.id}>
                <strong>{player.name}</strong>
                <span data-stat-resource-bundle="dice">
                  {resources.some((resource) => (diceIncome?.players[player.id]?.[resource] ?? 0) > 0)
                    ? <ResourceBundle compact resources={diceIncome?.players[player.id] ?? {}} />
                    : t("stats.noGain")}
                </span>
              </p>
            ))}
          </div>
        </>
      ) : null}
      {mode === "matrix" ? (
        <div aria-label={t("stats.title")} className="table-scroll matrix" role="region" tabIndex={0}>
          <table>
            <thead>
              <tr>
                <th>{t("stats.player")}</th>
                {resources.map((resource) => (
                  <th key={resource} scope="col">
                    <ResourceIcon resource={resource} size={17} />
                  </th>
                ))}
                <th>{t("stats.totalEv")}</th>
              </tr>
            </thead>
            <tbody>
              {state.game.players.map((player) => {
                const totals = matrix.totals[player.id];
                const totalExpected = resources.reduce((sum, resource) => sum + totals[resource], 0);
                return (
                  <tr key={player.id}>
                    <td>{player.name}</td>
                    {resources.map((resource) => (
                      <td key={resource}>{totals[resource].toFixed(2)}</td>
                    ))}
                    <td>{totalExpected.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
