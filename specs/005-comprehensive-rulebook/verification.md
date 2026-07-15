# Verification: Comprehensive In-Game Rulebook

Date: 2026-07-15
Branch: `codex/gathering-cooldowns-icons`
Result: PASS — 54/54 requirements mapped; no required work remains

## Fresh verification evidence

| Gate | Command | Current result |
| --- | --- | --- |
| Focused component/localization/accessibility | `pnpm vitest run test/domain/rulebookUi.test.ts test/domain/frontendAccessibility.test.ts test/domain/localization.test.ts test/domain/resourcePresentation.test.ts` | PASS — 4 files, 43 tests |
| Dedicated Rulebook browser | `pnpm exec playwright test test/e2e/rulebook.spec.ts --project=local-preview` | PASS — 5 tests |
| Main suite | `pnpm test` | PASS — 37 files, 511 tests |
| Full browser suite | `pnpm test:e2e` | PASS — 2 projects, 60 tests in 2.2 minutes |
| Production build | `pnpm build` | PASS — TypeScript and Vite; 1628 modules transformed |
| Built UI smoke | `pnpm smoke:ui` | PASS — board, trade, localization, scrolling, and responsive CSS exposed |
| Obsolete rule keys | `rg -n '"dialog\.rule[1-4]"' src` | PASS — zero matches |
| Artifact placeholders | PowerShell placeholder scan from `tasks.md` | PASS — zero matches |
| Forbidden boundary diff | `git diff b357b51 -- src/domain src/online worker package.json pnpm-lock.yaml` | PASS — empty |
| Whitespace | `git diff --check` | PASS — no errors |

Build output: `dist/index.html` 0.41 kB; CSS 30.06 kB (gzip 7.15 kB); JavaScript 396.84 kB (gzip 121.82 kB).

## Evidence legend

- **Content SSR**: `test/domain/rulebookUi.test.ts` validates bilingual catalog parity, exact chapter order, required topics, examples, authoritative `buildCosts`, shared resource icons, static boundaries, ARIA tab markup, integration boundaries, and CSS contracts.
- **Focused regressions**: `frontendAccessibility.test.ts`, `localization.test.ts`, and `resourcePresentation.test.ts` protect the existing dialog, translator, and single icon owner.
- **Rulebook browser**: `test/e2e/rulebook.spec.ts` validates pointer selection, scroll reset, reopen reset, Escape/focus restoration, Arrow/Home/End behavior, live locale retention, desktop/mobile containment, internal scrolling, and the final sentinel.
- **Rendered review**: English/Simplified-Chinese screenshots at 1280×768 and 390×844 are stored in the private worklog evidence folder and passed Visual Polish Gates with no P0/P1 issue.
- **Full gates**: the complete Vitest and Playwright suites prove the feature did not regress local gameplay, recovery behavior, or authoritative Online/Worker flows.

## RB-001–RB-054 owner and evidence map

| Requirement | Implementation owner | Verification owner | Result |
| --- | --- | --- | --- |
| RB-001 | `RulebookContent.tsx` closed chapter tuple; `RulebookPanel.tsx` ordered tabs | Content SSR exact tuple and four-tab assertion | PASS |
| RB-002 | `RulebookPanel` initializes `quickStart` and unmounts with the dialog | Rulebook browser close/reopen case | PASS |
| RB-003 | `RulebookChapterContent` accepts only a chapter id | Content SSR forbidden-dependency guard; boundary diff | PASS |
| RB-004 | `RulebookPanel` renders one active `tabpanel` and one chapter | Content SSR active-panel assertion; pointer browser case | PASS |
| RB-005 | Four explicit semantic chapter renderers | Content SSR headings/topics/examples/list coverage | PASS |
| RB-006 | Static presentation imports constants/icons but no legality/state transition | Forbidden-dependency guard; domain diff empty | PASS |
| RB-007 | Quick Start objective and point-source copy | Quick Start bilingual topic/phrase assertions | PASS |
| RB-008 | `TerrainResourceRows` plus non-producing desert copy | Quick Start assertions and icon accessibility checks | PASS |
| RB-009 | Quick Start setup steps and setup example | Bilingual setup/topic assertions | PASS |
| RB-010 | Quick Start ordered normal-turn steps | Bilingual turn/topic assertions | PASS |
| RB-011 | Quick Start production and robber copy | Quick Start production/seven assertions | PASS |
| RB-012 | Quick Start seven/discard/robber/victim copy | Seven-sequence phrase assertions | PASS |
| RB-013 | Quick Start legal-action overview | Quick Start action coverage assertion | PASS |
| RB-014 | Explicit setup and normal-turn examples | Example topic and localized text assertions | PASS |
| RB-015 | `buildCosts` rendered through `ResourceBundle` | Computed accessible bundle-label assertions | PASS |
| RB-016 | Base Rules construction restrictions | Base Rules bilingual coverage assertion | PASS |
| RB-017 | Base Rules production/bank/desert/robber copy | Base Rules topic and phrase assertions | PASS |
| RB-018 | Base Rules player/maritime trade distinction and ratios | 4:1/3:1/2:1 assertions | PASS |
| RB-019 | All five supported development-card effects and timing | Development-effect phrase assertions | PASS |
| RB-020 | Detailed seven/discard/relocation/victim/theft privacy copy | Seven and hidden-resource assertions | PASS |
| RB-021 | Scoring, awards, hidden points, and displayed target | Scoring threshold/value assertions | PASS |
| RB-022 | Base Common Misunderstandings section | Topic and bilingual heading assertions | PASS |
| RB-023 | Independent Commerce Guild chapter | Exact chapter tuple and single-chapter SSR | PASS |
| RB-024 | Slot costs/rewards/refresh/once-per-turn copy | Commerce Guild lifecycle assertions | PASS |
| RB-025 | Token-transfer restrictions copy | Commerce Guild token topic assertions | PASS |
| RB-026 | `2n`, `n`, initiating-turn exclusion, clean action authority | Cooldown phrase assertions | PASS |
| RB-027 | Redemption allowance, bank limit, and auction transition | Redemption topic/phrase assertions | PASS |
| RB-028 | Three sealed rounds, privacy, replacement, affordability, tie resolution | Auction phrase assertions | PASS |
| RB-029 | Resource/development/voucher outcomes with privacy boundary | Outcome topic/phrase assertions | PASS |
| RB-030 | Zero-token, zero-bid, and completion behavior | Termination phrase assertions; full zero-token E2E regression | PASS |
| RB-031 | Three-voucher prize redemption and availability | Voucher/prize phrase assertions | PASS |
| RB-032 | Guild Common Misunderstandings section | Topic and bilingual heading assertions | PASS |
| RB-033 | Quick Reference turn checklist | Reference topic assertion | PASS |
| RB-034 | Shared icons and authoritative costs | Computed `ResourceBundle`/ARIA assertions | PASS |
| RB-035 | Terrain/resource/desert and maritime ratios | Reference icon and ratio assertions | PASS |
| RB-036 | Point sources and displayed target concept | Reference point-topic assertion | PASS |
| RB-037 | Complete disabled-action reason list | Blocker phrase assertions | PASS |
| RB-038 | Keyboard/touch/internal-scroll/mobile guidance | Input phrase assertions and final sentinel | PASS |
| RB-039 | `rulebookMessages` English/Simplified-Chinese parity | Every catalog entry translated and non-empty | PASS |
| RB-040 | Existing `setLocale` used inside mounted panel | Live-language browser case retains Base Rules | PASS |
| RB-041 | Existing `ResourceIcon`/`ResourceBundle` system | Icon semantics and existing presentation regression suite | PASS |
| RB-042 | Native tablist/tab/tabpanel relationships | Server-render ARIA/id/selected assertions | PASS |
| RB-043 | Wrapped Arrow navigation and Home/End automatic activation | Dedicated keyboard browser case | PASS |
| RB-044 | Existing dialog Escape/close/opener lifecycle retained | Dedicated reopen/focus case and full dialog regression | PASS |
| RB-045 | Rulebook-only flex card with independently scrolling panel | CSS contract, browser geometry, rendered review | PASS |
| RB-046 | Focusable internal panel and stable final sentinel | Desktop/mobile sentinel browser cases | PASS |
| RB-047 | Bounded card/body; mobile-only horizontal tab scrolling | Desktop 1280×768 and mobile 390×844 geometry cases | PASS |
| RB-048 | Hover/pressed/focus styles plus weight/border selected indicator | CSS contract and rendered review | PASS |
| RB-049 | `buildCosts` import plus reviewed factual baseline | Cost assertions, content assertions, whole-feature review | PASS |
| RB-050 | No domain/Online/Worker/package/lockfile edit | Forbidden boundary diff empty; full suites pass | PASS |
| RB-051 | Required bilingual topics and raw-key exclusion | Content SSR catalog/topic tests | PASS |
| RB-052 | Four chapters/default/one panel/shared costs/icons/bilingual content | Nine Rulebook component tests | PASS |
| RB-053 | Pointer/keyboard/language/scroll/focus/responsive browser evidence | Five dedicated Rulebook Playwright tests | PASS |
| RB-054 | Focused, main, browser, build, smoke, guards, whitespace gates | Fresh verification table above | PASS |

## Whole-feature review

Review scope: specification, plan, tasks, commits `a31f50c` and `f4f9571`, all new Rulebook source/tests, Utility dialog integration, localization, and scoped CSS.

- Critical findings: 0.
- Important findings: 0.
- New minor findings at final review: 0.
- Earlier minor findings resolved with focused evidence: chapter heading hierarchy, duplicated Desert wording, and a dynamic-name browser-test locator after locale switching.
- Content correctness: matches the factual baseline in `plan.md`; shared costs/icons are authoritative; no unsupported strategy or state-aware instruction was added.
- Accessibility/focus: tab semantics, roving focus, automatic activation, Escape/close behavior, opener restoration, and localized accessible names are covered.
- Responsive behavior: header/toolbar remain outside the internal scroll region; document/card/body containment and final reachability pass at both required viewports.
- Privacy: copy describes hidden resources, sealed bids, and private outcomes without importing or exposing caller/opponent state.
- Boundary/minimalism: one component-local chapter state, native controls, no dependency, parser, route, service, rules engine, locale store, or second icon map.

## Artifact analysis and convergence

- CRITICAL: 0; HIGH: 0; MEDIUM: 0; LOW: 1.
- Accepted LOW L-001 remains: some ratios, award thresholds, and Commerce Guild values are explanatory literals because expanding the domain API only for documentation would be disproportionate. They are protected by focused assertions and the reviewed baseline.
- All 54 approved requirements map to implementation and evidence above.
- T001 and T002 match the approved static scope; no task contradicts the specification.
- Final application behavior matches the task list, so no convergence task was appended.
- T003 can close after this evidence and `handoff.md` are committed.
