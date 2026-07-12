interface BrowserEvaluationPage {
  evaluate(
    callback: (socketUrl: string) => Promise<unknown>,
    url: string
  ): Promise<unknown>;
}

export function expectConsumedTicketRejected(
  page: BrowserEvaluationPage,
  url: string
): Promise<unknown>;
