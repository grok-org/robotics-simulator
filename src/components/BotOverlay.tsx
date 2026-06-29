import React, { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { BotSVG } from "./BotSVG";
import { CanvasMoveable } from "./CanvasMoveable";
import type {
  BotSVGHandle,
  BotWorldGeometry,
  BotOverlayProps,
} from "../types/vmc";
import { BOT_SVG_WIDTH, BOT_SVG_HEIGHT } from "../types/vmc";
import { clampToBounds, screenToWorld, DEG, RAD } from "../utils/overlayMath";
import { useIrLedAnimation } from "../hooks/useIrLedAnimation";

const px = (v: number) => Math.round(v);
const deg1 = (v: number) => Math.round(v * 10) / 10;
const qScale = (s: number) => Math.round(s * 1000) / 1000;

const LED_BASE_R = 7;
const LED_FILL = { onLine: "#ef4444", offLine: "#22c55e" } as const;
const LED_STROKE = { onLine: "#7f1d1d", offLine: "#14532d" } as const;
const LED_GLOW_RGB = "34,197,94";
const LED_GLOW_BLUR_BASE = 6;
const LED_GLOW_BLUR_SWING = 6;
const LED_GLOW_ALPHA_BASE = 0.35;
const LED_GLOW_ALPHA_SWING = 0.45;
const LUM_MAX = 765;

function updateLedGlow(el: SVGCircleElement, lum: number, onLine: boolean): void {
  if (onLine) {
    el.setAttribute("filter", "none");
    return;
  }
  const t = Math.max(0, Math.min(1, lum / LUM_MAX));
  const blur = LED_GLOW_BLUR_BASE + LED_GLOW_BLUR_SWING * t;
  const alpha = LED_GLOW_ALPHA_BASE + LED_GLOW_ALPHA_SWING * t;
  el.setAttribute(
    "filter",
    `drop-shadow(0 0 ${blur}px rgba(${LED_GLOW_RGB},${alpha}))`,
  );
}

function initLed(el: SVGCircleElement, lum: number, onLine: boolean): void {
  const state = onLine ? LED_FILL.onLine : LED_FILL.offLine;
  const stroke = onLine ? LED_STROKE.onLine : LED_STROKE.offLine;
  gsap.set(el, {
    fill: state,
    stroke,
    attr: { r: LED_BASE_R },
  });
  updateLedGlow(el, lum, onLine);
}

function animateLedTransition(
  el: SVGCircleElement,
  onLine: boolean,
  prevTween: gsap.core.Tween | null,
): gsap.core.Tween {
  prevTween?.kill();
  const target = onLine ? LED_FILL.onLine : LED_FILL.offLine;
  const stroke = onLine ? LED_STROKE.onLine : LED_STROKE.offLine;

  gsap.set(el, { attr: { r: LED_BASE_R * (onLine ? 1.4 : 1.8) } });
  return gsap.to(el, {
    fill: target,
    stroke,
    attr: { r: LED_BASE_R },
    duration: onLine ? 0.18 : 0.28,
    ease: onLine ? "power2.out" : "back.out(3)",
  });
}

interface MoveableInstance {
  updateRect?(): void;
}
function refreshMoveable(ref: React.RefObject<unknown>): void {
  (ref.current as MoveableInstance | null)?.updateRect?.();
}

export interface BotOverlayExtraProps extends BotOverlayProps {
  onBotGeometry?: (geom: BotWorldGeometry) => void;
}

export function BotOverlay({
  physicsRef,
  vmcRef,
  cameraRef,
  sensorPinsRef,
  playBoundsRef,
  overlayRef,
  viewportRef,
  onTeleportBot,
  onBotGeometry,
}: BotOverlayExtraProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const botRef = useRef<BotSVGHandle>(null);
  const moveableRef = useRef<unknown>(null);
  const rafRef = useRef(0);
  const lockedRef = useRef(false);
  const dragRotation = useRef(0);
  const prevLed = useRef(new Int8Array([-1, -1, -1, -1]));
  const ledTweens = useRef<Array<gsap.core.Tween | null>>([null, null, null, null]);
  const mountedRef = useRef(true);
  const zoomThrottle = useRef(0);
  const selectedRef = useRef(false);
  const [selected, setSelected] = useState(false);
  const [, setZoomTick] = useState(0);

  useEffect(() => {
    selectedRef.current = selected;
    if (selectedRef.current) refreshMoveable(moveableRef);
  }, [selected]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    let lastScale = qScale(cameraRef.current.scale);
    const loop = () => {
      if (!alive) return;
      rafRef.current = requestAnimationFrame(loop);
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      const s = qScale(cameraRef.current.scale);
      if (s !== lastScale) {
        lastScale = s;
        const now = performance.now();
        if (now - zoomThrottle.current > 50) {
          zoomThrottle.current = now;
          setZoomTick((t) => t + 1);
        }
      }
      if (!lockedRef.current) {
        const p = physicsRef.current;
        gsap.set(wrapper, {
          x: px(p.x - BOT_SVG_WIDTH * 0.5),
          y: px(p.y - BOT_SVG_HEIGHT * 0.5),
          rotation: deg1(p.angle * RAD + 90),
        });
        if (selectedRef.current) refreshMoveable(moveableRef);
      }
      const bot = botRef.current;
      if (!bot) return;
      const { pins, count } = sensorPinsRef.current;
      const lumMap = vmcRef.current.irLuminance;
      const dig = vmcRef.current.digitalInputs;
      const prev = prevLed.current;
      const visible = Math.min(count, 4);
      for (let i = 0; i < 4; i++) {
        const el = bot.leds[i];
        if (!el) continue;
        const srcIdx =
          i === 2 && visible === 1
            ? 0
            : visible >= 2
              ? Math.round((i * (visible - 1)) / 3)
              : -1;
        const pin = srcIdx >= 0 ? pins[srcIdx] : undefined;
        const lum =
          pin !== undefined
            ? (lumMap?.[pin] ?? LUM_MAX)
            : LUM_MAX;
        const isOnLine = pin !== undefined ? dig[pin] === 1 : false;
        if (prev[i] === -1) {
          initLed(el, lum, isOnLine);
          prev[i] = isOnLine ? 1 : 0;
        } else {
          updateLedGlow(el, lum, isOnLine);
          const wasOnLine = prev[i] === 1;
          if (isOnLine !== wasOnLine) {
            ledTweens.current[i] = animateLedTransition(
              el,
              isOnLine,
              ledTweens.current[i],
            );
            prev[i] = isOnLine ? 1 : 0;
          }
        }
      }
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      alive = false;
      cancelAnimationFrame(rafRef.current);
      ledTweens.current.forEach((t) => t?.kill());
    };
  }, [physicsRef, sensorPinsRef, vmcRef, cameraRef]);

  useIrLedAnimation({
    getLeds: () => botRef.current?.leds ?? null,
    read: (i) => {
      const bot = botRef.current;
      if (!bot) return null;
      const { pins, count } = sensorPinsRef.current;
      const visible = Math.min(count, 4);
      let srcIdx: number;
      if (i === 2 && visible === 1) srcIdx = 0;
      else if (visible >= 2) srcIdx = Math.round((i * (visible - 1)) / 3);
      else srcIdx = -1;
      const pin = srcIdx >= 0 ? pins[srcIdx] : undefined;
      const lumMap = vmcRef.current.irLuminance;
      const dig = vmcRef.current.digitalInputs;
      return {
        luminance: pin !== undefined ? (lumMap?.[pin] ?? LUM_MAX) : LUM_MAX,
        onLine: pin !== undefined ? dig[pin] === 1 : false,
      };
    },
  });

  const lock = () => {
    lockedRef.current = true;
  };
  const commit = (): void => {
    const w = wrapperRef.current;
    const vp = viewportRef.current;
    if (!w || !vp) {
      lockedRef.current = false;
      return;
    }
    const r = w.getBoundingClientRect();
    const vr = vp.getBoundingClientRect();
    const cam = cameraRef.current;
    const pos = screenToWorld(r.left + r.width * 0.5, r.top + r.height * 0.5, vr, cam);
    const clamped = clampToBounds(pos.x, pos.y, playBoundsRef.current);
    const theta = (dragRotation.current - 90) * DEG;
    requestAnimationFrame(() => {
      if (!mountedRef.current) return;
      onTeleportBot(clamped.x, clamped.y, theta);
      lockedRef.current = false;
    });
  };

  return (
    <div
      ref={overlayRef}
      className={`vmc-bot-overlay absolute inset-0 pointer-events-none origin-top-left ${selected ? "is-selected" : ""
        }`}
      onClick={(e) => {
        if (e.target === e.currentTarget) setSelected(false);
      }}
    >
      <div
        ref={wrapperRef}
        className="vmc-bot-grabber absolute left-0 top-0 origin-center cursor-grab active:cursor-grabbing"
        style={{
          width: BOT_SVG_WIDTH,
          height: BOT_SVG_HEIGHT,
          pointerEvents: "auto",
        }}
        title="Drag to move • top handle to rotate"
        onClick={(e) => {
          e.stopPropagation();
          setSelected(true);
        }}
      >
        <BotSVG ref={botRef} onGeometryReady={onBotGeometry} />
        <span className="vmc-bot-ghost" />
      </div>
      {wrapperRef.current && (
        <CanvasMoveable
          ref={moveableRef as never}
          targetRef={wrapperRef}
          containerRef={overlayRef}
          cameraScale={cameraRef.current.scale}
          dragRotationRef={dragRotation}
          onStart={lock}
          onCommit={commit}
        />
      )}
    </div>
  );
}
