
export interface WallBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}
export function constrainToWallBounds(
  x: number,
  y: number,
  objectWidth: number,
  objectHeight: number,
  bounds: WallBounds,
): { x: number; y: number } {
  const halfW = objectWidth / 2;
  const halfH = objectHeight / 2;
  return {
    x: Math.max(bounds.minX + halfW, Math.min(bounds.maxX - halfW, x)),
    y: Math.max(bounds.minY + halfH, Math.min(bounds.maxY - halfH, y)),
  };
}
