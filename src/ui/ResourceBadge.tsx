import React from "react";
import {
  BrickWall,
  Cloud,
  Gem,
  Trees,
  Wheat,
  type LucideIcon
} from "lucide-react";
import {
  resources as resourceOrder,
  type Resource,
  type ResourceMap
} from "../domain/types";
import { useI18n } from "./i18n";
import { formatResourceQuantity } from "./resourceLabels";

const resourceIcons: Record<Resource, LucideIcon> = {
  wood: Trees,
  brick: BrickWall,
  wool: Cloud,
  grain: Wheat,
  ore: Gem
};

export function ResourceIcon({
  resource,
  className = "",
  decorative = false,
  size = 18
}: {
  resource: Resource;
  className?: string;
  decorative?: boolean;
  size?: number;
}) {
  const { t } = useI18n();
  const Icon = resourceIcons[resource];
  const label = t(`resource.${resource}`);
  return (
    <span
      {...(decorative ? { "aria-hidden": true } : { "aria-label": label, role: "img", title: label })}
      className={`resource-icon resource-${resource} ${resource} ${className}`.trim()}
      data-resource-icon={resource}
    >
      <Icon aria-hidden="true" focusable="false" size={size} />
    </span>
  );
}

export function ResourceBadge({
  resource,
  quantity,
  className = "",
  compact = false,
  decorative = false
}: {
  resource: Resource;
  quantity: number;
  className?: string;
  compact?: boolean;
  decorative?: boolean;
}) {
  const { t } = useI18n();
  const formattedQuantity = formatResourceQuantity(quantity);
  const label = t("resource.quantity", {
    resource: t(`resource.${resource}`),
    quantity: formattedQuantity
  });
  return (
    <span
      {...(decorative ? { "aria-hidden": true } : { "aria-label": label, role: "img", title: label })}
      className={`resource-badge resource-${resource} ${resource}${compact ? " compact" : ""} ${className}`.trim()}
      data-resource-badge={resource}
      data-resource-quantity={formattedQuantity}
    >
      <ResourceIcon decorative resource={resource} size={compact ? 15 : 18} />
      <span className="resource-quantity">{formattedQuantity}</span>
    </span>
  );
}

export function ResourceBundle({
  resources,
  className = "",
  compact = false,
  includeZero = false
}: {
  resources: Partial<ResourceMap>;
  className?: string;
  compact?: boolean;
  includeZero?: boolean;
}) {
  const { t } = useI18n();
  const entries = resourceOrder.filter(
    (resource) => includeZero || (resources[resource] ?? 0) > 0
  );
  const label = entries
    .map((resource) => t("resource.quantity", {
      resource: t(`resource.${resource}`),
      quantity: formatResourceQuantity(resources[resource] ?? 0)
    }))
    .join(t("resource.bundleSeparator"));
  return (
    <span
      aria-label={label}
      className={`resource-bundle${compact ? " compact" : ""} ${className}`.trim()}
      role="group"
      title={label}
    >
      {entries.map((resource) => (
        <ResourceBadge
          compact={compact}
          decorative
          key={resource}
          quantity={resources[resource] ?? 0}
          resource={resource}
        />
      ))}
    </span>
  );
}
