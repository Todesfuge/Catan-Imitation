import { describe, expect, it, vi } from "vitest";
import {
  activeSeatCredentialStorageKey,
  createSeatCredentialStore,
  getDefaultSeatCredentialStore,
  seatCredentialStorageKey,
  type SeatCredentialStore,
  type StorageLike
} from "../../src/online/sessionStorage";
import {
  createInitialOnlineState,
  onlineReducer,
  type OnlineClientState
} from "../../src/online/onlineReducer";
import {
  createOnlineRoom,
  createOnlineRoomClient,
  joinOnlineRoom,
  requestConnectionTicket,
  RECONNECT_DELAYS_MS,
  type ClientSocket,
  type Scheduler
} from "../../src/online/useOnlineRoom";
import { MAX_WIRE_BYTES, type RoomSnapshotMessage } from "../../src/online/protocol";

const roomCode = "7KMPQX";
const seatToken = "s".repeat(43);

function memoryStorage(): StorageLike & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key)
  };
}

function snapshot(version: number): RoomSnapshotMessage {
  return {
    type: "room.snapshot",
    schemaVersion: 2,
    roomVersion: version,
    lifecycle: "playing",
    publicState: { marker: `public-${version}` },
    privateState: { marker: `private-${version}` },
    allowedActions: { roll: version === 2 },
    presence: [{ seatId: "seat-1", connectionCount: 1, online: true }]
  };
}

class FakeSocket implements ClientSocket {
  readonly sent: string[] = [];
  readonly listeners = new Map<string, Set<(event: unknown) => void>>();
  readyState = 0;

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  send(value: string): void {
    this.sent.push(value);
  }

  close(): void {
    this.readyState = 3;
  }

  emit(type: string, event: unknown = {}): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

class FakeScheduler implements Scheduler {
  readonly delays: number[] = [];
  readonly tasks: Array<() => void> = [];

  setTimeout(task: () => void, delayMs: number): unknown {
    this.delays.push(delayMs);
    this.tasks.push(task);
    return task;
  }

  clearTimeout(handle: unknown): void {
    const index = this.tasks.indexOf(handle as () => void);
    if (index >= 0) this.tasks.splice(index, 1);
  }

  runNext(): void {
    this.tasks.shift()?.();
  }
}

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe("online seat credential storage", () => {
  it("persists only an active room pointer and resolves it through the existing credential", () => {
    const storage = memoryStorage();
    const store = createSeatCredentialStore(storage);

    expect(store.save({ roomCode: " 7kmpqx ", seatId: "seat-1", seatToken }))
      .toEqual({ saved: true, persistent: true });
    expect(storage.values.get(activeSeatCredentialStorageKey)).toBe(roomCode);
    expect(storage.values.get(activeSeatCredentialStorageKey)).not.toContain(seatToken);
    expect(store.loadActive()).toEqual({ roomCode, seatId: "seat-1" });

    store.clearActive(roomCode);
    expect(store.loadActive()).toBeUndefined();
    expect(store.load(roomCode)).toEqual({ roomCode, seatId: "seat-1", seatToken });

    store.save({ roomCode, seatId: "seat-1", seatToken });
    store.remove(roomCode);
    expect(store.loadActive()).toBeUndefined();
  });

  it("removes malformed and stale active pointers", () => {
    const storage = memoryStorage();
    storage.values.set(activeSeatCredentialStorageKey, " 7kmpqx ");
    expect(createSeatCredentialStore(storage).loadActive()).toBeUndefined();
    expect(storage.values.has(activeSeatCredentialStorageKey)).toBe(false);

    storage.values.set(activeSeatCredentialStorageKey, roomCode);
    expect(createSeatCredentialStore(storage).loadActive()).toBeUndefined();
    expect(storage.values.has(activeSeatCredentialStorageKey)).toBe(false);
  });

  it("keeps the active session volatile when storage is unavailable or quota-failing", () => {
    for (const storage of [
      undefined,
      {
        getItem: () => { throw new DOMException("blocked"); },
        setItem: () => { throw new DOMException("quota"); },
        removeItem: () => { throw new DOMException("blocked"); }
      } satisfies StorageLike
    ]) {
      const store = createSeatCredentialStore(storage);
      expect(store.save({ roomCode, seatId: "seat-1", seatToken }))
        .toEqual({ saved: true, persistent: false });
      expect(store.loadActive()).toEqual({ roomCode, seatId: "seat-1" });
      expect(() => store.clearActive(roomCode)).not.toThrow();
      expect(store.loadActive()).toBeUndefined();
    }
  });

  it("uses an origin-local room namespace and lets multiple tabs reuse one token", () => {
    const storage = memoryStorage();
    const firstTab = createSeatCredentialStore(storage);
    const secondTab = createSeatCredentialStore(storage);

    expect(seatCredentialStorageKey(" 7kmpqx ")).toBe("catan.online.seat.v1:7KMPQX");
    expect(firstTab.save({ roomCode, seatId: "seat-1", seatToken })).toEqual({ saved: true, persistent: true });
    expect(secondTab.load(roomCode)).toEqual({ roomCode, seatId: "seat-1", seatToken });
    expect([...storage.values.keys()]).toEqual([
      "catan.online.seat.v1:7KMPQX",
      activeSeatCredentialStorageKey
    ]);
  });

  it("falls back safely when storage is malformed or unavailable", () => {
    const malformed = memoryStorage();
    malformed.values.set(seatCredentialStorageKey(roomCode), "{secret");
    expect(createSeatCredentialStore(malformed).load(roomCode)).toBeUndefined();
    expect(malformed.values.size).toBe(0);

    const unavailable: StorageLike = {
      getItem: () => { throw new DOMException("blocked"); },
      setItem: () => { throw new DOMException("blocked"); },
      removeItem: () => { throw new DOMException("blocked"); }
    };
    const store = createSeatCredentialStore(unavailable);
    expect(store.load(roomCode)).toBeUndefined();
    expect(store.save({ roomCode, seatId: "seat-1", seatToken })).toEqual({ saved: true, persistent: false });
    expect(store.load(roomCode)).toEqual({ roomCode, seatId: "seat-1", seatToken });
    expect(() => store.remove(roomCode)).not.toThrow();
  });

  it("uses page-memory fallback for quota failures and keeps last-write-wins reads", () => {
    const storage = memoryStorage();
    const store = createSeatCredentialStore(storage);
    expect(store.save({ roomCode, seatId: "seat-old", seatToken })).toEqual({ saved: true, persistent: true });
    storage.values.set(seatCredentialStorageKey(roomCode), JSON.stringify({
      roomCode,
      seatId: "seat-new",
      seatToken: "n".repeat(43)
    }));
    expect(store.load(roomCode)?.seatId).toBe("seat-new");

    const quotaStorage: StorageLike = {
      getItem: () => { throw new DOMException("blocked"); },
      setItem: () => { throw new DOMException("quota"); },
      removeItem: () => undefined
    };
    const memoryOnly = createSeatCredentialStore(quotaStorage);
    expect(memoryOnly.save({ roomCode, seatId: "seat-1", seatToken })).toEqual({ saved: true, persistent: false });
    expect(memoryOnly.load(roomCode)?.seatToken).toBe(seatToken);
  });

  it("keeps a newer volatile credential over stale readable storage after quota failure", () => {
    const values = new Map<string, string>([[seatCredentialStorageKey(roomCode), JSON.stringify({
      roomCode,
      seatId: "seat-old",
      seatToken: "o".repeat(43)
    })]]);
    const quotaAfterRead: StorageLike = {
      getItem: (key) => values.get(key) ?? null,
      setItem: () => { throw new DOMException("quota"); },
      removeItem: (key) => void values.delete(key)
    };
    const store = createSeatCredentialStore(quotaAfterRead);
    expect(store.load(roomCode)?.seatId).toBe("seat-old");
    expect(store.save({ roomCode, seatId: "seat-new", seatToken })).toEqual({ saved: true, persistent: false });
    expect(store.load(roomCode)).toEqual({ roomCode, seatId: "seat-new", seatToken });
    expect(store.load("ABC234")).toBeUndefined();
  });

  it("adopts a different newer persistent credential after a volatile quota fallback", () => {
    const key = seatCredentialStorageKey(roomCode);
    const values = new Map<string, string>([[key, JSON.stringify({
      roomCode,
      seatId: "seat-old",
      seatToken: "o".repeat(43)
    })]]);
    let quota = true;
    const storage: StorageLike = {
      getItem: (candidate) => values.get(candidate) ?? null,
      setItem: (candidate, value) => {
        if (quota) throw new DOMException("quota");
        values.set(candidate, value);
      },
      removeItem: (candidate) => void values.delete(candidate)
    };
    const store = createSeatCredentialStore(storage);
    expect(store.save({ roomCode, seatId: "seat-volatile", seatToken })).toEqual({ saved: true, persistent: false });
    expect(store.load(roomCode)?.seatId).toBe("seat-volatile");

    quota = false;
    values.set(key, JSON.stringify({ roomCode, seatId: "seat-external", seatToken: "e".repeat(43) }));
    expect(store.load(roomCode)?.seatId).toBe("seat-external");
  });
});

describe("online HTTP bootstrap", () => {
  it("creates and joins via same-origin JSON and persists returned credentials", async () => {
    const requests: Request[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      requests.push(request);
      return new Response(JSON.stringify({ roomCode, seatId: `seat-${requests.length}`, seatToken }), {
        status: 201,
        headers: { "content-type": "application/json" }
      });
    });
    const store = createSeatCredentialStore(memoryStorage());

    expect(await createOnlineRoom("Alice", { origin: "https://game.test", fetch: fetcher, credentials: store }))
      .toEqual({ roomCode, seatId: "seat-1" });
    expect(await joinOnlineRoom(" 7kmpqx ", "Bob", { origin: "https://game.test", fetch: fetcher, credentials: store }))
      .toEqual({ roomCode, seatId: "seat-2" });

    expect(requests.map((request) => [request.method, request.url])).toEqual([
      ["POST", "https://game.test/api/rooms"],
      ["POST", "https://game.test/api/rooms/7KMPQX/join"]
    ]);
    expect(requests[0].headers.get("content-type")).toBe("application/json");
    expect(await requests[0].clone().json()).toEqual({ nickname: "Alice" });
    expect(await requests[1].clone().json()).toEqual({ nickname: "Bob" });
    expect(store.load(roomCode)?.seatToken).toBe(seatToken);
  });

  it("exchanges the seat token only in an authorization header", async () => {
    let request: Request | undefined;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      request = new Request(input, init);
      return new Response(JSON.stringify({ ticket: "t".repeat(43), expiresInMs: 30_000 }), { status: 201 });
    });

    await requestConnectionTicket(roomCode, seatToken, {
      origin: "https://game.test",
      fetch: fetcher
    });

    expect(request?.method).toBe("POST");
    expect(request?.url).toBe("https://game.test/api/rooms/7KMPQX/connection-ticket");
    expect(request?.headers.get("authorization")).toBe(`Bearer ${seatToken}`);
    expect(request?.url).not.toContain(seatToken);
  });

  it("rejects oversized or malformed HTTP bodies before secrets can enter client state", async () => {
    const oversized = JSON.stringify({ ticket: "t".repeat(MAX_WIRE_BYTES), expiresInMs: 30_000 });
    await expect(requestConnectionTicket(roomCode, seatToken, {
      origin: "https://game.test",
      fetch: async () => new Response(oversized, {
        status: 201,
        headers: { "content-length": String(new TextEncoder().encode(oversized).byteLength) }
      })
    })).rejects.toMatchObject({ protocolError: { code: "INTERNAL_ERROR" } });

    let caught: unknown;
    try {
      await requestConnectionTicket(roomCode, seatToken, {
        origin: "https://game.test",
        fetch: async () => new Response(JSON.stringify({
          error: {
            code: "RATE_LIMITED",
            params: { seatToken },
            retryable: true,
            extra: "not allowed"
          }
        }), { status: 429 })
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ protocolError: { code: "INTERNAL_ERROR", params: {} } });
    expect(JSON.stringify(caught)).not.toContain(seatToken);

    await expect(requestConnectionTicket(roomCode, seatToken, {
      origin: "https://game.test",
      fetch: async () => new Response(JSON.stringify({
        error: {
          code: "RATE_LIMITED",
          params: { detail: `ticket failed: ${seatToken} retry later` },
          retryable: true
        }
      }), { status: 429 })
    })).rejects.toMatchObject({ protocolError: { code: "INTERNAL_ERROR", params: {} } });

    let keyError: unknown;
    try {
      await requestConnectionTicket(roomCode, seatToken, {
        origin: "https://game.test",
        fetch: async () => new Response(JSON.stringify({
          error: {
            code: "RULE_VIOLATION",
            params: { [seatToken]: "echoed as a key" },
            retryable: false
          }
        }), { status: 422 })
      });
    } catch (error) {
      keyError = error;
    }
    expect(keyError).toMatchObject({ protocolError: { code: "INTERNAL_ERROR", params: {} } });
    expect(JSON.stringify(keyError)).not.toContain(seatToken);
  });

  it("cancels a streamed response as soon as the actual body exceeds the wire limit", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_WIRE_BYTES));
        controller.enqueue(new Uint8Array([1]));
      },
      cancel() { cancelled = true; }
    });
    await expect(requestConnectionTicket(roomCode, seatToken, {
      origin: "https://game.test",
      fetch: async () => new Response(stream, { status: 201 })
    })).rejects.toMatchObject({ protocolError: { code: "INTERNAL_ERROR" } });
    expect(cancelled).toBe(true);
  });

  it("best-effort cancels the body before rejecting an invalid declared length", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array([1])); },
      cancel() { cancelled = true; }
    });
    await expect(requestConnectionTicket(roomCode, seatToken, {
      origin: "https://game.test",
      fetch: async () => new Response(stream, {
        status: 201,
        headers: { "content-length": String(MAX_WIRE_BYTES + 1) }
      })
    })).rejects.toMatchObject({ protocolError: { code: "INTERNAL_ERROR" } });
    expect(cancelled).toBe(true);
  });

  it("normalizes malformed error param boundaries and length mismatches", async () => {
    const malformedParams = [
      Object.fromEntries(Array.from({ length: 17 }, (_, index) => [`key${index}`, index])),
      { ["k".repeat(129)]: "value" },
      { detail: "v".repeat(129) },
      { detail: -1 }
    ];
    for (const params of malformedParams) {
      await expect(requestConnectionTicket(roomCode, seatToken, {
        origin: "https://game.test",
        fetch: async () => new Response(JSON.stringify({
          error: { code: "RATE_LIMITED", params, retryable: true }
        }), { status: 429 })
      })).rejects.toMatchObject({ protocolError: { code: "INTERNAL_ERROR", params: {} } });
    }
    await expect(requestConnectionTicket(roomCode, seatToken, {
      origin: "https://game.test",
      fetch: async () => new Response("{}", {
        status: 201,
        headers: { "content-length": "3" }
      })
    })).rejects.toMatchObject({ protocolError: { code: "INTERNAL_ERROR" } });
  });

  it("rejects false-success seat creation when an injected credential store cannot save", async () => {
    const failingStore: SeatCredentialStore = {
      load: () => undefined,
      loadActive: () => undefined,
      save: () => ({ saved: false, persistent: false }),
      remove: () => undefined,
      clearActive: () => undefined
    };
    await expect(createOnlineRoom("Alice", {
      origin: "https://game.test",
      credentials: failingStore,
      fetch: async () => new Response(JSON.stringify({ roomCode, seatId: "seat-1", seatToken }), { status: 201 })
    })).rejects.toMatchObject({ protocolError: { code: "INTERNAL_ERROR" } });
  });

  it("shares the default page-lifetime credential store", () => {
    expect(getDefaultSeatCredentialStore()).toBe(getDefaultSeatCredentialStore());
  });

  it("can ticket and connect after create falls back to page memory", async () => {
    const unavailable: StorageLike = {
      getItem: () => { throw new DOMException("blocked"); },
      setItem: () => { throw new DOMException("quota"); },
      removeItem: () => undefined
    };
    const credentials = createSeatCredentialStore(unavailable);
    const requests: Request[] = [];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      requests.push(request);
      return requests.length === 1
        ? new Response(JSON.stringify({ roomCode, seatId: "seat-1", seatToken }), { status: 201 })
        : new Response(JSON.stringify({ ticket: "t".repeat(43), expiresInMs: 30_000 }), { status: 201 });
    };
    await createOnlineRoom("Alice", { origin: "https://game.test", fetch: fetcher, credentials });
    const sockets: FakeSocket[] = [];
    const client = createOnlineRoomClient(roomCode, {
      origin: "https://game.test",
      fetch: fetcher,
      credentials,
      scheduler: new FakeScheduler(),
      createWebSocket: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      }
    });
    client.connect();
    await flush();
    expect(requests[1].headers.get("authorization")).toBe(`Bearer ${seatToken}`);
    expect(sockets).toHaveLength(1);
    client.dispose();
  });
});

describe("online reducer", () => {
  it("replaces complete snapshots and ignores duplicate or out-of-order versions", () => {
    let state = createInitialOnlineState();
    state = onlineReducer(state, { type: "socket.opened" });
    state = onlineReducer(state, { type: "server.message", message: snapshot(2) });
    const accepted = state;
    expect(state.snapshot).toEqual(snapshot(2));

    state = onlineReducer(state, { type: "server.message", message: snapshot(2) });
    state = onlineReducer(state, { type: "server.message", message: snapshot(1) });
    expect(state).toBe(accepted);
    expect(JSON.stringify(state)).not.toContain(seatToken);
  });

  it("updates unversioned presence without mutating the projected game objects", () => {
    const state: OnlineClientState = onlineReducer(
      onlineReducer(createInitialOnlineState(), { type: "socket.opened" }),
      { type: "server.message", message: snapshot(2) }
    );
    const next = onlineReducer(state, {
      type: "server.message",
      message: { type: "presence.changed", presence: [{ seatId: "seat-1", connectionCount: 0, online: false }] }
    });
    expect(next.snapshot?.presence[0].online).toBe(false);
    expect(next.snapshot?.publicState).toBe(state.snapshot?.publicState);
    expect(next.snapshot?.privateState).toBe(state.snapshot?.privateState);
  });

  it("accepts the complete latest snapshot attached to a version conflict", () => {
    const current = onlineReducer(
      onlineReducer(createInitialOnlineState(), { type: "socket.opened" }),
      { type: "server.message", message: snapshot(2) }
    );
    const next = onlineReducer(current, {
      type: "server.message",
      message: {
        type: "command.rejected",
        commandId: "11111111-1111-4111-8111-111111111111",
        error: { code: "VERSION_CONFLICT", params: {}, retryable: true },
        snapshot: snapshot(3) as unknown as Record<string, unknown>
      }
    });
    expect(next.snapshot).toEqual(snapshot(3));
    expect(next.notice?.code).toBe("VERSION_CONFLICT");
    expect(next.noticeCommandId).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("makes expired and incompatible messages terminal", () => {
    const expired = onlineReducer(createInitialOnlineState(), {
      type: "server.message",
      message: { type: "room.expired", error: { code: "ROOM_EXPIRED", params: {}, retryable: false } }
    });
    const incompatible = onlineReducer(createInitialOnlineState(), {
      type: "server.message",
      message: {
        type: "protocol.incompatible",
        error: { code: "PROTOCOL_INCOMPATIBLE", params: { expected: 2 }, retryable: false }
      }
    });
    expect(expired.status).toBe("expired");
    expect(incompatible.status).toBe("incompatible");
  });
});

describe("online reconnect transport", () => {
  it("reduces a secret-echoing ticket error to a generic notice", async () => {
    const credentials = createSeatCredentialStore(memoryStorage());
    credentials.save({ roomCode, seatId: "seat-1", seatToken });
    const client = createOnlineRoomClient(roomCode, {
      origin: "https://game.test",
      credentials,
      scheduler: new FakeScheduler(),
      fetch: async () => new Response(JSON.stringify({
        error: { code: "RATE_LIMITED", params: { detail: seatToken }, retryable: true }
      }), { status: 429 }),
      createWebSocket: () => new FakeSocket()
    });
    client.connect();
    await flush();
    expect(client.getState().notice).toEqual({ code: "INTERNAL_ERROR", params: {}, retryable: true });
    expect(JSON.stringify(client.getState())).not.toContain(seatToken);
    client.dispose();
  });

  it("redacts embedded current credentials from WebSocket rejection notices", async () => {
    const credentials = createSeatCredentialStore(memoryStorage());
    credentials.save({ roomCode, seatId: "seat-1", seatToken });
    const socket = new FakeSocket();
    const ticket = "t".repeat(43);
    const client = createOnlineRoomClient(roomCode, {
      origin: "https://game.test",
      credentials,
      scheduler: new FakeScheduler(),
      fetch: async () => new Response(JSON.stringify({ ticket, expiresInMs: 30_000 }), { status: 201 }),
      createWebSocket: () => socket
    });
    client.connect();
    await flush();
    socket.readyState = 1;
    socket.emit("open");
    socket.emit("message", { data: JSON.stringify({
      type: "command.rejected",
      commandId: "11111111-1111-4111-8111-111111111111",
      error: {
        code: "RULE_VIOLATION",
        params: { detail: `seat ${seatToken}; ticket ${ticket}` },
        retryable: false
      }
    }) });
    expect(client.getState().notice).toEqual({ code: "INTERNAL_ERROR", params: {}, retryable: true });
    expect(JSON.stringify(client.getState())).not.toContain(seatToken);
    expect(JSON.stringify(client.getState())).not.toContain(ticket);
    client.dispose();
  });

  it("redacts a current credential used as a WebSocket error param key", async () => {
    const credentials = createSeatCredentialStore(memoryStorage());
    credentials.save({ roomCode, seatId: "seat-1", seatToken });
    const socket = new FakeSocket();
    const client = createOnlineRoomClient(roomCode, {
      origin: "https://game.test",
      credentials,
      scheduler: new FakeScheduler(),
      fetch: async () => new Response(JSON.stringify({ ticket: "t".repeat(43), expiresInMs: 30_000 }), { status: 201 }),
      createWebSocket: () => socket
    });
    client.connect();
    await flush();
    socket.readyState = 1;
    socket.emit("open");
    socket.emit("message", { data: JSON.stringify({
      type: "command.rejected",
      commandId: "11111111-1111-4111-8111-111111111111",
      error: {
        code: "RULE_VIOLATION",
        params: { [seatToken]: "echoed as a key" },
        retryable: false
      }
    }) });
    expect(client.getState().notice).toEqual({ code: "INTERNAL_ERROR", params: {}, retryable: true });
    expect(JSON.stringify(client.getState())).not.toContain(seatToken);
    client.dispose();
  });

  it("uses a fresh one-time ticket per socket and capped 1/2/4/8/15 second retries", async () => {
    const storage = memoryStorage();
    const credentials = createSeatCredentialStore(storage);
    credentials.save({ roomCode, seatId: "seat-1", seatToken });
    const scheduler = new FakeScheduler();
    const sockets: FakeSocket[] = [];
    const socketUrls: string[] = [];
    let ticketNumber = 0;
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      ticket: `${String(++ticketNumber).padStart(2, "0")}${"t".repeat(41)}`,
      expiresInMs: 30_000
    }), { status: 201 }));
    const client = createOnlineRoomClient(roomCode, {
      origin: "https://game.test",
      credentials,
      fetch: fetcher,
      scheduler,
      createWebSocket: (url) => {
        const socket = new FakeSocket();
        sockets.push(socket);
        socketUrls.push(url);
        expect(url).toMatch(/^wss:\/\/game\.test\/api\/rooms\/7KMPQX\/connect\?ticket=/);
        expect(url).not.toContain(seatToken);
        return socket;
      }
    });

    client.connect();
    await flush();
    for (let index = 0; index < 6; index += 1) {
      sockets[index].emit("close");
      scheduler.runNext();
      await flush();
    }

    expect(RECONNECT_DELAYS_MS).toEqual([1_000, 2_000, 4_000, 8_000, 15_000]);
    expect(scheduler.delays).toEqual([1_000, 2_000, 4_000, 8_000, 15_000, 15_000]);
    expect(fetcher).toHaveBeenCalledTimes(7);
    expect(new Set(socketUrls).size).toBe(7);
    expect(JSON.stringify(client.getState())).not.toContain(seatToken);
    client.dispose();
  });

  it("resets backoff after a successful reconnect and cancels pending work on dispose", async () => {
    const credentials = createSeatCredentialStore(memoryStorage());
    credentials.save({ roomCode, seatId: "seat-1", seatToken });
    const scheduler = new FakeScheduler();
    const sockets: FakeSocket[] = [];
    const client = createOnlineRoomClient(roomCode, {
      origin: "https://game.test",
      credentials,
      scheduler,
      fetch: async () => new Response(JSON.stringify({ ticket: "t".repeat(43), expiresInMs: 30_000 }), { status: 201 }),
      createWebSocket: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      }
    });

    client.connect();
    await flush();
    sockets[0].emit("close");
    scheduler.runNext();
    await flush();
    sockets[1].readyState = 1;
    sockets[1].emit("open");
    sockets[1].emit("close");
    expect(scheduler.delays).toEqual([1_000, 1_000]);
    expect(scheduler.tasks).toHaveLength(1);
    client.dispose();
    expect(scheduler.tasks).toHaveLength(0);
  });

  it("does not dispatch offline, apply commands locally, or accept stale socket events", async () => {
    const storage = memoryStorage();
    const credentials = createSeatCredentialStore(storage);
    credentials.save({ roomCode, seatId: "seat-1", seatToken });
    const scheduler = new FakeScheduler();
    const sockets: FakeSocket[] = [];
    const client = createOnlineRoomClient(roomCode, {
      origin: "https://game.test",
      credentials,
      scheduler,
      fetch: async () => new Response(JSON.stringify({ ticket: "t".repeat(43), expiresInMs: 30_000 }), { status: 201 }),
      createWebSocket: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      }
    });
    const command = { type: "room.ready", commandId: "11111111-1111-4111-8111-111111111111", expectedVersion: 0, ready: true } as const;

    expect(client.dispatch(command)).toBe(false);
    client.connect();
    await flush();
    sockets[0].readyState = 1;
    sockets[0].emit("open");
    expect(client.dispatch(command)).toBe(true);
    expect(sockets[0].sent).toEqual([JSON.stringify(command)]);
    expect(client.getState().snapshot).toBeUndefined();

    sockets[0].emit("close");
    expect(client.dispatch(command)).toBe(false);
    scheduler.runNext();
    await flush();
    sockets[1].readyState = 1;
    sockets[1].emit("open");
    sockets[0].emit("message", { data: JSON.stringify(snapshot(99)) });
    expect(client.getState().snapshot).toBeUndefined();

    client.dispose();
    sockets[1].emit("message", { data: JSON.stringify(snapshot(2)) });
    expect(client.getState().snapshot).toBeUndefined();
  });

  it("validates and canonicalizes every outbound message before sending", async () => {
    const credentials = createSeatCredentialStore(memoryStorage());
    credentials.save({ roomCode, seatId: "seat-1", seatToken });
    const socket = new FakeSocket();
    const client = createOnlineRoomClient(roomCode, {
      origin: "https://game.test",
      credentials,
      scheduler: new FakeScheduler(),
      fetch: async () => new Response(JSON.stringify({ ticket: "t".repeat(43), expiresInMs: 30_000 }), { status: 201 }),
      createWebSocket: () => socket
    });
    client.connect();
    await flush();
    socket.readyState = 1;
    socket.emit("open");
    const before = client.getState();

    const invalid = [
      { type: "room.ready", commandId: "bad", expectedVersion: 0, ready: true },
      { type: "room.ready", commandId: "11111111-1111-4111-8111-111111111111", expectedVersion: -1, ready: true },
      { type: "room.ready", commandId: "11111111-1111-4111-8111-111111111111", expectedVersion: 0, ready: true, seatToken },
      { type: "match.command", commandId: "11111111-1111-4111-8111-111111111111", expectedVersion: 0,
        command: { type: "BUILD_ROAD", edgeId: "x".repeat(MAX_WIRE_BYTES) } }
    ];
    for (const message of invalid) {
      expect(client.dispatch(message as never)).toBe(false);
    }
    expect(socket.sent).toHaveLength(0);
    expect(client.getState()).toBe(before);
    expect(JSON.stringify(client.getState())).not.toContain(seatToken);

    const valid = { type: "room.ready", commandId: "11111111-1111-4111-8111-111111111111", expectedVersion: 0, ready: true } as const;
    expect(client.dispatch(valid)).toBe(true);
    expect(socket.sent).toEqual([JSON.stringify(valid)]);
  });

  it("stops reconnecting after terminal messages", async () => {
    const credentials = createSeatCredentialStore(memoryStorage());
    credentials.save({ roomCode, seatId: "seat-1", seatToken });
    const scheduler = new FakeScheduler();
    const sockets: FakeSocket[] = [];
    const client = createOnlineRoomClient(roomCode, {
      origin: "https://game.test",
      credentials,
      scheduler,
      fetch: async () => new Response(JSON.stringify({ ticket: "t".repeat(43), expiresInMs: 30_000 }), { status: 201 }),
      createWebSocket: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      }
    });

    client.connect();
    await flush();
    sockets[0].emit("message", { data: JSON.stringify({
      type: "room.expired",
      error: { code: "ROOM_EXPIRED", params: {}, retryable: false }
    }) });
    sockets[0].emit("close");
    expect(client.getState().status).toBe("expired");
    expect(scheduler.tasks).toHaveLength(0);
  });

  it("aborts an in-flight ticket request and ignores its late completion", async () => {
    const credentials = createSeatCredentialStore(memoryStorage());
    credentials.save({ roomCode, seatId: "seat-1", seatToken });
    const scheduler = new FakeScheduler();
    const sockets: FakeSocket[] = [];
    let resolveFetch!: (response: Response) => void;
    let signal: AbortSignal | undefined;
    const client = createOnlineRoomClient(roomCode, {
      origin: "https://game.test",
      credentials,
      scheduler,
      fetch: async (_input, init) => {
        signal = init?.signal ?? undefined;
        return new Promise<Response>((resolve) => { resolveFetch = resolve; });
      },
      createWebSocket: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      }
    });

    client.connect();
    expect(signal?.aborted).toBe(false);
    client.dispose();
    expect(signal?.aborted).toBe(true);
    resolveFetch(new Response(JSON.stringify({ ticket: "t".repeat(43), expiresInMs: 30_000 }), { status: 201 }));
    await flush();
    expect(sockets).toHaveLength(0);
    expect(scheduler.tasks).toHaveLength(0);
  });

  it("removes every credential-capturing socket listener before dispose closes it", async () => {
    const credentials = createSeatCredentialStore(memoryStorage());
    credentials.save({ roomCode, seatId: "seat-1", seatToken });
    const socket = new FakeSocket();
    const client = createOnlineRoomClient(roomCode, {
      origin: "https://game.test",
      credentials,
      scheduler: new FakeScheduler(),
      fetch: async () => new Response(JSON.stringify({ ticket: "t".repeat(43), expiresInMs: 30_000 }), { status: 201 }),
      createWebSocket: () => socket
    });
    client.connect();
    await flush();
    expect([...socket.listeners.values()].reduce((total, listeners) => total + listeners.size, 0)).toBe(4);
    socket.readyState = 1;
    socket.emit("open");
    const beforeDispose = client.getState();
    client.dispose();
    expect([...socket.listeners.values()].reduce((total, listeners) => total + listeners.size, 0)).toBe(0);

    socket.emit("message", { data: JSON.stringify(snapshot(99)) });
    socket.emit("close");
    socket.emit("open");
    expect(client.getState()).toBe(beforeDispose);
  });
});
