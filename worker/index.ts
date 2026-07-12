import type { Env } from "./env";
import { PROTOCOL_SCHEMA_VERSION } from "../src/online/protocol";
import { HttpProtocolError, hardenResponse, jsonResponse, safeErrorResponse } from "./http";
import { assertRequestOrigin } from "./http";
import { generateRoomCode, normalizeRoomCode, RoomLifecycleError } from "./room/roomLifecycle";

export { RoomDurableObject } from "./room/RoomDurableObject";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return hardenResponse(request, await route(request, env));
  }
} satisfies ExportedHandler<Env>;

async function route(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);

  if (pathname === "/api/health") {
    return jsonResponse({ ok: true, schemaVersion: PROTOCOL_SCHEMA_VERSION });
  }

  if (pathname === "/api/rooms" && request.method === "POST") {
    try {
      assertRequestOrigin(request);
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const roomCode = generateRoomCode();
        const headers = new Headers(request.headers);
        headers.set("x-catan-room-code", roomCode);
        const response = await env.ROOMS.getByName(roomCode).fetch(
          new Request(request.clone(), { headers })
        );
        if (response.headers.get("x-room-code-collision") !== "1") return response;
      }
      return safeErrorResponse(new HttpProtocolError("INTERNAL_ERROR"));
    } catch (error) {
      return safeErrorResponse(error);
    }
  }

  if (pathname.startsWith("/api/rooms/")) {
    try {
      assertRequestOrigin(request);
      const segments = pathname.split("/").filter(Boolean);
      if (segments.length < 3) throw new HttpProtocolError("ROOM_NOT_FOUND");
      let roomCode: string;
      try {
        roomCode = normalizeRoomCode(segments[2]);
      } catch (error) {
        if (error instanceof RoomLifecycleError) throw new HttpProtocolError("RULE_VIOLATION");
        throw error;
      }
      const normalizedPath = `/${[...segments.slice(0, 2), roomCode, ...segments.slice(3)].join("/")}`;
      const url = new URL(request.url);
      url.pathname = normalizedPath;
      return env.ROOMS.getByName(roomCode).fetch(new Request(url, request));
    } catch (error) {
      return safeErrorResponse(error);
    }
  }

  if (pathname.startsWith("/api/")) {
    return safeErrorResponse(new HttpProtocolError("ROOM_NOT_FOUND"));
  }

  return env.ASSETS.fetch(request);
}
