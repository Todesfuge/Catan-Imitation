import { spawn, spawnSync } from "node:child_process";
import { chromium } from "@playwright/test";

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

async function stopWorker() {
  if (wrangler.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(wrangler.pid), "/t", "/f"], { stdio: "ignore" });
  } else {
    wrangler.kill("SIGTERM");
  }
}

let browser;
try {
  const health = await waitForHealth();
  const healthBody = await health.json();
  if (healthBody.ok !== true || healthBody.schemaVersion !== 1) throw new Error("invalid health response");

  const asset = await fetch(`${origin}/online/lobby`, { signal: controller.signal });
  const html = await asset.text();
  if (!asset.ok || !html.includes('id="root"')) throw new Error("SPA asset fallback is empty");

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
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(origin);
  const message = await openSocket(page,
    `${origin.replace(/^http/, "ws")}/api/rooms/${credential.roomCode}/connect?ticket=${encodeURIComponent(ticket)}`
  );
  if (message.lifecycle !== "lobby" || message.privateState.seatId !== credential.seatId) {
    throw new Error("WebSocket did not return the caller lobby snapshot");
  }
  console.log("Worker smoke passed: health, SPA assets, room API, ticket exchange, and WebSocket snapshot.");
} finally {
  clearTimeout(timeout);
  await browser?.close();
  await stopWorker();
}
