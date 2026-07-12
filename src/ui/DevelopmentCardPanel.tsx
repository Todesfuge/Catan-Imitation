import React from "react";
import { resources } from "../domain/types";
import { edgeProjection } from "./boardGeometry";
import type { GameTableDispatch, GameTableGameView, GameTableResource, GameTableView } from "./GameTable";
import { translateRuleText, useI18n } from "./i18n";

export function DevelopmentCardPanel({
  state,
  dispatch
}: {
  state: GameTableView;
  dispatch: GameTableDispatch;
}) {
  const { locale, t } = useI18n();
  const game = state.game;
  const effect = game.turnState.pendingDevelopmentEffect;
  if (game.turnState.phase === "awaitingDevelopmentEffect" && effect) {
    if (effect.kind === "roadBuilding") {
      return (
        <section className="turn-flow-panel development-effect-panel" data-development-effect="roadBuilding">
          <strong>{t("development.chooseRoad")}</strong>
          <span>{t("development.roadsRemaining", { count: effect.remainingRoads ?? 0 })}</span>
        </section>
      );
    }

    const isPlenty = effect.kind === "yearOfPlenty";
    const resourcePolicy = isPlenty ? state.decisionPolicy.yearOfPlenty : state.decisionPolicy.monopoly;
    return (
      <section
        className="turn-flow-panel development-effect-panel"
        data-development-effect={effect.kind}
      >
        <strong>
          {isPlenty
            ? t(effect.remainingPicks === 1 ? "development.chooseResource" : "development.chooseResources", { count: effect.remainingPicks ?? 0 })
            : t("development.chooseMonopoly")}
        </strong>
        <div className="development-resource-buttons">
          {(resourcePolicy.targets as readonly GameTableResource[]).map((resource) => (
            <button
              data-resource-choice={resource}
              disabled={!resourcePolicy.enabled}
              key={resource}
              onClick={() =>
                dispatch({
                  type: "development.chooseResource",
                  choice: isPlenty ? "yearOfPlenty" : "monopoly",
                  resource
                })
              }
              type="button"
            >
              {t(`resource.${resource}`)}
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
  const availability = state.legality.actions;
  const privateControl = state.controlledPlayers.find((control) => control.isActive);
  const victoryPointCount = (privateControl?.developmentCards ?? []).filter(
    (card) => card.kind === "victoryPoint"
  ).length;

  return (
    <div className="development-card-controls" data-development-cards="hand">
      {availability.developmentCards.map((cardAvailability) => {
        if (cardAvailability.count === 0) {
          return null;
        }
        return (
          <button
            aria-describedby={`development-${cardAvailability.kind}-unavailable-reason`}
            data-card-kind={cardAvailability.kind}
            disabled={!cardAvailability.enabled}
            key={cardAvailability.kind}
            onClick={() =>
              cardAvailability.cardId &&
              dispatch({
                type: "development.play",
                cardId: cardAvailability.cardId
              })
            }
            title={translateRuleText(locale, cardAvailability.reason)}
            type="button"
          >
            {t(`development.${cardAvailability.kind}`)} ×{cardAvailability.count}
          </button>
        );
      })}
      {victoryPointCount > 0 ? (
        <span className="development-card-victory-points">
          {t("development.victoryPoint")} ×{victoryPointCount}
        </span>
      ) : null}
      <div className="sr-only">
        {availability.developmentCards.map((cardAvailability) => (
          <span
            id={`development-${cardAvailability.kind}-unavailable-reason`}
            key={cardAvailability.kind}
          >
            {translateRuleText(locale, cardAvailability.reason)}
          </span>
        ))}
      </div>
    </div>
  );
}

export function RoadBuildingTargets({
  game,
  edgeIds,
  dispatch
}: {
  game: GameTableGameView;
  edgeIds: readonly string[];
  dispatch: GameTableDispatch;
}) {
  const { t } = useI18n();
  const effect = game.turnState.pendingDevelopmentEffect;
  if (
    game.turnState.phase !== "awaitingDevelopmentEffect" ||
    effect?.kind !== "roadBuilding"
  ) {
    return null;
  }

  const legalEdges = edgeIds.flatMap((edgeId) => {
    const edge = game.edges.find((candidate) => candidate.id === edgeId);
    if (!edge) return [];
    return [{ edgeId, position: edgeProjection(game.board, edge) }];
  });

  return (
    <g className="road-building-target-layer">
      {legalEdges.map(({ edgeId, position }) => {
        const placeRoad = () =>
          dispatch({ type: "development.placeRoad", edgeId });
        return (
          <line
            aria-label={t("development.placeFreeRoad", { edgeId })}
            className="board-action-hit-target road-building-hit-target"
            data-road-building-target={edgeId}
            key={`hit-${edgeId}`}
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
      {legalEdges.map(({ edgeId, position }) => (
        <line
          aria-hidden="true"
          className="road-building-target"
          key={`visible-${edgeId}`}
          onClick={() =>
            dispatch({ type: "development.placeRoad", edgeId })
          }
          x1={position.from.x}
          x2={position.to.x}
          y1={position.from.y}
          y2={position.to.y}
        />
      ))}
    </g>
  );
}
