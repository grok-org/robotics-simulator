import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import Konva from "konva";
import { Image as KonvaImage, Layer, Rect, Stage } from "react-konva";
import { gsap } from "gsap";
import { nanoid } from "nanoid";
import { BotOverlay } from "./BotOverlay";
import { ObstacleOverlay } from "./ObstacleOverlay";
import { PlacedObjectOverlay } from "./PlacedObjectOverlay";
import { UltrasonicLayer } from "./UltrasonicLayer";
import { CanvasToolbar } from "./CanvasToolbar";
import { SimulationEngine } from "../engine/SimulationEngine";
import { tokens } from "../styles/tokens";
import { useSimulatorStore } from "../store/useSimulatorStore";
import type {
  BotWorldGeometry,
  SimulationCanvasHandle,
  SimulationCanvasProps,
} from "../types/vmc";
import { MAX_TRAIL_POINTS, ZOOM_MAX, ZOOM_MIN } from "../types/vmc";
import { scopedLogger } from "../utils/logger";
import { screenToWorld } from "../utils/camera";
import { constrainToWallBounds } from "../utils/wallBounds";
import { getPaletteItem } from "../utils/paletteRegistry";
import {
  computeWallGeom,
  computeWallBars,
  computeStageSize,
} from "@/styles/wallGeometry";
const log = scopedLogger("canvas");
const ZOOM_STEP = 1.2;
export interface SimulationCanvasExtraProps extends SimulationCanvasProps {
  engineRef: React.RefObject<SimulationEngine | null>;
  onBotGeometry?: (geom: BotWorldGeometry) => void;
}
export const SimulationCanvas = forwardRef<
  SimulationCanvasHandle,
  SimulationCanvasExtraProps
>(
  (
    {
      track,
      engineRef,
      physicsRef,
      vmcRef,
      cameraRef,
      sensorPinsRef,
      playBoundsRef,
      onTeleportBot,
      onBotGeometry,
    },
    ref,
  ) => {
    const viewportRef = useRef<HTMLDivElement>(null);
    const overlayRef = useRef<HTMLDivElement>(null);
    const obstacleOverlayRef = useRef<HTMLDivElement>(null);
    const placedOverlayRef = useRef<HTMLDivElement>(null);
    const ultrasonicOverlayRef = useRef<HTMLDivElement>(null);
    const stageRef = useRef<Konva.Stage>(null);
    const trailRef = useRef<Konva.Line>(null);
    const trailPts = useRef<number[]>([]);
    const isPanning = useRef(false);
    const [zoom, setZoom] = useState(1);
    const undo = useSimulatorStore((s) => s.undo);
    const redo = useSimulatorStore((s) => s.redo);
    const clearPlacedObjects = useSimulatorStore((s) => s.clearPlacedObjects);
    const hasPlacedObjects = useSimulatorStore((s) => s.placedObjects.length > 0);
    const canUndo = useSimulatorStore((s) => s.history.past.length > 0);
    const canRedo = useSimulatorStore((s) => s.history.future.length > 0);
    const trackImage = useMemo(() => {
      const c = document.createElement("canvas");
      c.width = track.width;
      c.height = track.height;
      const ctx = c.getContext("2d");
      if (ctx) track.draw(ctx);
      log.info("track drawn", {
        id: track.id,
        w: track.width,
        h: track.height,
      });
      return c;
    }, [track]);
    const wallGeom = useMemo(
      () => computeWallGeom(track),
      [track.width, track.height],
    );
    const wallBars = useMemo(() => computeWallBars(wallGeom), [wallGeom]);
    const stage = useMemo(() => computeStageSize(wallGeom), [wallGeom]);
    const syncOverlay = () => {
      const s = stageRef.current;
      const o = overlayRef.current;
      const obs = obstacleOverlayRef.current;
      const placed = placedOverlayRef.current;
      const us = ultrasonicOverlayRef.current;
      if (!s) return;
      const x = s.x();
      const y = s.y();
      const sc = s.scaleX();
      cameraRef.current.x = x;
      cameraRef.current.y = y;
      cameraRef.current.scale = sc;
      const transform = `translate(${x}px,${y}px) scale(${sc})`;
      if (o) o.style.transform = transform;
      if (obs) obs.style.transform = transform;
      if (placed) placed.style.transform = transform;
      if (us) us.style.transform = transform;
    };
    const resetCamera = () => {
      const s = stageRef.current;
      const el = viewportRef.current;
      if (!s || !el) return;
      s.scale({ x: 1, y: 1 });
      s.position({
        x: el.clientWidth * 0.5 - physicsRef.current.x,
        y: el.clientHeight * 0.5 - physicsRef.current.y,
      });
      s.batchDraw();
      syncOverlay();
      setZoom(1);
    };
    useImperativeHandle(ref, () => ({
      appendTrail(x, y) {
        const pts = trailPts.current;
        if (pts.length >= MAX_TRAIL_POINTS * 2) {
          pts.copyWithin(0, 2);
          pts.length = MAX_TRAIL_POINTS * 2 - 2;
        }
        pts.push(x, y);
        trailRef.current?.points(pts);
        trailRef.current?.getLayer()?.batchDraw();
      },
      clearTrail() {
        trailPts.current.length = 0;
        trailRef.current?.points([]);
        trailRef.current?.getLayer()?.batchDraw();
      },
      resetCamera,
    }));
    useEffect(() => {
      resetCamera();
    }, [track]);
    useEffect(() => {
      const s = stageRef.current;
      if (!s) return;
      const target = { x: s.x(), y: s.y() };
      const toX = gsap.quickTo(target, "x", {
        duration: 0.38,
        ease: "power2.out",
      });
      const toY = gsap.quickTo(target, "y", {
        duration: 0.38,
        ease: "power2.out",
      });
      const follow = () => {
        const el = viewportRef.current;
        if (!el || isPanning.current) return;
        const sc = s.scaleX();
        toX(el.clientWidth * 0.5 - physicsRef.current.x * sc);
        toY(el.clientHeight * 0.5 - physicsRef.current.y * sc);
        s.x(target.x);
        s.y(target.y);
        syncOverlay();
        s.batchDraw();
      };
      gsap.ticker.add(follow);
      return () => {
        gsap.ticker.remove(follow);
        gsap.killTweensOf(target);
      };
    }, [physicsRef]);
    const applyZoom = (next: number) => {
      const s = stageRef.current;
      const el = viewportRef.current;
      if (!s || !el) return;
      const clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, next));
      const cx = el.clientWidth * 0.5;
      const cy = el.clientHeight * 0.5;
      const old = s.scaleX();
      const mx = (cx - s.x()) / old;
      const my = (cy - s.y()) / old;
      s.scale({ x: clamped, y: clamped });
      s.position({ x: cx - mx * clamped, y: cy - my * clamped });
      s.batchDraw();
      syncOverlay();
      setZoom(clamped);
    };
    const zoomIn = () => applyZoom(zoom * ZOOM_STEP);
    const zoomOut = () => applyZoom(zoom / ZOOM_STEP);
    const resetView = () => resetCamera();
    const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const s = stageRef.current;
      if (!s) return;
      const ptr = s.getPointerPosition();
      if (!ptr) return;
      const old = s.scaleX();
      const next = Math.max(
        ZOOM_MIN,
        Math.min(ZOOM_MAX, old * (e.evt.deltaY > 0 ? 1 / 1.1 : 1.1)),
      );
      const mx = (ptr.x - s.x()) / old;
      const my = (ptr.y - s.y()) / old;
      s.scale({ x: next, y: next });
      s.position({ x: ptr.x - mx * next, y: ptr.y - my * next });
      s.batchDraw();
      syncOverlay();
      setZoom(next);
    };
    const onDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    };
    const onDrop = (e: React.DragEvent) => {
      e.preventDefault();
      const paletteItemId = e.dataTransfer.getData("paletteItemId");
      if (!paletteItemId) return;
      const item = getPaletteItem(paletteItemId);
      if (!item) return;
      const el = viewportRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cam = cameraRef.current;
      const world = screenToWorld(
        e.clientX - rect.left,
        e.clientY - rect.top,
        { panX: cam.x, panY: cam.y, zoom: cam.scale },
      );
      const constrained = constrainToWallBounds(
        world.x,
        world.y,
        item.width,
        item.height,
        playBoundsRef.current,
      );
      useSimulatorStore.getState().addPlacedObject({
        id: nanoid(),
        paletteItemId,
        x: constrained.x,
        y: constrained.y,
        rotation: 0,
      });
    };
    const handleClearCanvas = () => {
      if (!hasPlacedObjects) return;
      if (
        window.confirm(
          "Remove all placed objects from the canvas? This can be undone.",
        )
      ) {
        clearPlacedObjects();
      }
    };
    return (
      <div
        ref={viewportRef}
        className="relative overflow-hidden rounded-[14px] border border-slate-500/18"
        style={{
          background: tokens.canvas.trackFloor,
          width: wallGeom.trackW,
          height: wallGeom.trackH,
        }}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <CanvasToolbar
          canUndo={canUndo}
          canRedo={canRedo}
          zoomPercentage={Math.round(zoom * 100)}
          hasPlacedObjects={hasPlacedObjects}
          onUndo={undo}
          onRedo={redo}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onResetView={resetView}
          onClearCanvas={handleClearCanvas}
        />
        <Stage
          ref={stageRef}
          width={stage.w}
          height={stage.h}
          x={stage.offset}
          y={stage.offset}
          draggable
          onWheel={onWheel}
          onDragStart={() => {
            isPanning.current = true;
          }}
          onDragMove={syncOverlay}
          onDragEnd={() => {
            isPanning.current = false;
            syncOverlay();
          }}
        >
          <Layer listening={false}>
            <KonvaImage image={trackImage} />
            {wallBars.map((w, i) => (
              <Rect
                key={i}
                x={w.x}
                y={w.y}
                width={w.w}
                height={w.h}
                fill={tokens.canvas.wall}
                cornerRadius={2}
                shadowColor="rgba(15,23,42,0.25)"
                shadowBlur={3}
                shadowOffsetY={1}
                perfectDrawEnabled={false}
              />
            ))}
          </Layer>
        </Stage>
        <BotOverlay
          physicsRef={physicsRef}
          vmcRef={vmcRef}
          cameraRef={cameraRef}
          sensorPinsRef={sensorPinsRef}
          playBoundsRef={playBoundsRef}
          overlayRef={overlayRef}
          viewportRef={viewportRef}
          onTeleportBot={onTeleportBot}
          onBotGeometry={onBotGeometry}
        />
        <ObstacleOverlay
          engineRef={engineRef}
          cameraRef={cameraRef}
          viewportRef={viewportRef}
          overlayRef={obstacleOverlayRef}
        />
        <PlacedObjectOverlay
          engineRef={engineRef}
          cameraRef={cameraRef}
          viewportRef={viewportRef}
          overlayRef={placedOverlayRef}
          playBoundsRef={playBoundsRef}
        />
        <UltrasonicLayer engineRef={engineRef} overlayRef={ultrasonicOverlayRef} />
      </div>
    );
  },
);
SimulationCanvas.displayName = "SimulationCanvas";
