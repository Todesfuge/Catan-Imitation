# Feature Specification: Comprehensive In-Game Rulebook

Created: 2026-07-15
Status: Approved; implementation ready
Workflow phase: Artifact analysis passed

## Problem

The in-game rulebook currently contains four short bullet points. It names several systems but does not teach setup order, a normal turn, placement rules, costs, trading, robber decisions, development cards, scoring, or the complete Commerce Guild flow. A player who has never played this implementation cannot use the rulebook to start a game, understand why an action is unavailable, or determine how to win.

The replacement rulebook must teach a first game in play order and remain useful as a fast reference later. It must describe the rules implemented by this project, including the Commerce Guild expansion, without becoming a live tutorial or changing gameplay.

## Users and Actors

- First-time player: needs a guided path from game objective through setup and a normal turn.
- Returning player: needs quick access to costs, production, ports, scoring, and common restrictions.
- Commerce Guild learner: needs the expansion explained separately after the base game.
- Keyboard user: needs complete tab navigation and predictable focus behavior.
- Mobile or touch user: needs readable, scrollable content without horizontal page overflow.
- English or Simplified-Chinese player: needs the same complete rule coverage in the selected language.

## Approved Product Scope

### In Scope

- Replace the four-bullet rulebook with four top-level tabs: Quick Start, Base Rules, Commerce Guild, and Quick Reference.
- Open on Quick Start every time the rulebook is reopened.
- Keep the rulebook static: every player sees the same rules regardless of current turn, phase, hand, or Online seat.
- Explain the game objective, resource and terrain relationships, setup order, second-settlement starting resources, normal turn order, legal actions, scoring, and victory.
- Document building placement, costs, production, rolling seven, discards, robber movement, player trading, maritime trading, development cards, longest road, and largest army.
- Document the complete current Commerce Guild flow in a separate chapter, including tokens, trade slots, gathering pacing, redemption, sealed auctions, outcomes, vouchers, prizes, and no-bid termination.
- Provide a compact reference for turn order, costs, terrain production, port ratios, victory points, common disabled-action reasons, and input/scrolling guidance.
- Use the same resource icons, localized names, and authoritative rule values as the game interface.
- Provide complete English and Simplified-Chinese copy with equivalent meaning and topic coverage.
- Support mouse, touch, Tab, Left/Right Arrow, Home, End, Escape, and dialog focus restoration.
- Keep the rulebook header and chapter navigation available while its long body scrolls.
- Remain readable on desktop and at a 390-pixel mobile viewport without page-level horizontal overflow.

### Out of Scope

- A state-aware “what should I do now?” assistant.
- An interactive tutorial that advances or modifies the match.
- Hiding, highlighting, or reordering rules based on the current player or game phase.
- Remembering the last-opened chapter after the rulebook closes.
- Changing any setup, building, trading, development-card, robber, scoring, Commerce Guild, protocol, persistence, or Online rule.
- Strategy recommendations, opening rankings, probability coaching, or guaranteed-win advice.
- Markdown parsing, remote content, new UI packages, videos, externally loaded images, or another localization system.
- Replacing the existing action-phase guidance shown on the game table.

## User Stories

### US1: Learn a First Game in Play Order

As a first-time player, I can read one ordered Quick Start chapter and understand how to set up, take a normal turn, gain resources, build, trade, and pursue victory.

Independent acceptance:

- Quick Start begins with the objective and explains the five resources and their producing terrain.
- Setup explains snake order, settlement-then-road placement, the distance rule, and the resource grant from the second settlement only.
- A normal turn is presented as roll, resolve mandatory decisions, take any legal actions, then end turn.
- Rolling seven explains discards, robber movement, victim selection, and blocked production.
- The chapter ends with the main victory-point sources and the configured target-score concept.

### US2: Look Up a Base Rule Without Reading the Tutorial Again

As a returning player, I can open Base Rules or Quick Reference and find exact costs, placement restrictions, trade ratios, development-card behavior, scoring, and common blockers.

Independent acceptance:

- Building and development-card costs match the rules used by gameplay.
- Road, settlement, and city placement requirements are explicit.
- Player trading and maritime trading are distinguished, including generic and resource-specific port ratios.
- Development-card timing and the current implementation’s card effects are described.
- Longest road, largest army, hidden/public victory points, and the win condition are described without inventing unsupported rules.

### US3: Learn the Commerce Guild Separately

As a player who understands the base game, I can learn the Commerce Guild expansion in one independent chapter without mixing expansion rules into the first-turn tutorial.

Independent acceptance:

- The chapter explains how trade slots award guild tokens and when a player may use them.
- Gathering availability explains the table-wide initial `2n` and post-start `n` cooldowns, current-player/action-phase authority, and initiating-turn exclusion.
- Redemption explains current allowances, bank limits, and transition to auction.
- Auction rules explain three sealed rounds, caller-private bids, public submission status, winning outcomes, and how zero-token or all-pass states terminate.
- Voucher and prize redemption are explained after auction outcomes.

### US4: Read and Navigate the Rulebook Accessibly

As a keyboard, mobile, or bilingual player, I can navigate every chapter, understand every icon, reach the final content, and return focus to the Rulebook button when I close the dialog.

Independent acceptance:

- The four chapters expose standard tab-list, tab, and tab-panel semantics.
- Left/Right Arrow changes chapter, Home selects the first chapter, and End selects the last chapter.
- The selected tab, controlled panel, and focus state are programmatically available and visually distinguishable.
- Resource icons retain complete localized accessible names and do not rely on color or position alone.
- Switching languages retranslates all visible chapter labels and content without reopening the dialog.
- Desktop and mobile layouts contain the content and allow scrolling to the end without horizontal page overflow.

## Functional Requirements

### Rulebook Information Architecture

- RB-001: The rulebook must expose exactly four top-level chapters in this order: Quick Start, Base Rules, Commerce Guild, and Quick Reference.
- RB-002: Opening or reopening the rulebook must select Quick Start.
- RB-003: Chapter content must remain static and must not vary with current match state, player identity, Local/Online mode, or connection state.
- RB-004: Only the selected chapter body may be visible as the active tab panel.
- RB-005: Each chapter must use headings, short paragraphs, ordered steps, lists, examples, and compact reference groups rather than one undifferentiated bullet list.
- RB-006: The rulebook must not introduce a second rules engine or calculate whether an action is currently legal.

### Quick Start Coverage

- RB-007: Quick Start must explain the objective as reaching the target score shown by the game and must identify the principal victory-point sources.
- RB-008: Quick Start must name wood, brick, wool, grain, and ore and associate each with its producing terrain; desert must be identified as non-producing.
- RB-009: Quick Start must explain snake-order setup, settlement-before-road placement, settlement distance, road connection, and that only the second setup settlement grants adjacent producing resources.
- RB-010: Quick Start must present a normal turn in the order: roll dice, resolve mandatory decisions, take legal actions in any allowed order, and end turn.
- RB-011: Quick Start must explain normal production for settlements and cities and the effect of the robber on a hex.
- RB-012: Quick Start must explain the seven-roll sequence: required discards, robber movement, and victim selection when available.
- RB-013: Quick Start must introduce building, buying/playing development cards, player trading, maritime trading, and ending the turn.
- RB-014: Quick Start must include at least one concrete setup example and one concrete normal-turn example.

### Base Rules Coverage

- RB-015: Base Rules must document the exact current resource costs for roads, settlements, cities, and development cards.
- RB-016: Base Rules must document road connectivity, settlement distance, city upgrade, piece availability, bank availability, and target-selection restrictions that can prevent construction.
- RB-017: Base Rules must document dice production, city double production, bank shortages, desert behavior, and robber-blocked production.
- RB-018: Base Rules must distinguish public player offers from maritime trades and document default, generic-port, and resource-port exchange ratios.
- RB-019: Base Rules must document every supported development-card category and relevant timing or once-per-turn restrictions.
- RB-020: Base Rules must document rolling seven, discard quantity, robber relocation, victim eligibility, and resource theft without claiming the UI reveals private hands.
- RB-021: Base Rules must document roads, settlements, cities, played knights, longest road, largest army, development-card victory points, and the configured victory target.
- RB-022: Base Rules must include a Common Misunderstandings section covering first-settlement resources, paired setup roads, build connectivity, same-turn development-card limits, and private Online information.

### Commerce Guild Coverage

- RB-023: Commerce Guild must be a separate chapter that assumes the reader already understands Base Rules.
- RB-024: The chapter must explain all three trade slots, their listed resource costs, token rewards, refresh behavior, and once-per-turn use restrictions.
- RB-025: The chapter must explain token transfers and which players or phases may prevent them.
- RB-026: The chapter must explain the initial `2n` gathering cooldown, the post-start `n` cooldown, the excluded initiating turn, and that only the current player in a clean action phase may start at zero.
- RB-027: The chapter must explain redemption allowances, resource selection, bank availability, and the transition from redemption to auction.
- RB-028: The chapter must explain the three sealed auction rounds, private bid amounts, public submission status, bid replacement, affordability, and winner resolution.
- RB-029: The chapter must explain resource, development-card, and voucher outcomes without exposing information that Online projections keep private.
- RB-030: The chapter must explain all-zero/no-token, no-bid, and gathering-completion behavior so players understand that an auction cannot become permanently stuck.
- RB-031: The chapter must explain voucher-to-prize redemption and any current availability limits.
- RB-032: The chapter must include a Common Misunderstandings section covering cooldown ownership, initiating-turn exclusion, sealed bids, and no-eligible-bidder termination.

### Quick Reference Coverage

- RB-033: Quick Reference must present a compact normal-turn checklist.
- RB-034: Quick Reference must present building/development costs using the shared resource icon system plus localized accessible names.
- RB-035: Quick Reference must present terrain-to-resource relationships, desert behavior, and maritime ratios.
- RB-036: Quick Reference must summarize victory-point sources and the configured target-score concept.
- RB-037: Quick Reference must summarize common disabled-action reasons, including unresolved roll/decision, wrong player, insufficient resources or bank stock, invalid target, pending trade, active gathering, and gathering cooldown.
- RB-038: Quick Reference must include keyboard, touch-target, internal-scroll, and mobile overflow guidance relevant to operating the current interface.

### Localization, Accessibility, and Responsive Behavior

- RB-039: Every chapter label, heading, paragraph, list item, example, tooltip, and accessible name must have equivalent English and Simplified-Chinese content.
- RB-040: Changing the session language while the rulebook is open must retranslate the active chapter and navigation without losing the selected chapter.
- RB-041: Resource visuals must reuse the established icon silhouettes, semantic colors, localized names, and quantities where applicable.
- RB-042: Chapter navigation must expose standard tab semantics with selected state and tab-to-panel relationships.
- RB-043: Tab enters the chapter navigation; Left/Right Arrow moves between adjacent chapters with wrapping; Home and End select the first and last chapters.
- RB-044: Escape and the close control must close the dialog, and focus must return to the Rulebook opener.
- RB-045: The rulebook header and chapter navigation must remain available while the chapter body scrolls.
- RB-046: The complete final chapter must be reachable by mouse wheel, touch, and keyboard scrolling.
- RB-047: At desktop, tablet, and 390-pixel mobile widths, the dialog and body must avoid page-level horizontal overflow; mobile chapter navigation may scroll horizontally within its own bounded region.
- RB-048: Focus, selected, hover, and pressed states must remain visibly distinct and must not rely on color alone.

### Correctness and Verification

- RB-049: Rulebook costs, ratios, target-score wording, resource identities, and Commerce Guild values must agree with the current authoritative gameplay rules.
- RB-050: Adding or editing explanatory content must not change domain state, command schemas, Worker behavior, persistence, or public/private projections.
- RB-051: Automated content coverage must prove that each required topic is present in both languages and that no untranslated `rulebook.*` key is rendered.
- RB-052: Component evidence must cover the four chapters, default selection, active-panel visibility, shared icon/cost rendering, and bilingual content.
- RB-053: Browser evidence must cover pointer and keyboard chapter changes, live language switching, final-content scrolling, focus restoration, and desktop/mobile containment.
- RB-054: Completion requires focused component/localization/accessibility tests, the main suite, the browser suite, production build, UI smoke, repository guards, and `git diff --check`.

## Approved Experience Design

### Chapter Order

```text
Quick Start
  -> objective and resources
  -> setup
  -> one normal turn
  -> robber/seven
  -> scoring and first-game checklist

Base Rules
  -> production and bank
  -> placement and costs
  -> trade
  -> development cards and robber
  -> scoring
  -> common misunderstandings

Commerce Guild
  -> trade slots and tokens
  -> gathering cooldown and authority
  -> redemption
  -> sealed auction
  -> outcomes and prizes
  -> common misunderstandings

Quick Reference
  -> turn checklist
  -> costs and terrain production
  -> ports and points
  -> blockers and input guidance
```

### Navigation and Reading Model

The Rulebook control opens one modal with a persistent title and four top-level tabs. Quick Start is selected on every open. Selecting a tab replaces only the chapter body. The body scrolls independently, while the title, close control, and chapter navigation remain available. The rulebook provides rules and examples only; the existing game table remains the owner of live action guidance.

### Content Style

Each instructional unit follows this order where applicable:

```text
When it happens -> What the player does -> What changes -> Short example
```

Full resource and terrain words remain in prose. Icons supplement compact costs and quick-reference relationships but never replace the accessible name. Common Misunderstandings state negative boundaries directly instead of relying on players to infer them.

## Edge Cases

- Reopening the rulebook after selecting another chapter starts again on Quick Start.
- Switching language while a non-default chapter is open keeps that chapter selected and retranslates it.
- Closing by Escape and closing by button both restore focus to the Rulebook opener.
- A 390-pixel viewport contains the dialog; only the tab strip and chapter body may scroll within their own boundaries.
- Long Chinese labels do not overlap, clip, or make the page horizontally scroll.
- Resource icons remain understandable when colors are unavailable.
- The configured target score may differ in future modes, so prose refers to the target displayed by the game rather than hard-coding a universal score.
- Online-specific privacy explanations never reveal opponents’ resource hands, development cards, sealed bid amounts, or private outcomes.
- If gameplay rules change later, content correctness tests must fail until the relevant rulebook copy is updated.

## Success Criteria

- A new player can use Quick Start alone to complete setup and a normal turn without relying on prior Catan knowledge.
- Base Rules contains every current base-game mechanic exposed by the interface and states exact costs and restrictions.
- Commerce Guild explains the complete expansion flow and its termination cases without mixing into Quick Start.
- Quick Reference exposes the most frequently checked facts without requiring a full-text scan.
- English and Simplified-Chinese versions cover the same required topics and render no untranslated rulebook key.
- Keyboard and touch users can select every chapter, reach its final content, close the dialog, and recover focus.
- Desktop, tablet, and 390-pixel mobile browser checks show no page-level horizontal overflow.
- No gameplay, protocol, persistence, or Online projection behavior changes as part of the feature.

## Assumptions

- The existing game table remains the source of live action guidance and current disabled reasons.
- The selected session language remains the only language preference; the rulebook adds no independent preference.
- Existing resource icons and rule values are suitable for reuse in explanatory content.
- Local and Online play share the same base rules and Commerce Guild behavior, with Online-specific privacy and authority differences called out where relevant.
- The current dialog remains the entry point; no separate route or external documentation site is required.
