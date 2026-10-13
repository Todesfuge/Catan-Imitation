import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(path, "utf8");
}

const readerDocuments = [
  "README.md",
  "README.zh-CN.md",
  "docs/user-guide.md",
  "docs/architecture.md",
  "docs/development.md",
  "docs/deployment.md"
];

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

  it("documents the configured build, verification, and Worker deployment commands", () => {
    const packageJson = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    const ci = read(".github/workflows/ci.yml");
    const development = read("docs/development.md");
    const deployment = read("docs/deployment.md");
    const workerSmoke = read("scripts/smoke-worker.mjs");
    const workspace = read("pnpm-workspace.yaml");

    expect(packageJson.scripts["smoke:ui"]).toBe("node scripts/smoke-ui.mjs");
    expect(packageJson.scripts["build:worker"]).toContain("tsc -p tsconfig.worker.json");
    expect(workspace).toContain("allowBuilds:");
    expect(workspace).toContain("  esbuild: true");
    expect(ci).toContain("node-version: 22");
    expect(ci).toContain("      - main");
    expect(ci).toContain("pnpm install --frozen-lockfile");
    for (const script of ["test", "build:worker", "test:worker", "test:e2e", "smoke:ui"]) {
      expect(packageJson.scripts[script]).toBeDefined();
      expect(ci).toContain(`pnpm ${script}`);
      expect(development).toContain(`pnpm ${script}`);
    }
    expect(existsSync(".github/workflows/pages.yml")).toBe(false);
    expect(deployment).toContain("pnpm exec wrangler deploy");
    expect(deployment).toContain("pnpm exec wrangler deploy --name catan-imitation-preview");
    expect(deployment).not.toContain("pnpm exec wrangler versions upload");
    expect(workerSmoke).toContain("healthBody.schemaVersion !== 3");
  });

  it("keeps reader documentation links valid without private workflow dependencies", () => {
    for (const path of readerDocuments) {
      const document = read(path);
      expect(document).not.toMatch(/(?:specs\/|\.codex\/|\.superpowers\/|\.specify\/)/);
      const base = path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "";
      for (const [, target] of document.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
        if (/^https?:\/\//.test(target) || target.startsWith("#")) continue;
        expect(existsSync(base + target.split("#")[0]), `${path} -> ${target}`).toBe(true);
      }
    }
    for (const path of ["README.md", "README.zh-CN.md"]) {
      expect(read(path)).toContain("https://catan-imitation.catan-imitation.workers.dev/");
    }
    expect(existsSync(".github/PULL_REQUEST_TEMPLATE.md")).toBe(true);
    expect(existsSync(".github/ISSUE_TEMPLATE/bug_report.md")).toBe(true);
    expect(existsSync(".github/ISSUE_TEMPLATE/feature_request.md")).toBe(true);
    expect(read(".github/PULL_REQUEST_TEMPLATE.md")).toContain("pnpm test:worker");
    expect(read(".github/ISSUE_TEMPLATE/bug_report.md")).toContain("Expected behavior");
    expect(read(".github/ISSUE_TEMPLATE/feature_request.md")).toContain("Acceptance criteria");
  });
});
