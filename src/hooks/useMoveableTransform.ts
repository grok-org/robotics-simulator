import { useCallback, useRef } from "react";
import Moveable, {
  type OnDrag,
  type OnDragStart,
  type OnRotate,
  type OnRotateStart,
} from "react-moveable";
import { gsap } from "gsap";
import { scopedLogger } from "../utils/logger";

const log = scopedLogger("moveable");

export interface Camera {
  x: number;
  y: number;
  scale: number;
}
export interface MoveableTransformOptions<TContext> {

  wrapperRef: React.RefObject<HTMLDivElement | null>;

  camera: Camera;

  onCommit: (ctx: TContext, thetaRad: number) => void;

  onLockChange?: (locked: boolean) => void;
}

export function useMoveableTransform<TContext>(opts: MoveableTransformOptions<TContext>) {
  const lockedRef = useRef(false);
  const rotationRef = useRef(0);
  const moveableRef = useRef<Moveable | null>(null);
  const ctxRef = useRef<TContext | null>(null);
  const lock = useCallback(() => {
    lockedRef.current = true;
    opts.onLockChange?.(true);
  }, [opts]);
  const release = useCallback(() => {
    lockedRef.current = false;
    opts.onLockChange?.(false);
  }, [opts]);
  const setContext = useCallback((ctx: TContext) => {
    ctxRef.current = ctx;
  }, []);

  const onDragStart = useCallback(
    (e: OnDragStart) => {
      const w = opts.wrapperRef.current;
      if (!w) return;
      lock();
      ctxRef.current = null;
      rotationRef.current = Number(gsap.getProperty(w, "rotation"));
      e.set([
        Number(gsap.getProperty(w, "x")),
        Number(gsap.getProperty(w, "y")),
      ]);
    },
    [lock, opts.wrapperRef],
  );
  const onDrag = useCallback(
    (e: OnDrag) => {
      const w = opts.wrapperRef.current;
      if (!w) return;
      gsap.set(w, { x: e.beforeTranslate[0], y: e.beforeTranslate[1] });
    },
    [opts.wrapperRef],
  );
  const onRotateStart = useCallback(
    (e: OnRotateStart) => {
      const w = opts.wrapperRef.current;
      if (!w) return;
      lock();
      rotationRef.current = Number(gsap.getProperty(w, "rotation"));
      e.set(rotationRef.current);
    },
    [lock, opts.wrapperRef],
  );
  const onRotate = useCallback(
    (e: OnRotate) => {
      const w = opts.wrapperRef.current;
      if (!w) return;
      rotationRef.current = e.rotation;
      gsap.set(w, { rotation: e.rotation });
    },
    [opts.wrapperRef],
  );

  const snap = useCallback(
    (x: number, y: number, rotationDeg: number) => {
      const w = opts.wrapperRef.current;
      if (!w) return;
      gsap.set(w, { x, y, rotation: rotationDeg });
      rotationRef.current = rotationDeg;
    },
    [opts.wrapperRef],
  );

  const getScreenCenter = useCallback((): { x: number; y: number; rect: DOMRect } | null => {
    const w = opts.wrapperRef.current;
    if (!w) return null;
    const r = w.getBoundingClientRect();
    return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.5, rect: r };
  }, [opts.wrapperRef]);
  const getRotationDeg = useCallback(() => rotationRef.current, []);
  const commit = useCallback(
    (forcedCtx?: TContext) => {
      const ctx = forcedCtx ?? ctxRef.current;
      if (!ctx) {
        log.warn("commit called without context");
        release();
        return;
      }
      const w = opts.wrapperRef.current;
      if (!w) {
        release();
        return;
      }
      const thetaRad = rotationRef.current * (Math.PI / 180);
      opts.onCommit(ctx, thetaRad);
      release();
    },
    [opts, release],
  );
  const getMoveableRef = useCallback(
    () => moveableRef as unknown as React.MutableRefObject<Moveable | null>,
    [],
  );
  return {
    setContext,
    snap,
    getScreenCenter,
    getRotationDeg,
    getMoveableRef,
    bind: () => ({
      ref: moveableRef as unknown as React.Ref<Moveable>,
      target: opts.wrapperRef.current,
      draggable: true,
      rotatable: true,
      origin: false,
      rotationPosition: "top" as const,
      throttleDrag: 0,
      throttleRotate: 0,
      zoom: 1 / (opts.camera.scale || 1),
      onDragStart,
      onDrag,
      onDragEnd: () => commit(),
      onRotateStart,
      onRotate,
      onRotateEnd: () => commit(),
    }),
  };
}
