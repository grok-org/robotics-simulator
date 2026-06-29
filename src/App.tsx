import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Split from "react-split";
import "./index.css";
import { BlocklyWorkspace } from "./components/BlocklyWorkspace";
import { CodePreview } from "./components/CodePreview";
import { ControlPanel } from "./components/ControlPanel";
import { ConsolePanel } from "./components/ConsolePanel";
import { SimulationCanvas } from "./components/SimulationCanvas";
import { SimulationEngine } from "./engine/SimulationEngine";
import { useSimulatorStore } from "./store/useSimulatorStore";
import type {
  MotorCmd,
  PhysicsState,
  PlacedObject,
  PlayBounds,
  SimHandle,
  SimulationCanvasHandle,
  VMCPinRegister,
} from "./types/vmc";
import {
  DEFAULT_PHYSICS_STATE,
  DEFAULT_VMC_REGISTER,
  UPDATE_EVERY_TICKS,
} from "./types/vmc";
import { getTrackById } from "./utils/tracks";
import { scopedLogger } from "./utils/logger";
const log = scopedLogger("app");
const clonePhysics = (p: PhysicsState): PhysicsState => ({ ...p });
const cloneVmc = (v: VMCPinRegister): VMCPinRegister => {
  const pwm: Record<number, MotorCmd> = {};
  const dig: Record<number, number> = {};
  const lum: Record<number, number> = {};
  for (const k in v.pwmOutputs) pwm[Number(k)] = { ...v.pwmOutputs[k]! };
  for (const k in v.digitalInputs) dig[Number(k)] = v.digitalInputs[k]!;
  for (const k in v.irLuminance) lum[Number(k)] = v.irLuminance[k]!;
  return { pwmOutputs: pwm, digitalInputs: dig, irLuminance: lum };
};

function obstaclesChanged(
  a: readonly import("./types/vmc").Obstacle[],
  b: readonly import("./types/vmc").Obstacle[],
): boolean {
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (x.id !== y.id) return true;
    if (x.x !== y.x || x.y !== y.y || x.rotation !== y.rotation) return true;
  }
  return false;
}
export default function App() {
  const selectedTrackId = useSimulatorStore((s) => s.selectedTrackId);
  const generatedCode = useSimulatorStore((s) => s.generatedCode);
  const iotStatus = useSimulatorStore((s) => s.iotStatus);
  const setIsRunning = useSimulatorStore((s) => s.setIsRunning);
  const setUserError = useSimulatorStore((s) => s.setUserError);
  const setObstacles = useSimulatorStore((s) => s.setObstacles);
  const setPrintLog = useSimulatorStore((s) => s.setPrintLog);
  const setDisplayState = useSimulatorStore((s) => s.setDisplayState);
  const [engineReady, setEngineReady] = useState(false);
  const track = getTrackById(selectedTrackId);
  const initialTrack = useRef(track);
  const prevTrackId = useRef(selectedTrackId);
  const engineRef = useRef<SimulationEngine | null>(null);
  const canvasRef = useRef<SimulationCanvasHandle | null>(null);
  const tickN = useRef(0);
  const printVersion = useRef(0);
  const physicsRef = useRef<PhysicsState>({
    ...DEFAULT_PHYSICS_STATE,
    ...initialTrack.current.start,
  });
  const vmcRef = useRef<VMCPinRegister>({ ...DEFAULT_VMC_REGISTER });
  const cameraRef = useRef({ x: 0, y: 0, scale: 1 });
  const sensorPinsRef = useRef({ pins: [0, 0, 0, 0] as number[], count: 0 });
  const playBoundsRef = useRef<PlayBounds>({ minX: 0, maxX: 0, minY: 0, maxY: 0 });
  useEffect(() => {
    let alive = true;
    SimulationEngine.create(initialTrack.current).then((eng) => {
      if (!alive) {
        eng.destroy();
        return;
      }
      engineRef.current = eng;
      eng.setIotBridgeState(useSimulatorStore.getState().iotStatus);
      eng.setOnError((msg) => {
        useSimulatorStore.getState().setUserError(msg);
      });
      eng.setOnUpdate((physics, vmc) => {
        physicsRef.current.x = physics.x;
        physicsRef.current.y = physics.y;
        physicsRef.current.angle = physics.angle;
        physicsRef.current.leftMotorSpeed = physics.leftMotorSpeed;
        physicsRef.current.rightMotorSpeed = physics.rightMotorSpeed;
        vmcRef.current = vmc;
        eng.readSensorPinMapping(sensorPinsRef.current);
        canvasRef.current?.appendTrail(physics.x, physics.y);
        tickN.current++;
        if (tickN.current % UPDATE_EVERY_TICKS === 0) {
          setDisplayState(clonePhysics(physics), cloneVmc(vmc));

          const snapshot = eng.getObstaclesSnapshot();
          const current = useSimulatorStore.getState().obstacles;
          if (obstaclesChanged(current, snapshot)) {
            setObstacles(snapshot);
          }
          const pv = eng.getPrintVersion();
          if (pv !== printVersion.current) {
            printVersion.current = pv;
            setPrintLog([...eng.getPrintLog()]);
          }
        }
      });
      const savedJs = useSimulatorStore.getState().jsCode;
      if (savedJs) {
        eng.loadUserProgram(savedJs);
      }
      for (const obstacle of useSimulatorStore.getState().obstacles) {
        eng.addObstacle(obstacle.x, obstacle.y, obstacle.rotation, obstacle.size, obstacle.id);
      }
      setObstacles(eng.getObstaclesSnapshot());
      eng.teleportRobot(
        initialTrack.current.start.x,
        initialTrack.current.start.y,
        initialTrack.current.start.angle,
      );
      playBoundsRef.current = eng.getPlayAreaBounds();
      setEngineReady(true);
      log.success("engine ready");
    }).catch((err: unknown) => {
      setUserError(String(err));
      log.error("boot failed", err);
    });
    return () => {
      alive = false;
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, [setUserError, setObstacles, setDisplayState, setPrintLog]);
  useEffect(() => {
    engineRef.current?.setIotBridgeState(iotStatus);
  }, [iotStatus]);
  useEffect(() => {
    if (!engineRef.current || prevTrackId.current === selectedTrackId) return;
    prevTrackId.current = selectedTrackId;
    engineRef.current.loadTrack(track);
    playBoundsRef.current = engineRef.current.getPlayAreaBounds();
    engineRef.current.syncPlacedObjects(useSimulatorStore.getState().placedObjects);
    canvasRef.current?.clearTrail();
    canvasRef.current?.resetCamera();
    setIsRunning(false);
  }, [selectedTrackId, setIsRunning, track]);
  useEffect(() => {
    if (!engineReady || !engineRef.current) return;
    const eng = engineRef.current;
    let queued: PlacedObject[] | null = null;
    let scheduled = false;
    const flush = () => {
      scheduled = false;
      const next = queued;
      queued = null;
      if (next) eng.syncPlacedObjects(next);
    };
    const schedule = (snapshot: PlacedObject[]) => {
      queued = snapshot;
      if (scheduled) return;
      scheduled = true;

      queueMicrotask(flush);
    };
    schedule(useSimulatorStore.getState().placedObjects);
    const unsub = useSimulatorStore.subscribe((state, prev) => {
      if (state.placedObjects !== prev.placedObjects) {
        schedule(state.placedObjects);
      }
    });
    return unsub;
  }, [engineReady]);
  const onJsCode = useCallback((js: string) => {
    engineRef.current?.loadUserProgram(js);
  }, []);

  const onTeleportBot = useCallback(
    (x: number, y: number, theta: number) => {
      engineRef.current?.teleportRobot(x, y, theta);
    },
    [],
  );
  const onBotGeometry = useCallback(
    (geom: import("./types/vmc").BotWorldGeometry) => {
      engineRef.current?.applyBotGeometry(geom);
    },
    [],
  );
  const simHandle = useMemo<SimHandle | null>(() => {
    if (!engineReady) return null;
    return {
      start: () => engineRef.current?.start(),
      stop: () => engineRef.current?.stop(),
      reset: () => {
        engineRef.current?.reset();
        canvasRef.current?.clearTrail();
      },
    };
  }, [engineReady]);
  return (
    <main
      className="h-full flex flex-col p-2.5 gap-2 font-sans overflow-hidden"
      style={{
        color: "#f8fafc",
        background:
          "radial-gradient(ellipse at 10% 0%, rgba(34,197,94,0.12) 0%, transparent 50%), radial-gradient(ellipse at 90% 0%, rgba(59,130,246,0.14) 0%, transparent 50%), #0b1220",
      }}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 px-2 h-9">
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-3xl font-bold tracking-[0.02em] truncate">Robotics Simulator</h1>
        </div>
      </header>
      <Split
        className="flex-1 min-h-0 min-w-0 overflow-hidden flex flex-row"
        sizes={[28, 44, 28]}
        minSize={[280, 360, 270]}
        gutterSize={6}
        snapOffset={0}
        expandToMin
      >
        <Split
          className="flex flex-col min-w-0 min-h-0 overflow-hidden"
          direction="vertical"
          sizes={[70, 30]}
          minSize={[200, 130]}
          gutterSize={6}
          snapOffset={0}
        >
          <BlocklyWorkspace onJsCode={onJsCode} />
          <CodePreview code={generatedCode} />
        </Split>
        <SimulationCanvas
          ref={canvasRef}
          engineRef={engineRef}
          track={track}
          physicsRef={physicsRef}
          vmcRef={vmcRef}
          cameraRef={cameraRef}
          sensorPinsRef={sensorPinsRef}
          playBoundsRef={playBoundsRef}
          onTeleportBot={onTeleportBot}
          onBotGeometry={onBotGeometry}
        />
        <Split
          className="flex flex-col min-w-0 min-h-0 overflow-hidden"
          direction="vertical"
          sizes={[60, 40]}
          minSize={[260, 140]}
          gutterSize={6}
          snapOffset={0}
        >
          <ControlPanel
            simHandle={simHandle}
            engineReady={engineReady}
            onResetCamera={() => canvasRef.current?.resetCamera()}
          />
          <ConsolePanel />
        </Split>
      </Split>
    </main>
  );
}
