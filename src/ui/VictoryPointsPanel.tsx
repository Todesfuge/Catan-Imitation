import React from "react";
import { calculatePublicScoreBreakdown } from "../domain/rules/scoring";
import type { GameTableView } from "./GameTable";
import { useI18n } from "./i18n";

const publicSources = ["settlements", "cities", "longestRoad", "largestArmy", "prizeCards"] as const;

export function VictoryPointsPanel({ state }: { state: GameTableView }) {
  const { t } = useI18n();
  const finished = state.game.phase === "gameOver";
  const privateControl = state.controlledPlayers.find(control => control.isActive) ?? state.controlledPlayers[0];

  return (
    <section className="victory-points-panel" aria-labelledby="victory-points-title">
      <h3 id="victory-points-title">{t("score.title")}</h3>
      <p className="score-privacy-note">{t(finished ? "score.finishedNote" : "score.privacyNote")}</p>
      <div aria-label={t("score.title")} className="score-source-list" role="region" tabIndex={0}>
        {state.game.players.map((player, displaySlot) => {
          const breakdown = calculatePublicScoreBreakdown(state.game, player.id);
          const hiddenPoints = finished
            ? Math.max(0, player.visibleScore - breakdown.total)
            : privateControl?.displaySlot === displaySlot
              ? privateControl.developmentCards.filter(card => card.kind === "victoryPoint").length
              : undefined;
          return (
            <article className="score-source-card" data-score-player={player.id} key={player.id}>
              <header>
                <h4>{player.name}</h4>
                <span>{t("score.publicTotal", { count: breakdown.total })}</span>
              </header>
              <dl>
                {publicSources.map(source => (
                  <div data-score-source={source} key={source}>
                    <dt>{t(`score.${source}`)}</dt>
                    <dd>{t("score.points", { count: breakdown[source] })}</dd>
                  </div>
                ))}
                <div data-score-source="hiddenVictoryPoints">
                  <dt>{t("score.hiddenVictoryPoints")}</dt>
                  <dd>{hiddenPoints === undefined ? t("score.hidden") : t("score.points", { count: hiddenPoints })}</dd>
                </div>
              </dl>
              <footer>
                <span>{t("score.total")}</span>
                <strong>{hiddenPoints === undefined ? t("score.notPublic") : t("score.points", { count: breakdown.total + hiddenPoints })}</strong>
              </footer>
            </article>
          );
        })}
      </div>
    </section>
  );
}
