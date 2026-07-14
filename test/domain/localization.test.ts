import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import App from "../../src/App";
import {
  I18nProvider,
  formatAuctionSummary,
  formatGameLogEntry,
  readStoredLocale,
  translate,
  translateRuleText
} from "../../src/ui/i18n";

describe("English and Simplified Chinese localization", () => {
  it("defaults invalid or unavailable session storage to English", () => {
    expect(readStoredLocale(undefined)).toBe("en");
    expect(readStoredLocale({ getItem: () => "fr" })).toBe("en");
    expect(
      readStoredLocale({
        getItem: () => {
          throw new Error("storage disabled");
        }
      })
    ).toBe("en");
    expect(readStoredLocale({ getItem: () => "zh-CN" })).toBe("zh-CN");
  });

  it("localizes resource quantities, bundles, and generic card counts", () => {
    expect(translate("en", "resource.quantity", { resource: "Wood", quantity: 2 })).toBe("Wood: 2");
    expect(translate("en", "resource.bundleSeparator")).toBe(", ");
    expect(translate("en", "resource.cardsGeneric.one", { count: 1 })).toBe("1 resource card");
    expect(translate("en", "resource.cardsGeneric.other", { count: 0 })).toBe("0 resource cards");
    expect(translate("en", "resource.cardsGeneric.other", { count: 2 })).toBe("2 resource cards");
    expect(translate("zh-CN", "resource.quantity", { resource: "木材", quantity: 2 })).not.toBe("Wood: 2");
    expect(translate("zh-CN", "resource.cardsGeneric.one", { count: 1 })).toBe("1 张资源卡");
    expect(translate("zh-CN", "resource.cardsGeneric.other", { count: 0 })).toBe("0 张资源卡");
    expect(translate("zh-CN", "resource.cardsGeneric.other", { count: 2 })).toBe("2 张资源卡");
  });

  it("renders English by default and the approved core surfaces in Chinese", () => {
    const english = renderToString(createElement(App));
    expect(english).toContain("Game Log");
    expect(english).toContain("Yield Statistics");
    expect(english).toContain("Roll Dice");

    const chinese = renderToString(
      createElement(I18nProvider, { initialLocale: "zh-CN" }, createElement(App))
    );
    for (const text of ["游戏日志", "产出统计", "掷骰子", "玩家交易", "发布公开报价"]) {
      expect(chinese).toContain(text);
    }
  });

  it("translates keyed historical logs and common rule notices without mutating their data", () => {
    const entry = {
      id: "log-roll",
      message: "Voyage1969 rolled 8; 2 production events resolved.",
      messageKey: "dice.rolled" as const,
      params: { playerName: "Voyage1969", total: 8, eventCount: 2 }
    };
    const snapshot = structuredClone(entry);

    expect(formatGameLogEntry(entry, "en")).toBe(entry.message);
    expect(formatGameLogEntry(entry, "zh-CN")).toBe("Voyage1969 掷出了 8；已结算 2 次资源产出。");
    expect(entry).toEqual(snapshot);
    expect(translateRuleText("zh-CN", "Roll the dice before using normal turn actions.")).toBe(
      "执行常规回合操作前请先掷骰子。"
    );
    expect(translate("zh-CN", "resource.ore")).toBe("矿石");
    expect(translateRuleText("zh-CN", "Loss bid exceeds available guild tokens.")).toBe(
      "Loss 的出价超过了可用公会代币。"
    );
    expect(
      formatAuctionSummary(
        {
          winnerId: "p2",
          winnerName: "Loss",
          round: 2,
          winningBid: 3,
          outcome: {
            kind: "resources",
            resources: { wood: 2, brick: 0, wool: 0, grain: 1, ore: 0 }
          }
        },
        "zh-CN"
      )
    ).toBe("Loss 以 3 枚代币赢得第 2 轮拍卖：资源：木材 2, 粮食 1。");
  });

  it("uses count-aware token grammar in auction summaries and keyed logs", () => {
    for (const [count, tokenWord] of [
      [0, "tokens"],
      [1, "token"],
      [2, "tokens"]
    ] as const) {
      const auction = {
        winnerId: "p2",
        winnerName: "Loss",
        round: 2,
        winningBid: count,
        outcome: { kind: "voucher" as const }
      };
      expect(formatAuctionSummary(auction, "en")).toBe(
        `Loss won auction round 2 with ${count} ${tokenWord}: voucher.`
      );
      expect(formatAuctionSummary(auction, "zh-CN")).toBe(
        `Loss 以 ${count} 枚代币赢得第 2 轮拍卖：1 张兑换券。`
      );

      expect(formatGameLogEntry({
        id: `transfer-${count}`,
        message: "fallback",
        messageKey: "guild.tokensTransferred",
        params: { fromName: "Earnest", amount: count, toName: "Loss" }
      }, "en")).toBe(`Earnest transferred ${count} guild ${tokenWord} to Loss.`);
      expect(formatGameLogEntry({
        id: `transfer-zh-${count}`,
        message: "fallback",
        messageKey: "guild.tokensTransferred",
        params: { fromName: "Earnest", amount: count, toName: "Loss" }
      }, "zh-CN")).toBe(`Earnest 向 Loss 转移了 ${count} 枚公会代币。`);

      const auctionLog = {
        id: `auction-${count}`,
        message: "fallback",
        messageKey: "guild.auctionResolved" as const,
        params: {
          winnerName: "Loss",
          round: 2,
          bid: count,
          outcomeKind: "voucher"
        }
      };
      expect(formatGameLogEntry(auctionLog, "en")).toBe(
        `Loss won auction round 2 with ${count} ${tokenWord}: voucher.`
      );
      expect(formatGameLogEntry(auctionLog, "zh-CN")).toBe(
        `Loss 以 ${count} 枚代币赢得第 2 轮拍卖：1 张兑换券。`
      );
    }
  });

  it("keeps complete resource names in natural-language logs after operational labels become icons", () => {
    const entry = {
      id: "log-maritime",
      message: "Earnest completed a maritime trade: wood for ore.",
      messageKey: "trade.maritime" as const,
      params: { playerName: "Earnest", give: "wood", receive: "ore" }
    };

    expect(formatGameLogEntry(entry, "en")).toContain("Wood for Ore");
    expect(formatGameLogEntry(entry, "zh-CN")).toContain(translate("zh-CN", "resource.wood"));
    expect(formatGameLogEntry(entry, "zh-CN")).toContain(translate("zh-CN", "resource.ore"));
  });

  it("keeps every seed and restart message complete with English as the default locale", () => {
    const keys = [
      "settings.mapSeed",
      "settings.copySeed",
      "settings.copySeedSuccess",
      "settings.copySeedFailed",
      "settings.restartTitle",
      "settings.restartDescription",
      "settings.newRandomMap",
      "settings.replayCurrentMap",
      "settings.restartConfirmFresh",
      "settings.restartConfirmSameMap",
      "settings.restartConfirm",
      "settings.restartCancel"
    ] as const;

    for (const key of keys) {
      const english = translate("en", key as Parameters<typeof translate>[1]);
      const chinese = translate("zh-CN", key as Parameters<typeof translate>[1]);
      expect(english, key).toBeTruthy();
      expect(chinese, key).toBeTruthy();
      expect(chinese, key).not.toBe(english);
    }
    expect(translate("en", "settings.copySeed" as Parameters<typeof translate>[1])).toBe("Copy Seed");
    expect(readStoredLocale(undefined)).toBe("en");
  });

  it("links complete English and Chinese README documents reciprocally", () => {
    const englishReadme = readFileSync("README.md", "utf8");
    const chineseReadme = readFileSync("README.zh-CN.md", "utf8");

    expect(englishReadme).toContain("README.zh-CN.md");
    expect(chineseReadme).toContain("README.md");
    for (const heading of ["项目范围", "安装与启动", "游戏玩法", "测试", "部署", "项目文档"]) {
      expect(chineseReadme).toContain(heading);
    }
  });

  it("keeps the seeded-map release behavior explicit in both README languages", () => {
    const englishReadme = readFileSync("README.md", "utf8");
    const chineseReadme = readFileSync("README.zh-CN.md", "utf8");

    for (const claim of [
      "Every new game uses a randomized standard 19-hex map",
      "Local Game opens in a real empty setup",
      "The seed stays selectable as a manual copy fallback",
      "Only the Online host can restart",
      "`M0-STANDARD` is migration-only",
      "Compatible v1 rooms continue through the existing fixed-board migration chain"
    ]) {
      expect(englishReadme).toContain(claim);
    }
    for (const claim of [
      "每局新游戏都使用随机化的标准 19 地块地图",
      "本地游戏会直接进入真实的空白开局设置",
      "种子仍可选中，作为手动复制的后备方式",
      "只有联机房主可以重开",
      "`M0-STANDARD` 仅用于迁移",
      "兼容的 v1 房间继续通过既有固定棋盘迁移链升级"
    ]) {
      expect(chineseReadme).toContain(claim);
    }
  });

  it("keeps gathering pacing, setup grants, icons, and v3 deployment explicit in both languages", () => {
    const englishReadme = readFileSync("README.md", "utf8");
    const chineseReadme = readFileSync("README.zh-CN.md", "utf8");

    for (const claim of [
      "English interface by default",
      "table-wide gathering cooldown",
      "second setup settlement",
      "accessible resource icons",
      "storage schema v3 and wire protocol v3"
    ]) {
      expect(englishReadme).toContain(claim);
    }
    for (const claim of [
      "界面默认使用英文",
      "全桌集会冷却",
      "第二个初始村庄",
      "无障碍资源图标",
      "存储架构 v3 和联机协议 v3"
    ]) {
      expect(chineseReadme).toContain(claim);
    }
  });
});
