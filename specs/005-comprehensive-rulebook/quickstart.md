# Quickstart: Comprehensive In-Game Rulebook

Date: 2026-07-15

## Prerequisites

- Node.js 22 or later.
- pnpm 11.7.0.
- Dependencies installed with `pnpm install --frozen-lockfile`.
- Work from the feature worktree containing `specs/005-comprehensive-rulebook`.

## Focused TDD Commands

### Content, localization, icons, and component semantics

```powershell
pnpm vitest run test/domain/rulebookUi.test.ts test/domain/localization.test.ts test/domain/resourcePresentation.test.ts test/domain/frontendAccessibility.test.ts
```

### Production build

```powershell
pnpm build
```

### Dedicated browser behavior

```powershell
pnpm exec playwright test test/e2e/rulebook.spec.ts --project=local-preview
```

## Manual Check

1. Run `pnpm dev` and enter Local Game.
2. Open Rulebook and confirm Quick Start is selected.
3. Read Quick Start through objective, setup, turn, robber, and victory sections; confirm both examples are present.
4. Use mouse/touch to open Base Rules, Commerce Guild, and Quick Reference.
5. Focus a chapter tab and verify Left/Right wrap, Home selects Quick Start, and End selects Quick Reference.
6. While Base Rules is selected, change the rulebook language to Simplified Chinese; confirm the selected chapter remains Base Rules and all visible content retranslates.
7. Inspect build costs and terrain/resource rows; confirm shared icons have complete localized accessible names.
8. Scroll Quick Reference to its final input/scroll guidance without losing the title, close control, or chapter tabs.
9. Close with Escape; confirm focus returns to Open rulebook. Reopen and confirm Quick Start is selected again.
10. Repeat at 390x844; confirm the page does not scroll horizontally, the tab strip is bounded, and the chapter body reaches its end.

## Full Feature Gates

Run separately and copy current output into `verification.md`:

```powershell
pnpm test
pnpm test:e2e
pnpm build
pnpm smoke:ui
rg -n '"dialog\.rule[1-4]"' src
git diff b357b51 -- src/domain src/online worker package.json pnpm-lock.yaml
git diff --check
```

The two repository guards must return no matches/diff. Worker-only gates are not required because the feature is forbidden from changing Worker, protocol, persistence, or projections.
