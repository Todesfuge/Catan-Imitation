import { readFileSync, readdirSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createLocalGameTableView } from "../../src/app/localGameState";
import { resources } from "../../src/domain/types";
import { GameTable } from "../../src/ui/GameTable";
import { CommercePanel } from "../../src/ui/CommercePanel";
import {
  ResourceBadge,
  ResourceBundle,
  ResourceIcon
} from "../../src/ui/ResourceBadge";
import { I18nProvider } from "../../src/ui/i18n";
import { createScenarioAppState } from "../fixtures/createScenarioGame";

function renderWithLocale(node: React.ReactNode, locale: "en" | "zh-CN" = "en") {
  return renderToStaticMarkup(
    createElement(I18nProvider, { initialLocale: locale }, node)
  );
}

type SourceEntry = readonly [path: string, source: string];

const productionSourceExtensions = /\.(?:css|html|js|jsx|json|scss|ts|tsx)$/;
const approvedResourceIcons = ["Trees", "BrickWall", "Cloud", "Wheat", "Gem"] as const;
const resourceAssetReference =
  /["'`](?:https?:\/\/|[^"'`]*\/)?[^"'`]*(?:wood|brick|wool|grain|ore|resources?)[^"'`]*\.(?:avif|gif|ico|jpe?g|png|svg|webp)(?:[?#][^"'`]*)?["'`]/i;

function productionSources(): SourceEntry[] {
  return readdirSync("src", { recursive: true })
    .map((path) => path.replaceAll("\\", "/"))
    .filter((path) => productionSourceExtensions.test(path))
    .map((path) => [`src/${path}`, readFileSync(`src/${path}`, "utf8")] as const);
}

function lucideImports(source: string): Set<string> {
  const imports = new Set<string>();
  for (const match of source.matchAll(/import\s*\{([\s\S]*?)\}\s*from\s*["']lucide-react["']/g)) {
    for (const specifier of match[1].split(",")) {
      const localName = specifier.trim().split(/\s+as\s+/).at(-1)?.trim();
      if (localName && !localName.startsWith("type ")) imports.add(localName);
    }
  }
  return imports;
}

function findResourceIconMapOwners(sources: SourceEntry[]): string[] {
  return sources
    .filter(([, source]) => {
      const icons = lucideImports(source);
      if (icons.size === 0) return false;
      return (source.match(/\{[^{}]*\}/g) ?? []).some((objectLiteral) =>
        resources.every((resource) => {
          const mappedName = objectLiteral.match(
            new RegExp(`\\b${resource}\\s*:\\s*([A-Za-z_$][\\w$]*)`)
          )?.[1];
          return Boolean(mappedName && icons.has(mappedName));
        })
      );
    })
    .map(([path]) => path);
}

function findApprovedResourceIconOwners(sources: SourceEntry[]): string[] {
  return sources
    .filter(([, source]) => {
      const imports = lucideImports(source);
      return approvedResourceIcons.some((icon) => imports.has(icon));
    })
    .map(([path]) => path);
}

describe("shared resource presentation", () => {
  it("renders five distinct semantic icon identities with localized names", () => {
    const english = renderWithLocale(
      createElement("div", null, resources.map((resource) =>
        createElement(ResourceIcon, { key: resource, resource })
      ))
    );
    const chinese = renderWithLocale(createElement(ResourceIcon, { resource: "wood" }), "zh-CN");

    for (const [resource, icon, label] of [
      ["wood", "trees", "Wood"],
      ["brick", "brick-wall", "Brick"],
      ["wool", "cloud", "Wool"],
      ["grain", "wheat", "Grain"],
      ["ore", "gem", "Ore"]
    ] as const) {
      expect(english).toContain(`data-resource-icon="${resource}"`);
      expect(english).toContain(`class="lucide lucide-${icon}`);
      expect(english).toContain(`aria-label="${label}"`);
      expect(english).toContain(`resource-${resource}`);
    }
    expect(chinese).toContain('aria-label="木材"');
    expect(chinese).toContain('title="木材"');
  });

  it("keeps integer, decimal, and zero quantities visible and named", () => {
    const html = renderWithLocale(createElement("div", null,
      createElement(ResourceBadge, { resource: "wood", quantity: 0 }),
      createElement(ResourceBadge, { resource: "brick", quantity: 2 }),
      createElement(ResourceBadge, { resource: "wool", quantity: 1.25 }),
      createElement(ResourceBundle, {
        resources: { wood: 1, brick: 0, wool: 0, grain: 2, ore: 0 }
      })
    ));

    expect(html).toContain('data-resource-badge="wood"');
    expect(html).toContain('data-resource-quantity="0"');
    expect(html).toContain('aria-label="Wood: 0"');
    expect(html).toContain('data-resource-quantity="2"');
    expect(html).toContain('data-resource-quantity="1.25"');
    expect(html).toContain('aria-label="Wood: 1, Grain: 2"');
  });

  it("keeps the only resource icon map and resource asset references under the shared owner", () => {
    const sources = productionSources();
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    const resourceAssetDependencies = Object.keys({
      ...packageJson.dependencies,
      ...packageJson.devDependencies
    })
      .filter((dependency) => dependency !== "lucide-react")
      .filter((dependency) => /asset|fontawesome|fortawesome|icons?|images?|svg/i.test(dependency));

    expect(findResourceIconMapOwners(sources)).toEqual(["src/ui/ResourceBadge.tsx"]);
    expect(findApprovedResourceIconOwners(sources)).toEqual(["src/ui/ResourceBadge.tsx"]);
    expect(sources.filter(([, source]) => resourceAssetReference.test(source))).toEqual([]);
    expect(packageJson.dependencies["lucide-react"]).toEqual(expect.any(String));
    expect(resourceAssetDependencies).toEqual([]);
  });

  it("detects a nested untyped duplicate resource-to-Lucide map", () => {
    const duplicate = `
      import { Trees, BrickWall, Cloud, Wheat, Gem } from "lucide-react";
      const presentation = { nested: {
        wood: Trees,
        brick: BrickWall,
        wool: Cloud,
        grain: Wheat,
        ore: Gem
      } };
    `;

    expect(findResourceIconMapOwners([
      ["src/ui/ResourceBadge.tsx", readFileSync("src/ui/ResourceBadge.tsx", "utf8")],
      ["src/nested/Duplicate.tsx", duplicate]
    ])).toEqual(["src/ui/ResourceBadge.tsx", "src/nested/Duplicate.tsx"]);
  });

  it("renders operational action costs, icon choices, trade bundles, and cooldown state", () => {
    const state = createScenarioAppState();
    const view = createLocalGameTableView({
      ...state,
      guild: {
        ...state.guild,
        gatheringCooldown: { availableAtTurn: state.game.turn + 3, displayDuration: 3 }
      }
    });
    const html = renderWithLocale(
      createElement(GameTable, { view, dispatch: () => undefined })
    );

    expect(view.legality.actions.road).toHaveProperty("cost");
    expect(view.legality.actions.settlement).toHaveProperty("cost");
    expect(view.legality.actions.city).toHaveProperty("cost");
    expect(view.legality.actions.buyDevelopmentCard).toHaveProperty("cost");
    expect(html).toContain('data-action-cost="road"');
    expect(html).toContain('aria-label="Maritime give resource"');
    expect(html).toContain('class="resource-choice-group" role="group"');
    expect(html).toContain('data-maritime-give="wood"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).not.toContain('<select aria-label="Maritime give resource"');
    expect(html).toContain('data-player-trade-resource="wood"');
    expect(html).toContain('data-gathering-cooldown="3"');
    expect(html).toContain('3 turn(s) remaining');
    expect(html).toContain('aria-describedby="gathering-start-unavailable-reason"');
  });

  it("renders Commerce costs, redemption controls, and sealed resource counts without resource words", () => {
    const state = createScenarioAppState();
    const redemptionState = {
      ...state,
      game: {
        ...state.game,
        players: state.game.players.map((player) =>
          player.id === state.game.activePlayerId
            ? { ...player, guildTokens: 2 }
            : player
        )
      },
      guild: {
        ...state.guild,
        gathering: { ...state.guild.gathering, phase: "redemption" as const }
      }
    };
    const redemptionView = createLocalGameTableView(redemptionState);
    const redemptionHtml = renderWithLocale(
      createElement(CommercePanel, { state: redemptionView, dispatch: () => undefined })
    );

    expect(redemptionHtml).toContain('class="resource-bundle compact"');
    expect(redemptionHtml).toContain('aria-label="Redeem Wood; 19 in bank"');
    expect(redemptionHtml).toContain('data-resource-badge="wood"');
    expect(redemptionHtml.replace(/<[^>]+>/g, "")).not.toContain("+Wood");

    const resultView = {
      ...redemptionView,
      guild: {
        ...redemptionView.guild,
        gathering: {
          ...redemptionView.guild.gathering,
          phase: "complete" as const,
          lastAuctionResult: {
            winnerName: "Loss",
            round: 2,
            winningBid: 1,
            outcome: { kind: "resources" as const, resourceCardCount: 3 }
          }
        }
      }
    };
    const resultHtml = renderWithLocale(
      createElement(CommercePanel, { state: resultView, dispatch: () => undefined })
    );
    expect(resultHtml).toContain('class="generic-resource-card-count"');
    expect(resultHtml).toContain('title="3 resource card(s)"');
    expect(resultHtml).toContain(
      '<span class="sr-only">Loss won auction round 2 with 1 token(s): 3 resource card(s).</span>'
    );
    expect(resultHtml).not.toContain(
      '<p aria-label="Loss won auction round 2 with 1 token(s): 3 resource card(s)."'
    );
    const visualResult = resultHtml.match(
      /<span aria-hidden="true" class="auction-result-visual">([\s\S]*?)<\/span><\/p>/
    )?.[1] ?? "";
    expect(visualResult).not.toContain("Wood");
    const chineseResultHtml = renderWithLocale(
      createElement(CommercePanel, { state: resultView, dispatch: () => undefined }),
      "zh-CN"
    );
    expect(chineseResultHtml).toContain(
      '<span class="sr-only">Loss 以 1 枚代币赢得第 2 轮拍卖：3 张资源卡。</span>'
    );
  });

  it("marks a zero cooldown as ready with text as well as styling", () => {
    const state = createScenarioAppState();
    const view = createLocalGameTableView({
      ...state,
      guild: {
        ...state.guild,
        gatheringCooldown: {
          availableAtTurn: state.game.turn,
          displayDuration: state.game.players.length
        }
      }
    });
    const html = renderWithLocale(
      createElement(CommercePanel, { state: view, dispatch: () => undefined })
    );
    const css = readFileSync("src/styles/app.css", "utf8");

    expect(html).toContain('data-gathering-cooldown="0"');
    expect(html).toContain("Ready");
    expect(html).toContain('class="gathering-cooldown-badge ready"');
    expect(css).toContain('.gathering-cooldown-badge.ready span::before');
  });
});
