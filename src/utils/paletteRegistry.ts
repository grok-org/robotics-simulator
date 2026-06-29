import type { PaletteItem } from "../types/vmc";
import { extractConvexHull } from "./svgCollider";
import rockSvg from "/assets/rock.svg?raw";
import coneSvg from "/assets/cone.svg?raw";

export const PALETTE_ITEMS: PaletteItem[] = [
  {
    id: "rock",
    label: "Rock",
    svgAsset: rockSvg,
    width: 60,
    height: 60,
    bodyType: "fixed",
  },
  {
    id: "cone",
    label: "Cone",
    svgAsset: coneSvg,
    width: 50,
    height: 70,
    bodyType: "fixed",
  },
];
PALETTE_ITEMS.forEach((item) => {
  item.convexHull = extractConvexHull(item.svgAsset);
});
export function getPaletteItem(id: string): PaletteItem | undefined {
  return PALETTE_ITEMS.find((p) => p.id === id);
}
