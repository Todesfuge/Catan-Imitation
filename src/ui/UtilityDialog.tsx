import React, { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { MapRestartMode } from "../domain/match/types";
import type { GameTableView } from "./GameTable";
import { useI18n } from "./i18n";

export type UtilityPanel = "settings" | "rulebook" | "info" | null;

type SeedClipboard = Pick<Clipboard, "writeText">;

async function copyMapSeed(
  seed: string,
  clipboard: SeedClipboard | undefined
): Promise<boolean> {
  if (!clipboard?.writeText) return false;
  try {
    await clipboard.writeText(seed);
    return true;
  } catch {
    return false;
  }
}

export function UtilityDialog({
  panel,
  state,
  onRestart,
  onClose
}: {
  panel: UtilityPanel;
  state: GameTableView;
  onRestart: (mode: MapRestartMode) => void;
  onClose: () => void;
}) {
  const { locale, setLocale, t } = useI18n();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const restartOriginRef = useRef<HTMLButtonElement | null>(null);
  const restartCancelRef = useRef<HTMLButtonElement>(null);
  const copyRequestRef = useRef(0);
  const [pendingRestart, setPendingRestart] = useState<MapRestartMode | null>(null);
  const [copyStatus, setCopyStatus] = useState<{
    readonly kind: "success" | "failure";
    readonly attempt: number;
  } | null>(null);

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

  useEffect(() => {
    if (pendingRestart) restartCancelRef.current?.focus();
  }, [pendingRestart]);

  useEffect(() => {
    copyRequestRef.current += 1;
    setPendingRestart(null);
    setCopyStatus(null);
    restartOriginRef.current = null;
  }, [panel, state.game.mapSeed, state.restart?.enabled, state.restart?.requiresConfirmation]);

  if (!panel) {
    return null;
  }

  const title =
    panel === "settings" ? t("dialog.settings") : panel === "rulebook" ? t("dialog.rulebook") : t("dialog.info");
  const activePlayer = state.game.players.find(
    (player) => player.id === state.game.activePlayerId
  );

  function requestRestart(mode: MapRestartMode, origin: HTMLButtonElement) {
    if (!state.restart?.enabled) return;
    if (!state.restart.requiresConfirmation) {
      onRestart(mode);
      return;
    }
    restartOriginRef.current = origin;
    setPendingRestart(mode);
  }

  function cancelRestart() {
    const origin = restartOriginRef.current;
    restartOriginRef.current = null;
    setPendingRestart(null);
    queueMicrotask(() => {
      if (origin?.isConnected) origin.focus();
    });
  }

  function confirmRestart() {
    const mode = pendingRestart;
    setPendingRestart(null);
    restartOriginRef.current = null;
    if (!mode || !state.restart?.enabled || !state.restart.requiresConfirmation) return;
    onRestart(mode);
  }

  function closeDialog() {
    copyRequestRef.current += 1;
    setPendingRestart(null);
    setCopyStatus(null);
    restartOriginRef.current = null;
    onClose();
  }

  async function handleCopySeed() {
    const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
    const request = ++copyRequestRef.current;
    const copied = await copyMapSeed(state.game.mapSeed, clipboard);
    if (request !== copyRequestRef.current) return;
    setCopyStatus((current) => ({
      kind: copied ? "success" : "failure",
      attempt: (current?.attempt ?? 0) + 1
    }));
  }

  return (
    <dialog
      aria-labelledby="utility-dialog-title"
      className="utility-modal"
      onCancel={(event) => {
        event.preventDefault();
        closeDialog();
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
            onClick={closeDialog}
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
            <section className="map-seed-setting" aria-labelledby="map-seed-label">
              <label id="map-seed-label" htmlFor="map-seed-value">{t("settings.mapSeed")}</label>
              <div className="map-seed-row">
                <input
                  className="map-seed-value"
                  data-map-seed
                  id="map-seed-value"
                  readOnly
                  value={state.game.mapSeed}
                />
                <button
                  aria-label={t("settings.copySeed")}
                  onClick={() => void handleCopySeed()}
                  type="button"
                >
                  {t("settings.copySeed")}
                </button>
              </div>
              <p
                aria-live="polite"
                className={`map-seed-copy-status${copyStatus ? ` map-seed-copy-status--${copyStatus.kind}` : ""}`}
                data-copy-attempt={copyStatus?.attempt}
                role="status"
              >
                {copyStatus
                  ? t(copyStatus.kind === "success" ? "settings.copySeedSuccess" : "settings.copySeedFailed")
                  : ""}
              </p>
            </section>
            <p>
              {t("dialog.recovery")}
            </p>
            {state.restart ? (
              <section className="restart-settings" aria-labelledby="restart-settings-title">
                <h3 id="restart-settings-title">{t("settings.restartTitle")}</h3>
                <p>{t("settings.restartDescription")}</p>
                <div className="restart-actions">
                  <button
                    disabled={!state.restart.enabled || pendingRestart !== null}
                    onClick={(event) => requestRestart("fresh", event.currentTarget)}
                    type="button"
                  >
                    {t("settings.newRandomMap")}
                  </button>
                  <button
                    disabled={!state.restart.enabled || pendingRestart !== null}
                    onClick={(event) => requestRestart("sameMap", event.currentTarget)}
                    type="button"
                  >
                    {t("settings.replayCurrentMap")}
                  </button>
                </div>
                {pendingRestart ? (
                  <div className="restart-confirmation" role="group" aria-labelledby="restart-confirmation-message">
                    <p id="restart-confirmation-message">
                      {t(pendingRestart === "fresh" ? "settings.restartConfirmFresh" : "settings.restartConfirmSameMap")}
                    </p>
                    <div>
                      <button onClick={cancelRestart} ref={restartCancelRef} type="button">
                        {t("settings.restartCancel")}
                      </button>
                      <button
                        className="danger-button"
                        disabled={!state.restart.enabled}
                        onClick={confirmRestart}
                        type="button"
                      >
                        {t("settings.restartConfirm")}
                      </button>
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}
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
