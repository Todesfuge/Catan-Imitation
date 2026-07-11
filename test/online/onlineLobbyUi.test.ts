import React, { type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  AppRouterView,
  type AppRoute
} from "../../src/app/AppRouter";
import {
  OnlineLobbyEntryView,
  OnlineRoomView,
  normalizeLobbyNickname,
  normalizeLobbyRoomCode,
  type OnlineRoomViewProps
} from "../../src/online/OnlineLobby";
import type { OnlineClientState } from "../../src/online/onlineReducer";
import type { RoomSnapshotMessage } from "../../src/online/protocol";
import { I18nProvider } from "../../src/ui/i18n";
import { leaveOnlineRoom, OnlineRequestError } from "../../src/online/useOnlineRoom";
import type { SeatCredentialStore } from "../../src/online/sessionStorage";

function render(node: ReactNode, locale: "en" | "zh-CN" = "en") {
  return renderToStaticMarkup(
    React.createElement(I18nProvider, { initialLocale: locale }, node)
  );
}

function elements(node: ReactNode): ReactElement[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  return [node, ...elements((node.props as { children?: ReactNode }).children)];
}

function elementByLabel(node: ReactNode, label: string): ReactElement {
  const found = elements(node).find((element) =>
    (element.props as { "aria-label"?: string })["aria-label"] === label
  );
  if (!found) throw new Error(`Missing element labelled ${label}`);
  return found;
}

function lobbySnapshot(overrides: Partial<RoomSnapshotMessage> = {}): RoomSnapshotMessage {
  return {
    type: "room.snapshot",
    schemaVersion: 1,
    roomVersion: 7,
    lifecycle: "lobby",
    publicState: {
      roomCode: "234567",
      lifecycle: "lobby",
      roomVersion: 7,
      hostSeatId: "seat-host",
      seats: [
        { seatId: "seat-host", nickname: "Host", ready: true },
        { seatId: "seat-two", nickname: "Two", ready: true },
        { seatId: "seat-three", nickname: "Three", ready: true }
      ],
      submittedBidSeatIds: []
    },
    privateState: { seatId: "seat-host", seatTokenPresent: true },
    allowedActions: {},
    presence: [
      { seatId: "seat-three", connectionCount: 0, online: false },
      { seatId: "seat-two", connectionCount: 1, online: true },
      { seatId: "seat-host", connectionCount: 2, online: true }
    ],
    ...overrides
  };
}

function roomProps(
  state: OnlineClientState,
  overrides: Partial<OnlineRoomViewProps> = {}
): OnlineRoomViewProps {
  return {
    roomCode: "234567",
    seatId: "seat-host",
    state,
    copyState: "idle",
    pendingCommand: null,
    leavePending: false,
    onCopy: vi.fn(),
    onReadyChange: vi.fn(),
    onStart: vi.fn(),
    onLeave: vi.fn(),
    onReconnect: vi.fn(),
    ...overrides
  };
}

describe("Local / Online router", () => {
  it("presents Local and Online as peer entry points and Local performs zero online work", () => {
    let route: AppRoute = "entry";
    const onRouteChange = vi.fn((next: AppRoute) => { route = next; });
    const onlineMount = vi.fn();
    const entry = AppRouterView({ route, onRouteChange, onlineMount });

    const html = render(entry);
    expect(html).toContain("Local Game");
    expect(html).toContain("Online Game");
    (elementByLabel(entry, "Play Local Game").props as { onClick(): void }).onClick();

    expect(route).toBe("local");
    expect(onlineMount).not.toHaveBeenCalled();
    expect(render(AppRouterView({ route, onRouteChange, onlineMount })))
      .toContain('class="game-shell"');
  });
});

describe("online room entry", () => {
  it("removes a seat credential only after the lobby leave succeeds", async () => {
    const remove = vi.fn();
    const credentials: SeatCredentialStore = {
      load: () => ({ roomCode: "234567", seatId: "seat-host", seatToken: "t".repeat(43) }),
      save: () => ({ saved: true, persistent: true }),
      remove
    };
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    await leaveOnlineRoom(
      { roomCode: "234567", seatId: "seat-host" },
      { origin: "https://game.test", fetch, credentials }
    );
    expect(fetch).toHaveBeenCalledWith(
      "https://game.test/api/rooms/234567/seats/seat-host",
      expect.objectContaining({ method: "DELETE", headers: { authorization: `Bearer ${"t".repeat(43)}` } })
    );
    expect(remove).toHaveBeenCalledWith("234567");

    fetch.mockResolvedValueOnce(new Response(JSON.stringify({
      error: { code: "COMMAND_NOT_ALLOWED", params: {}, retryable: false }
    }), { status: 403 }));
    await expect(leaveOnlineRoom(
      { roomCode: "234567", seatId: "seat-host" },
      { origin: "https://game.test", fetch, credentials }
    )).rejects.toBeInstanceOf(OnlineRequestError);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("normalizes nickname and room code at the visible validation boundary", () => {
    expect(normalizeLobbyNickname("  Ｋａｙ  ")).toEqual({ value: "Kay" });
    expect(normalizeLobbyNickname("   ")).toEqual({ value: "", error: "nicknameRequired" });
    expect(normalizeLobbyNickname("😀".repeat(21))).toEqual({ value: "😀".repeat(21), error: "nicknameTooLong" });
    expect(normalizeLobbyRoomCode(" 2o4i67 ")).toEqual({ value: "2O4I67", error: "roomCodeInvalid" });
    expect(normalizeLobbyRoomCode(" 234567 ")).toEqual({ value: "234567" });
  });

  it("renders labelled create/join forms and sends normalized values through interactions", () => {
    const create = vi.fn();
    const join = vi.fn();
    const view = OnlineLobbyEntryView({
      busy: false,
      error: null,
      joinNickname: "  Ｋａｙ  ",
      nickname: " Host ",
      roomCode: " 234567 ",
      onBack: vi.fn(),
      onCreate: create,
      onJoin: join,
      onJoinNicknameChange: vi.fn(),
      onNicknameChange: vi.fn(),
      onRoomCodeChange: vi.fn()
    });

    const html = render(view);
    expect(html).toContain('aria-label="Create nickname"');
    expect(html).toContain('aria-label="Join room code"');
    expect(html).toContain('aria-label="Join nickname"');
    expect(html).toContain('aria-live="assertive"');
    (elementByLabel(view, "Create room").props as { onClick(): void }).onClick();
    (elementByLabel(view, "Join room").props as { onClick(): void }).onClick();
    expect(create).toHaveBeenCalledWith("Host");
    expect(join).toHaveBeenCalledWith("234567", "Kay");
    const codeInput = elementByLabel(view, "Join room code");
    expect((codeInput.props as { maxLength?: number }).maxLength ?? Number.POSITIVE_INFINITY).toBeGreaterThan(6);
  });

  it("keeps the locale switch operable throughout Online entry", () => {
    const onLocaleChange = vi.fn();
    const view = OnlineLobbyEntryView({
      busy: false, error: null, joinNickname: "", nickname: "", roomCode: "",
      onBack: vi.fn(), onCreate: vi.fn(), onJoin: vi.fn(), onJoinNicknameChange: vi.fn(),
      onNicknameChange: vi.fn(), onRoomCodeChange: vi.fn(), locale: "en",
      onLocaleChange
    });
    const language = elementByLabel(view, "Language");
    const chinese = elements(language).find((element) =>
      (element.props as { children?: ReactNode }).children === "简体中文"
    );
    expect(chinese).toBeDefined();
    (chinese!.props as { onClick(): void }).onClick();
    expect(onLocaleChange).toHaveBeenCalledWith("zh-CN");
  });
});

describe("online lobby room", () => {
  it("shows code, copy recovery, join order, ready state, host marker, and presence", () => {
    const state: OnlineClientState = { status: "connected", retryAttempt: 0, snapshot: lobbySnapshot() };
    const view = OnlineRoomView(roomProps(state, { copyState: "failed" }));
    const html = render(view);

    expect(html).toContain("234567");
    expect(html).toContain("Copy failed. Try again.");
    expect(html.indexOf("Host")).toBeLessThan(html.indexOf("Two"));
    expect(html.indexOf("Two")).toBeLessThan(html.indexOf("Three"));
    expect(html).toContain("Host");
    expect(html).toContain("Ready");
    expect(html).toContain("Offline");
    expect(html).not.toMatch(/seatToken|ticket|authorization/i);
  });

  it("allows only a ready host with three or four ready seats to start", () => {
    const hostState: OnlineClientState = { status: "connected", retryAttempt: 0, snapshot: lobbySnapshot() };
    const hostStart = vi.fn();
    const hostView = OnlineRoomView(roomProps(hostState, { onStart: hostStart }));
    const hostButton = elementByLabel(hostView, "Start online game");
    expect((hostButton.props as { disabled?: boolean }).disabled).toBe(false);
    (hostButton.props as { onClick(): void }).onClick();
    expect(hostStart).toHaveBeenCalledOnce();

    const notReady = lobbySnapshot();
    notReady.publicState = {
      ...notReady.publicState,
      seats: (notReady.publicState.seats as Array<Record<string, unknown>>).map((seat, index) =>
        index === 2 ? { ...seat, ready: false } : seat
      )
    };
    const disabledView = OnlineRoomView(roomProps({ status: "connected", retryAttempt: 0, snapshot: notReady }));
    expect((elementByLabel(disabledView, "Start online game").props as { disabled?: boolean }).disabled).toBe(true);

    const guestSnapshot = lobbySnapshot();
    guestSnapshot.privateState = { seatId: "seat-two", seatTokenPresent: true };
    const guestView = OnlineRoomView(roomProps(
      { status: "connected", retryAttempt: 0, snapshot: guestSnapshot },
      { seatId: "seat-two" }
    ));
    expect(elements(guestView).some((element) =>
      (element.props as { "aria-label"?: string })["aria-label"] === "Start online game"
    )).toBe(false);
  });

  it("dispatches ready, supports leave, and exposes every connection state", () => {
    const ready = vi.fn();
    const leave = vi.fn();
    const state: OnlineClientState = { status: "connected", retryAttempt: 0, snapshot: lobbySnapshot() };
    const view = OnlineRoomView(roomProps(state, { onReadyChange: ready, onLeave: leave }));
    (elementByLabel(view, "Set not ready").props as { onClick(): void }).onClick();
    (elementByLabel(view, "Leave room").props as { onClick(): void }).onClick();
    expect(ready).toHaveBeenCalledWith(false);
    expect(leave).toHaveBeenCalledOnce();

    for (const [status, label] of [
      ["connecting", "Connecting"], ["connected", "Connected"],
      ["reconnecting", "Reconnecting"], ["offline", "Offline"],
      ["expired", "Room expired"], ["incompatible", "Update required"]
    ] as const) {
      const html = render(OnlineRoomView(roomProps({ status, retryAttempt: 0 })));
      expect(html).toContain(label);
    }
    const expired = OnlineRoomView(roomProps({ status: "expired", retryAttempt: 0 }));
    expect((elementByLabel(expired, "Leave room").props as { disabled?: boolean }).disabled).toBe(true);
    expect((elementByLabel(expired, "Copy room code").props as { disabled?: boolean }).disabled).toBe(true);
  });

  it("renders sanitized transport notices and keeps one pending room command disabled until matching completion", () => {
    const state = {
      status: "connected",
      retryAttempt: 0,
      snapshot: lobbySnapshot(),
      notice: { code: "RULE_VIOLATION", params: {}, retryable: false },
      noticeCommandId: "11111111-1111-4111-8111-111111111111"
    } as const;
    const html = render(OnlineRoomView({
      ...roomProps(state),
      pendingCommand: { action: "ready", commandId: "11111111-1111-4111-8111-111111111111" }
    }));
    expect(html).toContain('role="alert"');
    expect(html).toContain("That action is not allowed in the current room state.");
    const view = OnlineRoomView({
      ...roomProps(state),
      pendingCommand: { action: "start", commandId: "11111111-1111-4111-8111-111111111111" }
    });
    expect((elementByLabel(view, "Set not ready").props as { disabled?: boolean }).disabled).toBe(true);
    expect((elementByLabel(view, "Start online game").props as { disabled?: boolean }).disabled).toBe(true);
  });

  it("keeps the locale switch operable inside a connected room", () => {
    const onLocaleChange = vi.fn();
    const state: OnlineClientState = { status: "connected", retryAttempt: 0, snapshot: lobbySnapshot() };
    const view = OnlineRoomView({ ...roomProps(state), onLocaleChange });
    const language = elementByLabel(view, "Language");
    const chinese = elements(language).find((element) =>
      (element.props as { children?: ReactNode }).children === "简体中文"
    );
    expect(chinese).toBeDefined();
    (chinese!.props as { onClick(): void }).onClick();
    expect(onLocaleChange).toHaveBeenCalledWith("zh-CN");
  });

  it("keeps a failed room action visible and recoverable", () => {
    const state: OnlineClientState = { status: "connected", retryAttempt: 0, snapshot: lobbySnapshot() };
    const html = render(OnlineRoomView({
      ...roomProps(state),
      actionNotice: "online.error.leaveFailed"
    }));
    expect(html).toContain('role="alert"');
    expect(html).toContain("Could not leave the room. Try again.");
    expect(html).not.toMatch(/seatToken|authorization|Bearer/i);
  });

  it("has complete Simplified Chinese lobby translations while English remains default", () => {
    const state: OnlineClientState = { status: "connected", retryAttempt: 0, snapshot: lobbySnapshot() };
    const english = render(OnlineRoomView(roomProps(state)));
    const chinese = render(OnlineRoomView({ ...roomProps(state), locale: "zh-CN" }), "zh-CN");
    expect(english).toContain("Private online room");
    for (const text of ["私人联机房间", "房间代码", "已准备", "离开房间", "在线"]) {
      expect(chinese).toContain(text);
    }
    for (const label of ["复制房间代码", "取消准备", "开始联机游戏", "离开房间"]) {
      expect(chinese).toContain(`aria-label="${label}"`);
    }
  });
});
