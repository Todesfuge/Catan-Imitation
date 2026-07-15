import React, { type ReactNode } from "react";
import { buildCosts } from "../../domain/rules/building";
import { type Resource } from "../../domain/types";
import { useI18n, type MessageKey } from "../i18n";
import { ResourceBundle, ResourceIcon } from "../ResourceBadge";

export const rulebookChapterIds = [
  "quickStart",
  "baseRules",
  "commerceGuild",
  "quickReference"
] as const;

export type RulebookChapterId = (typeof rulebookChapterIds)[number];

const terrainResources: ReadonlyArray<{
  terrain: "forest" | "hill" | "pasture" | "field" | "mountain";
  resource: Resource;
}> = [
  { terrain: "forest", resource: "wood" },
  { terrain: "hill", resource: "brick" },
  { terrain: "pasture", resource: "wool" },
  { terrain: "field", resource: "grain" },
  { terrain: "mountain", resource: "ore" }
];

function TopicSection({
  topic,
  title,
  children
}: {
  topic: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rulebook-section" data-rulebook-topic={topic}>
      <h4>{title}</h4>
      {children}
    </section>
  );
}

function RulebookExample({ topic, title, children }: {
  topic: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <aside className="rulebook-example" data-rulebook-topic={topic}>
      <strong>{title}</strong>
      <p>{children}</p>
    </aside>
  );
}

function MessageList({ keys, ordered = false }: {
  keys: readonly MessageKey[];
  ordered?: boolean;
}) {
  const { t } = useI18n();
  const items = keys.map((key) => <li key={key}>{t(key)}</li>);
  return ordered ? <ol>{items}</ol> : <ul>{items}</ul>;
}

function TerrainResourceRows() {
  const { t } = useI18n();
  return (
    <div className="rulebook-fact-grid rulebook-terrain-grid">
      {terrainResources.map(({ terrain, resource }) => (
        <div className="rulebook-fact-row" key={terrain}>
          <ResourceIcon resource={resource} />
          <span>
            {t(`terrain.${terrain}`)} → {t(`resource.${resource}`)}
          </span>
        </div>
      ))}
      <div className="rulebook-fact-row rulebook-desert-row">
        <span aria-hidden="true" className="rulebook-desert-mark">—</span>
        <span>{t("terrain.desert")} — {t("rulebook.reference.desert")}</span>
      </div>
    </div>
  );
}

function CostRows() {
  const { t } = useI18n();
  return (
    <dl className="rulebook-cost-list">
      {(Object.keys(buildCosts) as Array<keyof typeof buildCosts>).map((kind) => (
        <div className="rulebook-cost-row" key={kind}>
          <dt>{t(`rulebook.cost.${kind}`)}</dt>
          <dd><ResourceBundle compact resources={buildCosts[kind]} /></dd>
        </div>
      ))}
    </dl>
  );
}

function QuickStartChapter() {
  const { t } = useI18n();
  return (
    <article className="rulebook-chapter" data-rulebook-chapter="quickStart">
      <h3>{t("rulebook.quick.title")}</h3>
      <p className="rulebook-lead">{t("rulebook.quick.intro")}</p>

      <TopicSection topic="objective" title={t("rulebook.quick.objectiveTitle")}>
        <p>{t("rulebook.quick.objectiveBody")}</p>
      </TopicSection>

      <TopicSection topic="resources" title={t("rulebook.quick.resourcesTitle")}>
        <p>{t("rulebook.quick.resourcesIntro")}</p>
        <TerrainResourceRows />
      </TopicSection>

      <TopicSection topic="setup" title={t("rulebook.quick.setupTitle")}>
        <MessageList ordered keys={[
          "rulebook.quick.setupStep1",
          "rulebook.quick.setupStep2",
          "rulebook.quick.setupStep3",
          "rulebook.quick.setupStep4"
        ]} />
        <RulebookExample topic="setup-example" title={t("rulebook.quick.setupExampleTitle")}>
          {t("rulebook.quick.setupExampleBody")}
        </RulebookExample>
      </TopicSection>

      <TopicSection topic="turn" title={t("rulebook.quick.turnTitle")}>
        <MessageList ordered keys={[
          "rulebook.quick.turnStep1",
          "rulebook.quick.turnStep2",
          "rulebook.quick.turnStep3",
          "rulebook.quick.turnStep4"
        ]} />
        <RulebookExample topic="turn-example" title={t("rulebook.quick.turnExampleTitle")}>
          {t("rulebook.quick.turnExampleBody")}
        </RulebookExample>
      </TopicSection>

      <TopicSection topic="seven" title={t("rulebook.quick.sevenTitle")}>
        <p>{t("rulebook.quick.sevenBody")}</p>
      </TopicSection>

      <TopicSection topic="victory" title={t("rulebook.quick.victoryTitle")}>
        <p>{t("rulebook.quick.victoryBody")}</p>
      </TopicSection>
    </article>
  );
}

function BaseRulesChapter() {
  const { t } = useI18n();
  return (
    <article className="rulebook-chapter" data-rulebook-chapter="baseRules">
      <h3>{t("rulebook.base.title")}</h3>
      <p className="rulebook-lead">{t("rulebook.base.intro")}</p>

      <TopicSection topic="production" title={t("rulebook.base.productionTitle")}>
        <p>{t("rulebook.base.productionBody")}</p>
        <TerrainResourceRows />
      </TopicSection>

      <TopicSection topic="building" title={t("rulebook.base.buildingTitle")}>
        <MessageList keys={[
          "rulebook.base.roadRule",
          "rulebook.base.settlementRule",
          "rulebook.base.cityRule",
          "rulebook.base.availabilityRule"
        ]} />
        <h5>{t("rulebook.base.costsTitle")}</h5>
        <CostRows />
      </TopicSection>

      <TopicSection topic="trade" title={t("rulebook.base.tradeTitle")}>
        <p>{t("rulebook.base.playerTrade")}</p>
        <p>{t("rulebook.base.maritimeTrade")}</p>
      </TopicSection>

      <TopicSection topic="development" title={t("rulebook.base.developmentTitle")}>
        <p>{t("rulebook.base.developmentTiming")}</p>
        <MessageList keys={[
          "rulebook.base.cardKnight",
          "rulebook.base.cardRoadBuilding",
          "rulebook.base.cardYearOfPlenty",
          "rulebook.base.cardMonopoly",
          "rulebook.base.cardVictoryPoint"
        ]} />
      </TopicSection>

      <TopicSection topic="robber" title={t("rulebook.base.robberTitle")}>
        <p>{t("rulebook.base.robberBody")}</p>
      </TopicSection>

      <TopicSection topic="scoring" title={t("rulebook.base.scoringTitle")}>
        <MessageList keys={[
          "rulebook.base.scoreBuildings",
          "rulebook.base.scoreLongestRoad",
          "rulebook.base.scoreLargestArmy",
          "rulebook.base.scoreCards",
          "rulebook.base.scoreTarget"
        ]} />
      </TopicSection>

      <TopicSection topic="base-misunderstandings" title={t("rulebook.common.title")}>
        <MessageList keys={[
          "rulebook.base.misunderstanding1",
          "rulebook.base.misunderstanding2",
          "rulebook.base.misunderstanding3",
          "rulebook.base.misunderstanding4",
          "rulebook.base.misunderstanding5"
        ]} />
      </TopicSection>
    </article>
  );
}

function CommerceGuildChapter() {
  const { t } = useI18n();
  return (
    <article className="rulebook-chapter" data-rulebook-chapter="commerceGuild">
      <h3>{t("rulebook.guild.title")}</h3>
      <p className="rulebook-lead">{t("rulebook.guild.intro")}</p>

      <TopicSection topic="trade-slots" title={t("rulebook.guild.slotsTitle")}>
        <MessageList keys={[
          "rulebook.guild.slotWood",
          "rulebook.guild.slotBrick",
          "rulebook.guild.slotOre",
          "rulebook.guild.slotRefresh"
        ]} />
      </TopicSection>

      <TopicSection topic="tokens" title={t("rulebook.guild.tokensTitle")}>
        <p>{t("rulebook.guild.tokensBody")}</p>
      </TopicSection>

      <TopicSection topic="cooldown" title={t("rulebook.guild.cooldownTitle")}>
        <p>{t("rulebook.guild.cooldownBody")}</p>
        <p>{t("rulebook.guild.startAuthority")}</p>
      </TopicSection>

      <TopicSection topic="redemption" title={t("rulebook.guild.redemptionTitle")}>
        <p>{t("rulebook.guild.redemptionBody")}</p>
      </TopicSection>

      <TopicSection topic="auction" title={t("rulebook.guild.auctionTitle")}>
        <p>{t("rulebook.guild.auctionBody")}</p>
        <p>{t("rulebook.guild.auctionWinner")}</p>
        <p>{t("rulebook.guild.auctionTermination")}</p>
      </TopicSection>

      <TopicSection topic="outcomes" title={t("rulebook.guild.outcomesTitle")}>
        <MessageList keys={[
          "rulebook.guild.outcomeResources",
          "rulebook.guild.outcomeDevelopment",
          "rulebook.guild.outcomeVoucher",
          "rulebook.guild.outcomePrivacy"
        ]} />
      </TopicSection>

      <TopicSection topic="prizes" title={t("rulebook.guild.prizesTitle")}>
        <p>{t("rulebook.guild.prizesBody")}</p>
      </TopicSection>

      <TopicSection topic="guild-misunderstandings" title={t("rulebook.common.title")}>
        <MessageList keys={[
          "rulebook.guild.misunderstanding1",
          "rulebook.guild.misunderstanding2",
          "rulebook.guild.misunderstanding3",
          "rulebook.guild.misunderstanding4"
        ]} />
      </TopicSection>
    </article>
  );
}

function QuickReferenceChapter() {
  const { t } = useI18n();
  return (
    <article className="rulebook-chapter" data-rulebook-chapter="quickReference">
      <h3>{t("rulebook.reference.title")}</h3>
      <p className="rulebook-lead">{t("rulebook.reference.intro")}</p>

      <TopicSection topic="turn-checklist" title={t("rulebook.reference.turnTitle")}>
        <MessageList keys={[
          "rulebook.reference.turn1",
          "rulebook.reference.turn2",
          "rulebook.reference.turn3",
          "rulebook.reference.turn4"
        ]} />
      </TopicSection>

      <TopicSection topic="costs" title={t("rulebook.reference.costsTitle")}>
        <CostRows />
      </TopicSection>

      <TopicSection topic="terrain" title={t("rulebook.reference.terrainTitle")}>
        <TerrainResourceRows />
      </TopicSection>

      <TopicSection topic="ports" title={t("rulebook.reference.portsTitle")}>
        <MessageList keys={[
          "rulebook.reference.portDefault",
          "rulebook.reference.portGeneric",
          "rulebook.reference.portResource"
        ]} />
      </TopicSection>

      <TopicSection topic="points" title={t("rulebook.reference.pointsTitle")}>
        <MessageList keys={[
          "rulebook.reference.pointSettlement",
          "rulebook.reference.pointAwards",
          "rulebook.reference.pointCards",
          "rulebook.reference.pointTarget"
        ]} />
      </TopicSection>

      <TopicSection topic="blockers" title={t("rulebook.reference.blockersTitle")}>
        <MessageList keys={[
          "rulebook.reference.blockerRoll",
          "rulebook.reference.blockerPlayer",
          "rulebook.reference.blockerResources",
          "rulebook.reference.blockerTarget",
          "rulebook.reference.blockerTrade",
          "rulebook.reference.blockerGathering",
          "rulebook.reference.blockerCards"
        ]} />
      </TopicSection>

      <TopicSection topic="input" title={t("rulebook.reference.inputTitle")}>
        <MessageList keys={[
          "rulebook.reference.inputKeyboard",
          "rulebook.reference.inputTouch",
          "rulebook.reference.inputScroll",
          "rulebook.reference.inputMobile"
        ]} />
      </TopicSection>

      <p className="rulebook-end" data-rulebook-topic="final">
        {t("rulebook.reference.final")}
      </p>
    </article>
  );
}

export function RulebookChapterContent({ chapter }: { chapter: RulebookChapterId }) {
  switch (chapter) {
    case "quickStart":
      return <QuickStartChapter />;
    case "baseRules":
      return <BaseRulesChapter />;
    case "commerceGuild":
      return <CommerceGuildChapter />;
    case "quickReference":
      return <QuickReferenceChapter />;
  }
}
