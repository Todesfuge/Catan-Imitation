# Gathering Pacing, Setup Grants, and Resource Icons Handoff

Status: Complete; release gates and whole-branch independent review passed

## Branch and Commit Chain

- Branch: `codex/gathering-cooldowns-icons`
- Base on `main`: `7434a04` (`docs: record seeded map deployment`)
- Specification/design: `8cf2500`, `1e2ae60`, `8577788`
- Cooldown domain: `cee9927`
- Second-settlement grant: `eaf565d`
- Protocol v3 projection: `79c9b28`
- Storage schema v3 migration: `73eaa1e`
- Shared operational resource badges: `614c34f`
- Board/statistics icon convergence: `6f962e9`
- Browser/docs/release record: this T007 commit, including resolved whole-branch review findings

## Delivered Behavior

- One authoritative Commerce Guild cooldown begins at `2n`, resets to `n` on a qualified manual start, excludes the initiating turn, and reaches zero only through accepted normal end turns.
- Local dispatch and the Worker supply trusted actor identity; the public `START_GATHERING` command has no actor or timer payload.
- Each second setup settlement atomically grants every adjacent producing resource and debits the bank; first settlements and paired roads grant nothing.
- One shared accessible Lucide icon mapping renders resource quantities across hands, bank, costs, decisions, trades, Commerce Guild, statistics, ports, and producing hexes.
- Board terrain words/abbreviations are visually removed while localized assistive labels, rules, help, and natural-language logs keep complete names.
- English remains the default; Settings switches the browser session to Simplified Chinese.

## Schema v3 Deployment Implications

- Deploy the Worker and SPA together because storage schema v3 and wire protocol v3 are one compatibility boundary.
- Valid v2 lobbies migrate to v3 without a match. Valid v2 idle/complete matches receive a `2n` baseline; active redemption/auction matches preserve live data and receive a conservative `n` baseline excluding the current turn.
- Valid v1 fixed-board rooms continue through the existing v1-to-v2 map migration and then the v2-to-v3 cooldown migration.
- Current validation rejects obsolete `lastAutoGatheringRound`, malformed cooldown windows, and strict public commands containing actor/timer fields before state replacement.
- Once a room is stored as schema v3, do not roll back to a schema-v2 or schema-v1 Worker. Use a verified v3-compatible deployment or roll forward.
- The required Wrangler command is a dry run only; this handoff does not authorize or claim a deployment.

## Verified Behavior

- Targeted Local Playwright covers exact setup grants/bank debit/no repeat; four-player `8` initial and `4` post-start cooldown boundaries; English desktop and Chinese mobile icon/accessibility/overflow; Chinese mobile log/statistics scrolling; and keyboard maritime resource selection.
- Targeted real-Worker Playwright covers three isolated callers, public `6`/post-start `3`, current-caller authorization, exact no-actor intent, one accepted version increment, stale/non-current rejection, reconnect convergence, and adversarial actor/timer-field rejection.
- T007's full gates pass: 36 domain/client files with 502 tests, 9 Worker files with 277 tests, and 55 browser tests across both Playwright projects, followed by both builds, both smoke checks, Wrangler dry-run, repository guards, and `git diff --check`.
- Focused domain, main, Worker, migration, protocol, resource-presentation, accessibility, localization, build, and smoke evidence from T001–T006 is retained in the task history.

## T007 Gate Fixes

- Restored the maritime resource-choice minimum target from 38 px to the repository's 44 px touch-accessibility contract after all three viewport checks reproduced ten undersized buttons.
- Corrected the bounded Online public log to retain the newest six newest-first domain entries. The old negative slice hid current events, including an immediately completed no-token auction.
- Replaced literal parenthetical English plurals for turns and resource cards with count-aware singular/plural messages while retaining the same Chinese counter semantics.
- Eliminated the remaining parenthetical plural markers from Road Building, token-transfer, and auction UI/log/fallback text while preserving the stable protocol log keys.
- Added complete localized hover tooltips to the parent maritime and development resource-choice buttons by reusing each control's existing accessible label.

## Known Out-of-Scope Work

- Three-player Local Game is not a supported product mode; Local remains fixed four-player hot-seat play. Three-player browser math/authority evidence uses a real three-seat Online room as required by GP-046/GP-047.
- Accounts, public matchmaking, cross-device seat recovery, long-term saved games, AI players, and non-standard boards/topologies remain out of scope.
- This task does not deploy, push, merge, or alter Cloudflare traffic.

## Exact Next Action

Integrate `codex/gathering-cooldowns-icons` through the repository's normal merge or pull-request path when authorized. Any production rollout must deploy the schema-v3 Worker and SPA together; this handoff performed only a Wrangler dry run and did not push, merge, deploy, or alter Cloudflare traffic.
