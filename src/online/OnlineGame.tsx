import React, { useMemo, useState } from "react";
import type { GameTableIntent } from "../ui/GameTable";
import { GameTable } from "../ui/GameTable";
import { translate, useI18n, type MessageKey } from "../ui/i18n";
import type { OnlineClientState } from "./onlineReducer";
import type { ClientWebSocketMessage } from "./protocol";
import {
  createOnlineGameTableController,
  createOnlineGameTableView,
  readOnlineGameProjection
} from "./onlineGameAdapter";

export { createOnlineGameTableController, createOnlineGameTableView, readOnlineGameProjection } from "./onlineGameAdapter";

const connectionKeys: Record<OnlineClientState["status"], MessageKey> = {
  connecting: "online.status.connecting",
  connected: "online.status.connected",
  reconnecting: "online.status.reconnecting",
  offline: "online.status.offline",
  expired: "online.status.expired",
  incompatible: "online.status.incompatible"
};

export function OnlineGame({
  roomCode,
  state,
  dispatch: send,
  reconnect,
  onExit,
  createCommandId
}: {
  roomCode: string;
  state: OnlineClientState;
  dispatch: (message: ClientWebSocketMessage) => boolean;
  reconnect: () => void;
  onExit: () => void;
  createCommandId: () => string;
}) {
  const { locale, t } = useI18n();
  const [selectedDiceTotal, setSelectedDiceTotal] = useState(8);
  const projection = readOnlineGameProjection(state.snapshot);
  const baseView = useMemo(() => {
    if (!projection) return undefined;
    try { return createOnlineGameTableView(state); } catch { return undefined; }
  }, [projection, state]);
  if (!baseView || !projection) {
    return (
      <main className="online-shell">
        <section className="online-game-protocol-error" role="alert">
          <h1>{t("online.protocolViewInvalid")}</h1>
          <p>{t("online.protocolViewInvalidDetail")}</p>
          <button onClick={onExit} type="button">{t("online.returnHome")}</button>
        </section>
      </main>
    );
  }
  const view = { ...baseView, selectedDiceTotal };
  const controller = createOnlineGameTableController(() => state, send, createCommandId);
  const game = projection.publicState.game!;
  const awaited = game.turnState.awaitedPlayerIds;
  const awaitedNames = awaited.map((playerId) => game.players.find((player) => player.playerId === playerId)?.nickname ?? playerId);
  const offlineNames = projection.publicState.seats.flatMap((seat) => {
    const online = state.snapshot?.presence.find((entry) => entry.seatId === seat.seatId)?.online ?? false;
    return online ? [] : [seat.nickname];
  });
  const winner = game.players.find((player) => player.playerId === game.winnerId)?.nickname;
  const actor = game.players.find((player) => player.playerId === game.activePlayerId)?.nickname;
  const dispatch = (intent: GameTableIntent) => {
    if (intent.type === "ui.selectDiceTotal") { setSelectedDiceTotal(intent.diceTotal); return; }
    controller.dispatch(intent);
  };
  return (
    <div className="online-game-shell">
      <header className="online-game-status" aria-label={t("online.tableStatus") }>
        <div><strong>{t("online.roomShort", { code: roomCode })}</strong><span>{t("online.privacyNote")}</span></div>
        <span className={`connection-badge connection-badge--${state.status}`} role="status">{t(connectionKeys[state.status])}</span>
        <div className="online-game-status__presence" aria-label={t("online.presenceSummary") }>
          {offlineNames.length > 0 ? offlineNames.map((name) => <span key={name}>{t("online.playerOffline", { name })}</span>) : <span>{t("online.everyoneOnline")}</span>}
        </div>
        <div className="online-game-status__turn" aria-live="polite">
          {winner ? t("online.gameWinner", { name: winner }) : awaitedNames.length > 0 ? t("online.waitingFor", { names: awaitedNames.join(", ") }) : t("online.activePlayer", { name: actor ?? "—" })}
        </div>
        {state.status === "offline" ? <button onClick={reconnect} type="button">{t("online.reconnect")}</button> : null}
        {state.status === "expired" || state.status === "incompatible" ? <button onClick={onExit} type="button">{t("online.returnHome")}</button> : null}
      </header>
      <GameTable view={view} dispatch={dispatch} />
      <p className="sr-only">{translate(locale, "online.noOptimisticChanges")}</p>
    </div>
  );
}
