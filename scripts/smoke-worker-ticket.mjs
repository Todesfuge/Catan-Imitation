export async function expectConsumedTicketRejected(page, url) {
  return page.evaluate((socketUrl) => new Promise((resolve, reject) => {
    const socket = new WebSocket(socketUrl);
    let settled = false;
    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      socket.removeEventListener("open", upgraded);
      socket.removeEventListener("message", upgraded);
      socket.removeEventListener("error", rejected);
      socket.removeEventListener("close", rejected);
    };
    const settle = (complete) => {
      if (settled) return;
      settled = true;
      cleanup();
      complete();
    };
    const upgraded = () => {
      settle(() => reject(new Error("consumed ticket upgraded twice")));
      socket.close();
    };
    const rejected = () => {
      settle(() => resolve(true));
    };
    timer = setTimeout(
      () => settle(() => reject(new Error("consumed ticket socket timed out"))),
      5_000
    );
    socket.addEventListener("open", upgraded, { once: true });
    socket.addEventListener("message", upgraded, { once: true });
    socket.addEventListener("error", rejected, { once: true });
    socket.addEventListener("close", rejected, { once: true });
  }), url);
}
