import React, { useRef, useState, type KeyboardEvent } from "react";
import { useI18n, type MessageKey } from "../i18n";
import {
  RulebookChapterContent,
  rulebookChapterIds,
  type RulebookChapterId
} from "./RulebookContent";

const chapterLabelKeys = {
  quickStart: "rulebook.chapter.quickStart",
  baseRules: "rulebook.chapter.baseRules",
  commerceGuild: "rulebook.chapter.commerceGuild",
  quickReference: "rulebook.chapter.quickReference"
} as const satisfies Record<RulebookChapterId, MessageKey>;

export function RulebookPanel() {
  const { locale, setLocale, t } = useI18n();
  const [activeChapter, setActiveChapter] = useState<RulebookChapterId>("quickStart");
  const panelRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function selectChapter(chapter: RulebookChapterId, focusTab = false) {
    setActiveChapter(chapter);
    if (panelRef.current) panelRef.current.scrollTop = 0;
    if (focusTab) {
      tabRefs.current[rulebookChapterIds.indexOf(chapter)]?.focus();
    }
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, chapter: RulebookChapterId) {
    const currentIndex = rulebookChapterIds.indexOf(chapter);
    let nextIndex: number | undefined;

    switch (event.key) {
      case "ArrowRight":
        nextIndex = (currentIndex + 1) % rulebookChapterIds.length;
        break;
      case "ArrowLeft":
        nextIndex = (currentIndex - 1 + rulebookChapterIds.length) % rulebookChapterIds.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = rulebookChapterIds.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    selectChapter(rulebookChapterIds[nextIndex], true);
  }

  return (
    <div className="rulebook-shell">
      <div className="rulebook-toolbar">
        <div
          aria-label={t("rulebook.navigationLabel")}
          aria-orientation="horizontal"
          className="rulebook-tabs"
          role="tablist"
        >
          {rulebookChapterIds.map((chapter, index) => {
            const selected = chapter === activeChapter;
            return (
              <button
                aria-controls={`rulebook-panel-${chapter}`}
                aria-selected={selected}
                id={`rulebook-tab-${chapter}`}
                key={chapter}
                onClick={() => selectChapter(chapter)}
                onKeyDown={(event) => handleTabKeyDown(event, chapter)}
                ref={(element) => { tabRefs.current[index] = element; }}
                role="tab"
                tabIndex={selected ? 0 : -1}
                type="button"
              >
                {t(chapterLabelKeys[chapter])}
              </button>
            );
          })}
        </div>
        <label className="rulebook-language">
          <span>{t("rulebook.languageLabel")}</span>
          <select
            aria-label={t("rulebook.languageLabel")}
            data-rulebook-language-select
            onChange={(event) => setLocale(event.currentTarget.value as "en" | "zh-CN")}
            value={locale}
          >
            <option value="en">{t("language.english")}</option>
            <option value="zh-CN">{t("language.chinese")}</option>
          </select>
        </label>
      </div>
      <div
        aria-labelledby={`rulebook-tab-${activeChapter}`}
        className="rulebook-panel"
        id={`rulebook-panel-${activeChapter}`}
        ref={panelRef}
        role="tabpanel"
        tabIndex={0}
      >
        <RulebookChapterContent chapter={activeChapter} />
      </div>
    </div>
  );
}
