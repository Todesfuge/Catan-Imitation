import { resources, type Resource, type ResourceMap } from "../domain/types";

export const resourceLabels: Record<Resource, string> = {
  wood: "Wood",
  brick: "Brick",
  wool: "Wool",
  grain: "Grain",
  ore: "Ore"
};

export function formatResourceQuantity(quantity: number): string {
  return Number.isInteger(quantity)
    ? String(quantity)
    : quantity.toFixed(2).replace(/\.0+$|(?<=\.[0-9])0+$/, "");
}

export function formatResourceMap(
  map: Partial<ResourceMap>,
  labels: Record<Resource, string> = resourceLabels
): string {
  return resources
    .filter((resource) => (map[resource] ?? 0) > 0)
    .map((resource) => {
      const quantity = map[resource] ?? 0;
      const displayQuantity = formatResourceQuantity(quantity);
      return `${labels[resource]} ${displayQuantity}`;
    })
    .join(", ");
}
