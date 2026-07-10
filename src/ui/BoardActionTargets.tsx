import React from "react";
import { getActionAvailability } from "../app/actionAvailability";
import type { AppState, GameCommand } from "../app/gameReducer";
import {
  getLegalSetupRoadEdgeIds,
  getLegalSetupSettlementVertexIds
} from "../domain/rules/building";
import type { GameState } from "../domain/types";
import type { BoardInteractionMode } from "./ActionDock";
import { edgeProjection, vertexProjection } from "./boardGeometry";
import { useI18n } from "./i18n";

interface BoardTarget {
  id: string;
  kind: Exclude<NonNullable<BoardInteractionMode>["kind"], "city"> | "city";
  label: string;
  command: GameCommand;
  shape:
    | { kind: "road"; x1: number; x2: number; y1: number; y2: number }
    | { kind: "vertex"; x: number; y: number };
}

function targetForEdge(
  game: GameState,
  edgeId: string,
  kind: BoardTarget["kind"],
  label: string,
  command: GameCommand
): BoardTarget | null {
  const edge = game.edges.find((candidate) => candidate.id === edgeId);
  if (!edge) return null;
  const position = edgeProjection(game.board, edge);
  return {
    id: edgeId,
    kind,
    label,
    command,
    shape: {
      kind: "road",
      x1: position.from.x,
      x2: position.to.x,
      y1: position.from.y,
      y2: position.to.y
    }
  };
}

function targetForVertex(
  game: GameState,
  id: string,
  vertexId: string,
  kind: BoardTarget["kind"],
  label: string,
  command: GameCommand
): BoardTarget {
  const position = vertexProjection(game.board, vertexId);
  return {
    id,
    kind,
    label,
    command,
    shape: { kind: "vertex", x: position.x, y: position.y }
  };
}

function TargetLayer({
  targets,
  activate
}: {
  targets: BoardTarget[];
  activate: (command: GameCommand) => void;
}) {
  const keyboardActivate = (event: React.KeyboardEvent, command: GameCommand) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activate(command);
    }
  };

  return (
    <g className="board-action-target-layer">
      {targets.map((target) =>
        target.shape.kind === "road" ? (
          <line
            aria-label={target.label}
            className="board-action-hit-target"
            data-board-action-target={target.kind}
            key={`hit-${target.kind}-${target.id}`}
            onClick={() => activate(target.command)}
            onKeyDown={(event) => keyboardActivate(event, target.command)}
            role="button"
            tabIndex={0}
            x1={target.shape.x1}
            x2={target.shape.x2}
            y1={target.shape.y1}
            y2={target.shape.y2}
          />
        ) : (
          <circle
            aria-label={target.label}
            className="board-action-hit-target"
            cx={target.shape.x}
            cy={target.shape.y}
            data-board-action-target={target.kind}
            key={`hit-${target.kind}-${target.id}`}
            onClick={() => activate(target.command)}
            onKeyDown={(event) => keyboardActivate(event, target.command)}
            r={14}
            role="button"
            tabIndex={0}
          />
        )
      )}
      {targets.map((target) =>
        target.shape.kind === "road" ? (
          <line
            aria-hidden="true"
            className="board-action-target road-target"
            data-board-visible-target={target.kind}
            key={`visible-${target.kind}-${target.id}`}
            onClick={() => activate(target.command)}
            x1={target.shape.x1}
            x2={target.shape.x2}
            y1={target.shape.y1}
            y2={target.shape.y2}
          />
        ) : (
          <circle
            aria-hidden="true"
            className={`board-action-target ${target.kind}-target`}
            cx={target.shape.x}
            cy={target.shape.y}
            data-board-visible-target={target.kind}
            key={`visible-${target.kind}-${target.id}`}
            onClick={() => activate(target.command)}
            r={14}
          />
        )
      )}
    </g>
  );
}

export function BoardActionTargets({
  state,
  dispatch,
  interactionMode,
  onTargetSelected
}: {
  state: AppState;
  dispatch: (command: GameCommand) => void;
  interactionMode: BoardInteractionMode;
  onTargetSelected?: () => void;
}) {
  const { t } = useI18n();
  if (!interactionMode) return null;
  const game = state.game;
  const activate = (command: GameCommand) => {
    dispatch(command);
    onTargetSelected?.();
  };
  let targets: BoardTarget[] = [];

  if (interactionMode.kind === "setupRoad") {
    targets = getLegalSetupRoadEdgeIds(game, game.activePlayerId).flatMap((edgeId) => {
      const target = targetForEdge(
        game,
        edgeId,
        "setupRoad",
        t("board.placeSetupRoad", { id: edgeId }),
        { type: "PLACE_SETUP_ROAD", playerId: game.activePlayerId, edgeId }
      );
      return target ? [target] : [];
    });
  } else if (interactionMode.kind === "setupSettlement") {
    targets = getLegalSetupSettlementVertexIds(game, game.activePlayerId).map((vertexId) =>
      targetForVertex(
        game,
        vertexId,
        vertexId,
        "setupSettlement",
        t("board.placeSetupSettlement", { id: vertexId }),
        { type: "PLACE_SETUP_SETTLEMENT", playerId: game.activePlayerId, vertexId }
      )
    );
  } else {
    const availability = getActionAvailability(state, game.activePlayerId);
    if (interactionMode.kind === "road") {
      targets = availability.road.targets.flatMap((edgeId) => {
        const target = targetForEdge(
          game,
          edgeId,
          "road",
          t("board.buildRoad", { id: edgeId }),
          { type: "BUILD_ROAD", playerId: game.activePlayerId, edgeId }
        );
        return target ? [target] : [];
      });
    } else if (interactionMode.kind === "settlement") {
      targets = availability.settlement.targets.map((vertexId) =>
        targetForVertex(
          game,
          vertexId,
          vertexId,
          "settlement",
          t("board.buildSettlement", { id: vertexId }),
          { type: "BUILD_SETTLEMENT", playerId: game.activePlayerId, vertexId }
        )
      );
    } else {
      targets = availability.city.targets.flatMap((buildingId) => {
        const building = game.buildings.find((candidate) => candidate.id === buildingId);
        return building
          ? [
              targetForVertex(
                game,
                buildingId,
                building.vertexId,
                "city",
                t("board.upgradeCity", { id: buildingId }),
                { type: "BUILD_CITY", playerId: game.activePlayerId, buildingId }
              )
            ]
          : [];
      });
    }
  }

  return <TargetLayer targets={targets} activate={activate} />;
}
