import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createInitialAppState } from "../../src/app/gameReducer";
import { emptyResources } from "../../src/domain/types";
import { ActionDock } from "../../src/ui/ActionDock";
import { BoardActionTargets } from "../../src/ui/BoardActionTargets";
import { executeMatchCommandForTest } from "./matchCommandTestUtils";

function createFundedActionState() {
  const initial = createInitialAppState();
  const funded = {
    ...initial,
    game: {
      ...initial.game,
      players: initial.game.players.map((player) =>
        player.id === initial.game.activePlayerId
          ? {
              ...player,
              resources: { ...emptyResources(), wood: 4, brick: 2, wool: 1, grain: 3, ore: 3 }
            }
          : player
      )
    }
  };
  return executeMatchCommandForTest(funded, {
    type: "ROLL_DICE",
    playerId: funded.game.activePlayerId,
    dice: [1, 1]
  });
}

describe("explicit action interaction", () => {
  it("renders selectable build modes and maritime resource controls", () => {
    const state = createFundedActionState();
    const html = renderToString(
      createElement(ActionDock, {
        dispatch: () => undefined,
        interactionMode: null,
        onInteractionModeChange: () => undefined,
        state
      })
    );

    expect(html).toContain('data-action-mode="road"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('aria-label="Maritime give resource"');
    expect(html).toContain('aria-label="Maritime receive resource"');
  });

  it("renders every legal road as a keyboard-accessible board target", () => {
    const state = createFundedActionState();
    const html = renderToString(
      createElement(BoardActionTargets, {
        dispatch: () => undefined,
        state,
        interactionMode: { kind: "road" }
      })
    );

    expect(html).toContain('data-board-action-target="road"');
    expect(html).toContain('role="button"');
    expect(html).toContain('tabindex="0"');
  });
});
