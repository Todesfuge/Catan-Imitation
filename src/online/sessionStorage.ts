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
  save(credential: SeatCredential): boolean;
  remove(roomCode: string): void;
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
  return {
    load(roomCode) {
      const normalizedRoomCode = normalizeRoomCode(roomCode);
      if (!ROOM_CODE_PATTERN.test(normalizedRoomCode) || !storage) return undefined;
      const key = seatCredentialStorageKey(normalizedRoomCode);
      try {
        const serialized = storage.getItem(key);
        if (serialized === null) return undefined;
        const credential = credentialAt(JSON.parse(serialized) as unknown, normalizedRoomCode);
        if (credential) return credential;
        try { storage.removeItem(key); } catch { /* unavailable storage remains a safe miss */ }
      } catch {
        try { storage.removeItem(key); } catch { /* unavailable storage remains a safe miss */ }
      }
      return undefined;
    },
    save(credential) {
      const normalizedRoomCode = normalizeRoomCode(credential.roomCode);
      const safeCredential = credentialAt(
        { ...credential, roomCode: normalizedRoomCode },
        normalizedRoomCode
      );
      if (!ROOM_CODE_PATTERN.test(normalizedRoomCode) || !safeCredential || !storage) return false;
      try {
        storage.setItem(seatCredentialStorageKey(normalizedRoomCode), JSON.stringify(safeCredential));
        return true;
      } catch {
        return false;
      }
    },
    remove(roomCode) {
      if (!storage) return;
      try { storage.removeItem(seatCredentialStorageKey(roomCode)); } catch { /* best-effort cleanup */ }
    }
  };
}
