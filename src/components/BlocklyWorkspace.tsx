import { useCallback, useEffect, useMemo, useRef } from "react";
import * as Blockly from "blockly";
import { tokens } from "../styles/tokens";
import { parsePythonCode } from "../parsers/pythonParser";
import {
    BUILT_IN_PRESETS,
    useSimulatorStore,
} from "../store/useSimulatorStore";
import type {
    BlocklyWorkspaceProps,
    Preset,
    PresetSelectorProps,
} from "../types/vmc";
import {
    getJsGen,
    getPythonGen,
    getToolbox,
    registerCustomBlocks,
} from "../utils/blocklyBlocks";
import { Panel } from "./Panel";
import { DEFAULT_BLOCKLY_XML } from "@/config/blockConfigs";
const T = tokens.blockly;
const theme = Blockly.Theme.defineTheme("vmc-dark", {
    name: "vmc-dark",
    base: Blockly.Themes.Classic,
    componentStyles: {
        workspaceBackgroundColour: T.workspace,
        toolboxBackgroundColour: T.toolbox,
        toolboxForegroundColour: T.toolboxFg,
        flyoutBackgroundColour: T.flyout,
        flyoutForegroundColour: T.flyoutFg,
        flyoutOpacity: 0.97,
        scrollbarColour: T.scrollbar,
        insertionMarkerColour: T.insertion,
        insertionMarkerOpacity: 0.4,
        cursorColour: T.cursor,
    },
});
export function BlocklyWorkspace({ onJsCode }: BlocklyWorkspaceProps) {
    const hostRef = useRef<HTMLDivElement>(null);
    const wsRef = useRef<Blockly.WorkspaceSvg | null>(null);
    const debounceRef = useRef<number | null>(null);
    const onJsCodeRef = useRef(onJsCode);
    const isInternalChangeRef = useRef(false);
    const activePresetLabel = useSimulatorStore((s) => s.activePresetLabel);
    const presets = useSimulatorStore((s) => s.presets);
    const setActivePresetLabel = useSimulatorStore(
        (s) => s.setActivePresetLabel,
    );
    const setBlocklyXml = useSimulatorStore((s) => s.setBlocklyXml);
    const setGeneratedCode = useSimulatorStore((s) => s.setGeneratedCode);
    const setJsCode = useSimulatorStore((s) => s.setJsCode);
    const setParsedConfig = useSimulatorStore((s) => s.setParsedConfig);
    const allPresets = useMemo<readonly Preset[]>(
        () => [...BUILT_IN_PRESETS, ...presets],
        [presets],
    );
    useEffect(() => {
        onJsCodeRef.current = onJsCode;
    }, [onJsCode]);
    const handlersRef = useRef({
        setBlocklyXml,
        setGeneratedCode,
        setJsCode,
        setParsedConfig,
    });
    handlersRef.current = {
        setBlocklyXml,
        setGeneratedCode,
        setJsCode,
        setParsedConfig,
    };
    const resolvePresetXml = useCallback(
        (label: string): string => {
            const preset = allPresets.find((p) => p.label === label);
            return preset?.xml ?? DEFAULT_BLOCKLY_XML;
        },
        [allPresets],
    );
    const generate = useCallback(() => {
        const w = wsRef.current;
        if (!w) return;
        try {
            const py = getPythonGen().workspaceToCode(w);
            const js = getJsGen().workspaceToCode(w);
            const xml = Blockly.Xml.domToText(Blockly.Xml.workspaceToDom(w));
            handlersRef.current.setGeneratedCode(py);
            handlersRef.current.setJsCode(js);
            handlersRef.current.setBlocklyXml(xml);
            handlersRef.current.setParsedConfig(parsePythonCode(py));
            onJsCodeRef.current(js);
        } catch (err) {
            console.error("[Blockly] Code generation failed:", err);
        }
    }, []);
    const schedule = useCallback(() => {
        if (debounceRef.current !== null) {
            clearTimeout(debounceRef.current);
        }
        debounceRef.current = window.setTimeout(generate, T.debounceMs);
    }, [generate]);
    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;
        registerCustomBlocks();
        const ws = Blockly.inject(host, {
            renderer: "thrasos",
            theme,
            toolbox:
                getToolbox() as unknown as Blockly.utils.toolbox.ToolboxDefinition,
            grid: { spacing: 22, length: 3, colour: T.grid, snap: true },
            trashcan: true,
            move: { scrollbars: true, drag: true, wheel: true },
            zoom: {
                controls: true,
                wheel: true,
                startScale: 0.8,
                maxScale: 2.5,
                minScale: 0.3,
                scaleSpeed: 1.1,
            },
        });
        wsRef.current = ws;
        const storeState = useSimulatorStore.getState();
        const initialXml =
            storeState.blocklyXml ||
            resolvePresetXml(storeState.activePresetLabel);
        isInternalChangeRef.current = true;
        try {
            Blockly.Xml.domToWorkspace(
                Blockly.utils.xml.textToDom(initialXml),
                ws,
            );
        } catch (err) {
            console.warn(
                "[Blockly] Failed to load initial XML, using obstacle default",
                err,
            );
            Blockly.Xml.domToWorkspace(
                Blockly.utils.xml.textToDom(DEFAULT_BLOCKLY_XML),
                ws,
            );
        }
        isInternalChangeRef.current = false;
        ws.addChangeListener(schedule);
        generate();
        Blockly.svgResize(ws);
        const resizeObserver = new ResizeObserver(() => {
            if (wsRef.current) Blockly.svgResize(wsRef.current);
        });
        resizeObserver.observe(host);
        return () => {
            if (debounceRef.current !== null) {
                clearTimeout(debounceRef.current);
                debounceRef.current = null;
            }
            resizeObserver.disconnect();
            ws.removeChangeListener(schedule);
            ws.dispose();
            wsRef.current = null;
        };
    }, [schedule, generate, resolvePresetXml]);
    const handlePresetChange = useCallback(
        (label: string) => {
            const ws = wsRef.current;
            if (!ws) return;
            const xml = resolvePresetXml(label);
            setActivePresetLabel(label);
            isInternalChangeRef.current = true;
            ws.clear();
            try {
                Blockly.Xml.domToWorkspace(
                    Blockly.utils.xml.textToDom(xml),
                    ws,
                );
            } catch (err) {
                console.error(
                    `[Blockly] Failed to load preset "${label}":`,
                    err,
                );
            }
            isInternalChangeRef.current = false;
            setBlocklyXml(
                Blockly.Xml.domToText(Blockly.Xml.workspaceToDom(ws)),
            );
            generate();
        },
        [generate, resolvePresetXml, setActivePresetLabel, setBlocklyXml],
    );
    return (
        <Panel
            title="Block Designer"
            className="h-full flex flex-col"
            toolbar={
                <PresetSelector
                    value={activePresetLabel}
                    options={allPresets}
                    onChange={handlePresetChange}
                />
            }
        >
            <div
                ref={hostRef}
                className="w-full h-full flex-1 relative"
                style={{ position: "relative" }}
            />
        </Panel>
    );
}
function PresetSelector({ value, options, onChange }: PresetSelectorProps) {
    return (
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="bg-gray-800 text-gray-100 text-sm px-2 py-1 rounded border border-gray-700 hover:border-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            aria-label="Select preset program"
        >
            {options.map((opt) => (
                <option key={opt.label} value={opt.label}>
                    {opt.label}
                </option>
            ))}
        </select>
    );
}
