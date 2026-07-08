import { describe, expect, it } from "vitest";
import { createDemoGame } from "../../src/domain/setup";
import { collectProduction } from "../../src/domain/rules/production";
import type { ResourceMap } from "../../src/domain/types";

describe("dice production", () => {
  it("gives one resource for settlements and two for cities adjacent to the rolled number", () => {
    const game = createDemoGame();

    const production = collectProduction(game, 8);

    expect(production.byPlayer.p1).toMatchObject<ResourceMap>({
      wood: 0,
      brick: 0,
      wool: 2,
      grain: 0,
      ore: 0
    });
    expect(production.byPlayer.p2).toMatchObject<ResourceMap>({
      wood: 0,
      brick: 0,
      wool: 0,
      grain: 0,
      ore: 1
    });
  });

  it("blocks production on the robber hex", () => {
    const game = {
      ...createDemoGame(),
      robberHexId: "pasture-8"
    };

    const production = collectProduction(game, 8);

    expect(production.byPlayer.p1.wool).toBe(0);
    expect(production.events.every((event) => event.hexId !== "pasture-8")).toBe(true);
  });
});

