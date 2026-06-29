import type { ControlPanelProps } from "../types/vmc";
import { useSimulatorStore } from "../store/useSimulatorStore";
import { TRACKS } from "../utils/tracks";
import { Panel } from "./Panel";
import { PaletteOverlay } from "./PaletteOverlay";
import { cn } from "../utils/cn";
export function ControlPanel({ simHandle, engineReady, onResetCamera }: ControlPanelProps) {
  const trackId = useSimulatorStore((s) => s.selectedTrackId);
  const isRunning = useSimulatorStore((s) => s.isRunning);
  const iotStatus = useSimulatorStore((s) => s.iotStatus);
  const setTrackId = useSimulatorStore((s) => s.setSelectedTrackId);
  const setRunning = useSimulatorStore((s) => s.setIsRunning);
  const setIot = useSimulatorStore((s) => s.setIotStatus);
  const toggle = () => {
    if (!simHandle || !engineReady) return;
    if (isRunning) { simHandle.stop(); setRunning(false); }
    else { simHandle.start(); setRunning(true); }
  };
  return (
    <Panel title="Control Panel">
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2.5 p-3">
        <button
          type="button" onClick={toggle} disabled={!engineReady}
          aria-pressed={isRunning}
          className={cn(
            "flex items-center gap-3 pl-2 pr-3.5 py-2 rounded-full border transition-colors duration-200",
            isRunning ? "border-green-500/55 bg-linear-to-b from-green-500/18 to-green-900/40" : "border-slate-500/22 bg-linear-to-b from-[#1f2937] to-[#0f172a]",
            !engineReady && "opacity-45 cursor-not-allowed",
          )}
        >
          <span className={cn("relative w-11 h-7 rounded-full shrink-0 transition-colors duration-200 shadow-[inset_0_0_0_1px_var(--tw-border-color)] border-slate-500/18",
            isRunning ? "bg-green-500/25" : "bg-vmc-page")}>
            <span className={cn(
              "absolute top-0.5 left-0.5 w-6 h-6 rounded-full flex items-center justify-center shadow-[0_2px_6px_rgba(0,0,0,0.4)] transition-transform duration-200",
              isRunning ? "translate-x-4 bg-linear-to-b from-green-300 to-green-500 text-[#052e16]"
                : "bg-linear-to-b from-slate-50 to-slate-300 text-slate-700",
            )}>
              {isRunning
                ? <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
                : <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>}
            </span>
          </span>
          <span className={cn("text-xs font-semibold tracking-[0.01em] leading-tight", isRunning ? "text-green-300" : "text-slate-300")}>
            {isRunning ? "Running - tap to pause" : "Paused - tap to run"}
          </span>
        </button>
        <div className="flex gap-1.5">
          <Btn onClick={() => { simHandle?.reset(); setRunning(false); }} disabled={!engineReady} label="Reset">
            <path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" />
          </Btn>
          <Btn onClick={onResetCamera} label="Center">
            <circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
          </Btn>
        </div>
        <label className="grid gap-1.5">
          <span className="text-slate-400 text-[10px] tracking-[0.14em] uppercase">Track</span>
          <select value={trackId} onChange={e => setTrackId(e.target.value)}
            className="h-[34px] px-2.5 text-slate-50 border border-slate-500/22 rounded-[9px] bg-vmc-panel text-xs">
            {TRACKS.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <div className="grid gap-1.5">
          <span className="text-slate-400 text-[10px] tracking-[0.14em] uppercase">
            Placeable Objects
          </span>
          <PaletteOverlay />
          <p className="text-slate-500 text-[10px] leading-snug">
            Drag an item onto the canvas. Drop, rotate, or delete it there.
          </p>
        </div>
        <div onClick={() => setIot(!iotStatus)} role="switch" aria-checked={iotStatus}
          className="flex items-center justify-between gap-2.5 p-2.5 rounded-[11px] border border-slate-500/15 bg-[rgba(2,6,23,0.5)] cursor-pointer">
          <div>
            <strong className="block text-slate-50 text-xs font-semibold">IoT Bridge</strong>
          </div>
          <span className={cn("relative shrink-0 w-9 h-5 rounded-full transition-colors duration-200 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.2)]",
            iotStatus ? "bg-green-500/55" : "bg-[#1e293b]")}>
            <span className={cn("absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-slate-50 shadow-[0_1px_3px_rgba(0,0,0,0.4)] transition-transform duration-200",
              iotStatus && "translate-x-4")} />
          </span>
        </div>
      </div>
    </Panel>
  );
}
function Btn({ onClick, disabled, label, children }: { onClick: () => void; disabled?: boolean; label: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label}
      className="flex-1 min-h-[34px] border border-slate-500/24 rounded-[9px] bg-linear-to-b from-[#334155] to-[#1e293b]
                       text-slate-200 text-xs font-semibold inline-flex items-center justify-center gap-1
                       transition-[filter] duration-120 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
      {label}
    </button>
  );
}
