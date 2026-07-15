# Tasks: Comprehensive In-Game Rulebook

Date: 2026-07-15
Branch: `codex/gathering-cooldowns-icons`
Specification: `specs/005-comprehensive-rulebook/spec.md`
Plan: `specs/005-comprehensive-rulebook/plan.md`

Execution rules:

- Complete tasks in order; T001 and T002 change production behavior and require observed RED before GREEN.
- Mark a checkbox `[x]` only after the named command or inspection has fresh evidence.
- Keep commits reviewable at the task boundary; do not combine T001 and T002 into one commit.
- Do not edit domain, Online, Worker, persistence, package, or lock files.
- Do not append rulebook coverage to `test/e2e/frontend-recovery.spec.ts`.

## Task 1 — T001: Bilingual chapter content and authoritative static rendering

Requirements: RB-001, RB-003–RB-039, RB-041, RB-049–RB-052

Review boundary: complete English/Chinese rules, explicit semantic chapter bodies, authoritative cost/icon reuse, and no game-state dependency. No dialog navigation or CSS interaction yet.

Files:

- Create `test/domain/rulebookUi.test.ts`.
- Create `src/ui/rulebook/messages.ts`.
- Create `src/ui/rulebook/RulebookContent.tsx`.
- Modify `src/ui/i18n.ts`.

Interfaces produced:

```ts
export const rulebookMessages: Record<
  `rulebook.${string}`,
  { readonly en: string; readonly "zh-CN": string }
>;

export const rulebookChapterIds: readonly [
  "quickStart",
  "baseRules",
  "commerceGuild",
  "quickReference"
];

export type RulebookChapterId = (typeof rulebookChapterIds)[number];

export function RulebookChapterContent(props: {
  chapter: RulebookChapterId;
}): React.JSX.Element;
```

Implement the catalog object with `as const satisfies` the shown record shape so literal keys remain part of the existing `MessageKey` union.

Steps:

- [x] Create `test/domain/rulebookUi.test.ts` with a `renderWithLocale(node, locale)` helper using `I18nProvider` and `renderToStaticMarkup`, matching the repository's existing Node test environment.
- [x] Add a failing catalog test that iterates every `rulebookMessages` entry and requires non-empty `en` and `zh-CN` values; require both `translate(locale, key)` calls to return content rather than the raw key.
- [x] Add a failing chapter-order/content test that expects `rulebookChapterIds` to equal `quickStart`, `baseRules`, `commerceGuild`, `quickReference` and renders each `RulebookChapterContent` in English and Chinese.
- [x] In the content test, assert Quick Start includes objective, all five terrain/resource pairs, snake setup, distance rule, second-settlement-only grant, roll/mandatory decisions/actions/end turn, rolling seven, robber, scoring, and concrete setup/turn examples.
- [x] Assert Base Rules includes road/settlement/city/development costs, production/bank shortage, connectivity/distance/city upgrade/piece stock, public player trade, 4:1/3:1/2:1 maritime trade, robber privacy, scoring, victory, and Common Misunderstandings.
- [x] Assert all five development-card effects are explicit: Knight moves the robber/counts for Largest Army; Road Building places up to two legal free roads; Year of Plenty takes up to two bank-available resources; Monopoly takes every opponent card of one chosen resource; Victory Point stays hidden and scores. Require the purchase-turn and one-non-victory-card-per-turn limits.
- [x] Assert scoring detail includes settlement/city/hidden-point/prize-card values, Longest Road's five-road minimum/opponent-building interruption/tie retention, Largest Army's three-knight minimum/strict takeover, and the configured target displayed by the game.
- [x] Assert rolling seven states the more-than-seven threshold, exact half rounded down, all owed discards before robber movement, move-to-a-different-hex requirement, eligible adjacent victim, and one random hidden resource theft.
- [x] Assert Commerce Guild includes all three current slot costs/rewards, refresh and once-per-turn use, token transfer, initial `2n`, post-start `n`, initiating-turn exclusion, action/current-player/pending-trade/idle authority, four-resource redemption cap, bank stock, three sealed rounds, replacement/affordability/privacy/tie resolution, resources/development/voucher outcomes, zero-token/no-bid completion, three-voucher prize redemption, and Common Misunderstandings.
- [x] Assert Quick Reference includes turn checklist, costs, terrain production, 4:1/3:1/2:1 ratios, score sources, disabled-action reasons, keyboard/touch/internal-scroll/mobile guidance, and a stable final sentinel.
- [x] Add a failing cost-rendering test that computes expected accessible bundle labels from `buildCosts.road`, `.settlement`, `.city`, and `.developmentCard`, then requires the Quick Reference markup to contain matching `ResourceBundle` output rather than copied text-only costs.
- [x] Add a failing icon-accessibility test that requires each resource icon/bundle to retain `data-resource-*`, localized `aria-label`, and non-color prose association with its terrain.
- [x] Run `pnpm vitest run test/domain/rulebookUi.test.ts`; expect RED because the catalog and content modules do not exist.
- [x] Create `src/ui/rulebook/messages.ts` with all `rulebook.*` labels, headings, paragraphs, ordered steps, examples, misunderstandings, fact labels, reference rows, language-control label, and final sentinel in English and Simplified Chinese.
- [x] Import `rulebookMessages` into `src/ui/i18n.ts` and spread it into the existing `messages` object before `MessageKey` is inferred; do not add another translate function, context, storage key, or locale type.
- [x] Create `src/ui/rulebook/RulebookContent.tsx` with the closed chapter-id tuple/type and four explicit semantic chapter renderers. Use headings, short paragraphs, ordered/unordered lists, example callouts, `<dl>`/compact groups where appropriate, and exactly one requested chapter per render.
- [x] Import `buildCosts` and render the four cost rows through `ResourceBundle`; import `resources`/`ResourceIcon` for terrain-resource relationships and keep full localized names in adjacent text.
- [x] Keep the component API static: no `GameTableView`, player id, phase, room, command, dispatch, target-score value, or action-availability prop/import.
- [x] Run `pnpm vitest run test/domain/rulebookUi.test.ts`; expect all new content/catalog/cost/icon tests GREEN.
- [x] Run `pnpm vitest run test/domain/localization.test.ts test/domain/resourcePresentation.test.ts`; expect existing i18n and single-icon-owner contracts GREEN.
- [x] Run `pnpm build`; expect TypeScript and Vite build GREEN with no untranslated/missing `MessageKey` error.
- [x] Run `rg -n "GameTableView|dispatch|useEffect|localStorage|sessionStorage" src/ui/rulebook/RulebookContent.tsx src/ui/rulebook/messages.ts`; expect no rulebook content state/game command/storage dependency.
- [x] Review English and Chinese chapter pairs side by side against RB-007–RB-038 and the authoritative baseline in `plan.md`; correct any missing or mismatched topic before commit.
- [x] Run `git diff --check`; expect no whitespace errors.
- [x] Commit `feat: add bilingual rulebook chapters`.

## Task 2 — T002: Accessible tabs, live language control, dialog integration, and responsive scrolling

Requirements: RB-001–RB-006, RB-039–RB-048, RB-052–RB-053

Review boundary: one accessible navigation owner wired through the existing modal, unchanged Settings/Info behavior, and dedicated desktop/mobile browser proof.

Files:

- Create `src/ui/rulebook/RulebookPanel.tsx`.
- Modify `src/ui/UtilityDialog.tsx`.
- Modify `src/styles/app.css`.
- Extend `test/domain/rulebookUi.test.ts`.
- Create `test/e2e/rulebook.spec.ts`.

Interface consumed/produced:

```ts
// consumes RulebookChapterId, rulebookChapterIds, RulebookChapterContent
export function RulebookPanel(): React.JSX.Element;
```

Steps:

- [x] Extend `test/domain/rulebookUi.test.ts` with a failing server-render test for one `role="tablist"`, four ordered `role="tab"` buttons, stable tab/panel ids, `aria-controls`/`aria-labelledby`, Quick Start `aria-selected="true"` and `tabIndex=0`, other tabs unselected and `tabIndex=-1`, one active `role="tabpanel"`, and one session-language select after the tablist in DOM order.
- [x] Add a failing source/CSS boundary test requiring `UtilityDialog` to delegate to `<RulebookPanel />`, apply `modal-card--rulebook` conditionally, contain no `dialog.rule1`–`dialog.rule4` consumer, and keep Settings/Info branches present.
- [x] Add CSS contract assertions for a wider rulebook-only card, column containment, internal `.rulebook-panel` vertical scrolling, bounded `.rulebook-tabs` horizontal scrolling, visible focus, non-color selected indication, and a max-640px containment rule.
- [x] Create `test/e2e/rulebook.spec.ts` with its own `openLocal` and `openRulebook` helpers; do not import or modify helpers in the large recovery spec.
- [x] Add a failing browser test that opens Rulebook, verifies Quick Start is selected, clicks Base Rules, verifies only its panel is visible and begins at scroll top, closes with Escape, checks focus returns to Open rulebook, reopens, and verifies Quick Start is selected again.
- [x] Add a failing keyboard browser test that focuses Quick Start, presses ArrowRight through chapters, verifies ArrowRight wrapping, ArrowLeft wrapping, Home to Quick Start, End to Quick Reference, and checks both selected state and focused tab after every move.
- [x] Add a failing live-language browser test that selects Base Rules, changes the in-rulebook session language to Simplified Chinese, verifies Chinese tab/body copy and unchanged selected chapter, then changes back to English.
- [x] Add failing desktop/mobile browser cases for 1280x768 and 390x844 that require document width within viewport, dialog within viewport, close button/tablist in viewport, body `scrollHeight > clientHeight`, final Quick Reference sentinel reachable, and no clipping/page-level horizontal overflow. On mobile, allow only the bounded tab strip to have horizontal overflow.
- [x] Run `pnpm vitest run test/domain/rulebookUi.test.ts`; expect RED on missing panel/integration/styles.
- [x] Run `pnpm build` and then `pnpm exec playwright test test/e2e/rulebook.spec.ts --project=local-preview`; expect RED because the four-bullet rulebook has no tabs/language control/internal scroll.
- [x] Create `src/ui/rulebook/RulebookPanel.tsx` with local `activeChapter = "quickStart"`, one ref per tab, one shared panel ref, a tablist before the native language select in DOM order, existing `locale`/`setLocale`, and one active `RulebookChapterContent`.
- [x] Implement a single chapter-selection path: set the chapter, reset the shared panel to scroll top, and optionally focus the selected tab. Left/Right calculate a wrapped index, Home selects index 0, End selects the last index, and handled keys call `preventDefault`; pointer selection uses the same path without stealing focus.
- [x] Give every tab/panel stable ids (`rulebook-tab-<id>`, `rulebook-panel-<id>`), correct ARIA relationships, roving tab index, and visible text labels from `rulebook.*` keys.
- [x] Modify `UtilityDialog.tsx` to import/render `RulebookPanel` and conditionally add `modal-card--rulebook`; do not change the dialog effect, `onCancel`, close button, opener restoration, restart flow, Settings, or Info.
- [x] Delete obsolete `dialog.rule1`–`dialog.rule4` messages from `src/ui/i18n.ts` after the old list consumer is gone.
- [x] Add scoped `.modal-card--rulebook` and `.rulebook-*` CSS using existing colors/tokens. Keep header/toolbar visible; make the active panel vertically scrollable; add focus/selected/hover/pressed distinctions; set `min-width: 0`, wrapping, and bounded tab-strip overflow.
- [x] At max 640px, keep the dialog inside its padded viewport, make tabs at least 44px high, contain the language control, and prevent chapter tables/cost rows/examples from widening the page.
- [x] Run `pnpm vitest run test/domain/rulebookUi.test.ts test/domain/frontendAccessibility.test.ts test/domain/localization.test.ts test/domain/resourcePresentation.test.ts`; expect all focused component/localization/accessibility tests GREEN.
- [x] Run `pnpm build`; expect TypeScript/Vite GREEN.
- [x] Run `pnpm exec playwright test test/e2e/rulebook.spec.ts --project=local-preview`; expect all dedicated pointer, keyboard, language, focus, scroll, and containment cases GREEN.
- [x] Run `pnpm smoke:ui`; expect the built Local UI smoke GREEN.
- [x] Manually inspect the actual Rulebook at 1280x768 and 390x844 in English and Chinese. Confirm headings are scannable, tab labels do not overlap, selected/focus states are distinct, resource icons are legible, and the final content is reachable.
- [x] Run `rg -n '"dialog\.rule[1-4]"' src`; expect zero matches.
- [x] Run `git diff b357b51 -- src/domain src/online worker package.json pnpm-lock.yaml`; expect no output.
- [x] Run `git diff --check`; expect no whitespace errors.
- [x] Commit `feat: add accessible in-game rulebook`.

## Task 3 — T003: Full verification, review, convergence, and handoff

Requirements: RB-001–RB-054

Review boundary: fresh whole-feature evidence and documentation only; production changes are allowed only for defects reproduced by these gates and must return through focused RED/GREEN.

Files:

- Update `specs/005-comprehensive-rulebook/tasks.md` checkboxes only after evidence.
- Create `specs/005-comprehensive-rulebook/verification.md`.
- Create `specs/005-comprehensive-rulebook/handoff.md`.
- Modify focused production/test files only if a gate reproduces an in-scope defect.

Steps:

- [ ] Review `spec.md`, `plan.md`, and completed T001/T002 diffs requirement by requirement; record the RB-001–RB-054 owner/test mapping in `verification.md`.
- [ ] Run `pnpm vitest run test/domain/rulebookUi.test.ts test/domain/frontendAccessibility.test.ts test/domain/localization.test.ts test/domain/resourcePresentation.test.ts`; record file/test counts and success.
- [ ] Run `pnpm exec playwright test test/e2e/rulebook.spec.ts --project=local-preview`; record dedicated test count and success.
- [ ] Run `pnpm test`; record exact main-suite file/test counts.
- [ ] Run `pnpm test:e2e`; record exact full browser-suite project/test counts.
- [ ] Run `pnpm build`; record successful TypeScript/Vite output.
- [ ] Run `pnpm smoke:ui`; record successful smoke output.
- [ ] Run `rg -n '"dialog\.rule[1-4]"' src`; record zero matches.
- [ ] Run `$pattern = '\[(' + 'TBD|TO' + 'DO)\]|PLACE' + 'HOLDER:'; Get-ChildItem specs/005-comprehensive-rulebook -Recurse -File | Select-String -Pattern $pattern`; record zero unresolved placeholders.
- [ ] Run `git diff b357b51 -- src/domain src/online worker package.json pnpm-lock.yaml`; record empty output proving no gameplay/network/dependency change.
- [ ] Run `git diff --check`; record no whitespace errors.
- [ ] Request a whole-feature code review covering content correctness, accessibility, focus lifecycle, responsive containment, localization parity, privacy, and boundary/minimalism constraints.
- [ ] Resolve every confirmed finding with a focused failing test first; rerun the affected focused command and all final gates changed by the fix.
- [ ] Perform the Spec Kit artifact analysis gate: verify every requirement maps to a task/evidence row, no task contradicts the approved static scope, no CRITICAL/HIGH finding remains, and any MEDIUM/LOW item is explicitly recorded.
- [ ] Perform convergence against the final application and `tasks.md`; append a new task rather than renumbering if any approved requirement remains unsatisfied.
- [ ] Create `handoff.md` with branch/commit list, implemented scope, unchanged systems, key files/interfaces, verification counts/commands, review result, convergence result, risks, and exact integration next action.
- [ ] Mark T003 complete only when all recorded evidence is current and no required work remains.
- [ ] Commit `docs: verify comprehensive in-game rulebook`.

## Requirement Coverage Matrix

| Requirement | Planned implementation/evidence |
| --- | --- |
| RB-001–RB-006 | T001 closed chapter model; T002 tab panel/default/reset/static integration |
| RB-007–RB-014 | T001 Quick Start bilingual content and SSR topic/example tests |
| RB-015–RB-022 | T001 Base Rules, authoritative costs, trade/dev/robber/scoring/misunderstanding tests |
| RB-023–RB-032 | T001 Commerce Guild complete flow, privacy, termination, and misunderstanding tests |
| RB-033–RB-038 | T001 Quick Reference rows, blockers, and operation guidance tests |
| RB-039–RB-041 | T001 catalog parity/icon semantics; T002 live session-language control |
| RB-042–RB-044 | T002 ARIA tabs, keyboard selection, Escape, and focus restoration browser evidence |
| RB-045–RB-048 | T002 internal scrolling, final reachability, 1280/390 containment, visible states |
| RB-049–RB-050 | T001 authoritative imports/baseline; T002/T003 domain/protocol/package no-diff guard |
| RB-051–RB-053 | T001 dedicated component/content coverage; T002 dedicated browser coverage |
| RB-054 | T003 focused/main/browser/build/smoke/guard/diff gates |

## MVP and Execution Order

- Content-complete increment: T001.
- User-facing MVP: T001 + T002.
- Merge-ready feature: T001 + T002 + T003.
