import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createLocalGameTableView } from "../../src/app/localGameState";
import { resources } from "../../src/domain/types";
import { HandSummary } from "../../src/ui/HandSummary";
import { createScenarioAppState } from "../fixtures/createScenarioGame";

function quantities(html: string) {
  return [...html.matchAll(/data-resource-quantity="([^"]+)"/g)].map((match) => Number(match[1]));
}

describe("mobile hand summary", () => {
  it("follows the active player in a shared Local game", () => {
    const state = createScenarioAppState();
    const active = state.game.players[1];
    const view = createLocalGameTableView({ ...state, game: { ...state.game, activePlayerId: active.id } });
    const html = renderToStaticMarkup(createElement(HandSummary, { state: view }));
    expect(html).toContain(`${active.name}&#x27;s resources`);
    expect(quantities(html)).toEqual(resources.map((resource) => active.resources[resource]));
  });

  it("shows only the controlled hand when another online player is active", () => {
    const view = createLocalGameTableView(createScenarioAppState());
    const own = { ...view.controlledPlayers[2], isActive: false,
      resources: { wood: 71, brick: 72, wool: 73, grain: 74, ore: 75 } };
    const html = renderToStaticMarkup(createElement(HandSummary, { state: { ...view, controlledPlayers: [own] } }));
    expect(html).toContain("Your resources");
    expect(quantities(html)).toEqual([71, 72, 73, 74, 75]);
    expect(html).not.toContain(view.controlledPlayers[0].displayName);
  });
});
