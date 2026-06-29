import type { ReactNode, RefObject } from "react";
export interface PhysicsState {
  x: number;
  y: number;
  angle: number;
  leftMotorSpeed: number;
  rightMotorSpeed: number;
}
export interface MotorCmd {
  duty: number;
  freq: number;
}
export interface VMCPinRegister {
  pwmOutputs: Record<number, MotorCmd>;
  digitalInputs: Record<number, number>;
  irLuminance: Record<number, number>;
}
export interface TrackDefinition {
  id: string;
  name: string;
  width: number;
  height: number;
  start: { x: number; y: number; angle: number };
  draw: (ctx: CanvasRenderingContext2D) => void;
}
export interface SimHandle {
  start(): void;
  stop(): void;
  reset(): void;
}
export interface PwmProxy {
  duty(value: number): void;
}
export type MotorRole = "left" | "right";
export interface Obstacle {
  id: string;
  x: number;
  y: number;
  rotation: number;
  size: number;
  svgKey: "rock";
  width?: number;
  height?: number;
}
export interface Vector {
  x: number;
  y: number;
}

export interface PlacedObject {
  id: string;
  paletteItemId: string;
  x: number;
  y: number;
  rotation: number;
}

export interface PaletteItem {
  id: string;
  label: string;
  svgAsset: string;
  width: number;
  height: number;
  bodyType: "fixed";
  convexHull?: Vector[];
}
export interface PlacedObjectHistoryEntry {
  placedObjects: PlacedObject[];
}
export interface PlacedObjectHistory {
  past: PlacedObjectHistoryEntry[];
  future: PlacedObjectHistoryEntry[];
}
export type UltrasonicPhase = "idle" | "outgoing" | "echo";

export interface UltrasonicChannel {
  trigPin: number;
  echoPin: number;
}

export interface UltrasonicConfig {
  beamHalfAngle: number;
  rayCount: number;
  speedOfSoundCmPerUs: number;
  minCm: number;
  maxCm: number;
  worldUnitsPerCm: number;
  clearPathCm: number;
  visualCycleMs: number;
  activeWindowSim: number;
}

export interface UltrasonicVisualState {
  active: boolean;
  phase: UltrasonicPhase;

  progress: number;
  txWorld: Vector;
  rxWorld: Vector;
  hitWorld: Vector | null;
  distanceCm: number;
}
export const MCU_METHODS = {
  createPWM: "createPWM",
  configureMotorPair: "configureMotorPair",
  setPWM: "setPWM",
  readPin: "readPin",
  writePin: "writePin",
  createPin: "createPin",
  togglePin: "togglePin",
  sleep: "sleep",
  exitProgram: "exitProgram",
  useMobileApp: "useMobileApp",
  importSensors: "importSensors",
  checkMsg: "checkMsg",
  hasData: "hasData",
  readData: "readData",
  iotStatus: "iotStatus",
  readUltrasonic: "readUltrasonic",
  readHMC5883L: "readHMC5883L",
  readMPUAccel: "readMPUAccel",
  readMPUGyro: "readMPUGyro",
  readRFID: "readRFID",
  setupMPU: "setupMPU",
  printLog: "printLog",
} as const;
export type McuMethod = keyof typeof MCU_METHODS;
export interface McuApi {
  createPWM(pin: number, freq: number): PwmProxy;
  configureMotorPair(role: MotorRole, fwdPin: number, revPin: number): void;
  setPWM(pin: number, freq: number, duty: number): void;
  readPin(pin: number): number;
  writePin(pin: number, mode: string): void;
  createPin(pin: number, mode: string): void;
  togglePin(pin: number, value: number): void;
  sleep(seconds: number): void;
  exitProgram(): void;
  readHMC5883L(): number[];
  readMPUAccel(): number[];
  readMPUGyro(): number[];
  readRFID(): string;
  setupMPU(pin: number): void;
  useMobileApp(): void;
  importSensors(name: string): void;
  checkMsg(): void;
  hasData(key: string): boolean;
  readData(key: string): unknown;
  iotStatus(): boolean;
  readUltrasonic(trigPin: number, echoPin: number): number;
  printLog(message: string): void;
}
export type UserTickFunction = (mcu: McuApi) => void;
export type EngineUpdateCallback = (
  physics: PhysicsState,
  vmc: VMCPinRegister,
) => void;
export type EngineErrorCallback = (message: string | null) => void;
export type TeleportBot = (x: number, y: number, theta: number) => void;
export interface WorkerInMessage {
  type: "compile";
  code: string;
}
export interface WorkerOutMessage {
  type: "compiled" | "error";
  body?: string;
  error?: string;
}
export interface CameraMetrics {
  x: number;
  y: number;
  scale: number;
}
export interface SensorPinState {
  pins: number[];
  count: number;
}
export interface PlayBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}
export interface BotWorldGeometry {
  wheelBase: number;
  irForwardOffset: number;
  irLateralOffset: number;
  scale: number;
  txLocal: Vector;
  rxLocal: Vector;
  bodySize: { w: number; h: number };
}
export interface SimulationCanvasHandle {
  appendTrail(x: number, y: number): void;
  clearTrail(): void;
  resetCamera(): void;
}
export interface SimulationCanvasProps {
  track: TrackDefinition;
  physicsRef: RefObject<PhysicsState>;
  vmcRef: RefObject<VMCPinRegister>;
  cameraRef: RefObject<CameraMetrics>;
  sensorPinsRef: RefObject<SensorPinState>;
  playBoundsRef: RefObject<PlayBounds>;
  onTeleportBot: TeleportBot;
}
export interface BotOverlayProps {
  physicsRef: RefObject<PhysicsState>;
  vmcRef: RefObject<VMCPinRegister>;
  cameraRef: RefObject<CameraMetrics>;
  sensorPinsRef: RefObject<SensorPinState>;
  playBoundsRef: RefObject<PlayBounds>;
  overlayRef: RefObject<HTMLDivElement | null>;
  viewportRef: RefObject<HTMLDivElement | null>;
  onTeleportBot: TeleportBot;
}
export interface BotSVGHandle {
  leds: (SVGCircleElement | null)[];
  root: SVGSVGElement;
  geometry: BotWorldGeometry | null;
}
export interface BlocklyWorkspaceProps {
  onJsCode(jsCode: string): void;
}
export interface ControlPanelProps {
  simHandle: SimHandle | null;
  engineReady: boolean;
  onResetCamera(): void;
}
export interface CodePreviewProps {
  code: string;
}
export interface MotorConfig {
  name: string;
  pin: number;
  freq: number;
}
export interface SensorConfig {
  name: string;
  pin: number;
}
export interface DutyAssignment {
  motor: string;
  duty: number;
}
export interface Procedure {
  name: string;
  duties: DutyAssignment[];
}
export interface SensorCondition {
  sensor: string;
  value: number;
}
export interface MainLoopRule {
  conditions: SensorCondition[];
  procedure: string;
}
export interface MotorPair {
  forward: string;
  backward: string;
}
export interface MotorMapping {
  left: MotorPair;
  right: MotorPair;
}
export interface ExtractedConfig {
  motors: MotorConfig[];
  sensors: SensorConfig[];
  procedures: Procedure[];
  mainLoopRules: MainLoopRule[];
  fallbackProcedure: string;
  motorMapping: MotorMapping;
  maxDuty: number;
}
export type Preset = {
  label: string;
  xml: string;
};
export type PanelProps = {
  title: string;
  className?: string;
  toolbar?: ReactNode;
  children: ReactNode;
};
export type PresetSelectorProps = {
  value: string;
  options: readonly Preset[];
  onChange: (label: string) => void;
};
export interface SimulatorStoreState {
  selectedTrackId: string;
  blocklyXml: string;
  iotStatus: boolean;
  isRunning: boolean;
  generatedCode: string;
  jsCode: string;
  userError: string | null;
  displayPhysics: PhysicsState;
  displayVmc: VMCPinRegister;
  parsedConfig: ExtractedConfig | null;
  obstacles: Obstacle[];
  placedObjects: PlacedObject[];
  printLog: string[];
  history: PlacedObjectHistory;
  activePresetLabel: string;
  presets: Preset[];
  undo: () => void;
  redo: () => void;
  setActivePresetLabel: (label: string) => void;
  addPreset: (label: string, xml: string) => void;
  removePreset: (label: string) => void;
  updatePreset: (
    label: string,
    newLabel: string,
    xml: string,
  ) => void;
}
export interface SimulatorStoreActions {
  setSelectedTrackId(trackId: string): void;
  setBlocklyXml(xml: string): void;
  setIotStatus(enabled: boolean): void;
  setIsRunning(running: boolean): void;
  setGeneratedCode(code: string): void;
  setJsCode(code: string): void;
  setUserError(error: string | null): void;
  setDisplayState(physics: PhysicsState, vmc: VMCPinRegister): void;
  setParsedConfig(config: ExtractedConfig | null): void;
  setObstacles(obstacles: Obstacle[]): void;
  setPrintLog(lines: string[]): void;
  addPlacedObject(obj: PlacedObject): void;
  removePlacedObject(id: string): void;
  updatePlacedObjectPose(
    id: string,
    x: number,
    y: number,
    rotation: number,
  ): void;
  clearPlacedObjects(): void;
}
export type SimulatorStore = SimulatorStoreState & SimulatorStoreActions;
export interface MotorPinPair {
  fwdPin: number;
  revPin: number;
}
export const MOTOR_PINS = { IN1: 14, IN2: 15, IN3: 12, IN4: 2 } as const;
export const IR_PINS = { LEFT: 4, RIGHT: 19 } as const;
export const PWM_MAX = 1023;
export const MAX_SPEED = 200;
export const FIXED_DT = 1 / 60;
export const FALLBACK_WHEEL_BASE = 64;
export const FALLBACK_IR_FORWARD_OFFSET = 56;
export const FALLBACK_IR_LATERAL_OFFSET = 14;
export const BOT_COLLIDER_WIDTH = 44;
export const BOT_COLLIDER_HEIGHT = 58;
export const BOT_SVG_WIDTH = 95;
export const BOT_SVG_HEIGHT = 134;
export const TRACK_LINE_WIDTH = 48;
export const UPDATE_EVERY_TICKS = 6;
export const MAX_TRAIL_POINTS = 6_000;
export const ZOOM_MIN = 0.15;
export const ZOOM_MAX = 4;
export const ULTRASONIC_CONFIG: UltrasonicConfig = {
  beamHalfAngle: 15 * (Math.PI / 180),
  rayCount: 7,
  speedOfSoundCmPerUs: 0.0343,
  minCm: 2,
  maxCm: 400,
  worldUnitsPerCm: 0.5,
  clearPathCm: 400,
  visualCycleMs: 650,
  activeWindowSim: 0.25,
};
export const DEFAULT_PHYSICS_STATE: PhysicsState = {
  x: 0,
  y: 0,
  angle: 0,
  leftMotorSpeed: 0,
  rightMotorSpeed: 0,
};
export const DEFAULT_VMC_REGISTER: VMCPinRegister = {
  pwmOutputs: {},
  digitalInputs: {},
  irLuminance: {},
};
