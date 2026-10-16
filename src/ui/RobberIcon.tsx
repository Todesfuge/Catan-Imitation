import React from "react";
import { VenetianMask } from "lucide-react";
import { useI18n } from "./i18n";

export function RobberIcon({ size = 46, x, y }: { size?: number; x?: number; y?: number }) {
  const { t } = useI18n();
  return (
    <svg aria-label={t("board.robber")} className="robber-piece" height={size} role="img" viewBox="-23 -23 46 46" width={size} x={x} y={y}>
      <title>{t("board.robber")}</title>
      <circle className="robber-badge" r="22" />
      <VenetianMask aria-hidden="true" className="robber-icon" focusable="false" size={32} x={-16} y={-16} />
    </svg>
  );
}
