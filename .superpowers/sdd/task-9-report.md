# Task 9 (T009) Report — Security and HTTP Helpers

## Status

Implemented anonymous seat credentials, one-time ticket issuance data, bounded HTTP JSON,
strict Bearer parsing, production/local origin checks, and stable safe JSON errors.

## Red/Green Evidence

- RED 1: `pnpm test:worker -- test/worker/security.test.ts` exited 1 because
  `worker/crypto.ts` did not exist.
- GREEN 1: the focused security suite passed 12/12 after the minimal helper implementation.
- RED 2: the Worker smoke suite failed on the old health body and old unsafe API error shape.
- GREEN 2: the smoke and security suites passed 16/16 after the Worker entrypoint became a
  thin caller of the HTTP helpers.
- Build debugging: the first `pnpm build:worker` exposed the generated Workers type
  requirement that `TextDecoderConstructorOptions` include `ignoreBOM`. Adding
  `ignoreBOM: false` preserved strict UTF-8 decoding and made the original command pass.

## Implementation

- `worker/crypto.ts`
  - Uses Workers `crypto.getRandomValues` with exactly 32 bytes for seat tokens and tickets.
  - Allows a byte-filling dependency to be injected in tests without replacing the secure
    production default.
  - Encodes plaintext and SHA-256 digests as unpadded base64url.
  - Provides a comparison that evaluates every position and folds in length differences.
  - Issues ticket data with `ticket`, `ticketHash`, and exact `expiresAt = now + 30_000`;
    storage and atomic consumption remain deferred to T010/T011.
- `worker/http.ts`
  - Reads request streams with a 16 KiB UTF-8 byte ceiling, rejects before retaining bytes
    beyond the bound, decodes strict UTF-8, and accepts JSON objects only.
  - Parses only `Bearer` plus a 43-character base64url credential.
  - Accepts exact same-origin requests. Cross-port HTTP loopback origins are allowed only
    when the request target is also loopback; missing, wildcard, malformed, and production
    cross-origin values are rejected.
  - Emits `application/json; charset=utf-8` and stable `{ error: { code, params,
    retryable } }` bodies. Unknown exceptions become generic `INTERNAL_ERROR` and do not
    serialize messages or stacks.
- `worker/index.ts`
  - Remains a thin integration boundary. Health now follows protocol schema version 1 and
    unknown API paths use a stable safe error response.

No room persistence, ticket consumption, rate limiter, WebSocket behavior, React code, or
match dispatcher randomness was added. No catch-all file gained business logic and no
duplicate implementation path was created.

## Verification

- `pnpm test:worker -- test/worker/security.test.ts` — 12/12 passed.
- `pnpm test:worker` — 16/16 passed.
- `pnpm test` — 215/215 passed across 27 files.
- `pnpm build:worker` — passed.
- `pnpm build` — passed.
- `git diff --check` — passed; Git reported only the repository's line-ending conversion
  notices for existing tracked files.

## Concerns

- Workers Vitest still reports the known Windows Miniflare temporary-directory `EBUSY`
  cleanup warning after passing runs. It remains visible and does not change the exit code.
- Ticket storage and atomic single-use consumption intentionally remain for T010/T011.
