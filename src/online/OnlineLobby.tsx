import React, { useEffect, useRef, useState, type RefObject } from "react";
import type { OnlineClientState } from "./onlineReducer";
import type { ProtocolErrorCode } from "./protocol";
import { getDefaultSeatCredentialStore } from "./sessionStorage";
import {
  OnlineRequestError,
  createOnlineRoom,
  joinOnlineRoom,
  leaveOnlineRoom,
  useOnlineRoom,
  type OnlineSeatSession
} from "./useOnlineRoom";
import type { PublicRoomState, PublicSeatView } from "./view";
import { translate, useI18n, type Locale, type MessageKey } from "../ui/i18n";

const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;

type ValidationError = "nicknameRequired" | "nicknameTooLong" | "roomCodeInvalid";
type CopyState = "idle" | "copied" | "failed";
type BusyRoomAction = "ready" | "start" | "leave" | null;

export interface NormalizedLobbyValue {
  value: string;
  error?: ValidationError;
}

export function normalizeLobbyNickname(value: string): NormalizedLobbyValue {
  const normalized = value.normalize("NFKC").trim();
  if ([...normalized].length === 0) return { value: normalized, error: "nicknameRequired" };
  if ([...normalized].length > 20) return { value: normalized, error: "nicknameTooLong" };
  return { value: normalized };
}

export function normalizeLobbyRoomCode(value: string): NormalizedLobbyValue {
  const normalized = value.trim().toUpperCase();
  return ROOM_CODE_PATTERN.test(normalized)
    ? { value: normalized }
    : { value: normalized, error: "roomCodeInvalid" };
}

interface EntryError {
  key: MessageKey;
  field?: "createNickname" | "joinRoomCode" | "joinNickname";
}

export interface OnlineLobbyEntryViewProps {
  nickname: string;
  roomCode: string;
  joinNickname: string;
  busy: boolean;
  error: EntryError | null;
  onNicknameChange: (value: string) => void;
  onRoomCodeChange: (value: string) => void;
  onJoinNicknameChange: (value: string) => void;
  onCreate: (nickname: string) => void;
  onJoin: (roomCode: string, nickname: string) => void;
  onBack: () => void;
  onValidationError?: (error: EntryError) => void;
  errorRef?: RefObject<HTMLDivElement>;
  locale?: Locale;
}

function validationEntryError(error: ValidationError, field: EntryError["field"]): EntryError {
  const key: MessageKey = error === "nicknameRequired"
    ? "online.error.nicknameRequired"
    : error === "nicknameTooLong"
      ? "online.error.nicknameTooLong"
      : "online.error.roomCodeInvalid";
  return { key, field };
}

export function OnlineLobbyEntryView({
  nickname,
  roomCode,
  joinNickname,
  busy,
  error,
  onNicknameChange,
  onRoomCodeChange,
  onJoinNicknameChange,
  onCreate,
  onJoin,
  onBack,
  onValidationError = () => undefined,
  errorRef,
  locale = "en"
}: OnlineLobbyEntryViewProps) {
  const t = (key: MessageKey) => translate(locale, key);
  const create = () => {
    const result = normalizeLobbyNickname(nickname);
    if (result.error) return onValidationError(validationEntryError(result.error, "createNickname"));
    onCreate(result.value);
  };
  const join = () => {
    const code = normalizeLobbyRoomCode(roomCode);
    if (code.error) return onValidationError(validationEntryError(code.error, "joinRoomCode"));
    const name = normalizeLobbyNickname(joinNickname);
    if (name.error) return onValidationError(validationEntryError(name.error, "joinNickname"));
    onJoin(code.value, name.value);
  };
  return (
    <main className="online-shell">
      <section className="online-entry" aria-labelledby="online-entry-title">
        <header className="online-heading">
          <button className="text-button" onClick={onBack} type="button">{t("online.back")}</button>
          <p className="mode-entry__eyebrow">{t("online.eyebrow")}</p>
          <h1 id="online-entry-title">{t("online.title")}</h1>
          <p>{t("online.intro")}</p>
        </header>
        <div
          aria-live="assertive"
          className="online-form-error"
          id="online-entry-error"
          ref={errorRef}
          role="alert"
          tabIndex={-1}
        >
          {error ? t(error.key) : ""}
        </div>
        <div className="online-entry__forms">
          <form onSubmit={(event) => { event.preventDefault(); create(); }}>
            <h2>{t("online.createTitle")}</h2>
            <p>{t("online.createDescription")}</p>
            <label htmlFor="create-nickname">{t("online.nickname")}</label>
            <input
              aria-describedby={error?.field === "createNickname" ? "online-entry-error" : undefined}
              aria-invalid={error?.field === "createNickname"}
              aria-label={t("online.createNicknameAria")}
              autoComplete="nickname"
              id="create-nickname"
              maxLength={40}
              onChange={(event) => onNicknameChange(event.currentTarget.value)}
              value={nickname}
            />
            <button aria-label={t("online.createRoomAria")} className="primary-button" disabled={busy} onClick={create} type="button">
              {busy ? t("online.working") : t("online.create")}
            </button>
          </form>
          <div className="online-entry__divider" aria-hidden="true">{t("online.or")}</div>
          <form onSubmit={(event) => { event.preventDefault(); join(); }}>
            <h2>{t("online.joinTitle")}</h2>
            <p>{t("online.joinDescription")}</p>
            <label htmlFor="join-room-code">{t("online.roomCode")}</label>
            <input
              aria-describedby={error?.field === "joinRoomCode" ? "online-entry-error" : undefined}
              aria-invalid={error?.field === "joinRoomCode"}
              aria-label={t("online.joinRoomCodeAria")}
              autoCapitalize="characters"
              autoComplete="off"
              className="room-code-input"
              id="join-room-code"
              maxLength={6}
              onChange={(event) => onRoomCodeChange(event.currentTarget.value.toUpperCase())}
              spellCheck={false}
              value={roomCode}
            />
            <label htmlFor="join-nickname">{t("online.nickname")}</label>
            <input
              aria-describedby={error?.field === "joinNickname" ? "online-entry-error" : undefined}
              aria-invalid={error?.field === "joinNickname"}
              aria-label={t("online.joinNicknameAria")}
              autoComplete="nickname"
              id="join-nickname"
              maxLength={40}
              onChange={(event) => onJoinNicknameChange(event.currentTarget.value)}
              value={joinNickname}
            />
            <button aria-label={t("online.joinRoomAria")} className="primary-button" disabled={busy} onClick={join} type="button">
              {busy ? t("online.working") : t("online.join")}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

interface LobbySeat extends PublicSeatView {
  online: boolean;
  connectionCount: number;
}

function lobbyState(state: OnlineClientState): {
  publicState?: PublicRoomState;
  seats: LobbySeat[];
  viewerSeatId?: string;
} {
  const snapshot = state.snapshot;
  if (!snapshot) return { seats: [] };
  const candidate = snapshot.publicState as Partial<PublicRoomState>;
  const rawSeats = Array.isArray(candidate.seats) ? candidate.seats : [];
  const presence = new Map(snapshot.presence.map((entry) => [entry.seatId, entry]));
  const seats = rawSeats.flatMap((seat) => {
    if (!seat || typeof seat.seatId !== "string" || typeof seat.nickname !== "string" || typeof seat.ready !== "boolean") return [];
    const current = presence.get(seat.seatId);
    return [{ ...seat, online: current?.online ?? false, connectionCount: current?.connectionCount ?? 0 }];
  });
  const privateState = snapshot.privateState as { seatId?: unknown };
  return {
    publicState: candidate as PublicRoomState,
    seats,
    viewerSeatId: typeof privateState.seatId === "string" ? privateState.seatId : undefined
  };
}

export interface OnlineRoomViewProps {
  roomCode: string;
  seatId: string;
  state: OnlineClientState;
  copyState: CopyState;
  busyAction: BusyRoomAction;
  onCopy: () => void;
  onReadyChange: (ready: boolean) => void;
  onStart: () => void;
  onLeave: () => void;
  onReconnect: () => void;
  onExit?: () => void;
  actionNotice?: MessageKey | null;
  locale?: Locale;
}

const connectionKeys: Record<OnlineClientState["status"], MessageKey> = {
  connecting: "online.status.connecting",
  connected: "online.status.connected",
  reconnecting: "online.status.reconnecting",
  offline: "online.status.offline",
  expired: "online.status.expired",
  incompatible: "online.status.incompatible"
};

export function OnlineRoomView({
  roomCode,
  seatId,
  state,
  copyState,
  busyAction,
  onCopy,
  onReadyChange,
  onStart,
  onLeave,
  onReconnect,
  onExit = () => undefined,
  actionNotice = null,
  locale = "en"
}: OnlineRoomViewProps) {
  const t = (key: MessageKey) => translate(locale, key);
  const projected = lobbyState(state);
  const viewerSeatId = projected.viewerSeatId ?? seatId;
  const ownSeat = projected.seats.find((seat) => seat.seatId === viewerSeatId);
  const isHost = projected.publicState?.hostSeatId === viewerSeatId;
  const canStart = isHost && (projected.seats.length === 3 || projected.seats.length === 4) &&
    projected.seats.every((seat) => seat.ready) && state.status === "connected";
  const terminal = state.status === "expired" || state.status === "incompatible";
  const inLobby = state.snapshot?.lifecycle === "lobby" && !terminal;
  return (
    <main className="online-shell">
      <section className="online-room" aria-labelledby="online-room-title">
        <header className="online-room__header">
          <div>
            <p className="mode-entry__eyebrow">{t("online.eyebrow")}</p>
            <h1 id="online-room-title">{t("online.roomTitle")}</h1>
          </div>
          <span className={`connection-badge connection-badge--${state.status}`} role="status">
            {t(connectionKeys[state.status])}
          </span>
        </header>
        <div className="room-code-card">
          <div>
            <span>{t("online.roomCode")}</span>
            <strong aria-label={t("online.roomCode")}>{roomCode}</strong>
          </div>
          <button aria-label={t("online.copyCodeAria")} onClick={onCopy} type="button">
            {copyState === "copied" ? t("online.copied") : t("online.copy")}
          </button>
        </div>
        <p aria-live="polite" className={`copy-status copy-status--${copyState}`} role="status">
          {copyState === "failed" ? t("online.copyFailed") : copyState === "copied" ? t("online.copySuccess") : ""}
        </p>
        {actionNotice ? <p className="online-action-error" role="alert">{t(actionNotice)}</p> : null}
        {state.snapshot?.lifecycle === "playing" || state.snapshot?.lifecycle === "finished" ? (
          <section className="online-transition" aria-live="polite">
            <h2>{t("online.gameStarting")}</h2>
            <p>{t("online.gameBoundary")}</p>
          </section>
        ) : (
          <>
            <div className="online-room__section-heading">
              <div>
                <h2>{t("online.players")}</h2>
                <p>{t("online.playerCount").replace("{count}", String(projected.seats.length))}</p>
              </div>
            </div>
            <ol className="seat-list">
              {projected.seats.map((seat) => (
                <li className={seat.seatId === viewerSeatId ? "seat-card seat-card--self" : "seat-card"} key={seat.seatId}>
                  <span className="seat-card__order" aria-hidden="true">{projected.seats.indexOf(seat) + 1}</span>
                  <div className="seat-card__identity">
                    <strong>{seat.nickname}{seat.seatId === viewerSeatId ? ` (${t("online.you")})` : ""}</strong>
                    <span>{seat.seatId === projected.publicState?.hostSeatId ? t("online.host") : t("online.player")}</span>
                  </div>
                  <span className={seat.ready ? "seat-state seat-state--ready" : "seat-state"}>
                    {seat.ready ? t("online.ready") : t("online.notReady")}
                  </span>
                  <span className={seat.online ? "presence-state presence-state--online" : "presence-state"}>
                    {seat.online ? t("online.presenceOnline") : t("online.presenceOffline")}
                  </span>
                </li>
              ))}
            </ol>
            {projected.seats.length < 3 ? <p className="online-room__hint">{t("online.waitingForPlayers")}</p> : null}
            <div className="online-room__actions">
              <button
                aria-label={ownSeat?.ready ? t("online.setNotReadyAria") : t("online.setReadyAria")}
                disabled={!ownSeat || state.status !== "connected" || busyAction !== null}
                onClick={() => onReadyChange(!ownSeat?.ready)}
                type="button"
              >
                {ownSeat?.ready ? t("online.setNotReady") : t("online.setReady")}
              </button>
              {isHost ? (
                <button
                  aria-label={t("online.startAria")}
                  className="primary-button"
                  disabled={!canStart || busyAction !== null}
                  onClick={onStart}
                  type="button"
                >
                  {t("online.start")}
                </button>
              ) : null}
              <button
                aria-label={t("online.leave")}
                className="danger-button"
                disabled={!inLobby || busyAction !== null}
                onClick={onLeave}
                type="button"
              >
                {t("online.leave")}
              </button>
            </div>
          </>
        )}
        {state.status === "offline" ? (
          <button onClick={onReconnect} type="button">{t("online.reconnect")}</button>
        ) : null}
        {terminal ? (
          <button className="primary-button" onClick={onExit} type="button">{t("online.returnHome")}</button>
        ) : null}
      </section>
    </main>
  );
}

export interface OnlineLobbyServices {
  createRoom(nickname: string): Promise<OnlineSeatSession>;
  joinRoom(roomCode: string, nickname: string): Promise<OnlineSeatSession>;
  leaveRoom(session: OnlineSeatSession): Promise<void>;
  useRoom: typeof useOnlineRoom;
  copyText(value: string): Promise<void>;
  createCommandId(): string;
}

function browserServices(): OnlineLobbyServices {
  const credentials = getDefaultSeatCredentialStore();
  const requestDependencies = () => ({
    origin: window.location.origin,
    fetch: window.fetch.bind(window),
    credentials
  });
  return {
    createRoom: (nickname) => createOnlineRoom(nickname, requestDependencies()),
    joinRoom: (roomCode, nickname) => joinOnlineRoom(roomCode, nickname, requestDependencies()),
    leaveRoom: (session) => leaveOnlineRoom(session, requestDependencies()),
    useRoom: useOnlineRoom,
    copyText: async (value) => {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(value);
    },
    createCommandId: () => crypto.randomUUID()
  };
}

function requestError(error: unknown): EntryError {
  const code = error instanceof OnlineRequestError ? error.protocolError.code : "INTERNAL_ERROR";
  const keys: Partial<Record<ProtocolErrorCode, MessageKey>> = {
    ROOM_NOT_FOUND: "online.error.roomNotFound",
    ROOM_FULL: "online.error.roomFull",
    ROOM_ALREADY_STARTED: "online.error.roomStarted",
    RATE_LIMITED: "online.error.rateLimited",
    RULE_VIOLATION: "online.error.ruleViolation"
  };
  return { key: keys[code] ?? "online.error.internal" };
}

function ConnectedOnlineRoom({
  session,
  services,
  onExit,
  locale
}: {
  session: OnlineSeatSession;
  services: OnlineLobbyServices;
  onExit: () => void;
  locale: Locale;
}) {
  const room = services.useRoom(session.roomCode);
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [busyAction, setBusyAction] = useState<BusyRoomAction>(null);
  const [actionNotice, setActionNotice] = useState<MessageKey | null>(null);
  const version = room.state.snapshot?.roomVersion ?? 0;
  const dispatch = (message: Parameters<typeof room.dispatch>[0], action: Exclude<BusyRoomAction, null>) => {
    setActionNotice(null);
    setBusyAction(action);
    if (!room.dispatch(message)) {
      setActionNotice("online.error.actionFailed");
      setBusyAction(null);
    }
    else window.setTimeout(() => setBusyAction(null), 250);
  };
  const leave = async () => {
    setBusyAction("leave");
    try {
      setActionNotice(null);
      await services.leaveRoom(session);
      onExit();
    } catch {
      setActionNotice("online.error.leaveFailed");
      setBusyAction(null);
    }
  };
  return (
    <OnlineRoomView
      actionNotice={actionNotice}
      busyAction={busyAction}
      copyState={copyState}
      locale={locale}
      onCopy={() => {
        void services.copyText(session.roomCode)
          .then(() => setCopyState("copied"))
          .catch(() => setCopyState("failed"));
      }}
      onExit={onExit}
      onLeave={() => { void leave(); }}
      onReadyChange={(ready) => dispatch({
        type: "room.ready",
        commandId: services.createCommandId(),
        expectedVersion: version,
        ready
      }, "ready")}
      onReconnect={room.reconnect}
      onStart={() => dispatch({
        type: "room.start",
        commandId: services.createCommandId(),
        expectedVersion: version
      }, "start")}
      roomCode={session.roomCode}
      seatId={session.seatId}
      state={room.state}
    />
  );
}

export function OnlineLobby({
  onExit,
  services: injectedServices
}: {
  onExit: () => void;
  services?: OnlineLobbyServices;
}) {
  const servicesRef = useRef<OnlineLobbyServices>();
  servicesRef.current ??= injectedServices ?? browserServices();
  const services = servicesRef.current;
  const { locale } = useI18n();
  const [session, setSession] = useState<OnlineSeatSession>();
  const [nickname, setNickname] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [joinNickname, setJoinNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<EntryError | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  const bootstrap = async (request: Promise<OnlineSeatSession>) => {
    setBusy(true);
    setError(null);
    try {
      setSession(await request);
    } catch (caught) {
      setError(requestError(caught));
    } finally {
      setBusy(false);
    }
  };
  if (session) {
    return <ConnectedOnlineRoom locale={locale} onExit={onExit} services={services} session={session} />;
  }
  return (
    <OnlineLobbyEntryView
      busy={busy}
      error={error}
      errorRef={errorRef}
      joinNickname={joinNickname}
      locale={locale}
      nickname={nickname}
      onBack={onExit}
      onCreate={(value) => { void bootstrap(services.createRoom(value)); }}
      onJoin={(code, value) => { void bootstrap(services.joinRoom(code, value)); }}
      onJoinNicknameChange={setJoinNickname}
      onNicknameChange={setNickname}
      onRoomCodeChange={setRoomCode}
      onValidationError={setError}
      roomCode={roomCode}
    />
  );
}
