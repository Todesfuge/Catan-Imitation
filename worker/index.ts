import type { Env } from "./env";
import { PROTOCOL_SCHEMA_VERSION } from "../src/online/protocol";
import { HttpProtocolError, jsonResponse, safeErrorResponse } from "./http";

export { RoomDurableObject } from "./room/RoomDurableObject";

export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === "/api/health") {
      return jsonResponse({ ok: true, schemaVersion: PROTOCOL_SCHEMA_VERSION });
    }

    if (pathname.startsWith("/api/")) {
      return safeErrorResponse(new HttpProtocolError("ROOM_NOT_FOUND"));
    }

    return env.ASSETS.fetch(request);
  }
} satisfies ExportedHandler<Env>;
