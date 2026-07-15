# Technical Research: Comprehensive In-Game Rulebook

Date: 2026-07-15
Specification: `specs/005-comprehensive-rulebook/spec.md`

## Decision 1: Keep the rulebook inside the existing utility dialog

Decision:

- `UtilityDialog` continues to own `<dialog>`, Escape handling, opener capture, initial close-button focus, and focus restoration.
- A new `RulebookPanel` is mounted only when `panel === "rulebook"`.
- The panel's local chapter state therefore starts on Quick Start for every open without persistence or a reset effect.

Rationale:

- The existing dialog already proves modal focus and Escape behavior in browser tests.
- Conditional mounting gives the required reopen reset through React lifecycle rather than another preference or state channel.
- Settings and Info keep their current width and scrolling behavior.

Rejected alternatives:

- A new route or second dialog: duplicates focus, close, and responsive behavior.
- Remembering the last chapter in session storage: explicitly out of scope.
- Moving chapter state into `GameTable`: couples static help navigation to the game facade.

## Decision 2: Separate navigation, chapter markup, and bilingual copy while retaining one i18n system

Decision:

- Add `src/ui/rulebook/RulebookPanel.tsx` for selected-tab state and keyboard navigation.
- Add `src/ui/rulebook/RulebookContent.tsx` for the four explicit chapter renderers and shared presentational rows.
- Add `src/ui/rulebook/messages.ts` for `rulebook.*` English/Simplified-Chinese messages.
- Spread `rulebookMessages` into the existing `messages` object in `src/ui/i18n.ts`; `translate`, `useI18n`, locale storage, and `MessageKey` remain the only localization system.

Rationale:

- Navigation behavior, long-form content, and translation data change for different reasons and are independently reviewable.
- `i18n.ts` is already 574 lines; placing the new long-form catalog beside its only consumer avoids turning the central translator into a content dump.
- Explicit React chapter markup supports headings, steps, examples, tables, and accessible resource components without inventing Markdown or a generic content schema.

Rejected alternatives:

- Add all copy and JSX to `UtilityDialog.tsx`: expands a generic modal owner with feature-specific behavior.
- Add all copy directly to `i18n.ts`: works technically but weakens the content boundary.
- Markdown, remote JSON, or a generic block renderer: creates a second content format and unnecessary parsing/typing work.

## Decision 3: Render authoritative costs and established resource semantics

Decision:

- Import `buildCosts` from `src/domain/rules/building.ts` for road, settlement, city, and development-card cost rows.
- Render those values through the existing `ResourceBundle` component.
- Use the existing `resources` order and localized `resource.*` / `terrain.*` names for production relationships.
- Keep ratios, victory values, development-card names, and Commerce Guild values in reviewed rulebook copy with focused assertions against the current domain constants and behavior.

Rationale:

- The most drift-prone repeated values—the four build costs—already have a stable exported owner and a shared visual renderer.
- Resource icons retain their unique mapping, complete localized accessible names, and semantic colors without a second icon map.
- Importing full game state would violate static-content scope and create false live legality guidance.

Rejected alternatives:

- Copy build-cost object literals into the rulebook: permits silent drift.
- Pass `GameTableView` into the panel: lets static help depend on current state and widens the component API.
- Create a second rules engine for disabled reasons or legality: explicitly forbidden by the specification.

## Decision 4: Use native ARIA tabs with automatic activation

Decision:

- Render one `role="tablist"`, four `role="tab"` buttons, and one active `role="tabpanel"`.
- Use stable tab/panel ids, `aria-selected`, `aria-controls`, `aria-labelledby`, and roving `tabIndex`.
- Left/Right Arrow wrap through chapters; Home/End select the first/last chapter; each keyboard selection also moves focus to the selected tab.
- Pointer selection uses the same chapter setter.
- A selected chapter starts at the top of the shared scrolling panel; changing language does not reset its chapter selection.

Rationale:

- Native buttons preserve activation, focus, and touch behavior without a component dependency.
- Automatic activation is appropriate because chapter bodies are local and render immediately.
- One active panel keeps the accessibility tree and long scrolling region predictable.

Rejected alternatives:

- Four ordinary buttons with no tab semantics: fails the specified relationships and keyboard contract.
- A new tab package: unnecessary for four local panels.
- Manual activation with Enter/Space after arrow movement: adds interaction not requested and makes quick reference slower.

## Decision 5: Reuse the session locale and expose it inside the open rulebook

Decision:

- Add a compact native language `<select>` in the rulebook toolbar using the existing `locale`, `setLocale`, and language messages.
- Keep the tablist before the language selector in DOM order so Tab from the dialog close button enters chapter navigation first.
- Changing it updates the same session locale used by Settings and the rest of the game.
- Selected chapter remains component state and therefore does not reset on locale changes.

Rationale:

- The existing Settings selector cannot be operated while the modal rulebook is open.
- An in-panel selector is the smallest way to prove live translation without adding a second preference.
- Native select behavior is accessible, compact, and already familiar in this application.

Rejected alternatives:

- Test-only locale mutation: would not provide the user-visible behavior required by RB-040.
- Move the Settings selector into a global app header: broadens the requested layout change.
- Maintain a rulebook-only locale: violates the single-session-language assumption.

## Decision 6: Give the rulebook its own bounded scroll region

Decision:

- Add `modal-card--rulebook` only for the rulebook: desktop width approximately 760 pixels, `overflow: hidden`, and a column layout within the existing viewport maximum.
- Keep the existing modal header outside the rulebook body scroll.
- Make the rulebook toolbar/tab strip fixed within that column and the active panel the only vertical scroll container.
- On narrow screens, constrain every layer with `min-width: 0`/`max-width: 100%`; allow bounded horizontal scrolling only on the tab strip.

Rationale:

- Settings restart confirmation currently relies on `.modal-card` scrolling and must not regress.
- A separate body scroller keeps close, title, language, and chapters reachable throughout a long manual.
- The 390-pixel requirement is measurable through document width and internal scroll dimensions.

Rejected alternatives:

- Widen every utility panel: wastes space and changes unrelated dialogs.
- Keep the whole rulebook card as one scroll container: the chapter navigation can disappear during lookup.
- Fixed viewport heights in pixels: fragile across mobile browser heights.

## Decision 7: Use focused static/component tests plus a dedicated Playwright file

Decision:

- Add `test/domain/rulebookUi.test.ts` using the project's React server-rendering pattern.
- Prove catalog parity, required content in both languages, semantic headings/tabs/panels, authoritative cost bundles, icon accessibility, and default Quick Start.
- Add `test/e2e/rulebook.spec.ts` for pointer/keyboard chapter changes, reopen reset, live language switching, Escape/focus restoration, scroll-to-end, and desktop/mobile containment.
- Keep `test/e2e/frontend-recovery.spec.ts` unchanged except for a confirmed compatibility fix; it already exceeds 1,800 lines.

Rationale:

- Vitest runs in Node and has no DOM interaction environment, so server rendering is the established narrow proof.
- Browser behavior is best proven through the real dialog and CSS.
- A dedicated file creates a reviewable feature boundary and prevents further growth of the recovery suite.

Rejected alternatives:

- Add React Testing Library/jsdom: new dependencies and configuration for behavior already covered by Playwright.
- Put all assertions in the large recovery E2E file: violates the test hotspot boundary.
- Snapshot the entire bilingual manual: creates noisy updates without proving topic intent.

## Static-Scope Clarification

The rulebook does not receive player, turn, phase, hand, room, or target-score state. It explains that victory occurs at the target displayed by the game and documents the current default/standard values where appropriate. Its structure and rules do not change by match state; only the existing session locale changes presentation language.

## Minimalism and Boundary Result

- Rung: reuse existing dialog, i18n context, domain constants, native buttons/selects, and resource components; then add direct bounded feature files.
- New production dependencies: none.
- New domain state, command, protocol, Worker, persistence, route, service, or parser: none.
- Large existing files receive only thin integration/catalog spread changes; feature behavior and long-form content have dedicated owners.
