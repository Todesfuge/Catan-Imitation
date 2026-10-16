import React, { useRef, useState } from "react";
import { CommercePanel } from "./CommercePanel";
import type { GameTableDispatch, GameTableView } from "./GameTable";
import { MaritimeTradePanel } from "./MaritimeTradePanel";
import { PlayerTradePanel } from "./PlayerTradePanel";
import { useI18n } from "./i18n";

const tabs = ["player", "maritime", "commerce"] as const;
type TradeHubTab = (typeof tabs)[number];

export function TradeHubPanel({
  state,
  dispatch
}: {
  state: GameTableView;
  dispatch: GameTableDispatch;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<TradeHubTab>(() =>
    state.guild.gathering.phase === "redemption" || state.guild.gathering.phase === "auction"
      ? "commerce" : "player"
  );
  const playerTabRef = useRef<HTMLButtonElement>(null);
  const maritimeTabRef = useRef<HTMLButtonElement>(null);
  const commerceTabRef = useRef<HTMLButtonElement>(null);
  const tabRefs = { player: playerTabRef, maritime: maritimeTabRef, commerce: commerceTabRef };
  function handleTabKey(event: React.KeyboardEvent<HTMLButtonElement>) {
    const index = tabs.indexOf(tab);
    let nextTab: TradeHubTab;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      nextTab = tabs[(index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    } else if (event.key === "Home" || event.key === "End") {
      nextTab = event.key === "Home" ? "player" : "commerce";
    } else return;
    event.preventDefault();
    setTab(nextTab);
    tabRefs[nextTab].current?.focus();
  }
  return (
    <section className="tool-panel trade-hub-panel">
      <div aria-label={t("trade.panelsLabel")} className="trade-hub-tabs" role="tablist">
        {tabs.map((item) => (
          <button
            aria-controls={`trade-panel-${item}`}
            aria-selected={tab === item}
            id={`trade-tab-${item}`}
            key={item}
            onClick={() => setTab(item)}
            onKeyDown={handleTabKey}
            ref={tabRefs[item]}
            role="tab"
            tabIndex={tab === item ? 0 : -1}
            type="button"
          >
            {t(`trade.${item === "player" ? "playerTab" : item === "maritime" ? "maritimeTab" : "commerceTab"}`)}
          </button>
        ))}
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
        data-trade-hub-panel="maritime"
        hidden={tab !== "maritime"}
        id="trade-panel-maritime"
        aria-labelledby="trade-tab-maritime"
        role="tabpanel"
      >
        <MaritimeTradePanel dispatch={dispatch} state={state} />
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
