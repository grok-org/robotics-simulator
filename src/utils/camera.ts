
export interface CameraState {
  panX: number;
  panY: number;
  zoom: number;
}
export interface Point {
  x: number;
  y: number;
}
export function screenToWorld(
  screenX: number,
  screenY: number,
  camera: CameraState,
): Point {
  return {
    x: (screenX - camera.panX) / camera.zoom,
    y: (screenY - camera.panY) / camera.zoom,
  };
}
