import type { TrackDefinition } from "../types/vmc";
import { TRACK_LINE_WIDTH } from "../types/vmc";
const W = 900;
const H = 700;
function drawBase(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#eef2f7";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(15, 23, 42, 0.06)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 50) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y <= H; y += 50) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = TRACK_LINE_WIDTH;
}
function strokePath(ctx: CanvasRenderingContext2D, path: Path2D): void {
  ctx.save();
  ctx.shadowColor = "rgba(15, 23, 42, 0.18)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  ctx.stroke(path);
  ctx.restore();
}
export const TRACKS: TrackDefinition[] = [
  {
    id: "oval",
    name: "Oval Circuit",
    width: W,
    height: H,
    start: { x: 730, y: 350, angle: Math.PI / 2 },
    draw: (ctx) => {
      drawBase(ctx);
      const path = new Path2D();
      path.ellipse(450, 350, 280, 170, 0, 0, Math.PI * 2);
      strokePath(ctx, path);
    },
  },
  {
    id: "figure8",
    name: "Figure-8",
    width: W,
    height: H,
    start: { x: 430, y: 350, angle: Math.PI / 3.5 },
    draw: (ctx) => {
      drawBase(ctx);
      const path = new Path2D();
      
      path.moveTo(450, 350);
      path.bezierCurveTo(600, 175, 600, 175, 450, 175);
      path.bezierCurveTo(300, 175, 300, 175, 450, 350);
      path.bezierCurveTo(600, 525, 600, 525, 450, 525);
      path.bezierCurveTo(300, 525, 300, 525, 450, 350);
      
      path.closePath();
      strokePath(ctx, path);
    },
  },
  {
    id: "rectangle",
    name: "Rectangular Loop",
    width: W,
    height: H,
    start: { x: 450, y: 100, angle: 0 },
    draw: (ctx) => {
      drawBase(ctx);
      const path = new Path2D();
      path.roundRect(100, 100, 700, 500, 42);
      strokePath(ctx, path);
    },
  },
  {
    id: "scurve",
    name: "S-Curve Sprint",
    width: W,
    height: H,
    start: { x: 100, y: 350, angle: 0 },
    draw: (ctx) => {
      drawBase(ctx);
      const path = new Path2D();
      const n = 160;
      const startX = 60;
      const endX = 780;
      const span = endX - startX;
      const cy = 350;
      const amplitude = 40;
      const leadIn = 80;
      const innerPoints = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x = startX + t * span;
        const curveT = Math.max(0, Math.min(1, (x - startX - leadIn) / (span - leadIn * 2)));
        const y = cy + Math.sin(curveT * Math.PI * 4) * amplitude;
        innerPoints.push({ x, y });
        if (i === 0) {
          path.moveTo(x, y);
        } else {
          path.lineTo(x, y);
        }
      }
      const trackThickness = 120;
      for (let i = n; i >= 0; i--) {
        const p = innerPoints[i];
        path.lineTo(p.x, p.y + trackThickness);
      }
      path.closePath();
      strokePath(ctx, path);
    },
  },
  {
    id: "wave-oval",
    name: "Wavy Oval Circuit",
    width: W,
    height: H,
    start: { x: 730, y: 350, angle: Math.PI / 2 },
    draw: (ctx) => {
      drawBase(ctx);
      const path = new Path2D();
      const cx = 450;
      const cy = 350;
      const n = 200;
      path.moveTo(cx + (280 + 40 * Math.sin(0)) * Math.cos(0), cy + (170 + 30 * Math.cos(0)) * Math.sin(0));
      for (let i = 1; i <= n; i++) {
        const t = (i / n) * Math.PI * 2;
        const rx = 280 + 40 * Math.sin(t * 3);
        const ry = 170 + 30 * Math.cos(t * 2);
        path.lineTo(cx + rx * Math.cos(t), cy + ry * Math.sin(t));
      }
      path.closePath();
      strokePath(ctx, path);
    },
  },
  {
    id: "peanut",
    name: "Peanut Track",
    width: W,
    height: H,
    start: { x: 110, y: 350, angle: Math.PI / 2 },
    draw: (ctx) => {
      drawBase(ctx);
      const path = new Path2D();
      path.moveTo(110, 350);
      path.bezierCurveTo(110, 480, 140, 520, 200, 520);
      path.bezierCurveTo(280, 520, 360, 540, 440, 540);
      path.bezierCurveTo(520, 540, 580, 580, 680, 580);
      path.bezierCurveTo(800, 580, 840, 500, 820, 400);
      path.bezierCurveTo(800, 300, 720, 280, 580, 270);
      path.bezierCurveTo(520, 270, 480, 240, 420, 180);
      path.bezierCurveTo(360, 120, 240, 120, 180, 120);
      path.bezierCurveTo(140, 120, 110, 160, 110, 240);
      path.closePath();
      strokePath(ctx, path);
    },
  },
  {
    id: "maze",
    name: "Maze Circuit",
    width: W,
    height: H,
    start: { x: 830, y: 250, angle: Math.PI },
    draw: (ctx) => {
      drawBase(ctx);
      const path = new Path2D();
      path.moveTo(830, 250);
      path.lineTo(480, 250);
      path.lineTo(480, 75);
      path.lineTo(250, 75);
      path.lineTo(250, 175);
      path.lineTo(70, 185);
      path.lineTo(70, 470);
      path.lineTo(400, 450);
      path.lineTo(400, 330);
      path.lineTo(330, 330);
      path.lineTo(330, 450);
      path.lineTo(560, 450);
      path.lineTo(560, 250);
      path.lineTo(830, 250);
      path.closePath();
      strokePath(ctx, path);
    },
  },
];
export function getTrackById(id: string): TrackDefinition {
  return TRACKS.find((track) => track.id === id) ?? TRACKS[0];
}
