import React, { useEffect, useState } from "react";
import type { GameCommand } from "../app/gameReducer";
import { emptyResources, resources, type GameState, type ResourceMap } from "../domain/types";

export function TurnFlowPanel({
  game,
  dispatch
}: {
  game: GameState;
  dispatch: (command: GameCommand) => void;
}) {
  const pendingPlayerId = Object.keys(game.turnState.pendingDiscards).find(
    (playerId) => (game.turnState.pendingDiscards[playerId] ?? 0) > 0
  );
  const [discarded, setDiscarded] = useState<ResourceMap>(emptyResources);

  useEffect(() => {
    setDiscarded(emptyResources());
  }, [pendingPlayerId]);

  if (game.turnState.phase === "awaitingDiscards" && pendingPlayerId) {
    const player = game.players.find((candidate) => candidate.id === pendingPlayerId);
    const required = game.turnState.pendingDiscards[pendingPlayerId] ?? 0;
    const selectedTotal = resources.reduce((total, resource) => total + discarded[resource], 0);
    const validSelection =
      selectedTotal === required &&
      resources.every(
        (resource) =>
          Number.isInteger(discarded[resource]) &&
          discarded[resource] >= 0 &&
          discarded[resource] <= (player?.resources[resource] ?? 0)
      );

    return (
      <section className="turn-flow-panel" data-turn-flow="discard">
        <strong>{player?.name ?? pendingPlayerId} must discard {required}</strong>
        <span>{selectedTotal} / {required} selected</span>
        <div className="turn-flow-resources">
          {resources.map((resource) => (
            <label key={resource}>
              {resource}
              <input
                aria-label={`${player?.name ?? pendingPlayerId} ${resource} discard`}
                max={player?.resources[resource] ?? 0}
                min={0}
                onChange={(event) =>
                  setDiscarded((current) => ({
                    ...current,
                    [resource]: Number(event.currentTarget.value)
                  }))
                }
                step={1}
                type="number"
                value={discarded[resource]}
              />
            </label>
          ))}
        </div>
        <button
          disabled={!validSelection}
          onClick={() =>
            dispatch({ type: "DISCARD_FOR_SEVEN", playerId: pendingPlayerId, resources: discarded })
          }
          type="button"
        >
          Submit Discard
        </button>
      </section>
    );
  }

  if (game.turnState.phase === "awaitingRobberPlacement") {
    return (
      <section className="turn-flow-panel" data-turn-flow="robber-placement">
        <strong>Move the robber to a different hex</strong>
        <span>Select an available board hex to continue.</span>
      </section>
    );
  }

  if (game.turnState.phase === "awaitingRobberVictim" && game.turnState.pendingRobber) {
    return (
      <section className="turn-flow-panel" data-turn-flow="robber-victim">
        <strong>Choose a player to steal from</strong>
        <div className="robber-victim-buttons">
          {game.turnState.pendingRobber.eligibleVictimIds.map((victimId) => {
            const victim = game.players.find((player) => player.id === victimId);
            return (
              <button
                key={victimId}
                onClick={() =>
                  dispatch({
                    type: "STEAL_ROBBER_RESOURCE",
                    playerId: game.activePlayerId,
                    victimId
                  })
                }
                type="button"
              >
                {victim?.name ?? victimId}
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  return null;
}
