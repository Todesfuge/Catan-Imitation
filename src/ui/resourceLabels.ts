import { resources, type Resource, type ResourceMap } from "../domain/types";

export const resourceLabels: Record<Resource, string> = {
  wood: "Wood",
  brick: "Brick",
  wool: "Wool",
  grain: "Grain",
  ore: "Ore"
};

export const resourceShortLabels: Record<Resource, string> = {
  wood: "Wd",
  brick: "Br",
  wool: "Wl",
  grain: "Gr",
  ore: "Or"
};

export function formatResourceMap(map: Partial<ResourceMap>): string {
  return resources
    .filter((resource) => (map[resource] ?? 0) > 0)
    .map((resource) => {
      const quantity = map[resource] ?? 0;
      const displayQuantity = Number.isInteger(quantity)
        ? String(quantity)
        : quantity.toFixed(2).replace(/\.0+$|(?<=\.[0-9])0+$/, "");
      return `${resourceLabels[resource]} ${displayQuantity}`;
    })
    .join(", ");
}
