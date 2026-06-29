const surface = ["#0b1220", "#111827", "#1a2437", "#202d40"] as const;
const brand = ["#22c55e", "#16a34a", "#14532d", "#052e16"] as const;
const neutral = ["#f8fafc", "#e2e8f0", "#94a3b8", "#64748b", "#334155"] as const;
const danger = ["#ef4444", "#7f1d1d", "rgba(127,29,29,0.5)"] as const;
const success = ["#86efac", "rgba(20,83,45,0.45)"] as const;
export const tokens = {
  surface: {
    page: surface[0],
    panel: surface[1],
    card: surface[2],
    inset: surface[3],
    panelBg: `linear-gradient(180deg, ${surface[2]}, ${surface[1]})`,
    headerBg: `linear-gradient(180deg, rgba(51,65,85,0.55), ${surface[1]})`,
  },
  brand: {
    fill: brand[0],
    stroke: brand[2],
    glow: `rgba(34,197,94,0.95)`,
    border: `rgba(34,197,94,0.55)`,
    bg: `rgba(34,197,94,0.18)`,
  },
  status: {
    run: brand[0],
    idle: "#38bdf8",
    boot: "#f59e0b",
  },
  text: {
    primary: neutral[0],
    secondary: neutral[1],
    muted: neutral[3],
  },
  border: {
    panel: `rgba(148,163,184,0.18)`,
    strong: `rgba(148,163,184,0.24)`,
    subtle: `rgba(148,163,184,0.12)`,
  },
  danger: { fill: danger[0], bg: danger[2], text: "#fca5a5", border: "rgba(248,113,113,0.32)" },
  success: { fill: success[0], bg: success[1], text: "#86efac", border: "rgba(34,197,94,0.26)" },
  bot: {
    wheel: "#111827", wheelEdge: "#475569",
    chassis: "#f3f4f6", chassisEdge: "#4b5563",
    inner: "#e5e7eb", innerEdge: "#cbd5e1",
    sensor: "#1f2937", mcu: "#2563eb", mcuEdge: "#1e40af",
    mcuDark: "#1d4ed8", mcuPin: "#1e3a8a", text: "#374151",
    hub: "#94a3b8",
    ledOff: "#ef4444", ledOffStroke: "#7f1d1d",
    ledOnStroke: "#14532d",
  },
  canvas: {
    trackFloor: "#eef2f7",
    trackStroke: "#0f172a",
    trackGrid: "rgba(15,23,42,0.06)",
    wall: "#94a3b8",
    trail: brand[0],
    wallVisualThickness: 15,
    wallGap: 4,
    playInset: 20,
    wallOverhang: 4,
  },
  moveable: {
    line: "rgba(34,197,94,0.7)",
    knob: brand[0], knobBorder: brand[3],
    rot: "#60a5fa", rotBorder: "#1e3a8a",
  },
  code: { bg: "#020617", text: "#86efac", pin: "#7dd3fc", badge: "#fbbf24" },
  blockly: {
    workspace: "#0d1117", toolbox: "#0f172a", toolboxFg: "#e2e8f0",
    flyout: "#161f2e", flyoutFg: "#f1f5f9",
    scrollbar: "#334155", insertion: brand[0], cursor: brand[0], grid: "#1e293b",
    debounceMs: 80
  },
  ir: {
    onLineMax: 320, offLineMin: 448, maxLuminance: 765, sampleRadius: 1,
  },
  size: {
    radius: 14, radiusSm: 10, radiusXs: 9, radiusPill: 999,
    panelHeader: 36, btn: 34, ledBase: 7,
  },
} as const;
