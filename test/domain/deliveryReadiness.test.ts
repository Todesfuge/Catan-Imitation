import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(path, "utf8");
}

describe("delivery readiness", () => {
  it("keeps the prepared demo-game factory out of production source", () => {
    const productionSources = import.meta.glob(
      ["../../src/**/*.{ts,tsx}", "../../worker/**/*.ts"],
      { eager: true, import: "default", query: "?raw" }
    ) as Record<string, string>;
    const offenders = Object.entries(productionSources)
      .filter(([, source]) => source.includes("createDemoGame"))
      .map(([path]) => path);

    expect(offenders).toEqual([]);
  });

  it("exposes CI, Worker deployment, and UI smoke commands", () => {
    const packageJson = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    const ci = read(".github/workflows/ci.yml");
    const readme = read("README.md");
    const quickstart = read("specs/002-cloudflare-online-multiplayer/quickstart.md");
    const workerSmoke = read("scripts/smoke-worker.mjs");
    const workspace = read("pnpm-workspace.yaml");

    expect(packageJson.scripts["smoke:ui"]).toBe("node scripts/smoke-ui.mjs");
    expect(packageJson.scripts["build:worker"]).toContain("tsc -p tsconfig.worker.json");
    expect(workspace).toContain("allowBuilds:");
    expect(workspace).toContain("  esbuild: true");
    expect(ci).toContain("node-version: 22");
    expect(ci).toContain("      - main");
    expect(ci).toContain("pnpm install --frozen-lockfile");
    expect(ci).toContain("pnpm test");
    expect(ci).toContain("pnpm build");
    expect(ci).toContain("pnpm smoke:ui");
    expect(existsSync(".github/workflows/pages.yml")).toBe(false);
    expect(readme).toContain("https://catan-imitation.catan-imitation.workers.dev/");
    expect(readme).not.toContain("https://catan-imitation.workers.dev");
    expect(readme).toContain("pnpm build:worker");
    expect(readme).toContain("pnpm exec wrangler deploy");
    expect(readme).toContain("pnpm exec wrangler deploy --name catan-imitation-preview");
    expect(readme).not.toContain("pnpm exec wrangler versions upload");
    expect(quickstart).toContain("pnpm exec wrangler deploy --name catan-imitation-preview");
    expect(quickstart).not.toContain("pnpm exec wrangler versions upload");
    expect(workerSmoke).toContain("healthBody.schemaVersion !== 3");
    expect(workerSmoke).not.toContain("healthBody.schemaVersion !== 2");
  });

  it("keeps collaboration templates and roadmap visible to reviewers", () => {
    expect(existsSync(".github/PULL_REQUEST_TEMPLATE.md")).toBe(true);
    expect(existsSync(".github/ISSUE_TEMPLATE/bug_report.md")).toBe(true);
    expect(existsSync(".github/ISSUE_TEMPLATE/feature_request.md")).toBe(true);
    expect(read(".github/PULL_REQUEST_TEMPLATE.md")).toContain("pnpm smoke:ui");
    expect(read(".github/ISSUE_TEMPLATE/bug_report.md")).toContain("Expected behavior");
    expect(read(".github/ISSUE_TEMPLATE/feature_request.md")).toContain("Acceptance criteria");
    expect(read("README.md")).toContain("Roadmap");
    expect(read("README.md")).not.toContain("https://todesfuge.github.io/Catan-Imitation/");
    expect(read("docs/roadmap.md")).toContain("Delivery Automation");
  });

  it("publishes the seeded-map release and migration contract", () => {
    const english = read("README.md");
    const chinese = read("README.zh-CN.md");
    const roadmap = read("docs/roadmap.md");
    const quickstart = read("specs/003-seeded-random-maps/quickstart.md");
    const verification = read("specs/003-seeded-random-maps/verification.md");
    const handoff = read("specs/003-seeded-random-maps/handoff.md");

    for (const readme of [english, chinese]) {
      expect(readme).toContain("https://catan-imitation.catan-imitation.workers.dev/");
      expect(readme).not.toContain("https://catan-imitation.workers.dev");
      expect(readme).toContain("M1-");
      expect(readme).toContain("M0-STANDARD");
      expect(readme).toContain("specs/003-seeded-random-maps/quickstart.md");
      expect(readme).toContain("specs/003-seeded-random-maps/verification.md");
    }
    expect(english).toContain("schema-v2 lobbies");
    expect(english).toContain("v2 matches");
    expect(chinese).toContain("v2 大厅");
    expect(chinese).toContain("v2 对局");
    expect(roadmap).toContain("## Milestone 9: Seeded Random Maps");
    expect(roadmap).not.toContain("Generalized board generation beyond the current fixed 19-hex shared topology.");
    expect(quickstart).toContain("Status: Verified");
    expect(english).toContain("never roll back to a schema-v2 or schema-v1 binary");
    expect(chinese).toContain("不得回滚到架构 v2 或 v1 二进制");
    expect(handoff).toContain("never roll back to a schema-v1 binary");
    expect(verification).toContain("Version ID `75810c45-9ec5-47e3-82b6-fece224462ce`");
    expect(verification).toContain("100% of production traffic");
    expect(verification).toContain("approved evidence-substitution path");
    expect(verification).toContain("could not directly probe the live target");
    expect(handoff).toContain("Status: Integrated and deployed");
    expect(handoff).toContain("https://catan-imitation.catan-imitation.workers.dev/");
  });

  it("publishes gathering pacing, setup grants, resource icons, and schema v3 delivery", () => {
    const english = read("README.md");
    const chinese = read("README.zh-CN.md");
    const roadmap = read("docs/roadmap.md");
    const verification = read("specs/004-gathering-pacing-resource-icons/verification.md");
    const handoff = read("specs/004-gathering-pacing-resource-icons/handoff.md");

    for (const readme of [english, chinese]) {
      expect(readme).toContain("specs/004-gathering-pacing-resource-icons/verification.md");
      expect(readme).toContain("specs/004-gathering-pacing-resource-icons/handoff.md");
    }
    for (const claim of [
      "table-wide gathering cooldown",
      "second setup settlement",
      "accessible resource icons",
      "storage schema v3 and wire protocol v3"
    ]) {
      expect(english).toContain(claim);
    }
    for (const claim of [
      "全桌集会冷却",
      "第二个初始村庄",
      "无障碍资源图标",
      "存储架构 v3 和联机协议 v3"
    ]) {
      expect(chinese).toContain(claim);
    }
    expect(roadmap).toContain("## Milestone 10: Gathering Pacing and Resource Iconography");
    expect(verification).toContain("| GP-048 | Pass |");
    expect(verification).toContain("Whole-branch independent review: passed");
    expect(handoff).toContain("schema v3");
    expect(handoff).toContain("Exact Next Action");
  });
});
