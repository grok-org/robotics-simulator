import type { PlayBounds } from "../types/vmc";
export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;
export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
export function clampToBounds(x: number, y: number, b: PlayBounds) {
  return {
    x: clamp(x, b.minX, b.maxX),
    y: clamp(y, b.minY, b.maxY),
  };
}
export function screenToWorld(
  centerX: number,
  centerY: number,
  viewportRect: DOMRect,
  camera: { x: number; y: number; scale: number },
) {
  return {
    x: (centerX - viewportRect.left - camera.x) / camera.scale,
    y: (centerY - viewportRect.top - camera.y) / camera.scale,
  };
}
