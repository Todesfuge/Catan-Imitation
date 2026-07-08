import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(path, "utf8");
}

describe("delivery readiness", () => {
  it("exposes CI, deployment, and UI smoke commands", () => {
    const packageJson = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    const ci = read(".github/workflows/ci.yml");
    const pages = read(".github/workflows/pages.yml");
    const workspace = read("pnpm-workspace.yaml");

    expect(packageJson.scripts["smoke:ui"]).toBe("node scripts/smoke-ui.mjs");
    expect(packageJson.scripts["build:pages"]).toContain("--base /Catan-Imitation/");
    expect(workspace).toContain("allowBuilds:");
    expect(workspace).toContain("  esbuild: true");
    expect(ci).toContain("node-version: 22");
    expect(pages).toContain("node-version: 22");
    expect(ci).toContain("pnpm install --frozen-lockfile");
    expect(ci).toContain("pnpm test");
    expect(ci).toContain("pnpm build");
    expect(ci).toContain("pnpm smoke:ui");
    expect(pages).toContain("actions/configure-pages@v6");
    expect(pages).toContain("actions/upload-pages-artifact@v4");
    expect(pages).toContain("actions/deploy-pages@v5");
    expect(pages).toContain("deploy-pages");
    expect(pages).toContain("upload-pages-artifact");
    expect(pages).toContain("pnpm build:pages");
  });

  it("keeps collaboration templates and roadmap visible to reviewers", () => {
    expect(existsSync(".github/PULL_REQUEST_TEMPLATE.md")).toBe(true);
    expect(existsSync(".github/ISSUE_TEMPLATE/bug_report.md")).toBe(true);
    expect(existsSync(".github/ISSUE_TEMPLATE/feature_request.md")).toBe(true);
    expect(read(".github/PULL_REQUEST_TEMPLATE.md")).toContain("pnpm smoke:ui");
    expect(read(".github/ISSUE_TEMPLATE/bug_report.md")).toContain("Expected behavior");
    expect(read(".github/ISSUE_TEMPLATE/feature_request.md")).toContain("Acceptance criteria");
    expect(read("README.md")).toContain("Roadmap");
    expect(read("README.md")).toContain("https://todesfuge.github.io/Catan-Imitation/");
    expect(read("docs/roadmap.md")).toContain("Delivery Automation");
  });
});
