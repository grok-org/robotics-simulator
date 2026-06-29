import { scopedLogger } from "./logger";
const log = scopedLogger("svgGeometry");
const FALLBACK_VB_W = 595.3;
const FALLBACK_VB_H = 841.9;
const MAX_IR_SENSORS = 4;
export interface BotGeometry {
  leftMotor: { x: number; y: number };
  rightMotor: { x: number; y: number };
  irOffsetsSvg: Array<{ x: number; y: number }>;
  txOffsetSvg: { x: number; y: number };
  rxOffsetSvg: { x: number; y: number };
  bodyBBox: { w: number; h: number };
  viewBox: { w: number; h: number };
}
export interface WorldBotGeometry {
  wheelBase: number;
  irForwardOffset: number;
  irLateralOffset: number;
  irOffsets: Array<{ x: number; y: number }>;
  txLocal: { x: number; y: number };
  rxLocal: { x: number; y: number };
  bodySize: { w: number; h: number };
  scale: number;
}
export function extractBotGeometry(svgRoot: SVGSVGElement): BotGeometry {
  const parts = svgRoot.getAttribute("viewBox")?.split(/[\s,]+/).map(Number);
  const vbW =
    parts && parts.length >= 4 && Number.isFinite(parts[2])
      ? parts[2]
      : FALLBACK_VB_W;
  const vbH =
    parts && parts.length >= 4 && Number.isFinite(parts[3])
      ? parts[3]
      : FALLBACK_VB_H;
  const leftMotorEl = svgRoot.querySelector("#left-motor");
  const rightMotorEl = svgRoot.querySelector("#right-motor");
  if (!leftMotorEl || !rightMotorEl) {
    throw new Error(
      'Bot SVG must contain <g id="left-motor"> and <g id="right-motor">',
    );
  }
  const lb = (leftMotorEl as SVGGraphicsElement).getBBox();
  const rb = (rightMotorEl as SVGGraphicsElement).getBBox();
  const leftMotor = { x: lb.x + lb.width / 2, y: lb.y + lb.height / 2 };
  const rightMotor = { x: rb.x + rb.width / 2, y: rb.y + rb.height / 2 };
  const lateralVec = {
    x: rightMotor.x - leftMotor.x,
    y: rightMotor.y - leftMotor.y,
  };
  const lateralLen = Math.hypot(lateralVec.x, lateralVec.y);
  const rightUnit = {
    x: lateralVec.x / lateralLen,
    y: lateralVec.y / lateralLen,
  };
  let forwardUnit = { x: -rightUnit.y, y: rightUnit.x };
  if (forwardUnit.y > 0) {
    forwardUnit = { x: rightUnit.y, y: -rightUnit.x };
  }
  const motorMidpoint = {
    x: (leftMotor.x + rightMotor.x) / 2,
    y: (leftMotor.y + rightMotor.y) / 2,
  };
  const irRaw: Array<{ x: number; y: number; index: number }> = [];
  for (let i = 0; i < MAX_IR_SENSORS; i++) {
    const el = svgRoot.querySelector(`.ir-led.ir-led-${i}`);
    if (!el) break;
    irRaw.push({
      x: parseFloat(el.getAttribute("cx") ?? "0"),
      y: parseFloat(el.getAttribute("cy") ?? "0"),
      index: i,
    });
  }
  const irOffsetsSvg = irRaw.map((p: { x: number; y: number; index: number }) => {
    const dx = p.x - motorMidpoint.x;
    const dy = p.y - motorMidpoint.y;
    return {
      x: dx * forwardUnit.x + dy * forwardUnit.y,
      y: dx * rightUnit.x + dy * rightUnit.y,
    };
  });
  const toLocalOffset = (sel: string): { x: number; y: number } => {
    const el = svgRoot.querySelector(sel) as SVGGraphicsElement | null;
    if (!el) return { x: 0, y: 0 };
    const b = el.getBBox();
    const dx = b.x + b.width / 2 - motorMidpoint.x;
    const dy = b.y + b.height / 2 - motorMidpoint.y;
    return {
      x: dx * forwardUnit.x + dy * forwardUnit.y,
      y: dx * rightUnit.x + dy * rightUnit.y,
    };
  };
  const txOffsetSvg = toLocalOffset("#u-transmitter-transducer");
  const rxOffsetSvg = toLocalOffset("#u-receiver-transducer");
  const rootBox = (svgRoot as SVGGraphicsElement).getBBox();
  const bodyBBox = { w: rootBox.width, h: rootBox.height };
  log.info("svg-extract", {
    viewBox: { w: vbW, h: vbH },
    motorMidpoint,
    forwardUnit,
    rightUnit,
    wheelBaseSvg: lateralLen.toFixed(1),
    irCount: irRaw.length,
    irSvg: irRaw.map((p, i) => ({
      i,
      cx: p.x.toFixed(1),
      cy: p.y.toFixed(1),
      fwd: irOffsetsSvg[i]?.x.toFixed(1) ?? "?",
      right: irOffsetsSvg[i]?.y.toFixed(1) ?? "?",
    })),
  });
  return {
    leftMotor,
    rightMotor,
    irOffsetsSvg,
    txOffsetSvg,
    rxOffsetSvg,
    bodyBBox,
    viewBox: { w: vbW, h: vbH },
  };
}
export function computeWorldGeometry(
  geom: BotGeometry,
  worldW: number,
  worldH: number,
): WorldBotGeometry {
  const sx = worldW / geom.viewBox.w;
  const sy = worldH / geom.viewBox.h;
  const scale = (sx + sy) / 2;
  const wheelBase = Math.hypot(
    geom.leftMotor.x - geom.rightMotor.x,
    geom.leftMotor.y - geom.rightMotor.y,
  ) * scale;
  const irOffsets = geom.irOffsetsSvg.map((p: { x: number; y: number }) => ({
    x: p.x * scale,
    y: p.y * scale,
  }));
  const txLocal = { x: geom.txOffsetSvg.x * scale, y: geom.txOffsetSvg.y * scale };
  const rxLocal = { x: geom.rxOffsetSvg.x * scale, y: geom.rxOffsetSvg.y * scale };
  const bodySize = { w: geom.bodyBBox.w * scale, h: geom.bodyBBox.h * scale };
  const irForwardOffset =
    irOffsets.length === 0
      ? 0
      : irOffsets.reduce((s, p) => s + p.x, 0) / irOffsets.length;
  const irLateralOffset =
    irOffsets.length === 0
      ? 0
      : (Math.max(...irOffsets.map((p) => p.y)) -
        Math.min(...irOffsets.map((p) => p.y))) /
      2;
  log.info("world-geometry", {
    scale: scale.toFixed(4),
    wheelBase: wheelBase.toFixed(2),
    irForwardOffset: irForwardOffset.toFixed(2),
    irLateralOffset: irLateralOffset.toFixed(2),
    irOffsets: irOffsets.map((p, i) => ({
      i,
      fwd: p.x.toFixed(2),
      right: p.y.toFixed(2),
    })),
  });
  return {
    wheelBase,
    irForwardOffset,
    irLateralOffset,
    irOffsets,
    txLocal,
    rxLocal,
    bodySize,
    scale,
  };
}
