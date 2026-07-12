const STORAGE_PREFIX = "catan.online.seat.v1:";
export const activeSeatCredentialStorageKey = "catan.online.active-seat.v1";
const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SeatCredential {
  roomCode: string;
  seatId: string;
  seatToken: string;
}

export interface SeatCredentialStore {
  load(roomCode: string): SeatCredential | undefined;
  loadActive(): Pick<SeatCredential, "roomCode" | "seatId"> | undefined;
  save(credential: SeatCredential): SeatCredentialSaveResult;
  remove(roomCode: string): void;
  clearActive(roomCode: string): void;
}

export interface SeatCredentialSaveResult {
  saved: boolean;
  persistent: boolean;
}

function normalizeRoomCode(roomCode: string): string {
  return roomCode.trim().toUpperCase();
}

export function seatCredentialStorageKey(roomCode: string): string {
  return `${STORAGE_PREFIX}${normalizeRoomCode(roomCode)}`;
}

function credentialAt(value: unknown, expectedRoomCode: string): SeatCredential | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Partial<SeatCredential>;
  if (
    candidate.roomCode !== expectedRoomCode ||
    typeof candidate.seatId !== "string" ||
    candidate.seatId.length === 0 ||
    typeof candidate.seatToken !== "string" ||
    !TOKEN_PATTERN.test(candidate.seatToken)
  ) {
    return undefined;
  }
  return {
    roomCode: candidate.roomCode,
    seatId: candidate.seatId,
    seatToken: candidate.seatToken
  };
}

function defaultStorage(): StorageLike | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function createSeatCredentialStore(
  storage: StorageLike | undefined = defaultStorage()
): SeatCredentialStore {
  const memory = new Map<string, SeatCredential>();
  const unreadable = Symbol("unreadable persistent credential");
  const volatileOverrides = new Map<string, string | null | typeof unreadable>();
  let activeRoomCode: string | undefined;
  let volatileActive = false;

  const load = (roomCode: string): SeatCredential | undefined => {
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    if (!ROOM_CODE_PATTERN.test(normalizedRoomCode)) return undefined;
    const key = seatCredentialStorageKey(normalizedRoomCode);
    if (volatileOverrides.has(key)) {
      const observed = volatileOverrides.get(key);
      if (storage && observed !== unreadable) {
        try {
          const current = storage.getItem(key);
          if (current !== observed && current !== null) {
            const external = credentialAt(JSON.parse(current) as unknown, normalizedRoomCode);
            if (external) {
              volatileOverrides.delete(key);
              memory.set(key, external);
              return external;
            }
          }
        } catch { /* preserve the newer volatile credential */ }
      }
      return memory.get(key);
    }
    if (storage) {
      try {
        const serialized = storage.getItem(key);
        if (serialized !== null) {
          const credential = credentialAt(JSON.parse(serialized) as unknown, normalizedRoomCode);
          if (credential) {
            memory.set(key, credential);
            return credential;
          }
          try { storage.removeItem(key); } catch { /* fall back to page memory */ }
        }
      } catch {
        try { storage.removeItem(key); } catch { /* fall back to page memory */ }
      }
    }
    return memory.get(key);
  };

  const clearActive = (roomCode: string): void => {
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    if (!ROOM_CODE_PATTERN.test(normalizedRoomCode)) return;
    const cachedMatch = activeRoomCode === normalizedRoomCode;
    if (cachedMatch) {
      activeRoomCode = undefined;
      volatileActive = false;
    }
    if (!storage) return;
    try {
      const stored = storage.getItem(activeSeatCredentialStorageKey);
      if (stored === normalizedRoomCode) storage.removeItem(activeSeatCredentialStorageKey);
    } catch {
      if (cachedMatch) {
        try { storage.removeItem(activeSeatCredentialStorageKey); } catch { /* best-effort cleanup */ }
      }
    }
  };

  const store: SeatCredentialStore = {
    load,
    loadActive() {
      if (volatileActive) {
        const credential = activeRoomCode === undefined ? undefined : load(activeRoomCode);
        return credential && { roomCode: credential.roomCode, seatId: credential.seatId };
      }
      if (!storage) return undefined;
      let stored: string | null;
      try {
        stored = storage.getItem(activeSeatCredentialStorageKey);
      } catch {
        return undefined;
      }
      if (stored === null) {
        activeRoomCode = undefined;
        return undefined;
      }
      if (!ROOM_CODE_PATTERN.test(stored)) {
        try { storage.removeItem(activeSeatCredentialStorageKey); } catch { /* best-effort cleanup */ }
        activeRoomCode = undefined;
        return undefined;
      }
      const credential = load(stored);
      if (!credential) {
        try { storage.removeItem(activeSeatCredentialStorageKey); } catch { /* best-effort cleanup */ }
        activeRoomCode = undefined;
        return undefined;
      }
      activeRoomCode = stored;
      return { roomCode: credential.roomCode, seatId: credential.seatId };
    },
    save(credential) {
      const normalizedRoomCode = normalizeRoomCode(credential.roomCode);
      const safeCredential = credentialAt(
        { ...credential, roomCode: normalizedRoomCode },
        normalizedRoomCode
      );
      if (!ROOM_CODE_PATTERN.test(normalizedRoomCode) || !safeCredential) {
        return { saved: false, persistent: false };
      }
      const key = seatCredentialStorageKey(normalizedRoomCode);
      let observed: string | null | typeof unreadable = unreadable;
      if (storage) {
        try { observed = storage.getItem(key); } catch { /* storage remains unreadable */ }
      }
      memory.set(key, safeCredential);
      activeRoomCode = normalizedRoomCode;
      if (!storage) {
        volatileOverrides.set(key, unreadable);
        volatileActive = true;
        return { saved: true, persistent: false };
      }
      try {
        storage.setItem(key, JSON.stringify(safeCredential));
        volatileOverrides.delete(key);
        storage.setItem(activeSeatCredentialStorageKey, normalizedRoomCode);
        volatileActive = false;
        return { saved: true, persistent: true };
      } catch {
        volatileOverrides.set(key, observed);
        volatileActive = true;
        return { saved: true, persistent: false };
      }
    },
    remove(roomCode) {
      const normalizedRoomCode = normalizeRoomCode(roomCode);
      clearActive(normalizedRoomCode);
      const key = seatCredentialStorageKey(normalizedRoomCode);
      memory.delete(key);
      volatileOverrides.delete(key);
      if (!storage) return;
      try { storage.removeItem(key); } catch { /* best-effort cleanup */ }
    },
    clearActive
  };
  return store;
}

let defaultStore: SeatCredentialStore | undefined;

export function getDefaultSeatCredentialStore(): SeatCredentialStore {
  defaultStore ??= createSeatCredentialStore();
  return defaultStore;
}
