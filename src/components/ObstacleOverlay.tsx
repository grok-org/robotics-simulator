import React, { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { SvgShape } from "./SvgShape";
import { CanvasMoveable } from "./CanvasMoveable";
import { useSimulatorStore } from "../store/useSimulatorStore";
import rockSvgRaw from "/assets/rock.svg?raw";
import { screenToWorld, RAD } from "../utils/overlayMath";
import type { Obstacle } from "../types/vmc";
import { SimulationEngine } from "../engine/SimulationEngine";
import { scopedLogger } from "../utils/logger";

const log = scopedLogger("obstacles");
const RENDER_SIZE = 60;

interface ObstacleOverlayProps {
  engineRef: React.RefObject<SimulationEngine | null>;
  cameraRef: React.RefObject<{ x: number; y: number; scale: number }>;
  viewportRef: React.RefObject<HTMLDivElement | null>;
  overlayRef: React.RefObject<HTMLDivElement | null>;
}
export function ObstacleOverlay({
  engineRef,
  cameraRef,
  viewportRef,
  overlayRef,
}: ObstacleOverlayProps) {
  const obstacles = useSimulatorStore((s) => s.obstacles);
  return (
    <div
      ref={overlayRef}
      className="vmc-obstacle-overlay absolute inset-0 pointer-events-none origin-top-left"
      style={{ zIndex: 5 }}
    >
      {obstacles.map((obstacle) => (
        <ObstacleItem
          key={obstacle.id}
          obstacle={obstacle}
          engineRef={engineRef}
          cameraRef={cameraRef}
          viewportRef={viewportRef}
          overlayRef={overlayRef}
        />
      ))}
    </div>
  );
}
interface ObstacleItemProps {
  obstacle: Obstacle;
  engineRef: React.RefObject<SimulationEngine | null>;
  cameraRef: React.RefObject<{ x: number; y: number; scale: number }>;
  viewportRef: React.RefObject<HTMLDivElement | null>;
  overlayRef: React.RefObject<HTMLDivElement | null>;
}
function ObstacleItem({
  obstacle,
  engineRef,
  cameraRef,
  viewportRef,
  overlayRef,
}: ObstacleItemProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const moveableRef = useRef<unknown>(null);
  const dragRotation = useRef(obstacle.rotation * RAD);
  const setObstacles = useSimulatorStore((s) => s.setObstacles);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    gsap.set(wrapper, {
      x: obstacle.x,
      y: obstacle.y,
      rotation: obstacle.rotation * RAD,
      scale: obstacle.size,
    });
  }, [obstacle.x, obstacle.y, obstacle.rotation, obstacle.size]);
  const remove = () => {
    engineRef.current?.removeObstacle(obstacle.id);
    setObstacles(
      useSimulatorStore.getState().obstacles.filter((o) => o.id !== obstacle.id),
    );
  };
  const lock = () => {
    dragRotation.current = Number(gsap.getProperty(wrapperRef.current!, "rotation")) || 0;
  };
  const commit = () => {
    const wrapper = wrapperRef.current;
    const vp = viewportRef.current;
    if (!wrapper || !vp) return;
    const r = wrapper.getBoundingClientRect();
    const vr = vp.getBoundingClientRect();
    const cam = cameraRef.current;
    const pos = screenToWorld(
      r.left + r.width * 0.5,
      r.top + r.height * 0.5,
      vr,
      cam,
    );
    engineRef.current?.moveObstacle(obstacle.id, pos.x, pos.y, dragRotation.current * RAD);
    const next: Obstacle = {
      ...obstacle,
      x: pos.x,
      y: pos.y,
      rotation: dragRotation.current * RAD,
    };
    setObstacles(
      useSimulatorStore
        .getState()
        .obstacles.map((o) => (o.id === obstacle.id ? next : o)),
    );
    log.debug("commit", { id: obstacle.id, x: pos.x.toFixed(0), y: pos.y.toFixed(0) });
  };
  const rotationDeg = obstacle.rotation * RAD;
  return (
    <>
      <div
        ref={wrapperRef}
        className="absolute left-0 top-0 origin-center group cursor-grab active:cursor-grabbing"
        style={{
          width: RENDER_SIZE,
          height: RENDER_SIZE,
          transform: `translate(${obstacle.x - RENDER_SIZE * 0.5}px, ${obstacle.y - RENDER_SIZE * 0.5}px) rotate(${rotationDeg}deg) scale(${obstacle.size})`,
          pointerEvents: "auto",
        }}
      >
        <SvgShape svgAsset={rockSvgRaw} className="w-full h-full" />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            remove();
          }}
          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow"
          aria-label="Remove obstacle"
        >
          X
        </button>
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
    </>
  );
}
