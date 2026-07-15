# Handoff: Comprehensive In-Game Rulebook

Date: 2026-07-15
Branch: `codex/gathering-cooldowns-icons`
Worktree: `C:\Study\Catan\.worktrees\integration-seeded-random-maps`
Status: Verified and ready for integration

## Commit sequence

- `b357b51` — `docs: specify comprehensive in-game rulebook`
- `6ce6550` — `docs: plan comprehensive in-game rulebook`
- `a31f50c` — `feat: add bilingual rulebook chapters`
- `f4f9571` — `feat: add accessible in-game rulebook`
- `docs: verify comprehensive in-game rulebook` — this handoff/verification commit; use the branch HEAD after commit

## Implemented scope

- Replaced the four abbreviated rules with Quick Start, Base Rules, Commerce Guild, and Quick Reference chapters.
- Added complete equivalent English and Simplified-Chinese copy, concrete first-game examples, exact base/expansion rules, common misunderstandings, blockers, and input guidance.
- Reused authoritative build costs and the existing resource icon/accessible-name system.
- Added an accessible native tab interface with wrapped Arrow navigation, Home/End, roving focus, active-panel relationships, scroll reset, and Quick Start reset on reopen.
- Added live session-language switching that retains the selected chapter and changes the dialog/title/content accessible text together.
- Kept title, close control, and chapter controls available while the body scrolls internally.
- Added scoped desktop/mobile styling and a dedicated five-case Rulebook Playwright suite.

## Unchanged systems

- Domain state and gameplay transitions
- Setup, building, trade, robber, development-card, scoring, and Commerce Guild rules
- Online protocol, Worker behavior, persistence, projections, and privacy model
- Dependencies, package manifest, and lockfile
- Settings/Info dialog behavior and existing action-phase guidance

The guard `git diff b357b51 -- src/domain src/online worker package.json pnpm-lock.yaml` is empty.

## Key files and interfaces

- `src/ui/rulebook/messages.ts` — feature-local bilingual catalog.
- `src/ui/rulebook/RulebookContent.tsx` — `rulebookChapterIds`, `RulebookChapterId`, and static `RulebookChapterContent({ chapter })`.
- `src/ui/rulebook/RulebookPanel.tsx` — prop-free navigation/language/scroll owner.
- `src/ui/UtilityDialog.tsx` — unchanged modal lifecycle with one Rulebook delegation and modifier class.
- `src/styles/app.css` — `.modal-card--rulebook` and `.rulebook-*` styles only for this feature.
- `test/domain/rulebookUi.test.ts` — nine component/content/boundary tests.
- `test/e2e/rulebook.spec.ts` — five dedicated real-browser cases.
- `specs/005-comprehensive-rulebook/verification.md` — RB-001–RB-054 evidence map and fresh gate output.

## Verification summary

- Focused: 4 files / 43 tests passed.
- Main Vitest: 37 files / 511 tests passed.
- Dedicated Rulebook Playwright: 5 tests passed.
- Full Playwright: 2 projects / 60 tests passed.
- Production build: passed, 1628 modules transformed.
- UI smoke: passed.
- Obsolete-key, unresolved-artifact, forbidden-boundary, and whitespace guards: passed.
- Rendered 1280×768 and 390×844 English/Chinese review: no P0/P1 visual issue.

## Review and convergence

- Whole-feature review: Critical 0, Important 0, unresolved Minor 0.
- Artifact analysis: CRITICAL 0, HIGH 0, MEDIUM 0, LOW 1 accepted.
- Requirement convergence: 54/54 mapped and satisfied; no additional task required.

## Residual risk

LOW L-001: ratios, award thresholds, and some Commerce Guild values remain tested explanatory literals instead of a new presentation constants API. If gameplay values change later, the focused content assertions must be updated with the rulebook.

## Exact integration next action

Review the branch HEAD containing `docs: verify comprehensive in-game rulebook`, then integrate `codex/gathering-cooldowns-icons` through the repository's chosen merge or pull-request path. No push, merge, deployment, or worktree cleanup has been performed by this task.
