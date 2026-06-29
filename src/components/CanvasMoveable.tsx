import React, { useRef } from "react";
import Moveable from "react-moveable";
import type {
  OnDrag,
  OnDragStart,
  OnRotate,
  OnRotateStart,
} from "react-moveable";
import { gsap } from "gsap";

type MoveableHandle = InstanceType<typeof Moveable>;

export interface Camera {
  scale: number;
}

export type DragRotationRef = React.RefObject<number>;

export interface MoveableCanvasCallbacks {
  onStart?: () => void;
  onLiveUpdate?: () => void;
}

export function useMoveableGSAP(
  wrapperRef: React.RefObject<HTMLElement | null>,
  dragRotationRef: DragRotationRef,
  callbacks?: MoveableCanvasCallbacks,
) {

  const onDragStart = (e: OnDragStart) => {
    callbacks?.onStart?.();
    const w = wrapperRef.current;
    if (!w) return;
    dragRotationRef.current = Number(gsap.getProperty(w, "rotation")) || 0;
    e.set([
      Number(gsap.getProperty(w, "x")) || 0,
      Number(gsap.getProperty(w, "y")) || 0,
    ]);
  };
  const onDrag = (e: OnDrag) => {
    const w = wrapperRef.current;
    if (!w) return;
    gsap.set(w, { x: e.beforeTranslate[0], y: e.beforeTranslate[1] });
    callbacks?.onLiveUpdate?.();
  };
  const onRotateStart = (e: OnRotateStart) => {
    callbacks?.onStart?.();
    const w = wrapperRef.current;
    if (!w) return;
    dragRotationRef.current = Number(gsap.getProperty(w, "rotation")) || 0;
    e.set(dragRotationRef.current);
  };
  const onRotate = (e: OnRotate) => {
    const w = wrapperRef.current;
    if (!w) return;
    dragRotationRef.current = e.rotation;
    gsap.set(w, { rotation: e.rotation });
    callbacks?.onLiveUpdate?.();
  };
  return { onDragStart, onDrag, onRotateStart, onRotate };
}

export interface CanvasMoveableProps {
  targetRef: React.RefObject<HTMLElement | null>;
  containerRef?: React.RefObject<HTMLElement | null>;
  cameraScale?: number;
  dragRotationRef: DragRotationRef;
  onStart?: () => void;
  onLiveUpdate?: () => void;

  onCommit: () => void;
}

export const CanvasMoveable = React.forwardRef<MoveableHandle, CanvasMoveableProps>(
  (
    {
      targetRef,
      containerRef,
      cameraScale = 1,
      dragRotationRef,
      onStart,
      onLiveUpdate,
      onCommit,
    },
    ref,
  ) => {
    const internalRef = useRef<MoveableHandle>(null);
    const setRef = (handle: MoveableHandle | null) => {
      if (typeof ref === "function") ref(handle);
      else if (ref) (ref as React.RefObject<MoveableHandle | null>).current = handle;
      (internalRef as React.RefObject<MoveableHandle | null>).current = handle;
    };
    const handlers = useMoveableGSAP(targetRef, dragRotationRef, {
      onStart,
      onLiveUpdate,
    });
    if (!targetRef.current) return null;
    return (
      <Moveable
        ref={setRef}
        target={targetRef.current}
        container={containerRef?.current ?? undefined}
        draggable
        rotatable
        throttleDrag={0}
        throttleRotate={0}
        origin={false}
        rotationPosition="top"
        zoom={1 / (cameraScale || 1)}
        onDragStart={handlers.onDragStart}
        onDrag={handlers.onDrag}
        onDragEnd={onCommit}
        onRotateStart={handlers.onRotateStart}
        onRotate={handlers.onRotate}
        onRotateEnd={onCommit}
      />
    );
  },
);
CanvasMoveable.displayName = "CanvasMoveable";

export function refreshMoveableHandle(
  handle: MoveableHandle | null | undefined,
): void {
  handle?.updateRect?.();
}
