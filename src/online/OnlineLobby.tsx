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
import { OnlineGame } from "./OnlineGame";
import { translate, type Locale, type MessageKey } from "../ui/i18n";

const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;

type ValidationError = "nicknameRequired" | "nicknameTooLong" | "roomCodeInvalid";
type CopyState = "idle" | "copied" | "failed";
type PendingRoomAction = "ready" | "start";

export interface PendingRoomCommand {
  action: PendingRoomAction;
  commandId: string;
}

function LobbyLocaleSwitch({
  locale,
  onLocaleChange
}: {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
}) {
  return (
    <div className="mode-locale" aria-label={translate(locale, "mode.language")} role="group">
      <button aria-pressed={locale === "en"} onClick={() => onLocaleChange("en")} type="button">English</button>
      <button aria-pressed={locale === "zh-CN"} onClick={() => onLocaleChange("zh-CN")} type="button">简体中文</button>
    </div>
  );
}

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
  onLocaleChange?: (locale: Locale) => void;
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
  locale = "en",
  onLocaleChange = () => undefined
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
          <div className="online-heading__controls">
            <button className="text-button" onClick={onBack} type="button">{t("online.back")}</button>
            {LobbyLocaleSwitch({ locale, onLocaleChange })}
          </div>
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
              maxLength={32}
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
  pendingCommand?: PendingRoomCommand | null;
  leavePending?: boolean;
  onCopy: () => void;
  onReadyChange: (ready: boolean) => void;
  onStart: () => void;
  onLeave: () => void;
  onReconnect: () => void;
  onExit?: () => void;
  actionNotice?: MessageKey | null;
  locale?: Locale;
  onLocaleChange?: (locale: Locale) => void;
}

const connectionKeys: Record<OnlineClientState["status"], MessageKey> = {
  connecting: "online.status.connecting",
  connected: "online.status.connected",
  reconnecting: "online.status.reconnecting",
  offline: "online.status.offline",
  expired: "online.status.expired",
  incompatible: "online.status.incompatible"
};

function protocolNoticeKey(code: ProtocolErrorCode): MessageKey {
  const keys: Record<ProtocolErrorCode, MessageKey> = {
    ROOM_NOT_FOUND: "online.error.roomNotFound",
    ROOM_FULL: "online.error.roomFull",
    ROOM_ALREADY_STARTED: "online.error.roomStarted",
    SEAT_TOKEN_INVALID: "online.error.seatInvalid",
    CONNECTION_TICKET_EXPIRED: "online.error.connectionExpired",
    VERSION_CONFLICT: "online.error.versionConflict",
    COMMAND_NOT_ALLOWED: "online.error.commandNotAllowed",
    RULE_VIOLATION: "online.error.commandNotAllowed",
    RATE_LIMITED: "online.error.rateLimited",
    ROOM_EXPIRED: "online.error.roomExpired",
    PROTOCOL_INCOMPATIBLE: "online.error.protocolIncompatible",
    INTERNAL_ERROR: "online.error.internal"
  };
  return keys[code];
}

export function OnlineRoomView({
  roomCode,
  seatId,
  state,
  copyState,
  pendingCommand = null,
  leavePending = false,
  onCopy,
  onReadyChange,
  onStart,
  onLeave,
  onReconnect,
  onExit = () => undefined,
  actionNotice = null,
  locale = "en",
  onLocaleChange = () => undefined
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
          {LobbyLocaleSwitch({ locale, onLocaleChange })}
        </header>
        <div className="room-code-card">
          <div>
            <span>{t("online.roomCode")}</span>
            <strong aria-label={t("online.roomCode")}>{roomCode}</strong>
          </div>
          <button aria-label={t("online.copyCodeAria")} disabled={terminal} onClick={onCopy} type="button">
            {copyState === "copied" ? t("online.copied") : t("online.copy")}
          </button>
        </div>
        <p aria-live="polite" className={`copy-status copy-status--${copyState}`} role="status">
          {copyState === "failed" ? t("online.copyFailed") : copyState === "copied" ? t("online.copySuccess") : ""}
        </p>
        {state.notice || actionNotice ? (
          <p className="online-action-error" role="alert">
            {t(state.notice ? protocolNoticeKey(state.notice.code) : actionNotice!)}
          </p>
        ) : null}
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
                disabled={!ownSeat || state.status !== "connected" || pendingCommand !== null || leavePending}
                onClick={() => onReadyChange(!ownSeat?.ready)}
                type="button"
              >
                {ownSeat?.ready ? t("online.setNotReady") : t("online.setReady")}
              </button>
              {isHost ? (
                <button
                  aria-label={t("online.startAria")}
                  className="primary-button"
                  disabled={!canStart || pendingCommand !== null || leavePending}
                  onClick={onStart}
                  type="button"
                >
                  {t("online.start")}
                </button>
              ) : null}
              <button
                aria-label={t("online.leave")}
                className="danger-button"
                disabled={!inLobby || pendingCommand !== null || leavePending}
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
  resumeSession(): OnlineSeatSession | undefined;
  clearActiveSession(session: OnlineSeatSession): void;
  useRoom: typeof useOnlineRoom;
  copyText(value: string): Promise<void>;
  createCommandId(): string;
}

export function exitConnectedOnlineRoom(
  session: OnlineSeatSession,
  services: Pick<OnlineLobbyServices, "clearActiveSession">,
  onExit: () => void
): void {
  services.clearActiveSession(session);
  onExit();
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
    resumeSession: () => credentials.loadActive(),
    clearActiveSession: (session) => credentials.clearActive(session.roomCode),
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
  locale,
  onLocaleChange
}: {
  session: OnlineSeatSession;
  services: OnlineLobbyServices;
  onExit: () => void;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
}) {
  const room = services.useRoom(session.roomCode);
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [pendingCommand, setPendingCommand] = useState<PendingRoomCommand | null>(null);
  const pendingCommandRef = useRef<PendingRoomCommand | null>(null);
  const [leavePending, setLeavePending] = useState(false);
  const leavePendingRef = useRef(false);
  const [actionNotice, setActionNotice] = useState<MessageKey | null>(null);
  const version = room.state.snapshot?.roomVersion ?? 0;
  const clearPendingCommand = () => {
    pendingCommandRef.current = null;
    setPendingCommand(null);
  };
  useEffect(() => {
    const current = pendingCommandRef.current;
    if (!current) return;
    const acknowledged = room.state.snapshot?.acknowledgedCommandId === current.commandId;
    const rejected = room.state.noticeCommandId === current.commandId;
    const connectionReset = room.state.status !== "connected";
    if (acknowledged || rejected || connectionReset) clearPendingCommand();
  }, [
    room.state.noticeCommandId,
    room.state.snapshot?.acknowledgedCommandId,
    room.state.status
  ]);
  useEffect(() => () => {
    pendingCommandRef.current = null;
    leavePendingRef.current = false;
  }, []);
  const dispatch = (
    action: PendingRoomAction,
    createMessage: (commandId: string) => Parameters<typeof room.dispatch>[0]
  ) => {
    if (pendingCommandRef.current || leavePendingRef.current) return;
    const commandId = services.createCommandId();
    const pending = { action, commandId };
    pendingCommandRef.current = pending;
    setPendingCommand(pending);
    setActionNotice(null);
    if (!room.dispatch(createMessage(commandId))) {
      setActionNotice("online.error.actionFailed");
      clearPendingCommand();
    }
  };
  const leave = async () => {
    if (leavePendingRef.current || pendingCommandRef.current) return;
    leavePendingRef.current = true;
    setLeavePending(true);
    try {
      setActionNotice(null);
      await services.leaveRoom(session);
      onExit();
    } catch {
      setActionNotice("online.error.leaveFailed");
      leavePendingRef.current = false;
      setLeavePending(false);
    }
  };
  const terminal = room.state.status === "expired" || room.state.status === "incompatible";
  if (room.state.snapshot?.lifecycle === "playing" || room.state.snapshot?.lifecycle === "finished") {
    return (
      <OnlineGame
        createCommandId={services.createCommandId}
        dispatch={room.dispatch}
        onExit={onExit}
        reconnect={room.reconnect}
        roomCode={session.roomCode}
        state={room.state}
      />
    );
  }
  return (
    <OnlineRoomView
      actionNotice={actionNotice}
      copyState={copyState}
      leavePending={leavePending}
      locale={locale}
      onCopy={() => {
        if (terminal) return;
        void services.copyText(session.roomCode)
          .then(() => setCopyState("copied"))
          .catch(() => setCopyState("failed"));
      }}
      onExit={onExit}
      onLeave={() => { void leave(); }}
      onLocaleChange={onLocaleChange}
      onReadyChange={(ready) => dispatch("ready", (commandId) => ({
        type: "room.ready", commandId, expectedVersion: version, ready
      }))}
      onReconnect={room.reconnect}
      onStart={() => dispatch("start", (commandId) => ({
        type: "room.start", commandId, expectedVersion: version
      }))}
      pendingCommand={pendingCommand}
      roomCode={session.roomCode}
      seatId={session.seatId}
      state={room.state}
    />
  );
}

export function OnlineLobby({
  onExit,
  services: injectedServices,
  locale,
  onLocaleChange
}: {
  onExit: () => void;
  services?: OnlineLobbyServices;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
}) {
  const servicesRef = useRef<OnlineLobbyServices>();
  servicesRef.current ??= injectedServices ?? browserServices();
  const services = servicesRef.current;
  const [session, setSession] = useState<OnlineSeatSession | undefined>(() => services.resumeSession());
  const [nickname, setNickname] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [joinNickname, setJoinNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const bootstrapPendingRef = useRef(false);
  const [error, setError] = useState<EntryError | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  useEffect(() => () => {
    bootstrapPendingRef.current = false;
  }, []);
  const bootstrap = async (request: () => Promise<OnlineSeatSession>) => {
    if (bootstrapPendingRef.current) return;
    bootstrapPendingRef.current = true;
    setBusy(true);
    setError(null);
    try {
      setSession(await request());
    } catch (caught) {
      setError(requestError(caught));
    } finally {
      bootstrapPendingRef.current = false;
      setBusy(false);
    }
  };
  if (session) {
    const exit = () => exitConnectedOnlineRoom(session, services, onExit);
    return (
      <ConnectedOnlineRoom
        locale={locale}
        onExit={exit}
        onLocaleChange={onLocaleChange}
        services={services}
        session={session}
      />
    );
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
      onCreate={(value) => { void bootstrap(() => services.createRoom(value)); }}
      onJoin={(code, value) => { void bootstrap(() => services.joinRoom(code, value)); }}
      onJoinNicknameChange={setJoinNickname}
      onLocaleChange={onLocaleChange}
      onNicknameChange={setNickname}
      onRoomCodeChange={setRoomCode}
      onValidationError={setError}
      roomCode={roomCode}
    />
  );
}
