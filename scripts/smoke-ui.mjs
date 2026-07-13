import { existsSync, readFileSync } from "node:fs";
import { preview } from "vite";

const port = Number(process.env.UI_SMOKE_PORT ?? 4173);
const origin = `http://127.0.0.1:${port}`;
const indexHtml = existsSync("dist/index.html") ? readFileSync("dist/index.html", "utf8") : "";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function fetchText(url) {
  const response = await fetch(url);
  assert(response.ok, `Expected ${url} to return 2xx, got ${response.status}`);
  return response.text();
}

async function waitForPreview() {
  let lastError;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await fetchText(origin);
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  throw lastError ?? new Error("Preview server did not become ready.");
}

function collectAssetPaths(html, extension) {
  return Array.from(html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g))
    .map((match) => match[1])
    .filter((path) => path.endsWith(extension));
}

function previewBasePath(html) {
  const firstAsset = html.match(/(?:src|href)="([^"]+\/assets\/[^"]+)"/)?.[1] ?? "";
  return firstAsset.split("/assets/")[0];
}

function previewEntryPath(html) {
  const basePath = previewBasePath(html);
  return basePath ? `${basePath}/` : "/";
}

function distAssetPath(assetPath, basePath) {
  const localPath = basePath && assetPath.startsWith(basePath) ? assetPath.slice(basePath.length) : assetPath;
  return `dist/${localPath.replace(/^\/+/, "")}`;
}

if (!indexHtml) {
  throw new Error("Missing dist/index.html. Run pnpm build before pnpm smoke:ui.");
}

const server = await preview({
  preview: {
    host: "127.0.0.1",
    port,
    strictPort: true
  }
});

try {
  await waitForPreview();
  const html = await fetchText(new URL(previewEntryPath(indexHtml), origin).toString());
  const basePath = previewBasePath(html);
  const jsPaths = collectAssetPaths(html, ".js");
  const cssPaths = collectAssetPaths(html, ".css");

  assert(html.includes('id="root"'), "Expected built HTML to contain React root.");
  assert(jsPaths.length > 0, "Expected built HTML to reference a JavaScript bundle.");
  assert(cssPaths.length > 0, "Expected built HTML to reference a CSS bundle.");

  const js = jsPaths.map((path) => readFileSync(distAssetPath(path, basePath), "utf8")).join("\n");
  const css = cssPaths.map((path) => readFileSync(distAssetPath(path, basePath), "utf8")).join("\n");

  for (const text of [
    "Catan board",
    "Yield Statistics",
    "Player Trade",
    "Commerce Guild",
    "Activity",
    "Submit Discard",
    "Move the robber to a different hex",
    "Choose a player to steal from",
    "Road Building",
    "Year of Plenty",
    "Monopoly",
    "Effective maritime trade ratios",
    "Token recipient",
    "Gathering player",
    "New Random Map",
    "Standard maritime ports",
    "2:1 "
    ,"Publish Public Offer"
    ,"Simplified Chinese"
    ,"游戏日志"
    ,"catan.locale"
  ]) {
    assert(js.includes(text), `Expected JavaScript bundle to include ${text}.`);
  }

  for (const text of [
    ".board-zone",
    ".activity-shell",
    ".terrain-icon",
    ".board-hex",
    ".road-marker",
    ".turn-flow-panel",
    ".robber-victim-buttons",
    ".development-card-controls",
    ".road-building-target",
    ".port-marker",
    ".maritime-ratio-guide",
    ".board-action-target",
    ".utility-modal"
    ,".player-trade-panel"
    ,".trade-hub-panel"
    ,".dice-income-list"
    ,".log-list"
  ]) {
    assert(css.includes(text), `Expected CSS bundle to include ${text}.`);
  }
  assert(js.includes("board-svg"), "Expected JavaScript bundle to render the SVG board.");
  assert(js.includes("board-hex"), "Expected JavaScript bundle to render SVG hex polygons.");
  assert(js.includes("road-marker"), "Expected JavaScript bundle to render road markers.");
  assert(!js.includes("edge-guide"), "Expected JavaScript bundle not to render every possible edge guide.");
  assert(!css.includes("clip-path"), "Expected board rendering not to rely on clipped CSS boxes.");
  assert(/\.terrain-forest\s*{[^}]*fill:/s.test(css), "Expected SVG terrain polygons to have fill colors.");
  assert(/filter:\s*drop-shadow/.test(css), "Expected hexes to have visible separated borders.");
  assert(/@media \(max-width:\s*640px\)/.test(css), "Expected CSS bundle to include the mobile breakpoint.");

  assert(/\.log-list\{[^}]*overflow-y:auto/s.test(css), "Expected Game Log to own vertical scrolling.");
  assert(/\.dice-income-list\{[^}]*overflow-y:auto/s.test(css), "Expected dice statistics to own vertical scrolling.");

  console.log("UI smoke passed: built preview exposes board, trade, localization, scrolling, and responsive CSS.");
} catch (error) {
  throw error;
} finally {
  await new Promise((resolve, reject) => {
    server.httpServer.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
