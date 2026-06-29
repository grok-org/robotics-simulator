import React, { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { useSimulatorStore } from "../store/useSimulatorStore";
import { screenToWorld } from "../utils/camera";
import { constrainToWallBounds } from "../utils/wallBounds";
import { getPaletteItem } from "../utils/paletteRegistry";
import { SvgShape } from "./SvgShape";
import { CanvasMoveable } from "./CanvasMoveable";
import type { PlacedObject, PlayBounds } from "../types/vmc";
import { SimulationEngine } from "../engine/SimulationEngine";

interface PlacedObjectOverlayProps {
  engineRef: React.RefObject<SimulationEngine | null>;
  cameraRef: React.RefObject<{ x: number; y: number; scale: number }>;
  viewportRef: React.RefObject<HTMLDivElement | null>;
  overlayRef: React.RefObject<HTMLDivElement | null>;
  playBoundsRef: React.RefObject<PlayBounds>;
}
export function PlacedObjectOverlay({
  engineRef,
  cameraRef,
  viewportRef,
  overlayRef,
  playBoundsRef,
}: PlacedObjectOverlayProps) {
  const placedObjects = useSimulatorStore((s) => s.placedObjects);
  return (
    <div
      ref={overlayRef}
      className="vmc-placed-overlay absolute inset-0 pointer-events-none origin-top-left"
      style={{ zIndex: 6 }}
    >
      {placedObjects.map((obj) => (
        <PlacedObjectItem
          key={obj.id}
          obj={obj}
          engineRef={engineRef}
          cameraRef={cameraRef}
          viewportRef={viewportRef}
          overlayRef={overlayRef}
          playBoundsRef={playBoundsRef}
        />
      ))}
    </div>
  );
}
interface PlacedObjectItemProps {
  obj: PlacedObject;
  engineRef: React.RefObject<SimulationEngine | null>;
  cameraRef: React.RefObject<{ x: number; y: number; scale: number }>;
  viewportRef: React.RefObject<HTMLDivElement | null>;
  overlayRef: React.RefObject<HTMLDivElement | null>;
  playBoundsRef: React.RefObject<PlayBounds>;
}
function PlacedObjectItem({
  obj,
  engineRef,
  cameraRef,
  viewportRef,
  overlayRef,
  playBoundsRef,
}: PlacedObjectItemProps) {
  const item = getPaletteItem(obj.paletteItemId);
  const width = item?.width ?? 50;
  const height = item?.height ?? 50;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const moveableRef = useRef<unknown>(null);
  const dragRotation = useRef(obj.rotation);
  const [mounted, setMounted] = useState(false);
  const updatePlacedObjectPose = useSimulatorStore((s) => s.updatePlacedObjectPose);
  const removePlacedObject = useSimulatorStore((s) => s.removePlacedObject);
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    gsap.set(wrapper, {
      x: obj.x - width * 0.5,
      y: obj.y - height * 0.5,
      rotation: obj.rotation,
    });
  }, [obj.x, obj.y, obj.rotation, width, height]);
  useEffect(() => {
    setMounted(true);
  }, []);
  const remove = () => removePlacedObject(obj.id);
  const worldPose = (): { x: number; y: number } | null => {
    const wrapper = wrapperRef.current;
    const vp = viewportRef.current;
    if (!wrapper || !vp) return null;
    const r = wrapper.getBoundingClientRect();
    const vr = vp.getBoundingClientRect();
    const cam = cameraRef.current;
    const world = screenToWorld(
      r.left + r.width * 0.5 - vr.left,
      r.top + r.height * 0.5 - vr.top,
      { panX: cam.x, panY: cam.y, zoom: cam.scale },
    );
    return constrainToWallBounds(world.x, world.y, width, height, playBoundsRef.current);
  };
  const lock = () => {
    dragRotation.current =
      Number(gsap.getProperty(wrapperRef.current!, "rotation")) || 0;
  };
  const applyLive = () => {
    const pose = worldPose();
    if (pose) {
      engineRef.current?.updatePlacedObjectPose(
        obj.id,
        pose.x,
        pose.y,
        dragRotation.current,
      );
    }
  };
  const commit = () => {
    const pose = worldPose();
    if (!pose) return;
    updatePlacedObjectPose(obj.id, pose.x, pose.y, dragRotation.current);
  };
  return (
    <>
      <div
        ref={wrapperRef}
        className="absolute left-0 top-0 origin-center group cursor-grab active:cursor-grabbing"
        style={{
          width,
          height,
          transform: `translate(${obj.x - width * 0.5}px, ${obj.y - height * 0.5}px) rotate(${obj.rotation}deg)`,
          pointerEvents: "auto",
        }}
      >
        {item && (
          <SvgShape
            svgAsset={item.svgAsset}
            className="drop-shadow-[0_4px_6px_rgba(0,0,0,0.35)]"
          />
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            remove();
          }}
          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow"
          aria-label="Remove placed object"
        >
          ×
        </button>
      </div>
      {mounted && wrapperRef.current && (
        <CanvasMoveable
          ref={moveableRef as never}
          targetRef={wrapperRef}
          containerRef={overlayRef}
          cameraScale={cameraRef.current.scale}
          dragRotationRef={dragRotation}
          onStart={lock}
          onLiveUpdate={applyLive}
          onCommit={commit}
        />
      )}
    </>
  );
}
