import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { BotSVGHandle, BotWorldGeometry } from "../types/vmc";
import { BOT_SVG_WIDTH, BOT_SVG_HEIGHT } from "../types/vmc";
import {
  extractBotGeometry,
  computeWorldGeometry,
} from "../utils/svgGeometry";
import { mountSvg } from "../utils/svgAssets";
import { scopedLogger } from "../utils/logger";
import botSvg from "/assets/esp-bot.svg?raw";
const log = scopedLogger("BotSVG");
const IR_LED_COUNT = 4;
interface BotSVGProps {
  onGeometryReady?: (geom: BotWorldGeometry) => void;
}
export const BotSVG = forwardRef<BotSVGHandle, BotSVGProps>(
  ({ onGeometryReady }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const rootRef = useRef<SVGSVGElement | null>(null);
    const ledRefs = useRef<(SVGCircleElement | null)[]>(
      Array<SVGCircleElement | null>(IR_LED_COUNT).fill(null),
    );
    const geometryRef = useRef<BotWorldGeometry | null>(null);

    const onGeometryReadyRef = useRef(onGeometryReady);
    useEffect(() => {
      onGeometryReadyRef.current = onGeometryReady;
    }, [onGeometryReady]);
    const [, setLoaded] = useState(false);
    useLayoutEffect(() => {
      const host = containerRef.current;
      if (!host) return;
      const svgElement = mountSvg(host, botSvg, {
        width: BOT_SVG_WIDTH,
        height: BOT_SVG_HEIGHT,
        cssClass: "drop-shadow-[0_12px_12px_rgba(0,0,0,0.35)]",
        pointerEvents: true,
      });
      if (!svgElement) {
        log.error("Invalid SVG structure");
        return;
      }
      rootRef.current = svgElement;
      ledRefs.current = Array.from(
        { length: IR_LED_COUNT },
        (_, i) => svgElement.querySelector(`.ir-led.ir-led-${i}`),
      );
      const missing = ledRefs.current.filter((l) => !l).length;
      if (missing > 0) {
        log.warn(`Missing ${missing} IR LED elements in bot SVG`);
      }
      const svgGeom = extractBotGeometry(svgElement);
      const worldGeom = computeWorldGeometry(
        svgGeom,
        BOT_SVG_WIDTH,
        BOT_SVG_HEIGHT,
      );
      geometryRef.current = worldGeom;
      onGeometryReadyRef.current?.(worldGeom);
      setLoaded(true);

    }, []);
    useImperativeHandle(
      ref,
      () => ({
        leds: ledRefs.current,
        root: rootRef.current as SVGSVGElement,
        geometry: geometryRef.current,
      }),
      [],
    );
    return <div ref={containerRef} />;
  },
);
BotSVG.displayName = "BotSVG";
