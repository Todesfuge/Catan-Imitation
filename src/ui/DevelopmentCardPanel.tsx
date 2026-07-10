import React from "react";
import type { GameCommand } from "../app/gameReducer";
import { getLegalRoadEdgeIds } from "../domain/rules/building";
import {
  resources,
  type DevelopmentCardKind,
  type GameState,
  type Resource
} from "../domain/types";
import { edgeProjection } from "./boardGeometry";

const cardLabels: Record<DevelopmentCardKind, string> = {
  knight: "Knight",
  victoryPoint: "Victory Point",
  roadBuilding: "Road Building",
  yearOfPlenty: "Year of Plenty",
  monopoly: "Monopoly"
};

const resourceLabels: Record<Resource, string> = {
  wood: "Wood",
  brick: "Brick",
  wool: "Wool",
  grain: "Grain",
  ore: "Ore"
};

const playableKinds: Exclude<DevelopmentCardKind, "victoryPoint">[] = [
  "knight",
  "roadBuilding",
  "yearOfPlenty",
  "monopoly"
];

export function DevelopmentCardPanel({
  game,
  dispatch
}: {
  game: GameState;
  dispatch: (command: GameCommand) => void;
}) {
  const effect = game.turnState.pendingDevelopmentEffect;
  if (game.turnState.phase === "awaitingDevelopmentEffect" && effect) {
    if (effect.kind === "roadBuilding") {
      return (
        <section className="turn-flow-panel development-effect-panel" data-development-effect="roadBuilding">
          <strong>Choose a highlighted road</strong>
          <span>{effect.remainingRoads} free road{effect.remainingRoads === 1 ? "" : "s"} remaining</span>
        </section>
      );
    }

    const isPlenty = effect.kind === "yearOfPlenty";
    return (
      <section
        className="turn-flow-panel development-effect-panel"
        data-development-effect={effect.kind}
      >
        <strong>
          {isPlenty
            ? `Choose ${effect.remainingPicks} resource${effect.remainingPicks === 1 ? "" : "s"}`
            : "Choose a resource to monopolize"}
        </strong>
        <div className="development-resource-buttons">
          {resources.map((resource) => (
            <button
              data-resource-choice={resource}
              disabled={isPlenty && game.bank.resources[resource] === 0}
              key={resource}
              onClick={() =>
                dispatch({
                  type: isPlenty
                    ? "CHOOSE_YEAR_OF_PLENTY_RESOURCE"
                    : "CHOOSE_MONOPOLY_RESOURCE",
                  playerId: game.activePlayerId,
                  resource
                })
              }
              type="button"
            >
              {resourceLabels[resource]}
              {isPlenty ? ` (${game.bank.resources[resource]})` : ""}
            </button>
          ))}
        </div>
      </section>
    );
  }

  const activePlayer = game.players.find((player) => player.id === game.activePlayerId);
  if (!activePlayer) {
    return null;
  }
  const canStartEffect =
    game.phase === "playing" &&
    (game.turnState.phase === "awaitingRoll" || game.turnState.phase === "action") &&
    !game.turnState.developmentCardPlayed;
  const victoryPointCount = activePlayer.developmentCards.filter(
    (card) => card.kind === "victoryPoint"
  ).length;

  return (
    <div className="development-card-controls" data-development-cards="hand">
      {playableKinds.map((kind) => {
        const cards = activePlayer.developmentCards.filter((card) => card.kind === kind);
        if (cards.length === 0) {
          return null;
        }
        const playableCard = cards.find((card) => card.purchasedTurn < game.turn);
        return (
          <button
            data-card-kind={kind}
            disabled={!canStartEffect || !playableCard}
            key={kind}
            onClick={() =>
              playableCard &&
              dispatch({
                type: "PLAY_DEVELOPMENT_CARD",
                playerId: activePlayer.id,
                cardId: playableCard.id
              })
            }
            type="button"
          >
            {cardLabels[kind]} ×{cards.length}
          </button>
        );
      })}
      {victoryPointCount > 0 ? (
        <span className="development-card-victory-points">
          {cardLabels.victoryPoint} ×{victoryPointCount}
        </span>
      ) : null}
    </div>
  );
}

export function RoadBuildingTargets({
  game,
  dispatch
}: {
  game: GameState;
  dispatch: (command: GameCommand) => void;
}) {
  const effect = game.turnState.pendingDevelopmentEffect;
  if (
    game.turnState.phase !== "awaitingDevelopmentEffect" ||
    effect?.kind !== "roadBuilding"
  ) {
    return null;
  }

  return (
    <g className="road-building-target-layer">
      {getLegalRoadEdgeIds(game, game.activePlayerId).map((edgeId) => {
        const edge = game.edges.find((candidate) => candidate.id === edgeId);
        if (!edge) {
          return null;
        }
        const position = edgeProjection(game.board, edge);
        const placeRoad = () =>
          dispatch({ type: "PLACE_FREE_ROAD", playerId: game.activePlayerId, edgeId });
        return (
          <line
            aria-label={`Place free road ${edgeId}`}
            className="road-building-target"
            data-road-building-target={edgeId}
            key={edgeId}
            onClick={placeRoad}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                placeRoad();
              }
            }}
            role="button"
            tabIndex={0}
            x1={position.from.x}
            x2={position.to.x}
            y1={position.from.y}
            y2={position.to.y}
          />
        );
      })}
    </g>
  );
}
