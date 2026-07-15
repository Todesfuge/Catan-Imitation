# Specification Quality Checklist: Comprehensive In-Game Rulebook

Reviewed: 2026-07-15
Artifact: `specs/005-comprehensive-rulebook/spec.md`

## Scope and User Value

- [x] The problem identifies why the current four bullets cannot teach a first game.
- [x] First-time, returning, Commerce Guild, keyboard, mobile, English, and Chinese users are explicit.
- [x] Quick Start, Base Rules, Commerce Guild, and Quick Reference have independent user value and acceptance criteria.
- [x] Live coaching, interactive tutorials, strategy advice, gameplay changes, Markdown, remote content, and new dependencies are explicitly out of scope.

## Content Completeness

- [x] Objective, resources, terrain, setup, second-settlement resources, turn order, rolling seven, robber, building, trading, development cards, scoring, and victory are testable requirements.
- [x] Exact costs, placement restrictions, bank behavior, maritime ratios, development-card timing, longest road, and largest army are covered.
- [x] Commerce Guild trade slots, tokens, cooldown, redemption, sealed auction, outcomes, vouchers, prizes, and termination cases are covered.
- [x] Quick Reference includes turn, cost, terrain, port, score, blocker, keyboard, touch, scroll, and mobile guidance.
- [x] Common misunderstandings explicitly address the highest-risk rule boundaries.

## Information Architecture and Behavior

- [x] Exactly four ordered tabs, default Quick Start, static content, and one visible active panel are explicit.
- [x] Reopening resets to Quick Start while live language changes retain the active chapter.
- [x] Sticky navigation, independent body scrolling, desktop/mobile containment, and bounded mobile tab scrolling are testable.
- [x] The rulebook remains explanatory and does not calculate current action legality.

## Localization and Accessibility

- [x] English and Simplified-Chinese parity covers labels, prose, examples, tooltips, and accessible names.
- [x] Standard tab semantics, selected state, tab-panel relationships, arrow keys, Home, End, Escape, and focus restoration are explicit.
- [x] Shared resource icons retain localized names and do not rely on color or position alone.
- [x] Mouse, touch, keyboard scrolling, focus visibility, and 390-pixel containment are measurable.

## Correctness and Verification

- [x] Rulebook facts must agree with authoritative gameplay values and privacy rules.
- [x] The feature is forbidden from changing domain, protocol, Worker, persistence, or projection behavior.
- [x] Component, localization, accessibility, browser, build, smoke, guard, and diff evidence are required.
- [x] A dedicated browser path covers public rulebook compatibility without expanding the existing oversized recovery specification.
- [x] No unresolved placeholder, TODO, TBD, contradiction, unsupported product mode, or ambiguous scope remains.

## Result

The approved design is represented as a testable Spec Kit specification, has passed user written-spec review, and is ready for technical planning.
