import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import type { WritableDraft } from "immer";
import type {
    SimulatorStore,
    Preset,
    PlacedObject,
    PlacedObjectHistory,
    PlacedObjectHistoryEntry,
} from "../types/vmc";
import {
    DEFAULT_PHYSICS_STATE,
    DEFAULT_VMC_REGISTER,
} from "../types/vmc";
import {
    DEFAULT_BLOCKLY_XML,
    OBSTACLE_AVOIDANCE_BLOCKLY_XML,
} from "@/config/blockConfigs";

const HISTORY_COMPACT_RATIO = 0.8;
const HISTORY_MAX = 1000;
const emptyHistory = (): PlacedObjectHistory => ({ past: [], future: [] });
const snapshot = (objs: PlacedObject[]): PlacedObject[] =>
    objs.map((o) => ({ ...o }));
const pushHistory = (s: WritableDraft<SimulatorStore>): void => {
    const next = { placedObjects: snapshot(s.placedObjects) };
    const top = s.history.past[s.history.past.length - 1];
    if (top && objectsEqual(top.placedObjects, next.placedObjects)) {
        return;
    }
    s.history.past.push(next);
    s.history.future = [];

    if (s.history.past.length > HISTORY_MAX) {
        compactHistory(s.history.past);
    }
};

function compactHistory(stack: PlacedObjectHistoryEntry[]): void {
    const dropCount = Math.floor(stack.length * (1 - HISTORY_COMPACT_RATIO));
    stack.splice(0, dropCount);
}
function objectsEqual(a: PlacedObject[], b: PlacedObject[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        const x = a[i]!;
        const y = b[i]!;
        if (x.id !== y.id) return false;
        if (x.x !== y.x || x.y !== y.y || x.rotation !== y.rotation) return false;
    }
    return true;
}
export const BUILT_IN_PRESETS = [
    { label: "Line Follower", xml: DEFAULT_BLOCKLY_XML },
    { label: "Obstacle Avoidance", xml: OBSTACLE_AVOIDANCE_BLOCKLY_XML },
] as const satisfies readonly Preset[];
export const DEFAULT_PRESET_LABEL = BUILT_IN_PRESETS[0].label;
export const useSimulatorStore = create<SimulatorStore>()(
    persist(
        immer((set) => ({
            selectedTrackId: "oval",
            blocklyXml: "",
            iotStatus: true,
            isRunning: false,
            generatedCode: "",
            jsCode: "",
            userError: null,
            displayPhysics: { ...DEFAULT_PHYSICS_STATE },
            displayVmc: {
                pwmOutputs: { ...DEFAULT_VMC_REGISTER.pwmOutputs },
                digitalInputs: { ...DEFAULT_VMC_REGISTER.digitalInputs },
                irLuminance: {},
            },
            parsedConfig: null,
            obstacles: [],
            placedObjects: [] as PlacedObject[],
            printLog: [] as string[],
            history: emptyHistory(),
            activePresetLabel: DEFAULT_PRESET_LABEL,
            presets: [] as Preset[],
            setSelectedTrackId: (trackId) => set((s) => { s.selectedTrackId = trackId; }),
            setBlocklyXml: (xml) => set((s) => { s.blocklyXml = xml; }),
            setIotStatus: (enabled) => set((s) => { s.iotStatus = enabled; }),
            setIsRunning: (running) => set((s) => { s.isRunning = running; }),
            setGeneratedCode: (code) => set((s) => { s.generatedCode = code; }),
            setJsCode: (code) => set((s) => { s.jsCode = code; }),
            setUserError: (error) => set((s) => { s.userError = error; }),
            setDisplayState: (physics, vmc) =>
                set((s) => { s.displayPhysics = physics; s.displayVmc = vmc; }),
            setParsedConfig: (config) => set((s) => { s.parsedConfig = config; }),
            setObstacles: (obstacles) => set((s) => { s.obstacles = obstacles; }),
            setPrintLog: (lines) => set((s) => { s.printLog = lines; }),
            addPlacedObject: (obj) => set((s) => {
                pushHistory(s);
                s.placedObjects.push({ ...obj });
            }),
            removePlacedObject: (id) => set((s) => {
                pushHistory(s);
                s.placedObjects = s.placedObjects.filter((o) => o.id !== id);
            }),
            updatePlacedObjectPose: (id, x, y, rotation) => set((s) => {
                pushHistory(s);
                const target = s.placedObjects.find((o) => o.id === id);
                if (target) { target.x = x; target.y = y; target.rotation = rotation; }
            }),
            clearPlacedObjects: () => set((s) => {
                pushHistory(s);
                s.placedObjects = [];
            }),
            undo: () => set((s) => {
                const prev = s.history.past.pop();
                if (!prev) return;
                s.history.future.unshift({ placedObjects: snapshot(s.placedObjects) });
                s.placedObjects = snapshot(prev.placedObjects);
            }),
            redo: () => set((s) => {
                const next = s.history.future.shift();
                if (!next) return;
                s.history.past.push({ placedObjects: snapshot(s.placedObjects) });
                s.placedObjects = snapshot(next.placedObjects);
            }),
            setActivePresetLabel: (label) => set((s) => { s.activePresetLabel = label; }),
            addPreset: (label, xml) => {
                const exists =
                    BUILT_IN_PRESETS.some((p) => p.label === label) ||
                    useSimulatorStore.getState().presets.some((p) => p.label === label);
                if (exists) return `Preset "${label}" already exists`;
                set((s) => {
                    s.presets.push({ label, xml });
                    s.activePresetLabel = label;
                });
                return null;
            },
            removePreset: (label) =>
                set((s) => {
                    s.presets = s.presets.filter((p) => p.label !== label);
                    if (s.activePresetLabel === label) {
                        s.activePresetLabel = DEFAULT_PRESET_LABEL;
                    }
                }),
            updatePreset: (label, newLabel, xml) => {
                const state = useSimulatorStore.getState();
                if (!state.presets.some((p) => p.label === label)) {
                    return `Preset "${label}" not found`;
                }
                const collision =
                    BUILT_IN_PRESETS.some((p) => p.label === newLabel) ||
                    state.presets.some(
                        (p) => p.label === newLabel && p.label !== label,
                    );
                if (collision) return `Preset "${newLabel}" already exists`;
                set((s) => {
                    const preset = s.presets.find((p) => p.label === label);
                    if (preset) {
                        preset.label = newLabel;
                        preset.xml = xml;
                    }
                    if (s.activePresetLabel === label) {
                        s.activePresetLabel = newLabel;
                    }
                });
                return null;
            },
        })),
        {
            name: "vmc-simulator-storage",
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({
                selectedTrackId: state.selectedTrackId,
                blocklyXml: state.blocklyXml,
                iotStatus: state.iotStatus,
                obstacles: state.obstacles,
                placedObjects: state.placedObjects,
                activePresetLabel: state.activePresetLabel,
                presets: state.presets,
            }),
        },
    ),
);
