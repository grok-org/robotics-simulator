import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import type { SimulationEngine } from "../engine/SimulationEngine";
import { ULTRASONIC_CONFIG } from "../types/vmc";

interface UltrasonicLayerProps {
  engineRef: React.RefObject<SimulationEngine | null>;
  overlayRef: React.RefObject<HTMLDivElement | null>;
}
const HALF = ULTRASONIC_CONFIG.beamHalfAngle;
const WAVE_RGB = "37, 99, 235";
const WAVE_STROKE_WIDTH = 2.5;
const DOT_RADIUS = 4;
const TRAIL = [0, 0.18, 0.36];
function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  if (!(r > 0)) return "";
  const x0 = cx + r * Math.cos(a0);
  const y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
  return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r.toFixed(1)} ${r.toFixed(1)} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}
export function UltrasonicLayer({ engineRef, overlayRef }: UltrasonicLayerProps) {
  const outRefs = useRef<(SVGPathElement | null)[]>([null, null, null]);
  const echoRefs = useRef<(SVGPathElement | null)[]>([null, null, null]);
  const txDotRef = useRef<SVGCircleElement | null>(null);
  const rxDotRef = useRef<SVGCircleElement | null>(null);
  useEffect(() => {
    const allRefs = () => [
      ...outRefs.current,
      ...echoRefs.current,
      txDotRef.current,
      rxDotRef.current,
    ];

    const hideAll = () =>
      allRefs().forEach((p) => {
        if (!p) return;
        const tag = p.tagName.toLowerCase();
        if (tag === "path") {
          gsap.set(p, { attr: { opacity: 0, d: "" } });
        } else {
          gsap.set(p, { attr: { opacity: 0, cx: -9999, cy: -9999 } });
        }
      });
    let wasActive = false;
    const tick = () => {
      const v = engineRef.current?.ultrasonicVisual;
      if (!v || !v.active) {
        if (wasActive) {
          hideAll();
          wasActive = false;
        }
        return;
      }
      wasActive = true;
      if (txDotRef.current)
        gsap.set(txDotRef.current, { attr: { cx: v.txWorld.x, cy: v.txWorld.y, opacity: 0.9 } });
      if (rxDotRef.current)
        gsap.set(rxDotRef.current, { attr: { cx: v.rxWorld.x, cy: v.rxWorld.y, opacity: 0.9 } });
      const hasHit = !!v.hitWorld;
      const hx = hasHit ? v.hitWorld!.x : v.txWorld.x;
      const hy = hasHit ? v.hitWorld!.y : v.txWorld.y;
      const dist = Math.hypot(hx - v.txWorld.x, hy - v.txWorld.y) || 1;
      const base = Math.atan2(hy - v.txWorld.y, hx - v.txWorld.x);
      if (v.phase === "outgoing") {
        const p = (v.progress / 0.5) * (1 + TRAIL[2]!);
        outRefs.current.forEach((path, i) => {
          if (!path) return;
          const r = Math.max(0, (p - TRAIL[i]!) * dist);
          gsap.set(path, {
            attr: { d: arcPath(v.txWorld.x, v.txWorld.y, r, base - HALF, base + HALF) },
            opacity: r > 0 ? 0.55 * (1 - TRAIL[i]!) : 0,
          });
        });
        echoRefs.current.forEach((p) => p && gsap.set(p, { attr: { opacity: 0 } }));
      } else {
        const p = ((v.progress - 0.5) / 0.5) * (1 + TRAIL[2]!);
        const maxR = hasHit ? dist * 0.5 : dist;
        echoRefs.current.forEach((path, i) => {
          if (!path) return;
          const r = Math.max(0, (p - TRAIL[i]!) * maxR);
          gsap.set(path, {
            attr: { d: arcPath(hx, hy, r, base - Math.PI, base + Math.PI) },
            opacity: r > 0 ? 0.5 * (1 - TRAIL[i]!) : 0,
          });
        });
        outRefs.current.forEach((p) => p && gsap.set(p, { attr: { opacity: 0 } }));
      }
    };
    hideAll();
    gsap.ticker.add(tick);
    return () => {
      gsap.ticker.remove(tick);
      hideAll();
    };
  }, [engineRef]);
  const ring = (i: number, refs: React.MutableRefObject<(SVGPathElement | null)[]>) => ({
    ref: (el: SVGPathElement | null) => {
      refs.current[i] = el;
    },
    fill: "none",
    stroke: `rgb(${WAVE_RGB})`,
    strokeWidth: WAVE_STROKE_WIDTH,
    strokeLinecap: "round" as const,
    opacity: 0,
    filter: "url(#ultrasonic-glow)",
  });
  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 pointer-events-none origin-top-left"
      style={{ zIndex: 7 }}
    >
      <svg
        className="absolute left-0 top-0 w-full h-full"
        style={{ overflow: "visible", pointerEvents: "none" }}
      >
        <defs>
          <filter id="ultrasonic-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {[0, 1, 2].map((i) => (
          <path key={`o${i}`} {...ring(i, outRefs)} />
        ))}
        {[0, 1, 2].map((i) => (
          <path key={`e${i}`} {...ring(i, echoRefs)} />
        ))}
        <circle ref={txDotRef} r={DOT_RADIUS} fill={`rgb(${WAVE_RGB})`} opacity={0} />
        <circle ref={rxDotRef} r={DOT_RADIUS} fill={`rgb(${WAVE_RGB})`} opacity={0} />
      </svg>
    </div>
  );
}
