import React, { useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { boardViewBox } from "./boardGeometry";
import { useI18n } from "./i18n";

export function BoardViewport({ children, focusBoard = false }: { children: React.ReactNode; focusBoard?: boolean }) {
  const { t } = useI18n();
  const viewportRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef({ x: 0.5, y: 0.5 });
  const [zoom, setZoom] = useState(1);
  const [fitWidth, setFitWidth] = useState(0);
  const ratio = boardViewBox.width / boardViewBox.height;

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(() => {
      if (!viewport.clientWidth || !viewport.clientHeight) return;
      setFitWidth(Math.min(viewport.clientWidth, viewport.clientHeight * ratio));
      anchorRef.current = { x: 0.5, y: 0.5 };
      setZoom(focusBoard ? 2 : 1);
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [ratio, focusBoard]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollLeft = anchorRef.current.x * viewport.scrollWidth - viewport.clientWidth / 2;
    viewport.scrollTop = anchorRef.current.y * viewport.scrollHeight - viewport.clientHeight / 2;
  }, [zoom, fitWidth]);

  function changeZoom(next: number) {
    const viewport = viewportRef.current;
    if (viewport?.scrollWidth && viewport.scrollHeight) {
      anchorRef.current = {
        x: (viewport.scrollLeft + viewport.clientWidth / 2) / viewport.scrollWidth,
        y: (viewport.scrollTop + viewport.clientHeight / 2) / viewport.scrollHeight
      };
    }
    setZoom(next);
  }

  return (
    <>
      <div
        aria-label={t("board.navigation")}
        className="board-viewport"
        ref={viewportRef}
        role="region"
        style={{
          "--board-scale": zoom,
          "--board-ratio": ratio,
          ...(fitWidth ? { "--board-fit-width": `${fitWidth}px`, "--board-fit-height": `${fitWidth / ratio}px` } : {})
        } as React.CSSProperties}
        tabIndex={fitWidth ? 0 : -1}
      >
        <div className="board-stage"><div className="island">{children}</div></div>
      </div>
      <div className="board-zoom-controls">
        <span>{t(focusBoard ? "board.panHintFocused" : "board.panHint")}</span>
        <div aria-label={t("board.zoomControls")} role="group">
          <button aria-label={t("board.zoomOut")} disabled={zoom <= 1} onClick={() => changeZoom(zoom - 0.5)} title={t("board.zoomOut")} type="button">
            <ZoomOut aria-hidden="true" size={20} />
          </button>
          <button onClick={() => { anchorRef.current = { x: 0.5, y: 0.5 }; setZoom(1); }} type="button">
            {t("board.fit")}
          </button>
          <button aria-label={t("board.zoomIn")} disabled={zoom >= 2.5} onClick={() => changeZoom(zoom + 0.5)} title={t("board.zoomIn")} type="button">
            <ZoomIn aria-hidden="true" size={20} />
          </button>
        </div>
      </div>
    </>
  );
}
