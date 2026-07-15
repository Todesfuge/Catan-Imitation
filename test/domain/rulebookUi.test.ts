import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildCosts } from "../../src/domain/rules/building";
import { resources, type ResourceMap } from "../../src/domain/types";
import {
  RulebookChapterContent,
  rulebookChapterIds,
  type RulebookChapterId
} from "../../src/ui/rulebook/RulebookContent";
import { rulebookMessages } from "../../src/ui/rulebook/messages";
import { RulebookPanel } from "../../src/ui/rulebook/RulebookPanel";
import {
  I18nProvider,
  translate,
  type Locale,
  type MessageKey
} from "../../src/ui/i18n";

function renderChapter(chapter: RulebookChapterId, locale: Locale = "en"): string {
  return renderToStaticMarkup(
    createElement(
      I18nProvider,
      { initialLocale: locale },
      createElement(RulebookChapterContent, { chapter })
    )
  );
}

function renderPanel(locale: Locale = "en"): string {
  return renderToStaticMarkup(
    createElement(
      I18nProvider,
      { initialLocale: locale },
      createElement(RulebookPanel)
    )
  );
}

function expectedBundleLabel(locale: Locale, bundle: ResourceMap): string {
  return resources
    .filter((resource) => bundle[resource] > 0)
    .map((resource) =>
      translate(locale, "resource.quantity", {
        resource: translate(locale, `resource.${resource}`),
        quantity: bundle[resource]
      })
    )
    .join(translate(locale, "resource.bundleSeparator"));
}

function expectTopics(html: string, topics: readonly string[]): void {
  for (const topic of topics) {
    expect(html, topic).toContain(`data-rulebook-topic="${topic}"`);
  }
}

describe("comprehensive in-game rulebook content", () => {
  it("keeps every rulebook message complete in English and Simplified Chinese", () => {
    expect(Object.keys(rulebookMessages).length).toBeGreaterThan(70);

    for (const [key, message] of Object.entries(rulebookMessages)) {
      expect(key).toMatch(/^rulebook\./);
      expect(message.en.trim(), `${key} English`).not.toBe("");
      expect(message["zh-CN"].trim(), `${key} Chinese`).not.toBe("");
      expect(translate("en", key as MessageKey), `${key} English translation`).toBe(message.en);
      expect(translate("zh-CN", key as MessageKey), `${key} Chinese translation`).toBe(
        message["zh-CN"]
      );
      expect(translate("en", key as MessageKey)).not.toBe(key);
      expect(translate("zh-CN", key as MessageKey)).not.toBe(key);
    }
  });

  it("defines exactly four ordered chapters and renders only the requested chapter", () => {
    expect(rulebookChapterIds).toEqual([
      "quickStart",
      "baseRules",
      "commerceGuild",
      "quickReference"
    ]);

    for (const chapter of rulebookChapterIds) {
      const html = renderChapter(chapter);
      expect(html).toContain(`data-rulebook-chapter="${chapter}"`);
      expect(html).toMatch(new RegExp(`data-rulebook-chapter="${chapter}"><h3>`));
      expect(html).not.toContain("<h2>");
      for (const other of rulebookChapterIds.filter((candidate) => candidate !== chapter)) {
        expect(html).not.toContain(`data-rulebook-chapter="${other}"`);
      }
    }
  });

  it("teaches a first game in play order with setup and turn examples", () => {
    const english = renderChapter("quickStart");
    const chinese = renderChapter("quickStart", "zh-CN");

    expectTopics(english, [
      "objective",
      "resources",
      "setup",
      "setup-example",
      "turn",
      "turn-example",
      "seven",
      "victory"
    ]);
    expectTopics(chinese, [
      "objective",
      "resources",
      "setup",
      "setup-example",
      "turn",
      "turn-example",
      "seven",
      "victory"
    ]);

    for (const phrase of [
      "target score shown by the game",
      "snake order",
      "second settlement",
      "Resolve every mandatory decision",
      "more than seven resource cards",
      "different hex"
    ]) {
      expect(english).toContain(phrase);
    }
    for (const phrase of ["游戏显示的目标分数", "蛇形顺序", "第二座村庄", "超过七张资源卡", "另一个地块"]) {
      expect(chinese).toContain(phrase);
    }
    expect(english).toContain("Setup example");
    expect(english).toContain("Turn example");
    expect(chinese).toContain("设置示例");
    expect(chinese).toContain("回合示例");
  });

  it("documents exact base rules, development effects, robber privacy, and awards", () => {
    const english = renderChapter("baseRules");
    const chinese = renderChapter("baseRules", "zh-CN");

    expectTopics(english, [
      "production",
      "building",
      "trade",
      "development",
      "robber",
      "scoring",
      "base-misunderstandings"
    ]);
    expectTopics(chinese, [
      "production",
      "building",
      "trade",
      "development",
      "robber",
      "scoring",
      "base-misunderstandings"
    ]);

    for (const phrase of [
      "4:1",
      "3:1",
      "2:1",
      "Knight",
      "Road Building",
      "Year of Plenty",
      "Monopoly",
      "Victory Point",
      "five connected roads",
      "three played knights",
      "strictly exceeds",
      "hidden",
      "Common misunderstandings"
    ]) {
      expect(english).toContain(phrase);
    }
    for (const phrase of ["骑士", "道路建设", "丰收年", "垄断", "胜利点", "五条相连道路", "三张已使用的骑士卡", "常见误解"]) {
      expect(chinese).toContain(phrase);
    }
  });

  it("explains the complete Commerce Guild lifecycle and every termination case", () => {
    const english = renderChapter("commerceGuild");
    const chinese = renderChapter("commerceGuild", "zh-CN");

    expectTopics(english, [
      "trade-slots",
      "tokens",
      "cooldown",
      "redemption",
      "auction",
      "outcomes",
      "prizes",
      "guild-misunderstandings"
    ]);
    expectTopics(chinese, [
      "trade-slots",
      "tokens",
      "cooldown",
      "redemption",
      "auction",
      "outcomes",
      "prizes",
      "guild-misunderstandings"
    ]);

    for (const phrase of [
      "2n",
      "n-turn",
      "initiating turn",
      "four resources per player",
      "three sealed rounds",
      "replace a submitted bid",
      "turn order breaks the tie",
      "no eligible token holder",
      "zero bids",
      "three vouchers",
      "Common misunderstandings"
    ]) {
      expect(english).toContain(phrase);
    }
    for (const phrase of ["2n", "n 回合", "发起回合", "每名玩家", "最多兑换四份资源", "三轮密封拍卖", "替换已提交的出价", "没有符合条件的代币持有者", "零出价", "三张兑换券", "常见误解"]) {
      expect(chinese).toContain(phrase);
    }
  });

  it("renders authoritative costs, terrain icons, points, blockers, and operation guidance", () => {
    for (const locale of ["en", "zh-CN"] as const) {
      const html = renderChapter("quickReference", locale);
      expectTopics(html, [
        "turn-checklist",
        "costs",
        "terrain",
        "ports",
        "points",
        "blockers",
        "input",
        "final"
      ]);

      for (const cost of Object.values(buildCosts)) {
        expect(html).toContain(`aria-label="${expectedBundleLabel(locale, cost)}"`);
      }
      for (const resource of resources) {
        expect(html).toContain(`data-resource-icon="${resource}"`);
        expect(html).toContain(`aria-label="${translate(locale, `resource.${resource}`)}"`);
      }
      expect(html).toContain("4:1");
      expect(html).toContain("3:1");
      expect(html).toContain("2:1");
      expect(html).not.toContain(locale === "en" ? "Desert — Desert" : "沙漠 — 沙漠");
      expect(html).not.toMatch(/rulebook\.[A-Za-z0-9_.-]+/);
    }

    const english = renderChapter("quickReference");
    for (const phrase of [
      "wrong player",
      "insufficient player resources",
      "bank stock",
      "invalid target",
      "pending player trade",
      "gathering is active",
      "cooldown remains",
      "keyboard",
      "touch",
      "internal scroll area",
      "End of quick reference"
    ]) {
      expect(english).toContain(phrase);
    }
  });

  it("keeps long-form help static and outside game/protocol owners", () => {
    const source = readFileSync("src/ui/rulebook/RulebookContent.tsx", "utf8");
    const messages = readFileSync("src/ui/rulebook/messages.ts", "utf8");

    for (const forbidden of [
      "GameTableView",
      "dispatch",
      "useEffect",
      "localStorage",
      "sessionStorage"
    ]) {
      expect(source).not.toContain(forbidden);
      expect(messages).not.toContain(forbidden);
    }
    expect(source).toContain("buildCosts");
    expect(source).toContain("ResourceBundle");
    expect(source).toContain("ResourceIcon");
  });

  it("renders one ordered, labelled ARIA tab interface before the language control", () => {
    const html = renderPanel();

    expect(html.match(/role="tablist"/g)).toHaveLength(1);
    expect(html.match(/role="tab"/g)).toHaveLength(4);
    expect(html.match(/role="tabpanel"/g)).toHaveLength(1);
    expect(html.indexOf('role="tablist"')).toBeLessThan(
      html.indexOf('data-rulebook-language-select="true"')
    );

    for (const [index, chapter] of rulebookChapterIds.entries()) {
      const tabId = `rulebook-tab-${chapter}`;
      const panelId = `rulebook-panel-${chapter}`;
      const tabPattern = new RegExp(
        `<button[^>]*aria-controls="${panelId}"[^>]*aria-selected="${index === 0 ? "true" : "false"}"[^>]*id="${tabId}"[^>]*role="tab"[^>]*tabindex="${index === 0 ? "0" : "-1"}"`
      );
      expect(html, chapter).toMatch(tabPattern);
    }

    expect(html).toContain('aria-labelledby="rulebook-tab-quickStart"');
    expect(html).toContain('id="rulebook-panel-quickStart"');
    expect(html).not.toContain('id="rulebook-panel-baseRules"');
    expect(html).not.toContain('id="rulebook-panel-commerceGuild"');
    expect(html).not.toContain('id="rulebook-panel-quickReference"');
  });

  it("delegates only the rulebook branch and scopes its responsive scroll contract", () => {
    const utility = readFileSync("src/ui/UtilityDialog.tsx", "utf8");
    const i18n = readFileSync("src/ui/i18n.ts", "utf8");
    const styles = readFileSync("src/styles/app.css", "utf8");

    expect(utility).toContain('from "./rulebook/RulebookPanel"');
    expect(utility).toContain("<RulebookPanel />");
    expect(utility).toMatch(/className=\{[^}]*modal-card--rulebook[^}]*\}/s);
    expect(utility).toContain('panel === "settings"');
    expect(utility).toContain('panel === "info"');
    expect(utility).not.toMatch(/dialog\.rule[1-4]/);
    expect(i18n).not.toMatch(/"dialog\.rule[1-4]"/);

    expect(styles).toMatch(/\.modal-card--rulebook\s*\{[^}]*width:\s*min\(760px,\s*100%\)[^}]*display:\s*flex[^}]*flex-direction:\s*column[^}]*overflow:\s*hidden/s);
    expect(styles).toMatch(/\.rulebook-panel\s*\{[^}]*min-height:\s*0[^}]*overflow-y:\s*auto[^}]*overflow-x:\s*hidden/s);
    expect(styles).toMatch(/\.rulebook-tabs\s*\{[^}]*min-width:\s*0[^}]*overflow-x:\s*auto/s);
    expect(styles).toMatch(/\.rulebook-tabs button:focus-visible\s*\{[^}]*outline:/s);
    expect(styles).toMatch(/\.rulebook-tabs button\[aria-selected="true"\]\s*\{[^}]*font-weight:/s);
    expect(styles).toMatch(/@media \(max-width:\s*640px\)[\s\S]*\.modal-card--rulebook[\s\S]*\.rulebook-tabs button\s*\{[^}]*min-height:\s*44px/s);
  });
});
