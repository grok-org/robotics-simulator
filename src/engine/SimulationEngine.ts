import RAPIER from "@dimforge/rapier2d-compat";
import { extractTickBody, compileUserCode } from "../parsers/javascriptParser";
import { scopedLogger } from "../utils/logger";
import { tokens } from "../styles/tokens";
import type {
  BotWorldGeometry,
  EngineErrorCallback,
  EngineUpdateCallback,
  McuApi,
  MotorPinPair,
  MotorRole,
  Obstacle,
  PaletteItem,
  PhysicsState,
  PlacedObject,
  PlayBounds,
  PwmProxy,
  SensorPinState,
  SimHandle,
  TrackDefinition,
  UltrasonicChannel,
  UltrasonicVisualState,
  UserTickFunction,
  Vector,
  VMCPinRegister,
} from "../types/vmc";
import {
  FALLBACK_IR_FORWARD_OFFSET,
  FALLBACK_IR_LATERAL_OFFSET,
  FALLBACK_WHEEL_BASE,
  FIXED_DT,
  MAX_SPEED,
  PWM_MAX,
  BOT_COLLIDER_HEIGHT,
  BOT_COLLIDER_WIDTH,
  ULTRASONIC_CONFIG,
} from "../types/vmc";
import {
  computeWallBars,
  computeWallGeom,
  computePlayBounds,
} from "@/styles/wallGeometry";
import { constrainToWallBounds } from "../utils/wallBounds";
import { getPaletteItem } from "../utils/paletteRegistry";
const log = scopedLogger("engine");
const MAX_DELTA_TIME_SEC = 0.1;
const BYTES_PER_PIXEL = 4;

const PRINT_LOG_LIMIT = 200;

const SOLVER_ITERATIONS = 8;
const clampDutyCycle = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  const truncated = value | 0;
  return truncated < 0 ? 0 : truncated > PWM_MAX ? PWM_MAX : truncated;
};
const extractErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

function paletteColliderDesc(
  paletteItemId: string,
  size: number,
): RAPIER.ColliderDesc | null {
  const item = getPaletteItem(paletteItemId);
  if (!item) return null;
  const hull = item.convexHull;
  if (!hull || hull.length < 3) {

    return RAPIER.ColliderDesc.cuboid(
      (item.width * size) * 0.5,
      (item.height * size) * 0.5,
    );
  }
  const out = new Float32Array(hull.length * 2);
  for (let i = 0; i < hull.length; i++) {
    out[i * 2] = hull[i].x * size;
    out[i * 2 + 1] = hull[i].y * size;
  }
  return RAPIER.ColliderDesc.convexHull(out);
}
const US = ULTRASONIC_CONFIG;
const US_RAY_STEP =
  US.rayCount > 1 ? (US.beamHalfAngle * 2) / (US.rayCount - 1) : 0;
export class SimulationEngine implements SimHandle {
  private world: RAPIER.World;
  private body: RAPIER.RigidBody;
  private botCollider: RAPIER.Collider;
  private track: TrackDefinition;
  private trackLuma: Uint8ClampedArray | null = null;
  private trackWidth = 0;
  private trackHeight = 0;
  private rowByteStride = 0;
  private cachedPlayBounds: PlayBounds | null = null;
  private tickFn: UserTickFunction | null = null;
  private previousCode = "";
  private animationFrameId = 0;
  private lastFrameTimestamp = 0;
  private isRunning = false;
  private tickCount = 0;
  private onUpdate: EngineUpdateCallback | null = null;
  private onError: EngineErrorCallback | null = null;
  private lastError: string | null = null;
  private readonly activePwmPins: number[] = [];
  private readonly motorRoles = new Map<MotorRole, MotorPinPair>();
  private leftMotorPair: MotorPinPair | null = null;
  private rightMotorPair: MotorPinPair | null = null;
  private readonly activeSensorPins: number[] = [];
  private readonly sensorPinSet = new Set<number>();
  private readonly proxyCache = new Map<number, PwmProxy>();
  private readonly vmcReg: VMCPinRegister = {
    pwmOutputs: Object.create(null),
    digitalInputs: Object.create(null),
    irLuminance: Object.create(null),
  };
  private readonly physics: PhysicsState = {
    x: 0,
    y: 0,
    angle: 0,
    leftMotorSpeed: 0,
    rightMotorSpeed: 0,
  };
  private readonly iotStore: Record<string, unknown> = { status: true };
  private iotEnabled = true;
  private readonly mcu: McuApi;
  private lastLeftIrValue = -1;
  private lastRightIrValue = -1;
  private botGeometry: BotWorldGeometry = {
    wheelBase: FALLBACK_WHEEL_BASE,
    irForwardOffset: FALLBACK_IR_FORWARD_OFFSET,
    irLateralOffset: FALLBACK_IR_LATERAL_OFFSET,
    scale: 1,
    txLocal: { x: FALLBACK_IR_FORWARD_OFFSET, y: 0 },
    rxLocal: { x: FALLBACK_IR_FORWARD_OFFSET, y: 0 },
    bodySize: { w: BOT_COLLIDER_WIDTH, h: BOT_COLLIDER_HEIGHT },
  };
  private simTime = 0;

  public readonly ultrasonicVisual: UltrasonicVisualState = {
    active: false,
    phase: "idle",
    progress: 0,
    txWorld: { x: 0, y: 0 },
    rxWorld: { x: 0, y: 0 },
    hitWorld: null,
    distanceCm: US.clearPathCm,
  };

  private usLastCastSimTime = -Infinity;
  private usCache: { distanceCm: number; hitWorld: Vector | null } = {
    distanceCm: US.clearPathCm,
    hitWorld: null,
  };

  private usLastReadSimTime = -Infinity;

  private readonly printBuffer: string[] = [];
  private printVersion = 0;
  private readonly rays: RAPIER.Ray[];
  private readonly obstacles = new Map<string, Obstacle>();
  private readonly rapierObstacles = new Map<
    string,
    { body: RAPIER.RigidBody; collider: RAPIER.Collider }
  >();
  private readonly ultrasonicChannels = new Map<string, UltrasonicChannel>();
  private readonly placedObjectBodies = new Map<
    string,
    { body: RAPIER.RigidBody; collider: RAPIER.Collider; paletteItemId: string }
  >();
  private readonly placedColliderHandleToId = new Map<number, string>();
  private lastAppliedBodyW = -1;
  private lastAppliedBodyH = -1;
  private constructor(track: TrackDefinition) {
    this.track = track;
    this.buildTrackLuminanceMap();
    this.world = this.createPhysicsWorld();
    const { body, collider } = this.createRobotBodyIn(this.world);
    this.body = body;
    this.botCollider = collider;
    this.rays = Array.from(
      { length: US.rayCount },
      () => new RAPIER.Ray({ x: 0, y: 0 }, { x: 1, y: 0 }),
    );

    this.mcu = this.buildMcuApi();
    this.syncPhysicsState(0, 0);
  }
  static async create(track: TrackDefinition): Promise<SimulationEngine> {
    await RAPIER.init();
    return new SimulationEngine(track);
  }
  setOnUpdate(callback: EngineUpdateCallback): void {
    this.onUpdate = callback;
  }
  setOnError(callback: EngineErrorCallback): void {
    this.onError = callback;
  }

  private pendingGeometry: BotWorldGeometry | null = null;

  private geometryRebuildQueued = false;
  applyBotGeometry(geometry: BotWorldGeometry): void {
    this.botGeometry = geometry;
    this.pendingGeometry = geometry;
    if (this.geometryRebuildQueued) return;
    this.geometryRebuildQueued = true;
    requestAnimationFrame(() => {
      this.geometryRebuildQueued = false;
      const next = this.pendingGeometry;
      this.pendingGeometry = null;
      if (!next) return;
      if (this.wasmBusy) return;
      this.rebuildBotColliderIfChanged(next);
    });
  }
  private rebuildBotColliderIfChanged(geometry: BotWorldGeometry): void {
    if (geometry.bodySize.w <= 0 || geometry.bodySize.h <= 0) return;
    const w = Math.round(geometry.bodySize.w * 1000) / 1000;
    const h = Math.round(geometry.bodySize.h * 1000) / 1000;
    if (this.lastAppliedBodyW === w && this.lastAppliedBodyH === h) return;
    this.lastAppliedBodyW = w;
    this.lastAppliedBodyH = h;
    if (this.wasmBusy) {

      requestAnimationFrame(() => this.rebuildBotColliderIfChanged(geometry));
      return;
    }
    this.wasmBusy = true;
    try {
      try {
        this.world.removeCollider(this.botCollider, true);
      } catch (err) {
        log.warn("removeCollider failed; keeping existing collider", String(err));
        return;
      }
      this.botCollider = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(w * 0.5, h * 0.5)
          .setRestitution(0.1)
          .setFriction(0.6)
          .setDensity(1.2),
        this.body,
      );
    } finally {
      this.wasmBusy = false;
    }
  }
  addObstacle(
    x: number,
    y: number,
    rotation: number,
    size: number,
    id?: string,
  ): string {
    const obstacleId = id ?? crypto.randomUUID();
    const paletteItemId = "rock";
    const item = getPaletteItem(paletteItemId);
    if (!item) {
      log.warn("obstacle palette item missing", { paletteItemId });
      return obstacleId;
    }
    const desc = paletteColliderDesc(paletteItemId, size);
    if (!desc) {
      log.error("obstacle collider build failed", { id: obstacleId });
      return obstacleId;
    }
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(x, y)
        .setRotation(rotation),
    );

    const collider = this.world.createCollider(
      desc
        .setRestitution(0.2)
        .setFriction(0.8)
        .setDensity(2.5),
      body,
    );
    const obstacle: Obstacle = {
      id: obstacleId,
      x,
      y,
      rotation,
      size,
      svgKey: "rock",
      width: item.width * size,
      height: item.height * size,
    };
    this.obstacles.set(obstacleId, obstacle);
    this.rapierObstacles.set(obstacleId, { body, collider });
    return obstacleId;
  }
  removeObstacle(id: string): void {
    const handles = this.rapierObstacles.get(id);
    if (!handles) return;
    this.world.removeCollider(handles.collider, true);
    this.world.removeRigidBody(handles.body);
    this.rapierObstacles.delete(id);
    this.obstacles.delete(id);
  }
  moveObstacle(id: string, x: number, y: number, rotation: number): void {
    const handles = this.rapierObstacles.get(id);
    const record = this.obstacles.get(id);
    if (!handles || !record) return;
    const next: Obstacle = {
      ...record,
      x,
      y,
      rotation,
      width: record.width,
      height: record.height,
    };
    handles.body.setTranslation({ x, y }, true);
    handles.body.setRotation(rotation, true);
    this.obstacles.set(id, next);
  }
  getObstaclesSnapshot(): Obstacle[] {
    return Array.from(this.obstacles.values());
  }
  addPlacedObject(
    id: string,
    paletteItemId: string,
    x: number,
    y: number,
    rotation: number,
  ): void {
    if (this.placedObjectBodies.has(id)) {
      this.updatePlacedObjectPose(id, x, y, rotation);
      return;
    }
    const item = getPaletteItem(paletteItemId);
    if (!item) {
      log.warn("unknown palette item", { id, paletteItemId });
      return;
    }
    const bounds = this.getPlayAreaBounds();
    const constrained = constrainToWallBounds(
      x,
      y,
      item.width,
      item.height,
      bounds,
    );
    const desc = this.buildPlacedColliderDesc(item);
    if (!desc) {
      log.error("collider build failed", { id, paletteItemId });
      return;
    }
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(constrained.x, constrained.y)
        .setRotation(rotation * (Math.PI / 180)),
    );
    const collider = this.world.createCollider(
      desc
        .setFriction(0.8)
        .setRestitution(0.2),
      body,
    );
    this.placedObjectBodies.set(id, { body, collider, paletteItemId });
    this.placedColliderHandleToId.set(collider.handle, id);
  }
  removePlacedObject(id: string): void {
    const rec = this.placedObjectBodies.get(id);
    if (!rec) return;
    this.placedColliderHandleToId.delete(rec.collider.handle);
    this.world.removeCollider(rec.collider, true);
    this.world.removeRigidBody(rec.body);
    this.placedObjectBodies.delete(id);
  }
  updatePlacedObjectPose(
    id: string,
    x: number,
    y: number,
    rotation: number,
  ): void {
    const rec = this.placedObjectBodies.get(id);
    if (!rec) return;
    const item = getPaletteItem(rec.paletteItemId);
    const bounds = this.getPlayAreaBounds();
    const constrained = constrainToWallBounds(
      x,
      y,
      item?.width ?? 0,
      item?.height ?? 0,
      bounds,
    );
    rec.body.setTranslation({ x: constrained.x, y: constrained.y }, true);
    rec.body.setRotation(rotation * (Math.PI / 180), true);
  }
  clearPlacedObjects(): void {
    for (const rec of this.placedObjectBodies.values()) {
      this.placedColliderHandleToId.delete(rec.collider.handle);
      this.world.removeCollider(rec.collider, true);
      this.world.removeRigidBody(rec.body);
    }
    this.placedObjectBodies.clear();
  }

  syncPlacedObjects(snapshot: PlacedObject[]): void {
    for (const [id, rec] of this.placedObjectBodies) {
      if (!snapshot.some((o) => o.id === id)) {
        this.placedColliderHandleToId.delete(rec.collider.handle);
        this.world.removeCollider(rec.collider, true);
        this.world.removeRigidBody(rec.body);
        this.placedObjectBodies.delete(id);
      }
    }
    for (const obj of snapshot) {
      if (this.placedObjectBodies.has(obj.id)) {
        this.updatePlacedObjectPose(obj.id, obj.x, obj.y, obj.rotation);
      } else {
        this.addPlacedObject(
          obj.id,
          obj.paletteItemId,
          obj.x,
          obj.y,
          obj.rotation,
        );
      }
    }
  }

  private buildPlacedColliderDesc(item: PaletteItem): RAPIER.ColliderDesc | null {
    const hull = item.convexHull;
    if (!hull || hull.length < 3) {
      return RAPIER.ColliderDesc.cuboid(item.width * 0.5, item.height * 0.5);
    }
    const flat = new Float32Array(hull.length * 2);
    for (let i = 0; i < hull.length; i++) {
      flat[i * 2] = hull[i].x;
      flat[i * 2 + 1] = hull[i].y;
    }
    return RAPIER.ColliderDesc.convexHull(flat);
  }
  loadUserProgram(sourceCode: string): void {
    if (sourceCode === this.previousCode) return;
    this.previousCode = sourceCode;
    this.resetPinState();
    try {
      const tickBody = extractTickBody(sourceCode);
      this.tickFn = compileUserCode(tickBody);
      log.debug("compiled", { bytes: sourceCode.length, bodyLen: tickBody.length });
      this.dispatchError(null);
    } catch (error) {
      this.tickFn = null;
      this.dispatchError(`Compile: ${extractErrorMessage(error)}`);
      log.warn("compile error", extractErrorMessage(error));
    }
  }
  setIotBridgeState(enabled: boolean): void {
    this.iotEnabled = enabled;
    if (enabled) this.iotStore.status = true;
  }
  loadTrack(track: TrackDefinition): void {
    this.stop();
    this.track = track;
    this.buildTrackLuminanceMap();
    this.world.free();
    this.world = this.createPhysicsWorld();
    const { body, collider } = this.createRobotBodyIn(this.world);
    this.body = body;
    this.botCollider = collider;
    this.placedObjectBodies.clear();
    this.placedColliderHandleToId.clear();
    this.cachedPlayBounds = null;
    this.lastAppliedBodyW = -1;
    this.lastAppliedBodyH = -1;
    this.resetPinState();
    this.syncPhysicsState(0, 0);
    this.dispatchPhysicsUpdate();
  }
  teleportRobot(x: number, y: number, theta: number): void {
    const constrained = this.clampBotToWorld(x, y);
    this.body.setTranslation({ x: constrained.x, y: constrained.y }, true);
    this.body.setRotation(theta, true);
    this.body.setLinvel({ x: 0, y: 0 }, true);
    this.body.setAngvel(0, true);
    this.syncPhysicsState(0, 0);
    this.updateIrSensors();
    this.dispatchPhysicsUpdate();
  }

  private clampBotToWorld(x: number, y: number): { x: number; y: number } {
    return constrainToWallBounds(
      x,
      y,
      this.botGeometry.bodySize.w,
      this.botGeometry.bodySize.h,
      this.getPlayAreaBounds(),
    );
  }
  readSensorPinMapping(output: SensorPinState): void {
    const count = Math.min(this.activeSensorPins.length, output.pins.length);
    for (let index = 0; index < count; index++) {
      output.pins[index] = this.activeSensorPins[index];
    }
    output.count = count;
  }
  getPlayAreaBounds(): PlayBounds {
    return this.cachedPlayBounds ??= computePlayBounds(computeWallGeom(this.track));
  }
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastFrameTimestamp = performance.now();
    this.animationFrameId = requestAnimationFrame(this.runFrameLoop);
  }
  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = 0;
    this.ultrasonicVisual.active = false;
  }
  reset(): void {
    this.stop();
    this.resetPinState();
    this.teleportRobot(
      this.track.start.x,
      this.track.start.y,
      this.track.start.angle,
    );
  }
  destroy(): void {
    this.stop();
    for (const id of Array.from(this.rapierObstacles.keys())) {
      this.removeObstacle(id);
    }
    this.clearPlacedObjects();
    this.world.free();
  }

  private wasmBusy = false;

  private readonly runFrameLoop = (timestamp: number): void => {
    if (!this.isRunning) {
      this.animationFrameId = requestAnimationFrame(this.runFrameLoop);
      return;
    }
    if (this.wasmBusy) {

      this.animationFrameId = requestAnimationFrame(this.runFrameLoop);
      return;
    }
    this.wasmBusy = true;
    try {
      const deltaSec = Math.min(
        MAX_DELTA_TIME_SEC,
        (timestamp - this.lastFrameTimestamp) / 1000,
      );
      this.lastFrameTimestamp = timestamp;

      this.simTime += Math.min(deltaSec, FIXED_DT);
      this.stepSimulation();
    } finally {
      this.wasmBusy = false;
    }
    this.animationFrameId = requestAnimationFrame(this.runFrameLoop);
  };

  private pendingUpdate: { physics: PhysicsState; vmc: VMCPinRegister } | null = null;
  private stepSimulation(): void {
    if (this.tickFn) {
      try {
        this.tickFn(this.mcu);
        this.dispatchError(null);
      } catch (error) {
        this.dispatchError(`Runtime: ${extractErrorMessage(error)}`);
        log.warn("runtime", extractErrorMessage(error));
      }
    }

    let leftSpeed = 0;
    let rightSpeed = 0;
    if (this.leftMotorPair && this.rightMotorPair) {
      leftSpeed = this.computeWheelSpeed(this.leftMotorPair);
      rightSpeed = this.computeWheelSpeed(this.rightMotorPair);
    }
    const linearVelocity = (leftSpeed + rightSpeed) * 0.5;
    const angularVelocity =
      (leftSpeed - rightSpeed) / this.botGeometry.wheelBase;

    try {
      const heading = this.body.rotation();
      this.body.setLinvel(
        {
          x: linearVelocity * Math.cos(heading),
          y: linearVelocity * Math.sin(heading),
        },
        true,
      );
      this.body.setAngvel(angularVelocity, true);
    } catch (err) {
      log.error("drive panicked; halting sim", String(err));
      this.isRunning = false;
      this.dispatchError(`Physics: ${extractErrorMessage(err)}`);
      return;
    }

    try {
      this.world.step();
    } catch (err) {
      log.error("world.step panicked; halting sim", String(err));
      this.isRunning = false;
      this.dispatchError(`Physics: ${extractErrorMessage(err)}`);
      return;
    }
    this.simTime += FIXED_DT;
    try {
      this.enforceBotBounds();
      this.syncPhysicsState(leftSpeed, rightSpeed);
      this.updateUltrasonicVisual(performance.now());
      this.updateIrSensors();
    } catch (err) {
      log.warn("post-step work failed", String(err));
    }

    this.pendingUpdate = {
      physics: { ...this.physics },
      vmc: { ...this.vmcReg },
    };
    if (!this.flushScheduled) {
      this.flushScheduled = true;
      requestAnimationFrame(this.flushPendingUpdate);
    }
    this.tickCount++;

  }
  private flushScheduled = false;
  private readonly flushPendingUpdate = (): void => {
    this.flushScheduled = false;
    if (this.wasmBusy) {

      this.flushScheduled = true;
      requestAnimationFrame(this.flushPendingUpdate);
      return;
    }
    const u = this.pendingUpdate;
    if (!u) return;
    this.pendingUpdate = null;
    try {
      this.onUpdate?.(u.physics, u.vmc);
    } catch (err) {
      log.warn("onUpdate callback threw", String(err));
    }
  };

  private enforceBotBounds(): void {
    const t = this.body.translation();
    const c = this.clampBotToWorld(t.x, t.y);
    if (c.x !== t.x || c.y !== t.y) {
      this.body.setTranslation({ x: c.x, y: c.y }, true);
      this.body.setLinvel({ x: 0, y: 0 }, true);
    }
  }
  private buildMcuApi(): McuApi {
    return {
      createPWM: (pin, freq) => this.createPwmProxy(pin, freq),
      configureMotorPair: (role, fwdPin, revPin) =>
        this.registerMotorPair(role, fwdPin, revPin),
      setPWM: (pin, freq, duty) => this.writePwmDuty(pin, freq, duty),
      readPin: (pin) => this.readDigitalPin(pin),
      useMobileApp: () => undefined,
      importSensors: () => undefined,
      checkMsg: () => undefined,
      hasData: (key) => this.iotEnabled && key in this.iotStore,
      readData: (key) =>
        this.iotEnabled && key in this.iotStore ? this.iotStore[key] : false,
      iotStatus: () => this.iotEnabled,
      writePin: () => undefined,
      createPin: () => undefined,
      togglePin: () => undefined,
      sleep: () => undefined,
      exitProgram: () => undefined,
      readHMC5883L: () => [0, 0, 0],
      readMPUAccel: () => [0, 0, 0],
      readMPUGyro: () => [0, 0, 0],
      readRFID: () => "",
      setupMPU: () => undefined,
      readUltrasonic: (trig, echo) => this.readUltrasonic(trig, echo),
      printLog: (msg) => this.appendPrint(msg),
    };
  }

  private appendPrint(message: string): void {
    this.printBuffer.push(message);
    if (this.printBuffer.length > PRINT_LOG_LIMIT) this.printBuffer.shift();
    this.printVersion++;
  }
  getPrintLog(): string[] {
    return this.printBuffer;
  }
  getPrintVersion(): number {
    return this.printVersion;
  }
  clearPrintLog(): void {
    if (this.printBuffer.length > 0) {
      this.printBuffer.length = 0;
      this.printVersion++;
    }
  }
  private getOrCreateUltrasonicChannel(trigPin: number, echoPin: number): UltrasonicChannel {
    const key = `${trigPin}:${echoPin}`;
    let ch = this.ultrasonicChannels.get(key);
    if (!ch) {
      ch = { trigPin, echoPin };
      this.ultrasonicChannels.set(key, ch);
    }
    return ch;
  }

  private readUltrasonic(trigPin: number, echoPin: number): number {
    this.getOrCreateUltrasonicChannel(trigPin, echoPin);
    if (this.simTime !== this.usLastCastSimTime) {
      this.usLastCastSimTime = this.simTime;
      const cast = this.castUltrasonicFan();
      this.usCache = {
        distanceCm: cast.distanceCm > 0 ? cast.distanceCm : US.clearPathCm,
        hitWorld: cast.hitWorld,
      };
    }
    this.usLastReadSimTime = this.simTime;
    return this.usCache.distanceCm;
  }

  private castUltrasonicFan(): { distanceCm: number; hitWorld: Vector | null } {
    const { x, y, angle } = this.physics;
    const tx = this.botGeometry.txLocal;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const originX = x + (tx.x * cos - tx.y * sin);
    const originY = y + (tx.x * sin + tx.y * cos);
    const maxToi = US.maxCm * US.worldUnitsPerCm;
    let bestToi = Number.POSITIVE_INFINITY;
    let bestDirX = 0;
    let bestDirY = 0;
    for (let i = 0; i < US.rayCount; i++) {
      const rayAngle = angle - US.beamHalfAngle + i * US_RAY_STEP;
      const ray = this.rays[i];
      ray.origin.x = originX;
      ray.origin.y = originY;
      ray.dir.x = Math.cos(rayAngle);
      ray.dir.y = Math.sin(rayAngle);
      const hit = this.world.castRay(
        ray,
        maxToi,
        true,
        RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC,
        undefined,
        this.botCollider,
      );
      if (hit && hit.timeOfImpact < bestToi) {
        bestToi = hit.timeOfImpact;
        bestDirX = ray.dir.x;
        bestDirY = ray.dir.y;
      }
    }
    if (!Number.isFinite(bestToi)) return { distanceCm: -1, hitWorld: null };
    const distanceCm = Math.max(US.minCm, Math.min(US.maxCm, bestToi / US.worldUnitsPerCm));
    const hitWorld = { x: originX + bestDirX * bestToi, y: originY + bestDirY * bestToi };
    return { distanceCm, hitWorld };
  }

  private updateUltrasonicVisual(now: number): void {
    const { x, y, angle } = this.physics;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const tx = this.botGeometry.txLocal;
    const rx = this.botGeometry.rxLocal;
    const v = this.ultrasonicVisual;
    v.txWorld = { x: x + (tx.x * cos - tx.y * sin), y: y + (tx.x * sin + tx.y * cos) };
    v.rxWorld = { x: x + (rx.x * cos - rx.y * sin), y: y + (rx.x * sin + rx.y * cos) };
    v.hitWorld = this.usCache.hitWorld;
    v.distanceCm = this.usCache.distanceCm;
    const active = this.simTime - this.usLastReadSimTime < US.activeWindowSim;
    v.active = active;
    if (!active) {
      v.phase = "idle";
      v.progress = 0;
      return;
    }
    const progress = (now % US.visualCycleMs) / US.visualCycleMs;
    v.progress = progress;
    v.phase = progress < 0.5 ? "outgoing" : "echo";
  }
  private createPwmProxy(pin: number, freq: number): PwmProxy {
    this.ensurePwmRegister(pin, freq);
    if (!this.proxyCache.has(pin)) {
      this.proxyCache.set(pin, {
        duty: (value) => this.applyPwmDuty(pin, clampDutyCycle(value)),
      });
    }
    return this.proxyCache.get(pin)!;
  }
  private registerMotorPair(
    role: MotorRole,
    fwdPin: number,
    revPin: number,
  ): void {
    this.ensurePwmRegister(fwdPin, 100);
    this.ensurePwmRegister(revPin, 100);
    const pair: MotorPinPair = { fwdPin, revPin };
    this.motorRoles.set(role, pair);
    if (role === "left") this.leftMotorPair = pair;
    else this.rightMotorPair = pair;
    log.debug("pair", { role, fwdPin, revPin });
  }
  private writePwmDuty(pin: number, freq: number, duty: number): void {
    this.ensurePwmRegister(pin, freq);
    this.applyPwmDuty(pin, clampDutyCycle(duty));
  }
  private readDigitalPin(pin: number): number {
    if (!this.sensorPinSet.has(pin)) {
      this.sensorPinSet.add(pin);
      this.activeSensorPins.push(pin);
      this.vmcReg.digitalInputs[pin] = 0;
      log.debug("sensor", { pin, order: this.activeSensorPins.length });
    }
    return this.vmcReg.digitalInputs[pin];
  }
  private ensurePwmRegister(pin: number, freq: number): void {
    if (this.vmcReg.pwmOutputs[pin]) return;
    this.activePwmPins.push(pin);
    this.vmcReg.pwmOutputs[pin] = { duty: 0, freq };
  }
  private applyPwmDuty(pin: number, duty: number): void {
    const output = this.vmcReg.pwmOutputs[pin];
    if (output) output.duty = duty;
  }
  private computeWheelSpeed(motorPair: MotorPinPair | null): number {
    if (!motorPair) return 0;
    const forwardDuty = this.vmcReg.pwmOutputs[motorPair.fwdPin]?.duty ?? 0;
    const reverseDuty = this.vmcReg.pwmOutputs[motorPair.revPin]?.duty ?? 0;
    return (MAX_SPEED * (forwardDuty - reverseDuty)) / PWM_MAX;
  }
  private updateIrSensors(): void {
    const sensorCount = this.activeSensorPins.length;
    if (sensorCount === 0 || !this.trackLuma) return;
    const { x, y, angle } = this.physics;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const irForward = this.botGeometry.irForwardOffset;
    const irLateral = this.botGeometry.irLateralOffset;
    const leftIrX = x + irForward * cos - irLateral * sin;
    const leftIrY = y + irForward * sin + irLateral * cos;
    const rightIrX = x + irForward * cos + irLateral * sin;
    const rightIrY = y + irForward * sin - irLateral * cos;
    const leftPin = this.activeSensorPins[0] ?? -1;
    const rightPin = this.activeSensorPins[1] ?? -1;
    const leftReading = this.evaluateSensorHysteresis(leftPin, leftIrX, leftIrY);
    const rightReading = this.evaluateSensorHysteresis(rightPin, rightIrX, rightIrY);
    if (sensorCount === 1) {
      this.vmcReg.digitalInputs[this.activeSensorPins[0]] = leftReading | rightReading;
    } else {
      this.vmcReg.digitalInputs[leftPin] = leftReading;
      this.vmcReg.digitalInputs[rightPin] = rightReading;
    }
    if (leftReading !== this.lastLeftIrValue) {
      this.lastLeftIrValue = leftReading;
    }
    if (rightReading !== this.lastRightIrValue) {
      this.lastRightIrValue = rightReading;
    }
  }
  private evaluateSensorHysteresis(pin: number, x: number, y: number): 0 | 1 {
    const luminance = this.samplePixelLuminance(x, y);
    this.vmcReg.irLuminance[pin] = luminance;
    const previous = pin >= 0 ? (this.vmcReg.digitalInputs[pin] ?? 0) : 0;
    return previous === 1
      ? (luminance < tokens.ir.offLineMin ? 1 : 0)
      : (luminance < tokens.ir.onLineMax ? 1 : 0);
  }
  private samplePixelLuminance(worldX: number, worldY: number): number {
    const buffer = this.trackLuma;

    if (!buffer) return tokens.ir.maxLuminance;
    const width = this.trackWidth;
    const height = this.trackHeight;
    const stride = this.rowByteStride;
    const baseX = Math.round(worldX);
    const baseY = Math.round(worldY);
    let luminanceSum = 0;
    let sampleCount = 0;
    for (let offsetY = -1; offsetY <= 0; offsetY++) {
      const pixelY = baseY + offsetY;
      if (pixelY < 0 || pixelY >= height) continue;
      const rowOffset = pixelY * stride;
      for (let offsetX = -1; offsetX <= 0; offsetX++) {
        const pixelX = baseX + offsetX;
        if (pixelX < 0 || pixelX >= width) continue;
        const pixelIndex = rowOffset + pixelX * BYTES_PER_PIXEL;
        luminanceSum += buffer[pixelIndex] + buffer[pixelIndex + 1] + buffer[pixelIndex + 2];
        sampleCount++;
      }
    }

    return sampleCount === 0 ? tokens.ir.maxLuminance : luminanceSum / sampleCount;
  }
  private buildTrackLuminanceMap(): void {
    const canvas = document.createElement("canvas");
    canvas.width = this.track.width;
    canvas.height = this.track.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      this.trackLuma = null;
      this.rowByteStride = 0;
      return;
    }
    this.track.draw(ctx);
    this.trackLuma = ctx.getImageData(0, 0, this.track.width, this.track.height).data;
    this.trackWidth = this.track.width;
    this.trackHeight = this.track.height;
    this.rowByteStride = this.trackWidth * BYTES_PER_PIXEL;
    log.debug("track buffer cached", {
      width: this.trackWidth,
      height: this.trackHeight,
      bytes: this.trackLuma.length,
    });
  }
  private syncPhysicsState(leftSpeed: number, rightSpeed: number): void {
    const translation = this.body.translation();
    this.physics.x = translation.x;
    this.physics.y = translation.y;
    this.physics.angle = this.body.rotation();
    this.physics.leftMotorSpeed = leftSpeed;
    this.physics.rightMotorSpeed = rightSpeed;
  }
  private createPhysicsWorld(): RAPIER.World {
    const world = new RAPIER.World({ x: 0, y: 0 });
    world.timestep = FIXED_DT;
    world.integrationParameters.numSolverIterations = SOLVER_ITERATIONS;
    return world;
  }
  private createRobotBodyIn(world: RAPIER.World): { body: RAPIER.RigidBody; collider: RAPIER.Collider } {
    const { x, y, angle } = this.track.start;
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, y)
        .setRotation(angle)
        .setLinearDamping(0.2)
        .setAngularDamping(0.2)
        .setCanSleep(false)
        .setCcdEnabled(true),
    );
    const collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(
        BOT_COLLIDER_WIDTH * 0.5,
        BOT_COLLIDER_HEIGHT * 0.5,
      )
        .setRestitution(0.1)
        .setFriction(0.6)
        .setDensity(1.2),
      body,
    );
    this.createBoundaryCollidersIn(world);
    return { body, collider };
  }
  private createBoundaryCollidersIn(world: RAPIER.World): void {
    const bars = computeWallBars(computeWallGeom(this.track));
    const wallBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    for (const bar of bars) {
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(bar.hx, bar.hy)
          .setTranslation(bar.cx, bar.cy)
          .setFriction(0.7)
          .setRestitution(0.15),
        wallBody,
      );
    }
  }
  private resetPinState(): void {
    for (const pin of this.activePwmPins) {
      delete this.vmcReg.pwmOutputs[pin];
    }
    for (const pin of this.activeSensorPins) {
      delete this.vmcReg.digitalInputs[pin];
    }
    this.proxyCache.clear();
    this.activePwmPins.length = 0;
    this.motorRoles.clear();
    this.leftMotorPair = null;
    this.rightMotorPair = null;
    this.activeSensorPins.length = 0;
    this.sensorPinSet.clear();
  }
  private dispatchPhysicsUpdate(): void {
    this.onUpdate?.(this.physics, this.vmcReg);
  }
  private dispatchError(message: string | null): void {
    if (message !== this.lastError) {
      this.lastError = message;
      this.onError?.(message);
    }
  }
}
