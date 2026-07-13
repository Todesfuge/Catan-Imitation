import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { chromium } from "@playwright/test";
import { expectConsumedTicketRejected } from "./smoke-worker-ticket.mjs";

const port = Number(process.env.CATAN_SMOKE_PORT ?? 8800);
const origin = `http://127.0.0.1:${port}`;
const timeoutMs = 30_000;
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(new Error("Worker smoke timed out")), timeoutMs);
const wrangler = spawn(
  process.execPath,
  [
    "node_modules/wrangler/bin/wrangler.js",
    "dev",
    "--host", "127.0.0.1",
    "--port", String(port),
    "--persist-to", ".wrangler/state/smoke"
  ],
  { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] }
);
let output = "";
wrangler.stdout.on("data", (chunk) => { output += String(chunk); });
wrangler.stderr.on("data", (chunk) => { output += String(chunk); });

async function withDeadline(promise, milliseconds, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), milliseconds);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function waitForHealth() {
  while (!controller.signal.aborted) {
    try {
      const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return response;
    } catch {
      if (wrangler.exitCode !== null) throw new Error(`Wrangler exited early (${wrangler.exitCode})\n${output}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw controller.signal.reason;
}

async function openSocket(page, url) {
  return page.evaluate((socketUrl) => new Promise((resolve, reject) => {
    const socket = new WebSocket(socketUrl);
    const timer = setTimeout(() => reject(new Error("WebSocket smoke timed out")), 5_000);
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.type !== "room.snapshot") return;
      clearTimeout(timer);
      socket.close(1000, "smoke complete");
      resolve(message);
    });
    socket.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("WebSocket smoke failed"));
    }, { once: true });
  }), url);
}

function requireHeader(response, name, expected) {
  const actual = response.headers.get(name);
  if (actual !== expected) throw new Error(`${name} mismatch: ${actual}`);
}

async function stopWorker() {
  if (wrangler.exitCode !== null) return;
  const exited = once(wrangler, "exit");
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(wrangler.pid), "/t", "/f"], {
      stdio: "ignore",
      timeout: 5_000
    });
    await withDeadline(exited, 5_000, "Windows Worker shutdown");
  } else {
    wrangler.kill("SIGTERM");
    try {
      await withDeadline(exited, 5_000, "Worker SIGTERM shutdown");
    } catch {
      wrangler.kill("SIGKILL");
      await withDeadline(exited, 5_000, "Worker SIGKILL shutdown");
    }
  }
}

let browser;
try {
  const health = await waitForHealth();
  const healthBody = await health.json();
  if (healthBody.ok !== true || healthBody.schemaVersion !== 2) throw new Error("invalid health response");
  requireHeader(health, "cache-control", "no-store");
  requireHeader(health, "x-content-type-options", "nosniff");
  requireHeader(health, "referrer-policy", "no-referrer");
  requireHeader(health, "x-frame-options", "DENY");
  const csp = health.headers.get("content-security-policy") ?? "";
  for (const directive of ["default-src 'self'", "connect-src 'self'", "object-src 'none'", "frame-ancestors 'none'"]) {
    if (!csp.includes(directive)) throw new Error(`CSP is missing ${directive}`);
  }

  const asset = await fetch(`${origin}/online/lobby`, { signal: controller.signal });
  const html = await asset.text();
  if (!asset.ok || !html.includes('id="root"')) throw new Error("SPA asset fallback is empty");
  requireHeader(asset, "cache-control", "no-store");
  const fingerprintedPath = html.match(/(?:src|href)="(\/assets\/[^"]+-[A-Za-z0-9_-]{8,}\.[^"]+)"/)?.[1];
  if (fingerprintedPath === undefined) throw new Error("SPA shell has no fingerprinted asset");
  const fingerprinted = await fetch(`${origin}${fingerprintedPath}`, { signal: controller.signal });
  if (!fingerprinted.ok) throw new Error("fingerprinted asset failed");
  requireHeader(fingerprinted, "cache-control", "public, max-age=31536000, immutable");

  const created = await fetch(`${origin}/api/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ nickname: "Smoke" }),
    signal: controller.signal
  });
  if (created.status !== 201) throw new Error(`room create failed: ${created.status}`);
  const credential = await created.json();
  const ticketResponse = await fetch(`${origin}/api/rooms/${credential.roomCode}/connection-ticket`, {
    method: "POST",
    headers: { authorization: `Bearer ${credential.seatToken}`, origin },
    signal: controller.signal
  });
  if (ticketResponse.status !== 201) throw new Error(`ticket request failed: ${ticketResponse.status}`);
  const { ticket } = await ticketResponse.json();
  browser = await withDeadline(chromium.launch({ headless: true }), 10_000, "Chromium launch");
  const page = await browser.newPage();
  await page.goto(`${origin}/online/lobby`);
  await page.locator("#root").waitFor({ state: "visible" });
  const renderedRoot = await page.locator("#root").evaluate((root) => root.childElementCount > 0 && root.innerHTML.trim().length > 0);
  if (!renderedRoot) throw new Error("React root did not render content");
  const socketUrl = `${origin.replace(/^http/, "ws")}/api/rooms/${credential.roomCode}/connect?ticket=${encodeURIComponent(ticket)}`;
  const message = await openSocket(page, socketUrl);
  if (message.lifecycle !== "lobby" || message.privateState.seatId !== credential.seatId) {
    throw new Error("WebSocket did not return the caller lobby snapshot");
  }
  await expectConsumedTicketRejected(page, socketUrl);
  console.log("Worker smoke passed: security/cache headers, rendered SPA, room API, single-use ticket, and WebSocket snapshot.");
} finally {
  clearTimeout(timeout);
  try {
    if (browser) await withDeadline(browser.close(), 5_000, "Chromium close");
  } finally {
    await stopWorker();
  }
}
