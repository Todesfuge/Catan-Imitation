# Implementation Plan: Comprehensive In-Game Rulebook

Date: 2026-07-15
Branch: `codex/gathering-cooldowns-icons`
Specification: `specs/005-comprehensive-rulebook/spec.md`
Research: `specs/005-comprehensive-rulebook/research.md`

> **Agentic worker note:** Execute `tasks.md` in order with test-first RED/GREEN evidence. Use the Spec Kit task list as the only durable execution source. No subagent execution is assumed or required.

## Goal

Replace the four-bullet modal help with a complete, bilingual, accessible in-game rulebook that teaches a first game, documents base and Commerce Guild rules, and remains quick to navigate on desktop and mobile without changing gameplay.

## Architecture

`UtilityDialog` remains the generic modal and focus owner. A bounded `src/ui/rulebook/` feature owns chapter navigation, explicit chapter markup, and its bilingual message catalog while continuing to use the existing i18n context. Static content imports only stable rule constants and shared resource presentation; it receives no game state and dispatches no game command.

The rulebook-specific modal class creates a wider flex column whose header and tab toolbar remain visible while only the active panel scrolls. Native button tabs and a native language selector provide the requested keyboard, touch, focus, and live-language behavior without a package or parallel localization system.

## Technology Stack

- TypeScript 5.7 and React 18.
- Existing `useI18n` context and inferred `MessageKey` catalog.
- Existing `ResourceIcon`, `ResourceBadge`, and `ResourceBundle` components.
- Existing pure-domain `buildCosts` export.
- Native HTML `<dialog>`, buttons, select, and ARIA tab semantics.
- Existing CSS design tokens in `src/styles/app.css`.
- Vitest 2 server-rendered component/content tests.
- Playwright 1.61 Local-preview browser tests.

## Global Constraints

- English remains the default; all rulebook-visible and accessible copy has equivalent Simplified Chinese.
- Exactly four chapters appear in order: Quick Start, Base Rules, Commerce Guild, Quick Reference.
- Every open starts on Quick Start; locale changes while open retain the selected chapter.
- The rulebook remains static by player, phase, hand, Local/Online mode, and connection state.
- Do not pass `GameTableView` or dispatch functions into the rulebook.
- Do not add Markdown, JSON loaders, remote content, routes, services, packages, or a second localization preference.
- Do not calculate legality or duplicate action-availability logic.
- Reuse `buildCosts` for cost values and `ResourceBundle`/`ResourceIcon` for resource visuals.
- Keep natural-language terrain/resource names in prose; icons supplement compact facts and retain localized accessible names.
- Preserve utility-dialog Escape handling, close-button initial focus, and opener focus restoration.
- Keep Settings and Info modal layout/scrolling unchanged.
- Keep feature E2E coverage out of `test/e2e/frontend-recovery.spec.ts`, currently over 1,800 lines.
- Follow TDD: observe a focused failing test before each production behavior, implement the smallest passing change, then run broader gates.
- Do not modify domain state, commands, protocol, Worker, persistence, projections, package manifests, or lockfiles.

## Constitution Check

| Principle | Plan response |
| --- | --- |
| Playable core before decorative completeness | The rulebook explains already-playable behavior and introduces no decorative asset work. |
| Pure game rules, thin UI | React renders static copy and imports authoritative values; it contains no rule transition or legality calculation. |
| High cohesion, low coupling | Dialog lifecycle, rulebook navigation, rulebook content, translations, and domain values retain distinct owners. |
| Traceable delivery | RB-001 through RB-054 map to tasks and final evidence artifacts. |
| Time-boxed scope control | No dependency, route, service, protocol, or gameplay change is planned. |

No constitution exception is required.

## Minimalism Decision

| Question | Decision |
| --- | --- |
| Lowest adequate rung | Reuse local components/context/constants and native browser controls, then add direct bounded feature files. |
| New dependency | None. |
| New abstraction | No generic manual engine; explicit chapter components only. |
| Localization | One new catalog object spread into the existing translator. |
| State | One component-local `RulebookChapterId`; no persisted or game state. |
| Styling | Rulebook modifier/classes in the existing stylesheet; existing tokens only. |
| Testing | Existing SSR pattern plus existing Playwright stack; no jsdom/testing-library. |

## Boundary-First Gate

| Boundary | Existing owner | Risk | Planned net effect | Narrow proof |
| --- | --- | --- | --- | --- |
| Modal lifecycle/focus | `src/ui/UtilityDialog.tsx` | Feature logic could turn it into a catch-all | Replace four bullets with one import and one modifier class only | existing focus E2E + new rulebook E2E |
| Chapter navigation | new `RulebookPanel.tsx` | Keyboard behavior could scatter through dialog/CSS | One local state machine and one tab-ref collection | dedicated Playwright keyboard cases |
| Long-form content | new `RulebookContent.tsx` | Generic data renderer could become a second content framework | Four explicit chapter renderers and small presentational helpers | SSR topic/semantic tests |
| Translations | `src/ui/i18n.ts` plus new `messages.ts` | Central 574-line catalog could become harder to review | One spread import; all new copy stays beside feature | bilingual catalog parity test |
| Rule values/icons | `building.ts`, `ResourceBadge.tsx` | Literal duplication could drift | Import and render existing exports; create no second maps | rendered cost/icon assertions |
| Global styling | `src/styles/app.css` | Rulebook sizing could regress Settings/Info | Add only `.modal-card--rulebook`/`.rulebook-*` selectors | desktop/mobile browser containment |
| Browser coverage | new `test/e2e/rulebook.spec.ts` | 1,847-line recovery suite could grow further | New dedicated feature file | targeted Local-preview run |

No existing facade gains business logic, and no duplicate rules, locale store, icon map, runner, or parser is created.

## Responsibility and File Map

### Bilingual content and static rendering

- Create `src/ui/rulebook/messages.ts`: all `rulebook.*` English/Simplified-Chinese labels, headings, instructions, examples, misunderstandings, reference labels, and input guidance.
- Modify `src/ui/i18n.ts`: import and spread `rulebookMessages`; delete obsolete `dialog.rule1` through `dialog.rule4` after consumers are removed.
- Create `src/ui/rulebook/RulebookContent.tsx`:
  - export `rulebookChapterIds` and `RulebookChapterId`;
  - render one explicit chapter for each id;
  - use semantic headings, ordered/unordered lists, examples, compact fact/cost rows, and final sentinel;
  - import `buildCosts`, `resources`, and shared resource components;
  - receive only `{ chapter: RulebookChapterId }`.
- Create `test/domain/rulebookUi.test.ts`: bilingual message parity, required topic coverage, all chapter SSR, exact rendered build costs, resource accessibility, no raw keys, and static component contract.

### Accessible navigation and dialog integration

- Create `src/ui/rulebook/RulebookPanel.tsx`:
  - initialize `activeChapter` to `"quickStart"`;
  - render one tablist with stable ids and roving tab index;
  - render the language selector from the existing i18n context after the tablist in DOM order;
  - handle Left/Right with wrapping and Home/End with automatic selection/focus;
  - reset the shared panel scroll position to the top when a different chapter is selected;
  - render one `RulebookChapterContent` panel.
- Modify `src/ui/UtilityDialog.tsx`:
  - import `RulebookPanel`;
  - apply `modal-card--rulebook` only for the rulebook;
  - replace the four-item list with the panel;
  - leave dialog effects, callbacks, Settings, and Info unchanged.
- Modify `src/styles/app.css`:
  - wider bounded rulebook card;
  - fixed header/toolbar and internally scrolling panel;
  - tab selected/hover/focus states with non-color indicators;
  - readable headings, lists, examples, facts, and cost rows;
  - `min-width: 0`, wrapping, and bounded tab-strip overflow;
  - 390-pixel/touch containment without changing generic modal rules.
- Extend `test/domain/rulebookUi.test.ts`: exact tab order, default selection, ids/relationships, one visible panel, language control semantics, and CSS contract.

### Real-browser behavior and delivery evidence

- Create `test/e2e/rulebook.spec.ts`:
  - Local entry helper only;
  - pointer tab selection and one visible panel;
  - Arrow wrapping plus Home/End focus/selection;
  - live English/Chinese switch retaining the selected chapter;
  - Escape close, focus restoration, and reopen reset to Quick Start;
  - scroll final chapter to its sentinel by wheel/keyboard/programmatic observation;
  - desktop and 390x844 containment, bounded tab overflow, internal body overflow, and visible close/navigation controls.
- Create `specs/005-comprehensive-rulebook/verification.md` only from fresh command output.
- Create `specs/005-comprehensive-rulebook/handoff.md` only after convergence and review.

## Component Interfaces

```ts
export const rulebookChapterIds = [
  "quickStart",
  "baseRules",
  "commerceGuild",
  "quickReference"
] as const;

export type RulebookChapterId = (typeof rulebookChapterIds)[number];

export function RulebookChapterContent({
  chapter
}: {
  chapter: RulebookChapterId;
}): React.JSX.Element;

export function RulebookPanel(): React.JSX.Element;
```

`RulebookPanel` has no props. `RulebookChapterContent` consumes only a closed chapter id. Both obtain locale/copy from the existing `useI18n` context; neither receives or mutates game state.

## Key UI Flows

### Open and reopen

```text
Rulebook opener receives click
  -> GameTable utilityPanel = "rulebook"
  -> UtilityDialog mounts and captures opener
  -> RulebookPanel mounts with activeChapter = quickStart
  -> close button receives focus
  -> Escape/close unmounts dialog and panel
  -> opener regains focus
  -> next open creates a fresh quickStart state
```

### Keyboard chapter navigation

```text
Tab from close control
  -> first selected tab (Quick Start)
Left/Right
  -> prevent page scroll
  -> wrap chapter index
  -> set active chapter
  -> move focus to selected tab
Home/End
  -> select/focus first or last tab
```

### Live locale change

```text
Rulebook language select changes
  -> existing setLocale updates session locale/storage
  -> I18nProvider rerenders labels and active body
  -> RulebookPanel local activeChapter is unchanged
```

### Rule-value rendering

```text
buildCosts.<kind>
  -> ResourceBundle
  -> shared resource order, icon mapping, quantity formatting
  -> localized accessible bundle name
```

## Content Correctness Baseline

Implementation copy and tests must reflect these current authoritative facts:

- Costs: road = wood 1 + brick 1; settlement = wood 1 + brick 1 + wool 1 + grain 1; city = grain 2 + ore 3; development card = wool 1 + grain 1 + ore 1.
- Maritime ratios: default 4:1, generic port 3:1, matching resource port 2:1.
- Development cards: Knight moves the robber and counts toward Largest Army; Road Building places up to two legal free roads; Year of Plenty takes up to two bank-available resources; Monopoly transfers every opponent card of one chosen resource; Victory Point remains hidden and scores 1. Non-victory cards cannot be played on their purchase turn, and at most one non-victory card may be played per turn.
- Scores: settlement 1, city 2, hidden victory-point card 1, Longest Road 2, Largest Army 2, Commerce Guild prize card 2; victory uses the target displayed by the game. Longest Road requires at least five connected owned roads, cannot continue through an opponent building, and preserves a tied current owner; Largest Army requires at least three played knights and changes owner only when another player strictly exceeds the current owner.
- Rolling seven: every player holding more than seven resource cards discards exactly half rounded down before the active player moves the robber to a different hex and, when eligible, steals one random resource from an adjacent opponent.
- Setup: snake order; settlement then connected road; only the second settlement grants one resource per adjacent producing hex.
- Commerce Guild default slots: two wood for two tokens; one brick plus one grain for three tokens; one ore for two tokens; a player completes at most one slot per turn and the used slot refreshes.
- Gathering: initial table cooldown `2n`; post-start cooldown `n` excluding the initiating turn; current player, normal action phase, no pending player trade, idle gathering, and zero remaining are required.
- Redemption: one token per resource, maximum four resources per player per gathering, limited by bank stock.
- Auction: three sealed rounds; positive affordable bids compete; turn order breaks equal bids; zero/no-bid rounds advance and the third completes; no eligible token holder skips directly to complete.
- Blind box: resources, voucher, or development card; three vouchers redeem one prize card.

## Verification Strategy

### Focused RED/GREEN evidence

```powershell
pnpm vitest run test/domain/rulebookUi.test.ts test/domain/localization.test.ts test/domain/resourcePresentation.test.ts
pnpm build
pnpm exec playwright test test/e2e/rulebook.spec.ts --project=local-preview
```

### Final gates

Run separately and record current output in `verification.md`:

```powershell
pnpm test
pnpm test:e2e
pnpm build
pnpm smoke:ui
rg -n '"dialog\.rule[1-4]"' src
git diff b357b51 -- src/domain src/online worker package.json pnpm-lock.yaml
git diff --check
```

Expected guard results:

- obsolete four-bullet message keys: zero matches;
- domain/Online/Worker/package/lockfile diff since the approved spec commit: empty;
- whitespace errors: none.

## Review Checkpoints

1. Bilingual content completeness and factual baseline before dialog integration.
2. Static semantics and authoritative cost/icon reuse before interactive styling.
3. Pointer/keyboard/language/reopen behavior before responsive browser checks.
4. Desktop/mobile scroll and focus evidence before full regression gates.
5. Whole-feature review and RB-001–RB-054 convergence before completion claims.

## Non-Applicable Spec Kit Artifacts

- `data-model.md`: not created because the feature adds no domain, persisted, protocol, or application data model.
- `contracts/`: not created because the feature adds no public API, Worker command, schema, route, or component contract crossing feature boundaries beyond the interfaces documented above.

## Delivery Sequence

- T001: bilingual chapter content and correctness tests.
- T002: accessible navigation, dialog integration, responsive styling, and dedicated browser behavior.
- T003: full verification, review, convergence, evidence, and handoff.

The user-facing MVP requires T001 and T002 together; T003 makes the result merge-ready.
