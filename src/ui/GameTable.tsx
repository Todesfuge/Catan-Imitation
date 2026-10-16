import React, { useEffect, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Coins,
  Gift,
  Maximize,
  ScrollText,
  Settings,
  Trophy,
  Warehouse
} from "lucide-react";
import { resources } from "../domain/types";
import { RobberIcon } from "./RobberIcon";
import type { MapSeed } from "../domain/mapSeed";
import type { MapRestartMode } from "../domain/match/types";
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
import { BoardViewport } from "./BoardViewport";
import { HandSummary } from "./HandSummary";
import { UtilityDialog, type UtilityPanel } from "./UtilityDialog";
import { ResourceBundle, ResourceCardCount, ResourceIcon } from "./ResourceBadge";
import { translateRuleText, useI18n } from "./i18n";

export type GameTableResource = (typeof resources)[number];
export type GameTableResourceMap = Readonly<Record<GameTableResource, number>>;

export interface GameTablePrivateControl {
  readonly controlId: string;
  readonly displaySlot: number;
  readonly displayName: string;
  readonly isActive: boolean;
  readonly resources: GameTableResourceMap;
  readonly developmentCards: readonly {
    readonly id: string;
    readonly kind: "knight" | "victoryPoint" | "roadBuilding" | "yearOfPlenty" | "monopoly";
    readonly purchasedTurn: number;
    readonly revealed: boolean;
  }[];
  readonly decision?:
    | { readonly kind: "discard"; readonly count: number }
    | { readonly kind: "robber" }
    | { readonly kind: "development" };
  readonly guildTokens: number;
  readonly gatheringRemainingAllowance: number;
  readonly gatheringRedemptionEnabled: boolean;
  readonly gatheringBankStock: GameTableResourceMap;
  readonly tradeResponse?: { readonly kind: "accept" | "cancel"; readonly enabled: boolean; readonly reason?: string };
}

export interface GameTablePlayerView {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly visibleScore: number;
  readonly resourceCardCount: number;
  readonly developmentCardCount: number;
  readonly guildTokens: number;
  readonly vouchers: number;
  readonly prizeCards: number;
  readonly knightsPlayed: number;
}

export interface GameTableGameView {
  readonly mapSeed: MapSeed;
  readonly phase: "setup" | "playing" | "gameOver";
  readonly players: readonly GameTablePlayerView[];
  readonly activePlayerId: string;
  readonly turn: number;
  readonly round: number;
  readonly turnState: {
    readonly phase: "awaitingRoll" | "awaitingDiscards" | "awaitingRobberPlacement" | "awaitingRobberVictim" | "awaitingDevelopmentEffect" | "action";
    readonly awaitedPlayerIds: readonly string[];
    readonly pendingRobber?: {
      readonly eligibleVictimIds: readonly string[];
    };
    readonly pendingDevelopmentEffect?: {
      readonly kind: "roadBuilding" | "yearOfPlenty" | "monopoly";
      readonly remainingRoads?: number;
      readonly remainingPicks?: number;
    };
  };
  readonly targetScore: number;
  readonly board: readonly GameTableBoardHex[];
  readonly edges: readonly GameTableBoardEdge[];
  readonly ports: readonly GameTablePort[];
  readonly buildings: readonly GameTableBuilding[];
  readonly roads: readonly GameTableRoad[];
  readonly robberHexId: string;
  readonly bank: { readonly resources: GameTableResourceMap };
  readonly log: readonly GameTableLogEntry[];
  readonly developmentDeckCount: number;
  readonly setup?: {
    readonly stage: "settlement" | "road";
  };
  readonly winnerId?: string;
  readonly longestRoadOwnerId?: string;
  readonly largestArmyOwnerId?: string;
}

export interface GameTableBoardHex {
  readonly id: string;
  readonly terrain: "forest" | "hill" | "pasture" | "field" | "mountain" | "desert";
  readonly resource: GameTableResource | null;
  readonly diceNumber: number | null;
  readonly vertexIds: readonly string[];
  readonly q: number;
  readonly r: number;
}
export interface GameTableBoardEdge { readonly id: string; readonly vertexIds: readonly [string, string] }
export interface GameTablePort { readonly id: string; readonly kind: "generic" | "resource"; readonly resource?: GameTableResource; readonly vertexIds: readonly string[] }
export interface GameTableBuilding { readonly id: string; readonly ownerId: string; readonly vertexId: string; readonly kind: "settlement" | "city" }
export interface GameTableRoad { readonly id: string; readonly ownerId: string; readonly edgeId: string }
export interface GameTableLogEntry {
  readonly id: string;
  readonly fallbackText: string;
  readonly messageKey?: string;
  readonly params?: {
    readonly playerName?: string;
    readonly victimName?: string;
    readonly proposerName?: string;
    readonly acceptingPlayerName?: string;
    readonly fromName?: string;
    readonly toName?: string;
    readonly total?: number;
    readonly eventCount?: number;
    readonly hexId?: string;
    readonly round?: number;
    readonly amount?: number;
  };
}

export interface GameTableAvailability { readonly enabled: boolean; readonly reason?: string; readonly targets: readonly string[] }
export interface GameTableActions {
  readonly roll: GameTableAvailability;
  readonly endTurn: GameTableAvailability;
  readonly road: GameTableAvailability & { readonly cost: GameTableResourceMap };
  readonly settlement: GameTableAvailability & { readonly cost: GameTableResourceMap };
  readonly city: GameTableAvailability & { readonly cost: GameTableResourceMap };
  readonly buyDevelopmentCard: GameTableAvailability & { readonly cost: GameTableResourceMap };
  readonly developmentCards: readonly { readonly cardId?: string; readonly count: number; readonly enabled: boolean; readonly kind: "knight" | "roadBuilding" | "yearOfPlenty" | "monopoly"; readonly reason?: string }[];
  readonly maritime: { readonly enabled: boolean; readonly reason?: string; readonly ratios: Readonly<Record<GameTableResource, number>>; readonly trades: readonly { readonly give: GameTableResource; readonly ratio: number; readonly receives: readonly GameTableResource[] }[] };
  readonly commerce: {
    readonly tradeSlots: readonly (GameTableAvailability & { readonly id: string })[];
    readonly transfer: GameTableAvailability & { readonly maxAmount: number; readonly recipientIds: readonly string[] };
    readonly startGathering: GameTableAvailability;
    readonly openAuction: GameTableAvailability;
    readonly redeemPrize: GameTableAvailability;
    readonly gatheringPlayers: readonly { readonly id: string; readonly tokens: number; readonly remainingAllowance: number; readonly bankStock: GameTableResourceMap }[];
  };
}

export interface GameTableView {
  readonly game: GameTableGameView;
  readonly guild: {
    readonly tradeSlots: readonly { readonly id: string; readonly requires: Partial<GameTableResourceMap>; readonly tokenReward: number }[];
    readonly gathering: {
      readonly phase: "idle" | "redemption" | "auction" | "complete";
      readonly auctionRound: number;
      readonly cooldownRemaining: number;
      readonly lastAuctionResult?: { readonly winnerName: string; readonly round: number; readonly winningBid: number; readonly outcome: { readonly kind: "resources" | "voucher" | "developmentCard"; readonly resourceCardCount?: number } };
    };
  };
  readonly controlledPlayers: readonly GameTablePrivateControl[];
  readonly lastDice: { readonly first: number; readonly second: number; readonly total: number } | null;
  readonly pendingPlayerTrade?: { readonly proposerId: string; readonly offered: GameTableResourceMap; readonly requested: GameTableResourceMap; readonly offeredTokens?: number; readonly requestedTokens?: number };
  readonly selectedDiceTotal: number;
  readonly selectedPlayerId: string;
  readonly notice: string | null;
  readonly statistics?: { readonly playerRows: Readonly<Record<string, readonly { readonly diceTotal: number; readonly probability: number; readonly resources: GameTableResourceMap; readonly expected: GameTableResourceMap }[]>>; readonly diceIncome: Readonly<Record<number, { readonly players: Readonly<Record<string, GameTableResourceMap>> }>>; readonly matrix: { readonly totals: Readonly<Record<string, GameTableResourceMap>> } };
  readonly legality: { readonly actions: GameTableActions; readonly setupControlId?: string; readonly setupRoadEdgeIds: readonly string[]; readonly setupSettlementVertexIds: readonly string[]; readonly freeRoadEdgeIds: readonly string[] };
  readonly decisionPolicy: {
    readonly discard: GameTableAvailability & { readonly exactCount: number; readonly maxByResource: GameTableResourceMap };
    readonly robberHex: GameTableAvailability;
    readonly robberVictim: GameTableAvailability;
    readonly freeRoad: GameTableAvailability & { readonly remainingRoads: number };
    readonly yearOfPlenty: GameTableAvailability & { readonly remainingPicks: number };
    readonly monopoly: GameTableAvailability;
  };
  readonly tradePolicy: {
    readonly publishEnabled: boolean;
    readonly publishReason?: string;
    readonly maxOfferResources: GameTableResourceMap;
  };
  readonly sealedAuction?: {
    readonly viewerSeatId: string;
    readonly seats: readonly { readonly seatId: string; readonly nickname: string; readonly submitted: boolean }[];
    readonly ownPendingBid?: number;
    readonly enabled: boolean;
    readonly maxAmount: number;
    readonly submitted: boolean;
    readonly reason?: string;
  };
  readonly restart?: {
    readonly enabled: boolean;
    readonly requiresConfirmation: boolean;
  };
}

export type GameTableIntent =
  | { readonly type: "ui.selectDiceTotal"; readonly diceTotal: number }
  | { readonly type: "ui.selectPlayer"; readonly playerId: string }
  | { readonly type: "game.restart"; readonly mode: MapRestartMode }
  | { readonly type: "turn.roll" }
  | { readonly type: "turn.end" }
  | { readonly type: "build.road"; readonly edgeId: string }
  | { readonly type: "build.settlement"; readonly vertexId: string }
  | { readonly type: "build.city"; readonly buildingId: string }
  | { readonly type: "setup.settlement"; readonly controlId: string; readonly vertexId: string }
  | { readonly type: "setup.road"; readonly controlId: string; readonly edgeId: string }
  | { readonly type: "robber.place"; readonly hexId: string }
  | { readonly type: "robber.steal"; readonly victimId: string }
  | { readonly type: "development.buy" }
  | { readonly type: "development.play"; readonly cardId: string }
  | { readonly type: "development.chooseResource"; readonly choice: "yearOfPlenty" | "monopoly"; readonly resource: GameTableResource }
  | { readonly type: "development.placeRoad"; readonly edgeId: string }
  | { readonly type: "trade.maritime"; readonly give: GameTableResource; readonly receive: GameTableResource }
  | { readonly type: "trade.publish"; readonly offered: GameTableResourceMap; readonly requested: GameTableResourceMap; readonly offeredTokens?: number; readonly requestedTokens?: number }
  | { readonly type: "trade.respond"; readonly controlId: string; readonly response: "accept" | "cancel" }
  | { readonly type: "commerce.completeSlot"; readonly slotId: string }
  | { readonly type: "commerce.startGathering" }
  | { readonly type: "commerce.redeem"; readonly controlId: string; readonly resources: Partial<GameTableResourceMap> }
  | { readonly type: "commerce.openAuction" }
  | { readonly type: "commerce.redeemPrize" }
  | { readonly type: "auction.submitBid"; readonly controlId: string; readonly bid: number }
  | { readonly type: "decision.discard"; readonly controlId: string; readonly resources: GameTableResourceMap };

export type GameTableDispatch = (intent: GameTableIntent) => void;

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

function buildingPosition(hexes: readonly GameTableBoardHex[], building: GameTableBuilding) {
  return vertexProjection(hexes, building.vertexId);
}

function RoadMarker({
  edge,
  hexes,
  ownerColor
}: {
  edge: GameTableBoardEdge;
  hexes: readonly GameTableBoardHex[];
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
  onFullscreen,
  infoCollapsed,
  onInfoToggle,
  infoToggleDisabled
}: {
  state: GameTableView;
  dispatch: GameTableDispatch;
  interactionMode: BoardInteractionMode;
  onTargetSelected: () => void;
  onUtilityOpen: (panel: Exclude<UtilityPanel, null>) => void;
  onFullscreen: () => void;
  infoCollapsed: boolean;
  onInfoToggle: () => void;
  infoToggleDisabled: boolean;
}) {
  const { t } = useI18n();
  const canPlaceRobber = state.game.turnState.phase === "awaitingRobberPlacement" && state.decisionPolicy.robberHex.enabled;
  const playerColorById = new Map(state.game.players.map((player) => [player.id, player.color]));

  return (
    <section className="board-zone" aria-label={t("board.label")}>
      <div className="board-toolbar">
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
        </div>
        <button
          aria-haspopup="dialog"
          aria-label={t("nav.openRecords")}
          className="records-toggle"
          onClick={() => onUtilityOpen("records")}
          type="button"
        >
          <ScrollText size={20} />
          <span className="records-label">{t("dialog.records")}</span>
          <span className="records-label-short">{t("board.recordsShort")}</span>
        </button>
      </div>
      <BoardViewport focusBoard={infoCollapsed}>
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
              const resource = port.kind === "resource" ? port.resource : undefined;
              const ratio = resource ? "2:1" : "3:1";
              const label = resource ? `${ratio} ${t(`resource.${resource}`)}` : ratio;
              const accessibleLabel = t("board.portLabel", { label });
              return (
                <g
                  aria-label={accessibleLabel}
                  className="port-marker"
                  data-port-kind={port.kind}
                  data-port-id={port.id}
                  data-port-resource={resource}
                  key={port.id}
                >
                  <title>{accessibleLabel}</title>
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
                  <text x={position.label.x - (resource ? 5 : 0)} y={position.label.y + 4}>{ratio}</text>
                  {resource ? (
                    <foreignObject
                      className="port-resource-icon"
                      height="18"
                      width="18"
                      x={position.label.x + 4}
                      y={position.label.y - 9}
                    >
                      <ResourceIcon decorative resource={resource} size={15} />
                    </foreignObject>
                  ) : null}
                </g>
              );
            })}
          </g>
          <g className="hex-layer">
            {state.game.board.map((hex) => {
              const center = hexCenterPoint(hex);
              const polygonPoints = hexPolygonPoints(hex);
              const hasRobber = state.game.robberHexId === hex.id;
              const resourceIconSize = hasRobber ? 28 : 32;
              const canTargetHex = canPlaceRobber && state.decisionPolicy.robberHex.targets.includes(hex.id);
              const terrainLabel = t(`terrain.${hex.terrain}`);
              const accessibleLabel = hex.resource
                ? `${terrainLabel}; ${t(`resource.${hex.resource}`)}`
                : terrainLabel;

              return (
                <g
                  aria-label={accessibleLabel}
                  className="hex-tile"
                  data-robber-target={canTargetHex ? hex.id : undefined}
                  key={hex.id}
                  onClick={
                    canTargetHex
                      ? () =>
                          dispatch({ type: "robber.place", hexId: hex.id })
                      : undefined
                  }
                  onKeyDown={(event) => {
                    if (canTargetHex && (event.key === "Enter" || event.key === " ")) {
                      event.preventDefault();
                      dispatch({ type: "robber.place", hexId: hex.id });
                    }
                  }}
                  role={canTargetHex ? "button" : undefined}
                  tabIndex={canTargetHex ? 0 : -1}
                >
                  <title>{accessibleLabel}</title>
                  <polygon
                    className={`board-hex terrain-${hex.terrain}`}
                    points={pointsAttribute(polygonPoints)}
                  />
                  {hex.resource ? (
                    <foreignObject
                      className="board-resource-icon"
                      data-board-resource={hex.resource}
                      height={resourceIconSize}
                      width={resourceIconSize}
                      x={center.x - (hasRobber ? 16 : 0) - resourceIconSize / 2}
                      y={center.y - 20 - resourceIconSize / 2}
                    >
                      <ResourceIcon decorative resource={hex.resource} size={resourceIconSize - 6} />
                    </foreignObject>
                  ) : null}
                  {hex.diceNumber ? (
                    <g className={`dice-chip ${hex.diceNumber === 6 || hex.diceNumber === 8 ? "hot" : ""}`}>
                      <rect height="40" rx="9" width="50" x={center.x - 25} y={center.y - 2} />
                      <text className="dice-number" x={center.x} y={center.y + 27}>
                        {hex.diceNumber}
                      </text>
                      <g className="dice-pips" aria-hidden="true">
                        {Array.from({ length: dicePipCounts[hex.diceNumber] ?? 0 }).map((_, index, pips) => {
                          const startX = center.x - ((pips.length - 1) * 5) / 2;
                          return <circle cx={startX + index * 5} cy={center.y + 34} key={index} r="2" />;
                        })}
                      </g>
                    </g>
                  ) : null}
                  {hasRobber ? (
                    <RobberIcon
                      size={hex.resource ? 28 : 46}
                      x={center.x + (hex.resource ? 2 : -23)}
                      y={center.y - (hex.resource ? 34 : 23)}
                    />
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
            edgeIds={state.decisionPolicy.freeRoad.targets}
            dispatch={dispatch}
          />
          <BoardActionTargets
            state={state}
            dispatch={dispatch}
            interactionMode={interactionMode}
            onTargetSelected={onTargetSelected}
          />
        </svg>
      </BoardViewport>
      <button
        aria-controls="game-info"
        aria-expanded={!infoCollapsed}
        className="game-info-toggle"
        disabled={infoToggleDisabled}
        onClick={onInfoToggle}
        type="button"
      >
        {infoCollapsed ? <ChevronDown aria-hidden="true" size={20} /> : <ChevronUp aria-hidden="true" size={20} />}
        {t(infoCollapsed ? "board.showInfo" : "board.hideInfo")}
      </button>
    </section>
  );
}

function PlayerPanel({ state }: { state: GameTableView }) {
  const { t } = useI18n();
  return (
    <section className="players-panel" aria-label={t("board.players")}>
      {state.game.players.map((player, displaySlot) => {
        const active = player.id === state.game.activePlayerId;
        const privatePresentation = state.controlledPlayers.find(
          (control) => control.displaySlot === displaySlot
        );
        const scoreLabel = t(state.game.phase === "gameOver" ? "board.finalScore" : "board.publicScore", {
          count: player.visibleScore
        });
        return (
          <article className={`player-card ${active ? "active" : ""}`} key={player.id}>
            <div className="player-main">
              <span className={`avatar avatar-slot-${displaySlot + 1}`}>
                {player.name.slice(0, 1)}
              </span>
              <div>
                <strong>{player.name}</strong>
                <span>{active ? t("board.takingTurn") : t("board.waiting")}</span>
              </div>
            </div>
            <div className="player-metrics">
              <span aria-label={scoreLabel} title={scoreLabel}>
                <Trophy aria-hidden="true" size={15} /> {player.visibleScore}
              </span>
              <span>
                <Coins size={15} /> {player.guildTokens}
              </span>
              <span>
                <Gift size={15} /> {player.vouchers}
              </span>
              <span aria-label={t("online.developmentCardCount", { count: player.developmentCardCount })}
                title={t("online.developmentCardCount", { count: player.developmentCardCount })}>
                <ScrollText aria-hidden="true" size={15} /> {player.developmentCardCount}
              </span>
            </div>
            <div className="resource-strip compact player-resource-row" data-resource-inventory={privatePresentation ? "private" : undefined}>
              <ResourceCardCount quantity={player.resourceCardCount} />
              {privatePresentation ? (
                <ResourceBundle
                  className="player-resource-inventory"
                  compact
                  includeZero
                  resources={privatePresentation.resources}
                />
              ) : null}
            </div>
          </article>
        );
      })}
    </section>
  );
}

function RightRail({ state }: { state: GameTableView }) {
  return (
    <aside className="right-rail">
      <section className="bank-panel">
        <Warehouse size={28} />
        <div className="resource-strip" data-resource-inventory="bank">
          <ResourceBundle
            className="bank-resource-inventory"
            includeZero
            resources={state.game.bank.resources}
          />
        </div>
      </section>
      <PlayerPanel state={state} />
    </aside>
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
  const [infoCollapsed, setInfoCollapsed] = useState(false);
  const needsResourceChoice = state.game.turnState.phase === "awaitingDevelopmentEffect" &&
    state.game.turnState.pendingDevelopmentEffect?.kind !== "roadBuilding";
  const collapseInfo = infoCollapsed && !needsResourceChoice;
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

  function dispatch(intent: GameTableIntent) {
    setInteractionMode(null);
    dispatchBase(intent);
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
    <main className={`game-shell${collapseInfo ? " game-shell--info-collapsed" : ""}`}>
      <BoardView
        state={state}
        dispatch={dispatch}
        interactionMode={boardInteractionMode}
        onTargetSelected={() => setInteractionMode(null)}
        onUtilityOpen={setUtilityPanel}
        onFullscreen={toggleFullscreen}
        infoCollapsed={collapseInfo}
        infoToggleDisabled={needsResourceChoice}
        onInfoToggle={() => setInfoCollapsed((current) => !current)}
      />
      <TurnFlowPanel game={state.game} gameControls={state.controlledPlayers} decisionPolicy={state.decisionPolicy} dispatch={dispatch} />
      <div className="game-info" id="game-info">
        <RightRail state={state} />
        <HandSummary state={state} />
        <ActionDock
          state={state}
          dispatch={dispatch}
          interactionMode={interactionMode}
          onInteractionModeChange={setInteractionMode}
          onTradeOpen={() => setUtilityPanel("trade")}
        />
      </div>
      <UtilityDialog
        panel={utilityPanel}
        state={state}
        dispatch={dispatch}
        onClose={() => setUtilityPanel(null)}
        onRestart={(mode) => {
          dispatch({ type: "game.restart", mode });
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
