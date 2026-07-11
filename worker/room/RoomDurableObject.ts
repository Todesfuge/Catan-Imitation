/**
 * Task 8 only establishes the Durable Object binding and module boundary.
 * Room lifecycle, persistence, and transport behavior belong to later tasks.
 */
export class RoomDurableObject {
  fetch(): Response {
    return Response.json(
      {
        error: {
          code: "NOT_IMPLEMENTED",
          message: "Room behavior is implemented in later tasks."
        }
      },
      { status: 501 }
    );
  }
}
