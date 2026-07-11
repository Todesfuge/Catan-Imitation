import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { GameTableView } from "./GameTable";
import { useI18n } from "./i18n";

export type UtilityPanel = "settings" | "rulebook" | "info" | null;

export function UtilityDialog({
  panel,
  state,
  onNewGame,
  onClose
}: {
  panel: UtilityPanel;
  state: GameTableView;
  onNewGame: () => void;
  onClose: () => void;
}) {
  const { locale, setLocale, t } = useI18n();
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
    panel === "settings" ? t("dialog.settings") : panel === "rulebook" ? t("dialog.rulebook") : t("dialog.info");
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
            aria-label={t("dialog.close")}
            className="modal-close"
            data-dialog-close
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
                <dt>{t("language.label")}</dt>
                <dd>
                  <select
                    aria-label={t("language.label")}
                    data-language-select
                    onChange={(event) => setLocale(event.currentTarget.value as "en" | "zh-CN")}
                    value={locale}
                  >
                    <option value="en">{t("language.english")}</option>
                    <option value="zh-CN">{t("language.chinese")}</option>
                  </select>
                </dd>
              </div>
              <div>
                <dt>{t("dialog.activePlayer")}</dt>
                <dd>{activePlayer?.name ?? "Player"}</dd>
              </div>
              <div>
                <dt>{t("dialog.targetScore")}</dt>
                <dd>{state.game.targetScore}</dd>
              </div>
              <div>
                <dt>{t("dialog.round")}</dt>
                <dd>{state.game.round}</dd>
              </div>
              <div>
                <dt>{t("dialog.guildPhase")}</dt>
                <dd>{t(`commerce.phase.${state.guild.gathering.phase}`)}</dd>
              </div>
            </dl>
            <p>
              {t("dialog.recovery")}
            </p>
            <button onClick={onNewGame} type="button">{t("dialog.startNewGame")}</button>
          </div>
        ) : null}
        {panel === "rulebook" ? (
          <ul className="modal-list">
            <li>{t("dialog.rule1")}</li>
            <li>{t("dialog.rule2")}</li>
            <li>{t("dialog.rule3")}</li>
            <li>{t("dialog.rule4")}</li>
          </ul>
        ) : null}
        {panel === "info" ? (
          <div className="modal-stack">
            <p>
              {t("dialog.info1")}
            </p>
            <p>
              {t("dialog.info2")}
            </p>
          </div>
        ) : null}
      </section>
    </dialog>
  );
}
