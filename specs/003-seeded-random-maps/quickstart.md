# Quickstart: Seeded Random Maps Verification

Status: Planned manual verification path

## Prerequisites

- Node.js 22 or newer.
- pnpm 11.7.0 through Corepack.
- Repository worktree on `codex/seeded-random-maps`.
- Dependencies installed with `pnpm install --offline` when the local pnpm store is already populated.

## Focused Development Commands

Run from the feature worktree:

```powershell
pnpm vitest run test/domain/mapSeed.test.ts test/domain/randomBoard.test.ts
pnpm vitest run test/domain/matchTransition.test.ts test/domain/setupInteraction.test.ts
pnpm vitest run test/online/protocol.test.ts test/online/projectionPrivacy.test.ts test/online/onlineGameUi.test.ts
pnpm exec vitest run --config vitest.worker.config.ts test/worker/roomMigration.test.ts test/worker/roomRestart.test.ts
```

## Local Manual Path

1. Run `pnpm dev` and open the printed local URL.
2. Select Local Game.
3. Confirm the first state is setup with four current default names, no buildings/roads/resources, and the first settlement target active.
4. Open Settings and confirm a canonical `M1-` seed is visible and selectable.
5. Copy the seed and confirm localized success feedback.
6. Record terrain, number, and port positions; choose Replay Current Map and complete confirmation if shown.
7. Confirm the seed and complete public board are unchanged while setup/game/Commerce Guild state is reset.
8. Choose New Random Map and confirm a different seed and layout appear in empty setup.
9. Deny or stub clipboard access; confirm failure feedback appears while the seed remains selectable and both restart controls still work.
10. Switch Settings to Simplified Chinese and repeat the copy/restart labels and status checks.

## Online Manual Path

1. Run `pnpm dev:worker --config wrangler.e2e.jsonc --port 8799 --persist-to .wrangler/state/manual-seeded-map`.
2. Open three isolated browser contexts at `http://127.0.0.1:8799`.
3. Create a room, join with two other names, mark every seat ready, and start as host.
4. Confirm all contexts display the same canonical seed and reconstructed terrain/numbers/ports.
5. Confirm non-host settings expose the seed/copy control but no enabled restart action.
6. From the host, choose Replay Current Map and confirm the inline warning.
7. Confirm all contexts converge to one incremented room version, empty setup, and the same seed/layout.
8. Progress at least one placement or action, then choose New Random Map as host.
9. Confirm all contexts converge to another single version with a different M1 seed and identical new layout.
10. Attempt a direct non-host `room.restart` message in the automated/adversarial path; verify `COMMAND_NOT_ALLOWED` and no room mutation.
11. Finish or prepare a game-over state in automated coverage and confirm host restart remains available there.

## Legacy Migration Path

Use `test/worker/roomMigration.test.ts` rather than manually modifying production storage:

- valid v1 lobby becomes v2 with no match seed until start;
- exact v1 fixed playing/finished room receives `M0-STANDARD` without gameplay reset;
- one changed terrain, number, edge, port, or reference rejects migration;
- unsupported/malformed v2 seed rejects load;
- rejected migration leaves the raw storage value byte-equivalent.

## Completion Gate

```powershell
pnpm test
pnpm test:worker
pnpm test:e2e
pnpm build
pnpm build:worker
pnpm smoke:ui
pnpm smoke:worker
pnpm exec wrangler deploy --dry-run --config wrangler.jsonc
git diff --check
```

Before handoff, verify `rg -n "createDemoGame" src worker` returns no matches and `rg -n "boardLayout.*standard-v1" src worker test` returns no active production/protocol matches.
