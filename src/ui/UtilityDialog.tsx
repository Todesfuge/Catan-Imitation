import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { AppState } from "../app/gameReducer";

export type UtilityPanel = "settings" | "rulebook" | "info" | null;

export function UtilityDialog({
  panel,
  state,
  onNewGame,
  onClose
}: {
  panel: UtilityPanel;
  state: AppState;
  onNewGame: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!panel) {
      return;
    }

    openerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
      closeRef.current?.focus();
    }

    return () => {
      if (dialog?.open) {
        dialog.close();
      }
      openerRef.current?.focus();
    };
  }, [panel]);

  if (!panel) {
    return null;
  }

  const title =
    panel === "settings" ? "Settings" : panel === "rulebook" ? "Rulebook" : "Project Info";
  const activePlayer = state.game.players.find(
    (player) => player.id === state.game.activePlayerId
  );

  return (
    <dialog
      aria-labelledby="utility-dialog-title"
      className="utility-modal"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      ref={dialogRef}
    >
      <section className="modal-card">
        <div className="modal-header">
          <h2 id="utility-dialog-title">{title}</h2>
          <button
            aria-label="Close utility panel"
            className="modal-close"
            onClick={onClose}
            ref={closeRef}
            type="button"
          >
            <X size={18} />
          </button>
        </div>
        {panel === "settings" ? (
          <div className="modal-stack">
            <dl className="utility-facts">
              <div>
                <dt>Active player</dt>
                <dd>{activePlayer?.name ?? "Player"}</dd>
              </div>
              <div>
                <dt>Target score</dt>
                <dd>{state.game.targetScore}</dd>
              </div>
              <div>
                <dt>Round</dt>
                <dd>{state.game.round}</dd>
              </div>
              <div>
                <dt>Guild phase</dt>
                <dd>{state.guild.gathering.phase}</dd>
              </div>
            </dl>
            <p>
              Invalid actions are reported as toast messages so the local turn can recover
              without a page reload.
            </p>
            <button onClick={onNewGame} type="button">Start New Game</button>
          </div>
        ) : null}
        {panel === "rulebook" ? (
          <ul className="modal-list">
            <li>Roll dice to produce resources from matching terrain with settlements and cities.</li>
            <li>Build roads, settlements, and cities by spending the standard resource costs.</li>
            <li>
              Use maritime trades, development cards, the robber, longest road, and largest army
              to reach the target score.
            </li>
            <li>
              Commerce Guild trades convert listed resources into tokens, then gatherings let
              tokens buy resources or blind boxes.
            </li>
          </ul>
        ) : null}
        {panel === "info" ? (
          <div className="modal-stack">
            <p>
              Catan Imitation is a TypeScript local-table implementation with deterministic rules,
              statistics, and an original Commerce Guild expansion.
            </p>
            <p>
              The interface prioritizes reviewable product behavior: visible state, direct
              commands, and recoverable errors.
            </p>
          </div>
        ) : null}
      </section>
    </dialog>
  );
}
