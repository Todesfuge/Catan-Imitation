# Quickstart

Status: Verified through U046.

## Expected Commands

```bash
pnpm install
pnpm dev -- --port 5173
pnpm test
pnpm build
pnpm build:pages
pnpm smoke:ui
```

## Manual Demo Path

1. Start the app and open the local Vite URL.
2. Confirm the screen shows a Catan-like board, right information column, and bottom action bar.
3. Use the demo preset or setup controls to begin a local hot-seat game.
4. Roll dice and confirm resources are distributed to adjacent settlements/cities.
5. Open the statistics panel and check player, dice, and full matrix views.
6. Complete one Commerce Guild trade slot and confirm tokens increase and the slot refreshes.
7. Trigger a guild gathering, redeem up to 4 resources for one player, run three auctions, and resolve blind boxes.
8. Redeem vouchers into a prize card and confirm score changes.

## Core Rule Integrity Manual Path

1. Start a fresh turn and confirm build, trade, and end-turn actions are unavailable before rolling.
2. Roll a non-seven once; confirm a second roll is unavailable and normal actions become available.
3. End the turn and confirm the dice display resets for the next active player.
4. Use a deterministic or prepared state that rolls 7 with at least one player holding more than seven cards.
5. Submit that player's chosen discard combination and confirm the exact required count returns to the bank.
6. Confirm the robber cannot remain on its current hex, then move it to a hex adjacent to multiple opponents.
7. Select one eligible opponent and confirm one random resource moves to the active player before normal actions resume.
8. Play a knight before rolling and confirm the robber interaction returns to the waiting-for-roll phase.
9. On later turns, play Road Building and choose two legal road edges; confirm no wood/brick is spent and Longest Road updates after each placement.
10. Play Year of Plenty, choose two available resources (including the same resource twice), and confirm both cards leave the bank.
11. Play Monopoly, choose one resource, and confirm every opponent transfers all matching cards while the bank stays unchanged.
12. Confirm a second non-victory development card cannot be played in the same turn and a newly acquired card cannot be played immediately.
13. Inspect the nine visible coastal ports, build on either endpoint of a generic and resource port, and confirm Maritime ratios change from 4:1 to 3:1 or 2:1 as applicable.
9. Attempt a normal settlement away from the active player's roads and confirm a recoverable error.
10. Exercise a Commerce Guild trade, gathering redemption, and resource blind box while watching bank totals remain conserved.
