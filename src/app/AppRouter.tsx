import React, { useState, type ReactNode } from "react";
import { LocalGame } from "../App";
import { OnlineLobby } from "../online/OnlineLobby";
import { translate, useI18n, type Locale } from "../ui/i18n";

export type AppRoute = "entry" | "local" | "online";

export interface AppRouterViewProps {
  route: AppRoute;
  onRouteChange: (route: AppRoute) => void;
  onlineMount?: (locale: Locale, onLocaleChange: (locale: Locale) => void) => ReactNode;
  locale?: Locale;
  onLocaleChange?: (locale: Locale) => void;
}

function LocaleSwitch({ locale, onLocaleChange }: { locale: Locale; onLocaleChange: (locale: Locale) => void }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  return (
    <div className="mode-locale" aria-label={t("mode.language")} role="group">
      <button
        aria-pressed={locale === "en"}
        onClick={() => onLocaleChange("en")}
        type="button"
      >
        English
      </button>
      <button
        aria-pressed={locale === "zh-CN"}
        onClick={() => onLocaleChange("zh-CN")}
        type="button"
      >
        简体中文
      </button>
    </div>
  );
}

export function AppRouterView({
  route,
  onRouteChange,
  onlineMount,
  locale = "en",
  onLocaleChange = () => undefined
}: AppRouterViewProps) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  if (route === "local") return <LocalGame />;
  if (route === "online") {
    return <>{onlineMount?.(locale, onLocaleChange) ?? (
      <OnlineLobby
        locale={locale}
        onExit={() => onRouteChange("entry")}
        onLocaleChange={onLocaleChange}
      />
    )}</>;
  }
  return (
    <main className="mode-entry">
      <section className="mode-entry__panel" aria-labelledby="mode-entry-title">
        <div>
          <p className="mode-entry__eyebrow">{t("mode.eyebrow")}</p>
          <h1 id="mode-entry-title">{t("mode.title")}</h1>
          <p className="mode-entry__intro">{t("mode.intro")}</p>
        </div>
        <div className="mode-entry__choices">
          <button
            aria-label={t("mode.localAria")}
            className="mode-card"
            onClick={() => onRouteChange("local")}
            type="button"
          >
            <strong>{t("mode.local")}</strong>
            <span>{t("mode.localDescription")}</span>
          </button>
          <button
            aria-label={t("mode.onlineAria")}
            className="mode-card mode-card--primary"
            onClick={() => onRouteChange("online")}
            type="button"
          >
            <strong>{t("mode.online")}</strong>
            <span>{t("mode.onlineDescription")}</span>
          </button>
        </div>
        <LocaleSwitch locale={locale} onLocaleChange={onLocaleChange} />
      </section>
    </main>
  );
}

export function AppRouter() {
  const [route, setRoute] = useState<AppRoute>("entry");
  const { locale, setLocale } = useI18n();
  return <AppRouterView route={route} onRouteChange={setRoute} locale={locale} onLocaleChange={setLocale} />;
}
