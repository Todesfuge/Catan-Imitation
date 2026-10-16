import React from "react";
import type { GameTableView } from "./GameTable";
import { ResourceBundle } from "./ResourceBadge";
import { useI18n } from "./i18n";

export function HandSummary({ state }: { state: GameTableView }) {
  const { t } = useI18n();
  const control = state.controlledPlayers.find((player) => player.isActive) ?? state.controlledPlayers[0];
  if (!control) return null;
  const label = state.controlledPlayers.length === 1
    ? t("board.yourResources")
    : t("board.playerResources", { name: control.displayName });
  return (
    <section aria-label={label} className="hand-summary" data-hand-summary>
      <strong>{label}</strong>
      <ResourceBundle compact includeZero resources={control.resources} />
    </section>
  );
}
