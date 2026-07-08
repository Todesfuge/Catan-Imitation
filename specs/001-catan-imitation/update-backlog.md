# Ordered Update Backlog

Date: 2026-07-08
Scope: Post-MVP improvements after `453674f feat: implement catan imitation mvp`

This backlog records all known unfinished or improvable work after the MVP. Items are ordered by review value and dependency order: rule correctness first, then expansion polish, product polish, and delivery automation.

## Priority 1: Core Rule Completeness

- [ ] U001 Add full setup placement flow.
  - Current state: demo preset creates initial buildings automatically.
  - Target: players can place initial settlements and roads in correct snake order.
  - Acceptance: setup phase blocks normal turns until every player has completed required initial placements.

- [ ] U002 Enforce settlement distance and occupied-vertex legality.
  - Current state: occupied vertices are blocked, but Catan distance rule is not enforced.
  - Target: settlement placement rejects adjacent occupied vertices.
  - Acceptance: tests cover valid placement, occupied vertex rejection, and adjacent settlement rejection.

- [ ] U003 Enforce road connectivity and ownership legality.
  - Current state: roads can be built on any unused demo edge.
  - Target: new roads must connect to the player's road network or owned building.
  - Acceptance: tests cover connected road acceptance, disconnected road rejection, and occupied edge rejection.

- [ ] U004 Implement full 7-roll robber flow.
  - Current state: robber can move and blocks production.
  - Target: rolling 7 triggers discard for players above hand limit, robber movement, and optional random steal from adjacent opponent.
  - Acceptance: tests cover discard rounding, robber movement, and steal/no-steal outcomes.

- [ ] U005 Add bank resource accounting and exhaustion handling.
  - Current state: player hands update, but the bank is mostly visual.
  - Target: production and builds update bank counts; exhausted resources are not overpaid.
  - Acceptance: tests cover bank decrement, build refund to bank, and limited production when bank is short.

- [ ] U006 Implement game-over and winner flow.
  - Current state: score is calculated but no winner state ends the game.
  - Target: reaching target score on the active player's turn creates a winner state and blocks further actions.
  - Acceptance: tests cover normal scoring below target and winner detection at target.

## Priority 2: Development Cards and Classic Catan Systems

- [ ] U007 Implement development card deck and purchase flow.
  - Current state: development cards are strings used only for simplified Commerce Guild rewards.
  - Target: deck contains knight, victory point, road building, year of plenty, and monopoly cards.
  - Acceptance: tests cover purchase cost, deck draw, hidden card ownership, and no same-turn play for non-victory cards.

- [ ] U008 Implement knight cards and Largest Army.
  - Current state: Largest Army is not implemented.
  - Target: playing knights moves the robber and awards Largest Army when the threshold is met.
  - Acceptance: tests cover threshold, tie behavior, and score contribution.

- [ ] U009 Implement Longest Road.
  - Current state: Longest Road is not implemented.
  - Target: calculate each player's longest continuous road and award the bonus.
  - Acceptance: tests cover simple chain, branch handling, blocked paths, and ownership boundaries.

- [ ] U010 Implement maritime trade and port benefits.
  - Current state: ports are not represented in gameplay.
  - Target: generic 4:1, owned 3:1, and resource-specific 2:1 trades.
  - Acceptance: tests cover each trade ratio and ownership requirement.

## Priority 3: Commerce Guild Polish

- [ ] U011 Auto-trigger Commerce Guild gatherings by interval.
  - Current state: gathering is manually triggered.
  - Target: default trigger every 6 completed rounds, with manual trigger retained for demos.
  - Acceptance: tests cover no trigger before interval and trigger at interval boundary.

- [ ] U012 Improve auction validation and result display.
  - Current state: auction resolves, but UI feedback is compact.
  - Target: show invalid bid reasons, current round status, winner, payment, and blind-box result.
  - Acceptance: manual smoke confirms invalid bids are visible and successful auction result is clear.

- [ ] U013 Integrate Commerce Guild development-card rewards with the real card deck.
  - Current state: blind boxes can create a simplified development card string.
  - Target: blind-box card reward draws from the same deck as normal development purchases.
  - Acceptance: tests cover reward draw and empty deck handling.

- [ ] U014 Improve token transfer UX and log naming.
  - Current state: transfers work, but logs may show internal player ids.
  - Target: logs and controls consistently use player display names.
  - Acceptance: manual smoke confirms transfer logs use names and reject impossible transfers clearly.

## Priority 4: UI and Product Polish

- [ ] U015 Connect left utility rail actions.
  - Current state: settings, rulebook, fullscreen, and info are visual controls.
  - Target: show settings/help/info panels and use browser fullscreen where available.
  - Acceptance: each utility button opens a visible, dismissible interaction.

- [ ] U016 Add guided phase prompts and error recovery.
  - Current state: errors show a generic toast.
  - Target: action bar explains the current expected step and suggests how to recover from invalid actions.
  - Acceptance: manual smoke confirms invalid build/trade actions produce actionable messages.

- [ ] U017 Improve board visual fidelity and inspectability.
  - Current state: board uses original CSS hexes and labels.
  - Target: improve terrain icons, number-token pips, port indicators, and piece clarity without copying proprietary assets.
  - Acceptance: desktop screenshot shows readable resources, dice numbers, robber, settlements, and cities.

- [ ] U018 Add real local chat or remove chat affordance.
  - Current state: chat is a shell.
  - Target: either local message log works, or the panel is renamed to activity/help to avoid false affordance.
  - Acceptance: UI no longer presents nonfunctional chat.

- [ ] U019 Harden mobile layout.
  - Current state: mobile has no horizontal overflow, but the board is compact.
  - Target: mobile gets a clearer stacked interaction pattern and board controls remain readable.
  - Acceptance: smoke checks at 390x844 and 768x1024 show no overlap or clipped controls.

## Priority 5: Engineering and Delivery

- [ ] U020 Add GitHub Actions CI.
  - Current state: checks are manual.
  - Target: run `pnpm install`, `pnpm test`, and `pnpm build` on push and pull request.
  - Acceptance: GitHub Actions passes on `master`.

- [ ] U021 Add deployment.
  - Current state: app runs locally only.
  - Target: deploy to GitHub Pages, Vercel, or another static host.
  - Acceptance: README links to a working public URL.

- [ ] U022 Add UI smoke tests.
  - Current state: browser smoke checks were manual.
  - Target: automate rendering checks for board, panels, statistics, and Commerce Guild controls.
  - Acceptance: CI runs UI smoke tests headlessly or documents a stable local command.

- [ ] U023 Add PR and issue templates.
  - Current state: no collaboration templates.
  - Target: repository includes templates for feature work, bug reports, and PR validation.
  - Acceptance: `.github/` templates exist and reference test/build expectations.

- [ ] U024 Add roadmap milestones.
  - Current state: future work is documented in this backlog only.
  - Target: group follow-up work into reviewable milestones: rules, expansion, UI polish, delivery.
  - Acceptance: README or docs expose the milestone order clearly.

