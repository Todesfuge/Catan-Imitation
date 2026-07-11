import React, { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Coins,
  Gift,
  Info,
  Landmark,
  Maximize,
  ScrollText,
  Settings,
  Trophy,
  Warehouse
} from "lucide-react";
import type { CommerceGuildState } from "../domain/expansion/commerceGuild";
import type { TurnActionAvailability } from "../app/actionAvailability";
import type { DiceRoll, MatchCommand } from "../domain/match/types";
import type { PlayerTradeOffer } from "../domain/rules/playerTrade";
import type {
  DiceIncome,
  ExpectedIncomeMatrix,
  PlayerIncomeRow
} from "../domain/stats/income";
import {
  resources,
  type BoardEdge,
  type BoardHex,
  type Building,
  type DevelopmentCard,
  type GameState,
  type Player,
  type PlayerId,
  type ResourceMap
} from "../domain/types";
import {
  boardViewBox,
  edgeProjection,
  hexCenterPoint,
  hexPolygonPoints,
  portProjection,
  pointsAttribute,
  vertexProjection
} from "./boardGeometry";
import { TurnFlowPanel } from "./TurnFlowPanel";
import { RoadBuildingTargets } from "./DevelopmentCardPanel";
import { ActionDock, type BoardInteractionMode } from "./ActionDock";
import { BoardActionTargets } from "./BoardActionTargets";
import { TradeHubPanel } from "./TradeHubPanel";
import { UtilityDialog, type UtilityPanel } from "./UtilityDialog";
import {
  formatResourceMap,
  resourceShortLabels
} from "./resourceLabels";
import { formatGameLogEntry, translateRuleText, useI18n } from "./i18n";

export interface GameTablePlayerView extends Omit<Player, "resources" | "developmentCards"> {
  visibleScore: number;
  resourceCardCount: number;
  developmentCardCount: number;
  resources?: Player["resources"];
  developmentCards?: DevelopmentCard[];
}

export interface GameTableGameView extends Omit<GameState, "players" | "developmentDeck"> {
  players: GameTablePlayerView[];
  developmentDeckCount: number;
}

export interface GameTableStatisticsView {
  playerRows: Record<PlayerId, PlayerIncomeRow[]>;
  diceIncome: Record<number, DiceIncome>;
  matrix: ExpectedIncomeMatrix;
}

export interface GameTableLegalityView {
  actions: TurnActionAvailability;
  setupRoadEdgeIds: string[];
  setupSettlementVertexIds: string[];
  freeRoadEdgeIds: string[];
}

export interface GameTableTradePolicy {
  publishReason(offered: ResourceMap, requested: ResourceMap): string | null;
  acceptanceReasons: Record<PlayerId, string | null>;
}

export interface GameTableView {
  game: GameTableGameView;
  guild: CommerceGuildState;
  lastDice: DiceRoll | null;
  pendingPlayerTrade?: PlayerTradeOffer;
  selectedDiceTotal: number;
  selectedPlayerId: PlayerId;
  notice: string | null;
  statistics: GameTableStatisticsView;
  legality: GameTableLegalityView;
  tradePolicy: GameTableTradePolicy;
}

export type GameTableUiCommand =
  | { type: "SELECT_DICE_TOTAL"; diceTotal: number }
  | { type: "SELECT_PLAYER"; playerId: PlayerId };

export type GameTableCommand = MatchCommand | GameTableUiCommand;

export type GameTableDispatch = (command: GameTableCommand) => void;

type StatsMode = "player" | "dice" | "matrix";

const terrainMarks: Record<BoardHex["terrain"], string> = {
  forest: "Fo",
  hill: "Hi",
  pasture: "Pa",
  field: "Fi",
  mountain: "Mt",
  desert: "De"
} as const;

const dicePipCounts: Record<number, number> = {
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  8: 5,
  9: 4,
  10: 3,
  11: 2,
  12: 1
} as const;

function buildingPosition(hexes: BoardHex[], building: Building) {
  return vertexProjection(hexes, building.vertexId);
}

function RoadMarker({
  edge,
  hexes,
  ownerColor
}: {
  edge: BoardEdge;
  hexes: BoardHex[];
  ownerColor?: string;
}) {
  const position = edgeProjection(hexes, edge);
  return (
    <line
      aria-hidden="true"
      className="road-marker"
      stroke={ownerColor}
      x1={position.from.x}
      x2={position.to.x}
      y1={position.from.y}
      y2={position.to.y}
    />
  );
}

function BoardView({
  state,
  dispatch,
  interactionMode,
  onTargetSelected,
  onUtilityOpen,
  onFullscreen
}: {
  state: GameTableView;
  dispatch: GameTableDispatch;
  interactionMode: BoardInteractionMode;
  onTargetSelected: () => void;
  onUtilityOpen: (panel: Exclude<UtilityPanel, null>) => void;
  onFullscreen: () => void;
}) {
  const { t } = useI18n();
  const canPlaceRobber = state.game.turnState.phase === "awaitingRobberPlacement";
  const playerColorById = new Map(state.game.players.map((player) => [player.id, player.color]));

  return (
    <section className="board-zone" aria-label={t("board.label")}>
      <div className="utility-rail" aria-label={t("board.utilityControls")}>
        <button aria-label={t("nav.openSettings")} onClick={() => onUtilityOpen("settings")} title={t("dialog.settings")} type="button">
          <Settings size={26} />
        </button>
        <button aria-label={t("nav.openRulebook")} onClick={() => onUtilityOpen("rulebook")} title={t("dialog.rulebook")} type="button">
          <BookOpen size={26} />
        </button>
        <button aria-label={t("nav.toggleFullscreen")} onClick={onFullscreen} title={t("nav.toggleFullscreen")} type="button">
          <Maximize size={26} />
        </button>
        <button aria-label={t("nav.openInfo")} onClick={() => onUtilityOpen("info")} title={t("dialog.info")} type="button">
          <Info size={26} />
        </button>
      </div>
      <div className="island">
        <svg
          aria-label={t("board.map")}
          className="board-svg"
          role="group"
          viewBox={`0 0 ${boardViewBox.width} ${boardViewBox.height}`}
        >
          <ellipse className="shoreline outer" cx="450" cy="310" rx="408" ry="272" />
          <ellipse className="shoreline inner" cx="450" cy="310" rx="380" ry="250" />
          <g className="port-layer" aria-label={t("board.ports")}>
            {state.game.ports.map((port) => {
              const position = portProjection(state.game.board, port);
              const label =
                port.kind === "generic"
                  ? "3:1"
                  : `2:1 ${t(`resource.${port.resource ?? "wood"}`)}`;
              return (
                <g
                  aria-label={t("board.portLabel", { label })}
                  className="port-marker"
                  data-port-id={port.id}
                  key={port.id}
                >
                  <line
                    className="port-connector"
                    x1={position.label.x}
                    x2={position.from.x}
                    y1={position.label.y}
                    y2={position.from.y}
                  />
                  <line
                    className="port-connector"
                    x1={position.label.x}
                    x2={position.to.x}
                    y1={position.label.y}
                    y2={position.to.y}
                  />
                  <circle cx={position.label.x} cy={position.label.y} r="25" />
                  <text x={position.label.x} y={position.label.y + 4}>{label}</text>
                </g>
              );
            })}
          </g>
          <g className="hex-layer">
            {state.game.board.map((hex) => {
              const center = hexCenterPoint(hex);
              const polygonPoints = hexPolygonPoints(hex);
              const canTargetHex = canPlaceRobber && hex.id !== state.game.robberHexId;

              return (
                <g
                  aria-label={t(`terrain.${hex.terrain}`)}
                  className="hex-tile"
                  key={hex.id}
                  onClick={
                    canTargetHex
                      ? () =>
                          dispatch({
                            type: "PLACE_ROBBER",
                            playerId: state.game.activePlayerId,
                            hexId: hex.id
                          })
                      : undefined
                  }
                  onKeyDown={(event) => {
                    if (canTargetHex && (event.key === "Enter" || event.key === " ")) {
                      event.preventDefault();
                      dispatch({
                        type: "PLACE_ROBBER",
                        playerId: state.game.activePlayerId,
                        hexId: hex.id
                      });
                    }
                  }}
                  role={canTargetHex ? "button" : undefined}
                  tabIndex={canTargetHex ? 0 : -1}
                >
                  <polygon
                    className={`board-hex terrain-${hex.terrain}`}
                    points={pointsAttribute(polygonPoints)}
                  />
                  <text className="terrain-icon" x={center.x} y={center.y - 30}>
                    {terrainMarks[hex.terrain]}
                  </text>
                  <text className="hex-resource" x={center.x} y={center.y - 4}>
                    {t(`terrain.${hex.terrain}`)}
                  </text>
                  {hex.diceNumber ? (
                    <g className={`dice-chip ${hex.diceNumber === 6 || hex.diceNumber === 8 ? "hot" : ""}`}>
                      <rect height="46" rx="9" width="50" x={center.x - 25} y={center.y + 8} />
                      <text className="dice-number" x={center.x} y={center.y + 40}>
                        {hex.diceNumber}
                      </text>
                      <g className="dice-pips" aria-hidden="true">
                        {Array.from({ length: dicePipCounts[hex.diceNumber] ?? 0 }).map((_, index, pips) => {
                          const startX = center.x - ((pips.length - 1) * 5) / 2;
                          return <circle cx={startX + index * 5} cy={center.y + 48} key={index} r="2" />;
                        })}
                      </g>
                    </g>
                  ) : (
                    <text className="robber-label" x={center.x} y={center.y + 38}>
                      {t("board.robber")}
                    </text>
                  )}
                  {state.game.robberHexId === hex.id ? (
                    <rect className="robber-piece" height="44" rx="14" width="28" x={center.x + 18} y={center.y + 8} />
                  ) : null}
                </g>
              );
            })}
          </g>
          <g className="road-layer" aria-hidden="true">
            {state.game.roads.map((road) => {
              const edge = state.game.edges.find((candidate) => candidate.id === road.edgeId);
              if (!edge) {
                return null;
              }
              return (
                <RoadMarker
                  edge={edge}
                  hexes={state.game.board}
                  key={road.id}
                  ownerColor={playerColorById.get(road.ownerId)}
                />
              );
            })}
          </g>
          <g className="building-layer" aria-hidden="true">
            {state.game.buildings.map((building) => {
              const position = buildingPosition(state.game.board, building);
              const owner = state.game.players.find((player) => player.id === building.ownerId);
              const title = `${owner?.name ?? building.ownerId} ${t(`action.${building.kind}`)}`;
              return building.kind === "city" ? (
                <rect
                  className="building-marker city"
                  height="27"
                  key={building.id}
                  rx="5"
                  stroke={owner?.color}
                  width="34"
                  x={position.x - 17}
                  y={position.y - 13.5}
                >
                  <title>{title}</title>
                </rect>
              ) : (
                <rect
                  className="building-marker settlement"
                  height="24"
                  key={building.id}
                  rx="4"
                  stroke={owner?.color}
                  width="24"
                  x={position.x - 12}
                  y={position.y - 12}
                >
                  <title>{title}</title>
                </rect>
              );
            })}
          </g>
          <RoadBuildingTargets
            game={state.game}
            edgeIds={state.legality.freeRoadEdgeIds}
            dispatch={dispatch}
          />
          <BoardActionTargets
            state={state}
            dispatch={dispatch}
            interactionMode={interactionMode}
            onTargetSelected={onTargetSelected}
          />
        </svg>
      </div>
    </section>
  );
}

function PlayerPanel({ state }: { state: GameTableView }) {
  const { locale, t } = useI18n();
  return (
    <section className="players-panel" aria-label={t("board.players")}>
      {state.game.players.map((player) => {
        const active = player.id === state.game.activePlayerId;
        return (
          <article className={`player-card ${active ? "active" : ""}`} key={player.id}>
            <div className="player-main">
              <span className="avatar" style={{ borderColor: player.color }}>
                {player.name.slice(0, 1)}
              </span>
              <div>
                <strong>{player.name}</strong>
                <span>{active ? t("board.takingTurn") : t("board.waiting")}</span>
              </div>
            </div>
            <div className="player-metrics">
              <span>
                <Trophy size={15} /> {player.visibleScore}
              </span>
              <span>
                <Coins size={15} /> {player.guildTokens}
              </span>
              <span>
                <Gift size={15} /> {player.vouchers}
              </span>
              <span>
                <Landmark size={15} /> {player.prizeCards}
              </span>
            </div>
            <div className="resource-strip compact">
              {player.resources ? resources.map((resource) => (
                <span className={`resource-token ${resource}`} key={resource}>
                  {`${locale === "en" ? resourceShortLabels[resource] : t(`resource.${resource}`)} ${player.resources?.[resource] ?? 0}`}
                </span>
              )) : null}
            </div>
          </article>
        );
      })}
    </section>
  );
}

function RightRail({ state }: { state: GameTableView }) {
  const { locale, t } = useI18n();
  return (
    <aside className="right-rail">
      <section className="log-panel">
        <h2>
          <ScrollText size={18} /> {t("log.title")}
        </h2>
        <div aria-live="polite" className="log-list" role="log" tabIndex={0}>
          {state.game.log.map((entry) => (
            <p key={entry.id}>{formatGameLogEntry(entry, locale)}</p>
          ))}
        </div>
      </section>
      <section className="activity-shell" aria-label={t("activity.title")}>
        <strong>{t("activity.title")}</strong>
        <span>{state.game.phase === "gameOver" ? t("activity.complete") : t("activity.events", { count: state.game.log.length })}</span>
      </section>
      <section className="bank-panel">
        <Warehouse size={28} />
        <div className="resource-strip">
          {resources.map((resource) => (
            <span className={`resource-token ${resource}`} key={resource}>
              {t(`resource.${resource}`)} {state.game.bank.resources[resource]}
            </span>
          ))}
        </div>
      </section>
      <PlayerPanel state={state} />
    </aside>
  );
}

function StatsPanel({
  state,
  dispatch
}: {
  state: GameTableView;
  dispatch: GameTableDispatch;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<StatsMode>("player");
  const localizedResourceLabels = useMemo(
    () => Object.fromEntries(resources.map((resource) => [resource, t(`resource.${resource}`)])) as Record<(typeof resources)[number], string>,
    [t]
  );
  const playerRows = state.statistics.playerRows[state.selectedPlayerId] ?? [];
  const diceIncome = state.statistics.diceIncome[state.selectedDiceTotal];
  const matrix = state.statistics.matrix;

  return (
    <section className="tool-panel stats-panel">
      <div className="panel-header">
        <h2>{t("stats.title")}</h2>
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
              dispatch({ type: "SELECT_PLAYER", playerId: event.currentTarget.value })
            }
          >
            {state.game.players.map((player) => (
              <option key={player.id} value={player.id}>
                {player.name}
              </option>
            ))}
          </select>
          <div className="table-scroll">
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
                    <td>{formatResourceMap(row.resources, localizedResourceLabels) || "-"}</td>
                    <td>{formatResourceMap(row.expected, localizedResourceLabels) || "-"}</td>
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
              dispatch({ type: "SELECT_DICE_TOTAL", diceTotal: Number(event.currentTarget.value) })
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
                <span>{formatResourceMap(diceIncome?.players[player.id], localizedResourceLabels) || t("stats.noGain")}</span>
              </p>
            ))}
          </div>
        </>
      ) : null}
      {mode === "matrix" ? (
        <div className="table-scroll matrix">
          <table>
            <thead>
              <tr>
                <th>{t("stats.player")}</th>
                {resources.map((resource) => (
                  <th key={resource}>{localizedResourceLabels[resource]}</th>
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

export function GameTable({
  view: state,
  dispatch: dispatchBase
}: {
  view: GameTableView;
  dispatch: GameTableDispatch;
}) {
  const { locale } = useI18n();
  const [browserNotice, setBrowserNotice] = useState<string | null>(null);
  const [interactionMode, setInteractionMode] = useState<BoardInteractionMode>(null);
  const [utilityPanel, setUtilityPanel] = useState<UtilityPanel>(null);
  const boardInteractionMode: BoardInteractionMode =
    state.game.phase === "setup"
      ? { kind: state.game.setup?.stage === "road" ? "setupRoad" : "setupSettlement" }
      : interactionMode;

  useEffect(() => {
    if (!interactionMode) {
      return;
    }
    const cancelSelection = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setInteractionMode(null);
      }
    };
    window.addEventListener("keydown", cancelSelection);
    return () => window.removeEventListener("keydown", cancelSelection);
  }, [interactionMode]);

  function dispatch(command: GameTableCommand) {
    setInteractionMode(null);
    dispatchBase(command);
    setBrowserNotice(null);
  }

  function toggleFullscreen() {
    if (typeof document === "undefined") {
      return;
    }

    if (document.fullscreenElement) {
      if (!document.exitFullscreen) {
        setBrowserNotice("Fullscreen exit is not available in this browser.");
        return;
      }

      void document.exitFullscreen().catch(() => setBrowserNotice("Fullscreen exit was blocked by the browser."));
      return;
    }

    if (!document.documentElement.requestFullscreen) {
      setBrowserNotice("Fullscreen is not available in this browser.");
      return;
    }

    void document.documentElement.requestFullscreen().catch(() => setBrowserNotice("Fullscreen is not available in this browser."));
  }

  return (
    <main className="game-shell">
      <BoardView
        state={state}
        dispatch={dispatch}
        interactionMode={boardInteractionMode}
        onTargetSelected={() => setInteractionMode(null)}
        onUtilityOpen={setUtilityPanel}
        onFullscreen={toggleFullscreen}
      />
      <RightRail state={state} />
      <div className="bottom-dock">
        <StatsPanel state={state} dispatch={dispatch} />
        <TradeHubPanel state={state} dispatch={dispatch} />
      </div>
      <TurnFlowPanel game={state.game} dispatch={dispatch} />
      <ActionDock
        state={state}
        dispatch={dispatch}
        interactionMode={interactionMode}
        onInteractionModeChange={setInteractionMode}
      />
      <UtilityDialog
        panel={utilityPanel}
        state={state}
        onClose={() => setUtilityPanel(null)}
        onNewGame={() => {
          dispatch({ type: "START_NEW_GAME" });
          setUtilityPanel(null);
        }}
      />
      {state.notice || browserNotice ? (
        <div aria-live="polite" className="toast" role="status">
          {translateRuleText(locale, state.notice ?? browserNotice)}
        </div>
      ) : null}
    </main>
  );
}
