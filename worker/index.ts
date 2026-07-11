import type { Env } from "./env";

export { RoomDurableObject } from "./room/RoomDurableObject";

export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === "/api/health") {
      return Response.json({ status: "ok" });
    }

    if (pathname.startsWith("/api/")) {
      return Response.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "API route not found."
          }
        },
        { status: 404 }
      );
    }

    return env.ASSETS.fetch(request);
  }
} satisfies ExportedHandler<Env>;
