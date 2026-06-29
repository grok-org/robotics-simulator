import { tokens } from "../styles/tokens";
const {
  wallGap: GAP,
  wallVisualThickness: T,
  wallOverhang: O,
  playInset: PLAY,
} = tokens.canvas;
export const WALL_PHYSICS_THICKNESS = Math.max(1, T);
export type WallGeom = {
  trackW: number;
  trackH: number;
  innerX: number;
  innerY: number;
  innerW: number;
  innerH: number;
  thickness: number;
  playMinX: number;
  playMinY: number;
  playMaxX: number;
  playMaxY: number;
};
export type WallBar = {
  x: number; y: number; w: number; h: number;
  cx: number; cy: number; hx: number; hy: number;
};
export function computeWallGeom(track: { width: number; height: number }): WallGeom {
  const g = Math.max(0, GAP);
  const p = Math.max(0, PLAY);
  const innerW = Math.max(0, track.width - 2 * g);
  const innerH = Math.max(0, track.height - 2 * g);
  return {
    trackW: track.width,
    trackH: track.height,
    innerX: g,
    innerY: g,
    innerW,
    innerH,
    thickness: Math.max(0, T),
    playMinX: g + p,
    playMinY: g + p,
    playMaxX: track.width - g - p,
    playMaxY: track.height - g - p,
  };
}
export function computeWallBars(g: WallGeom): WallBar[] {
  const t = g.thickness;
  const W = g.trackW;
  const H = g.trackH;
  return [
    {
      x: g.innerX, y: g.innerY, w: g.innerW, h: t,
      cx: W * 0.5, cy: g.innerY + t * 0.5,
      hx: g.innerW * 0.5, hy: t * 0.5,
    },
    {
      x: g.innerX, y: H - g.innerY - t, w: g.innerW, h: t,
      cx: W * 0.5, cy: H - g.innerY - t * 0.5,
      hx: g.innerW * 0.5, hy: t * 0.5,
    },
    {
      x: g.innerX, y: g.innerY, w: t, h: g.innerH,
      cx: g.innerX + t * 0.5, cy: H * 0.5,
      hx: t * 0.5, hy: g.innerH * 0.5,
    },
    {
      x: W - g.innerX - t, y: g.innerY, w: t, h: g.innerH,
      cx: W - g.innerX - t * 0.5, cy: H * 0.5,
      hx: t * 0.5, hy: g.innerH * 0.5,
    },
  ];
}
export function computeStageSize(g: WallGeom) {
  const o = Math.max(0, O);
  return { w: g.trackW + 2 * o, h: g.trackH + 2 * o, offset: -o };
}
export function computePlayBounds(g: WallGeom) {
  return {
    minX: g.playMinX,
    minY: g.playMinY,
    maxX: g.playMaxX,
    maxY: g.playMaxY,
  };
}
