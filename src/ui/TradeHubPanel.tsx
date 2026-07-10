import React, { useRef, useState } from "react";
import type { AppState, GameCommand } from "../app/gameReducer";
import { CommercePanel } from "./CommercePanel";
import { PlayerTradePanel } from "./PlayerTradePanel";
import { useI18n } from "./i18n";

type TradeHubTab = "player" | "commerce";

export function TradeHubPanel({
  state,
  dispatch
}: {
  state: AppState;
  dispatch: (command: GameCommand) => void;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<TradeHubTab>("player");
  const playerTabRef = useRef<HTMLButtonElement>(null);
  const commerceTabRef = useRef<HTMLButtonElement>(null);
  const selectTab = (nextTab: TradeHubTab) => {
    setTab(nextTab);
    (nextTab === "player" ? playerTabRef : commerceTabRef).current?.focus();
  };
  return (
    <section className="tool-panel trade-hub-panel">
      <div aria-label={t("trade.panelsLabel")} className="trade-hub-tabs" role="tablist">
        <button
          aria-controls="trade-panel-player"
          aria-selected={tab === "player"}
          id="trade-tab-player"
          onClick={() => setTab("player")}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight" || event.key === "ArrowLeft") selectTab("commerce");
          }}
          ref={playerTabRef}
          role="tab"
          tabIndex={tab === "player" ? 0 : -1}
          type="button"
        >
          {t("trade.playerTab")}
        </button>
        <button
          aria-controls="trade-panel-commerce"
          aria-selected={tab === "commerce"}
          id="trade-tab-commerce"
          onClick={() => setTab("commerce")}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight" || event.key === "ArrowLeft") selectTab("player");
          }}
          ref={commerceTabRef}
          role="tab"
          tabIndex={tab === "commerce" ? 0 : -1}
          type="button"
        >
          {t("trade.commerceTab")}
        </button>
      </div>
      <div
        className="trade-hub-content"
        data-trade-hub-panel="player"
        hidden={tab !== "player"}
        id="trade-panel-player"
        aria-labelledby="trade-tab-player"
        role="tabpanel"
      >
        <PlayerTradePanel dispatch={dispatch} state={state} />
      </div>
      <div
        className="trade-hub-content"
        data-trade-hub-panel="commerce"
        hidden={tab !== "commerce"}
        id="trade-panel-commerce"
        aria-labelledby="trade-tab-commerce"
        role="tabpanel"
      >
        <CommercePanel dispatch={dispatch} state={state} />
      </div>
    </section>
  );
}
