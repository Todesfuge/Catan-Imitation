import { readFileSync, readdirSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createLocalGameTableView } from "../../src/app/localGameState";
import { resources } from "../../src/domain/types";
import { GameTable } from "../../src/ui/GameTable";
import { CommercePanel } from "../../src/ui/CommercePanel";
import { DevelopmentCardPanel } from "../../src/ui/DevelopmentCardPanel";
import {
  ResourceBadge,
  ResourceBundle,
  ResourceIcon
} from "../../src/ui/ResourceBadge";
import { I18nProvider, translate } from "../../src/ui/i18n";
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
    expect(html).toContain('3 turns remaining');
    expect(html).toContain('aria-describedby="gathering-start-unavailable-reason"');
  });

  it("renders count-aware gathering cooldown text in English and Chinese", () => {
    const state = createScenarioAppState();

    for (const [count, english, chinese] of [
      [0, "Ready", "可开启"],
      [1, "1 turn remaining", "还需 1 个回合"],
      [2, "2 turns remaining", "还需 2 个回合"]
    ] as const) {
      const view = createLocalGameTableView({
        ...state,
        guild: {
          ...state.guild,
          gatheringCooldown: {
            availableAtTurn: state.game.turn + count,
            displayDuration: Math.max(1, count)
          }
        }
      });
      const panel = createElement(CommercePanel, { state: view, dispatch: () => undefined });

      expect(renderWithLocale(panel)).toContain(english);
      expect(renderWithLocale(panel, "zh-CN")).toContain(chinese);
    }
  });

  it.each(["en", "zh-CN"] as const)(
    "puts complete localized maritime labels in both aria-label and title in %s",
    (locale) => {
      const view = createLocalGameTableView(createScenarioAppState());
      const html = renderWithLocale(
        createElement(GameTable, { view, dispatch: () => undefined }),
        locale
      );

      for (const resource of resources) {
        for (const attribute of ["data-maritime-give", "data-maritime-receive"] as const) {
          const tag = html.match(
            new RegExp(`<button[^>]*${attribute}="${resource}"[^>]*>`)
          )?.[0] ?? "";
          const ariaLabel = tag.match(/aria-label="([^"]+)"/)?.[1];
          const title = tag.match(/title="([^"]+)"/)?.[1];

          expect(ariaLabel).toContain(translate(locale, `resource.${resource}`));
          expect(title).toBe(ariaLabel);
        }
      }
    }
  );

  it.each(["en", "zh-CN"] as const)(
    "puts complete localized development resource-choice labels in both aria-label and title in %s",
    (locale) => {
      const state = createScenarioAppState();

      for (const effect of [
        {
          kind: "yearOfPlenty" as const,
          playerId: state.game.activePlayerId,
          remainingPicks: 2,
          resumePhase: "action" as const
        },
        {
          kind: "monopoly" as const,
          playerId: state.game.activePlayerId,
          resumePhase: "action" as const
        }
      ]) {
        const view = createLocalGameTableView({
          ...state,
          game: {
            ...state.game,
            turnState: {
              phase: "awaitingDevelopmentEffect" as const,
              pendingDiscards: {},
              developmentCardPlayed: true,
              pendingDevelopmentEffect: effect
            }
          }
        });
        const html = renderWithLocale(
          createElement(DevelopmentCardPanel, { state: view, dispatch: () => undefined }),
          locale
        );

        for (const resource of resources) {
          const tag = html.match(
            new RegExp(`<button[^>]*data-resource-choice="${resource}"[^>]*>`)
          )?.[0] ?? "";
          const ariaLabel = tag.match(/aria-label="([^"]+)"/)?.[1];
          const title = tag.match(/title="([^"]+)"/)?.[1];

          expect(ariaLabel).toContain(translate(locale, `resource.${resource}`));
          expect(title).toBe(ariaLabel);
        }
      }
    }
  );

  it("renders complete private and bank inventories as five semantic resource badges", () => {
    const html = renderWithLocale(
      createElement(GameTable, {
        view: createLocalGameTableView(createScenarioAppState()),
        dispatch: () => undefined
      })
    );
    const privateInventory = html.match(
      /data-resource-inventory="private">([\s\S]*?)<\/div>/
    )?.[1] ?? "";
    const bankInventory = html.match(
      /data-resource-inventory="bank">([\s\S]*?)<\/div>/
    )?.[1] ?? "";

    expect(html.match(/data-resource-inventory="private"/g)).toHaveLength(4);
    expect(privateInventory.match(/data-resource-badge=/g)).toHaveLength(5);
    expect(bankInventory.match(/data-resource-badge=/g)).toHaveLength(5);
    expect(html).toContain('aria-label="Wood: 0, Brick: 0, Wool: 0, Grain: 0, Ore: 0"');
    expect(html).toContain('data-resource-inventory="bank"');
  });

  it("renders statistics with icon bundles, decimal quantities, and semantic matrix headers", () => {
    const html = renderWithLocale(
      createElement(GameTable, {
        view: createLocalGameTableView(createScenarioAppState()),
        dispatch: () => undefined
      })
    );
    const source = readFileSync("src/ui/GameTable.tsx", "utf8");

    expect(html).toContain('data-stat-resource-bundle="gain"');
    expect(html).toContain('data-resource-quantity="0.11"');
    expect(source).toContain('data-stat-resource-bundle="dice"');
    expect(source).toContain("<ResourceIcon resource={resource}");
    expect(source).toContain('scope="col"');
    expect(source).toContain('t("stats.noGain")');
    expect(source).not.toContain("formatResourceMap(row.resources");
    expect(source).not.toContain("formatResourceMap(row.expected");
    expect(source).not.toContain("formatResourceMap(diceIncome");
  });

  it("renders produced-resource and resource-port icons without visible terrain words", () => {
    const html = renderWithLocale(
      createElement(GameTable, {
        view: createLocalGameTableView(createScenarioAppState()),
        dispatch: () => undefined
      })
    ).replaceAll("<!-- -->", "");
    const nonDesertHexes = createScenarioAppState().game.board.filter((hex) => hex.resource);
    const desertHexes = createScenarioAppState().game.board.filter((hex) => !hex.resource);

    expect(html.match(/data-board-resource=/g)).toHaveLength(nonDesertHexes.length);
    expect(html.match(/data-board-resource="desert"/g) ?? []).toHaveLength(0);
    expect(desertHexes).toHaveLength(1);
    expect(html).toContain('class="dice-pips"');
    expect(html).not.toContain('class="terrain-icon"');
    expect(html).not.toContain('class="hex-resource"');
    expect(html).toContain('data-port-kind="generic"');
    expect(html).toContain('data-port-kind="resource"');
    expect(html).toContain('data-port-resource="wood"');
    expect(html).toContain('aria-label="2:1 Wood port"');
    expect(html).toContain('<title>2:1 Wood port</title>');
    expect(html).toContain('<title>Forest; Wood</title>');
    expect(html).toContain('>2:1</text>');
    expect(html).not.toContain('>2:1 Wood</text>');
  });

  it.each(["en", "zh-CN"] as const)(
    "names each board hex terrain and produced resource in %s accessible semantics",
    (locale) => {
      const state = createScenarioAppState();
      const html = renderWithLocale(
        createElement(GameTable, {
          view: createLocalGameTableView(state),
          dispatch: () => undefined
        }),
        locale
      );
      const semantics = [...html.matchAll(
        /<g aria-label="([^"]+)" class="hex-tile"[^>]*><title>([^<]+)<\/title>/g
      )].map((match) => ({ ariaLabel: match[1], title: match[2] }));

      expect(semantics).toHaveLength(state.game.board.length);
      expect(semantics).toEqual(state.game.board.map((hex) => {
        const terrain = translate(locale, `terrain.${hex.terrain}`);
        const label = hex.resource
          ? `${terrain}; ${translate(locale, `resource.${hex.resource}`)}`
          : terrain;
        return { ariaLabel: label, title: label };
      }));
      expect(html.match(/data-board-resource=/g)).toHaveLength(
        state.game.board.filter((hex) => hex.resource).length
      );
      expect(html).not.toContain('data-board-resource="desert"');
    }
  );

  it("keeps bilingual icon semantics and resource layouts contained at narrow widths", () => {
    const chinese = renderWithLocale(
      createElement(GameTable, {
        view: createLocalGameTableView(createScenarioAppState()),
        dispatch: () => undefined
      }),
      "zh-CN"
    );
    const wood = translate("zh-CN", "resource.wood");
    const forest = translate("zh-CN", "terrain.forest");
    const css = readFileSync("src/styles/app.css", "utf8");

    expect(chinese).toContain(`data-resource-icon="wood"`);
    expect(chinese).toContain(translate("zh-CN", "resource.quantity", { resource: wood, quantity: 0 }));
    expect(chinese).toContain(
      `aria-label="${forest}; ${wood}"`
    );
    expect(css).toMatch(/\.resource-strip\s*{[^}]*max-width:\s*100%/);
    expect(css).toMatch(/\.resource-bundle\s*{[^}]*flex-wrap:\s*wrap/);
    expect(css).toContain("@media (max-width: 640px)");
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
    expect(resultHtml).toContain('title="3 resource cards"');
    expect(resultHtml).toContain(
      '<span class="sr-only">Loss won auction round 2 with 1 token: 3 resource cards.</span>'
    );
    expect(resultHtml).not.toContain(
      '<p aria-label="Loss won auction round 2 with 1 token: 3 resource cards."'
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

  it("renders generic auction resource-card counts with English singular and plural forms", () => {
    const baseView = createLocalGameTableView(createScenarioAppState());

    for (const [count, english, chinese] of [
      [0, "0 resource cards", "0 张资源卡"],
      [1, "1 resource card", "1 张资源卡"],
      [2, "2 resource cards", "2 张资源卡"]
    ] as const) {
      const view = {
        ...baseView,
        guild: {
          ...baseView.guild,
          gathering: {
            ...baseView.guild.gathering,
            phase: "complete" as const,
            lastAuctionResult: {
              winnerName: "Loss",
              round: 2,
              winningBid: 1,
              outcome: { kind: "resources" as const, resourceCardCount: count }
            }
          }
        }
      };
      const panel = createElement(CommercePanel, { state: view, dispatch: () => undefined });

      expect(renderWithLocale(panel)).toContain(`title="${english}"`);
      expect(renderWithLocale(panel, "zh-CN")).toContain(`title="${chinese}"`);
    }
  });

  it("renders Commerce auction bids with count-aware English token grammar", () => {
    const baseView = createLocalGameTableView(createScenarioAppState());

    for (const [bid, tokenWord] of [
      [0, "tokens"],
      [1, "token"],
      [2, "tokens"]
    ] as const) {
      const view = {
        ...baseView,
        guild: {
          ...baseView.guild,
          gathering: {
            ...baseView.guild.gathering,
            phase: "complete" as const,
            lastAuctionResult: {
              winnerName: "Loss",
              round: 2,
              winningBid: bid,
              outcome: { kind: "resources" as const, resourceCardCount: 2 }
            }
          }
        }
      };
      const panel = createElement(CommercePanel, { state: view, dispatch: () => undefined });

      expect(renderWithLocale(panel)).toContain(
        `Loss won auction round 2 with ${bid} ${tokenWord}: 2 resource cards.`
      );
      expect(renderWithLocale(panel, "zh-CN")).toContain(
        `Loss 以 ${bid} 枚代币赢得第 2 轮拍卖：2 张资源卡。`
      );
    }
  });

  it("renders Road Building remaining counts with English singular and plural forms", () => {
    const state = createScenarioAppState();

    for (const [count, english] of [
      [0, "0 free roads remaining"],
      [1, "1 free road remaining"],
      [2, "2 free roads remaining"]
    ] as const) {
      const view = createLocalGameTableView({
        ...state,
        game: {
          ...state.game,
          turnState: {
            phase: "awaitingDevelopmentEffect" as const,
            pendingDiscards: {},
            developmentCardPlayed: true,
            pendingDevelopmentEffect: {
              kind: "roadBuilding" as const,
              playerId: state.game.activePlayerId,
              remainingRoads: count,
              resumePhase: "action" as const
            }
          }
        }
      });
      const panel = createElement(DevelopmentCardPanel, { state: view, dispatch: () => undefined });

      expect(renderWithLocale(panel)).toContain(english);
      expect(renderWithLocale(panel, "zh-CN")).toContain(`还可免费放置 ${count} 条道路`);
    }
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
