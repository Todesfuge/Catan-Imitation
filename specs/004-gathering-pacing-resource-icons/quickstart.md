# Quickstart: Gathering Pacing, Setup Grants, and Resource Icons

Date: 2026-07-14

## Prerequisites

- Node.js 22 or later.
- pnpm 11.7.0.
- Dependencies installed with `pnpm install --frozen-lockfile`.
- Work from the feature worktree/branch containing `specs/004-gathering-pacing-resource-icons`.

## Focused TDD Commands

### Gathering cooldown domain

```powershell
pnpm vitest run test/domain/gatheringCooldown.test.ts test/domain/actionAvailability.test.ts test/domain/matchTransition.test.ts
```

### Second-settlement setup grant

```powershell
pnpm vitest run test/domain/setupInteraction.test.ts test/domain/coreRulesBacklog.test.ts test/domain/ruleIntegrity.test.ts
```

### Online projection and protocol

```powershell
pnpm vitest run test/online/protocol.test.ts test/online/projectionPrivacy.test.ts test/online/onlineGameUi.test.ts test/online/onlineClient.test.ts
```

### Worker migration and authority

```powershell
pnpm exec vitest run --config vitest.worker.config.ts test/worker/gatheringMigration.test.ts test/worker/gatheringAuthority.test.ts
```

### Resource presentation

```powershell
pnpm vitest run test/domain/resourcePresentation.test.ts test/domain/playerTradeUi.test.ts test/domain/productPolish.test.ts test/domain/frontendAccessibility.test.ts test/domain/gameTableView.test.ts test/domain/localization.test.ts
```

## Manual Local Check

1. Run `pnpm dev`.
2. Enter Local mode and finish snake-order setup.
3. Confirm the first settlement grants nothing and the second grants one card per adjacent producing hex.
4. Confirm the Commerce Guild shows one table cooldown badge: `2n` at formal-play start.
5. Complete the required turns, roll into the normal action phase, and start a gathering.
6. Confirm the value is `n` before and after ending the initiating turn, then reaches zero after `n` subsequent completed player turns.
7. Inspect hands, bank, build costs, trades, Commerce Guild, decisions, statistics, ports, and hexes in English and Chinese.
8. Confirm no terrain word or abbreviation is visibly printed on a hex; desert has no resource icon.

## Manual Online Check

1. Run the Worker/local online stack using the repository's current Online quickstart.
2. Connect at least two isolated browser contexts to one room.
3. Confirm both contexts display the same cooldown value.
4. Confirm only the current authenticated player in normal action phase can start a ready gathering.
5. Send a direct command containing `playerId`; confirm strict protocol rejection and no room-version change.
6. Reconnect one context and confirm the same public cooldown and correct caller-specific availability.

## Full Release Gates

Run each command separately and record current output in `verification.md` during the final task:

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
