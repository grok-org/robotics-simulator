import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";

export type IrLedState = "off-line" | "on-line";
const LED_FILL: Record<IrLedState, string> = {
  "on-line": "#ef4444",
  "off-line": "#22c55e",
};
const LED_STROKE: Record<IrLedState, string> = {
  "on-line": "#7f1d1d",
  "off-line": "#14532d",
};
const LED_BASE_R = 3.6;
const GLOW_RGB = "34,197,94";
const GLOW_BLUR_BASE = 6;
const GLOW_BLUR_SWING = 6;
const GLOW_ALPHA_BASE = 0.35;
const GLOW_ALPHA_SWING = 0.45;
const LUM_MAX = 765;
function setGlowFilter(el: SVGCircleElement, lum: number, state: IrLedState): void {
  if (state === "on-line") {
    el.setAttribute("filter", "none");
    return;
  }
  const t = Math.max(0, Math.min(1, lum / LUM_MAX));
  const blur = GLOW_BLUR_BASE + GLOW_BLUR_SWING * t;
  const alpha = GLOW_ALPHA_BASE + GLOW_ALPHA_SWING * t;
  el.setAttribute(
    "filter",
    `drop-shadow(0 0 ${blur}px rgba(${GLOW_RGB},${alpha}))`,
  );
}
function setStaticAppearance(
  el: SVGCircleElement,
  state: IrLedState,
  lum: number,
): void {
  el.setAttribute("fill", LED_FILL[state]);
  el.setAttribute("stroke", LED_STROKE[state]);
  el.setAttribute("r", String(LED_BASE_R));
  setGlowFilter(el, lum, state);
}

function animateFlip(
  el: SVGCircleElement,
  toState: IrLedState,
  prev: gsap.core.Tween | null,
): gsap.core.Tween {
  prev?.kill();
  return gsap.fromTo(
    el,
    { attr: { r: LED_BASE_R * (toState === "on-line" ? 1.4 : 1.9) } },
    {
      attr: {
        fill: LED_FILL[toState],
        stroke: LED_STROKE[toState],
        r: LED_BASE_R,
      },
      duration: toState === "on-line" ? 0.18 : 0.3,
      ease: toState === "on-line" ? "power2.out" : "back.out(3)",
    },
  );
}
export interface IrLedAnimationProps {
  getLeds: () => ReadonlyArray<SVGCircleElement | null> | null;
  read: (index: number) => { luminance: number; onLine: boolean } | null;
}

export function useIrLedAnimation({ getLeds, read }: IrLedAnimationProps): void {

  const [ledSignature, setLedSignature] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const current = getLeds();

      const next = current ? sig(current) : 0;
      if (next !== lastSig) {
        lastSig = next;
        setLedSignature((s) => s + 1);
      }
      rafHandle = requestAnimationFrame(tick);
    };
    let lastSig = -1;
    let rafHandle = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafHandle);
    };
  }, [getLeds]);
  const prevStateRef = useRef<Array<IrLedState | null>>([]);
  const tweensRef = useRef<Array<gsap.core.Tween | null>>([]);
  useEffect(() => {
    let alive = true;
    const leds = getLeds() ?? [];
    prevStateRef.current = Array(leds.length).fill(null);
    tweensRef.current = Array(leds.length).fill(null);
    const tick = () => {
      if (!alive) return;
      const current = getLeds() ?? [];

      if (current.length !== prevStateRef.current.length) {
        prevStateRef.current = Array(current.length).fill(null);
        tweensRef.current = Array(current.length).fill(null);
      }
      for (let i = 0; i < current.length; i++) {
        const el = current[i];
        if (!el) continue;
        const reading = read(i);
        if (!reading) continue;
        const nextState: IrLedState = reading.onLine ? "on-line" : "off-line";
        const prev = prevStateRef.current[i];
        if (prev === null) {
          setStaticAppearance(el, nextState, reading.luminance);
          prevStateRef.current[i] = nextState;
          continue;
        }
        setGlowFilter(el, reading.luminance, nextState);
        if (prev !== nextState) {
          tweensRef.current[i] = animateFlip(
            el,
            nextState,
            tweensRef.current[i],
          );
          prevStateRef.current[i] = nextState;
        }
      }
      requestAnimationFrame(tick);
    };
    const handle = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(handle);
      tweensRef.current.forEach((t) => t?.kill());
    };

  }, [ledSignature, read]);
}

function sig(leds: ReadonlyArray<SVGCircleElement | null>): number {

  let h = 0;
  for (let i = 0; i < leds.length; i++) {
    const el = leds[i];
    h = (h * 31 + (el ? (i + 1) * 0x9e3779b1 : 0)) | 0;
  }
  return h ^ leds.length;
}
