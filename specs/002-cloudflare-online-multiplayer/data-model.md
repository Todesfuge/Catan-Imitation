# Data Model: Cloudflare Online Multiplayer

Date: 2026-07-11

## Shared Match State

```ts
interface MatchState {
  game: GameState;
  guild: CommerceGuildState;
  lastDice: DiceRoll | null;
  pendingPlayerTrade?: PlayerTradeOffer;
}
```

`MatchState` contains only synchronized rule state. Locale, selected statistics query, modal state, connection status, browser notices, and board interaction mode are not part of it.

## Room Lifecycle

```ts
type RoomLifecycle = "lobby" | "playing" | "finished" | "expired";
```

Allowed transitions:

- `lobby -> playing`: host starts with three or four ready seats.
- `playing -> finished`: shared match reaches `gameOver`.
- `lobby|playing|finished -> expired`: 24-hour alarm finds no open WebSockets and retention elapsed.
- `expired` has no outgoing transition.

## Persisted Seat

```ts
interface PersistedSeat {
  seatId: string;
  playerId?: PlayerId;
  nickname: string;
  normalizedNickname: string;
  tokenHash: string;
  joinedAt: number;
  joinOrder: number;
  ready: boolean;
  acceptedCommandIds: Array<{
    commandId: string;
    resultingVersion: number;
  }>;
}
```

- `playerId` is assigned when the match starts.
- `tokenHash` is base64url SHA-256 output; plaintext never persists.
- The command ID list retains at most 64 items per seat.

## Persisted Room

```ts
interface PersistedRoom {
  schemaVersion: 1;
  roomCode: string;
  lifecycle: Exclude<RoomLifecycle, "expired">;
  createdAt: number;
  lastActivityAt: number;
  expiresAt: number;
  hostSeatId: string;
  nextJoinOrder: number;
  roomVersion: number;
  seats: PersistedSeat[];
  matchState?: MatchState;
  connectionTickets: ConnectionTicket[];
  pendingAuction?: PendingSealedAuction;
}
```

Invariants:

- Lobby has no `matchState`; playing/finished has one.
- Lobby has 1–4 seats; playing/finished has exactly 3 or 4 locked seats.
- `hostSeatId` references a lobby seat. It has no gameplay authority after start.
- `expiresAt = lastActivityAt + 24 hours` after each valid activity.
- `roomVersion` increases exactly once per accepted mutation.

## Connection Ticket

```ts
interface ConnectionTicket {
  ticketHash: string;
  seatId: string;
  expiresAt: number;
}
```

Tickets expire after 30 seconds and are removed when consumed. Expired tickets are removed during room load and alarm processing.

## WebSocket Attachment

```ts
interface ConnectionAttachment {
  seatId: string;
  connectionId: string;
  connectedAt: number;
}
```

The attachment is reconstructable and contains no seat token, ticket, bid, cards, or resources.

## Sealed Auction

```ts
interface PendingSealedAuction {
  round: number;
  bidsBySeatId: Record<string, number>;
}
```

Invariants:

- Exists only while the Commerce Guild gathering phase is `auction`.
- Bid is a whole number from zero through the seat player's current token count.
- A seat may replace its bid before all locked seats have submitted.
- Resolution clears the record before broadcasting the next snapshot.
- Bid values are never copied into public projections or diagnostic audit metadata.

## Public Projection

```ts
interface PublicPlayerView {
  playerId: PlayerId;
  nickname: string;
  color: string;
  resourceCardCount: number;
  developmentCardCount: number;
  visibleScore: number;
  guildTokens: number;
  vouchers: number;
  prizeCards: number;
  knightsPlayed: number;
}

interface PublicRoomState {
  roomCode: string;
  hostSeatId?: string;
  seats: PublicSeatView[];
  game?: PublicGameView;
  guild?: PublicGuildView;
  submittedBidSeatIds: string[];
}
```

`PublicGameView` includes board/turn/bank/building/road/robber/public-trade/log state but contains no full `Player`, raw development deck, or opponent-private pending choice.

## Private Projection

```ts
interface PrivateSeatState {
  seatId: string;
  playerId?: PlayerId;
  seatTokenPresent: true;
  resources?: ResourceMap;
  developmentCards?: DevelopmentCard[];
  ownPendingBid?: number;
  requiredDecision?: RequiredDecision;
}
```

The server does not echo the actual seat token. `seatTokenPresent` only tells the UI that the authenticated session is valid.

## Client-only State

```ts
type ConnectionStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "offline"
  | "expired"
  | "incompatible";

interface OnlineClientState {
  status: ConnectionStatus;
  snapshot?: RoomSnapshot;
  notice?: ProtocolError;
  retryAttempt: number;
}
```

No client-only state is sent back as authoritative match state.
