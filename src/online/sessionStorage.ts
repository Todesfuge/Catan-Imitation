const STORAGE_PREFIX = "catan.online.seat.v1:";
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
  save(credential: SeatCredential): SeatCredentialSaveResult;
  remove(roomCode: string): void;
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
  const volatileOverrides = new Set<string>();
  return {
    load(roomCode) {
      const normalizedRoomCode = normalizeRoomCode(roomCode);
      if (!ROOM_CODE_PATTERN.test(normalizedRoomCode)) return undefined;
      const key = seatCredentialStorageKey(normalizedRoomCode);
      if (volatileOverrides.has(key)) return memory.get(key);
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
      memory.set(key, safeCredential);
      if (!storage) {
        volatileOverrides.add(key);
        return { saved: true, persistent: false };
      }
      try {
        storage.setItem(key, JSON.stringify(safeCredential));
        volatileOverrides.delete(key);
        return { saved: true, persistent: true };
      } catch {
        volatileOverrides.add(key);
        return { saved: true, persistent: false };
      }
    },
    remove(roomCode) {
      memory.delete(seatCredentialStorageKey(roomCode));
      volatileOverrides.delete(seatCredentialStorageKey(roomCode));
      if (!storage) return;
      try { storage.removeItem(seatCredentialStorageKey(roomCode)); } catch { /* best-effort cleanup */ }
    }
  };
}

let defaultStore: SeatCredentialStore | undefined;

export function getDefaultSeatCredentialStore(): SeatCredentialStore {
  defaultStore ??= createSeatCredentialStore();
  return defaultStore;
}
