import { cn } from "../utils/cn";

export interface CanvasToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  zoomPercentage: number;
  hasPlacedObjects: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  onClearCanvas: () => void;
}
function ToolButton({
  onClick,
  disabled,
  label,
  children,
  className,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "w-8 h-8 flex items-center justify-center rounded-md text-slate-200",
        "transition-colors duration-150",
        "hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400",
        disabled && "opacity-30 cursor-not-allowed hover:bg-transparent",
        className,
      )}
    >
      {children}
    </button>
  );
}
const Divider = () => (
  <span className="w-px h-5 bg-slate-500/30 mx-0.5 shrink-0" />
);
export function CanvasToolbar({
  canUndo,
  canRedo,
  zoomPercentage,
  hasPlacedObjects,
  onUndo,
  onRedo,
  onZoomIn,
  onZoomOut,
  onResetView,
  onClearCanvas,
}: CanvasToolbarProps) {
  return (
    <div
      className="absolute top-2 left-2 z-20 flex items-center gap-0.5 px-1.5 py-1 rounded-xl border border-slate-500/25 bg-slate-900/80 backdrop-blur shadow-lg"
      style={{ pointerEvents: "auto" }}
    >
      <ToolButton onClick={onUndo} disabled={!canUndo} label="Undo (placed objects)">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 14 4 9l5-5" />
          <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
        </svg>
      </ToolButton>
      <ToolButton onClick={onRedo} disabled={!canRedo} label="Redo (placed objects)">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 14 5-5-5-5" />
          <path d="M20 9H9a5 5 0 0 0 0 10h3" />
        </svg>
      </ToolButton>
      <Divider />
      <ToolButton onClick={onZoomOut} label="Zoom out">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3M8 11h6" />
        </svg>
      </ToolButton>
      <span className="w-12 text-center text-[11px] font-semibold tabular-nums text-slate-300 select-none">
        {zoomPercentage}%
      </span>
      <ToolButton onClick={onZoomIn} label="Zoom in">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3M11 8v6M8 11h6" />
        </svg>
      </ToolButton>
      <ToolButton onClick={onResetView} label="Reset view">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9V5a2 2 0 0 1 2-2h4" />
          <path d="M21 9V5a2 2 0 0 0-2-2h-4" />
          <path d="M3 15v4a2 2 0 0 0 2 2h4" />
          <path d="M21 15v4a2 2 0 0 1-2 2h-4" />
        </svg>
      </ToolButton>
      <Divider />
      <ToolButton
        onClick={onClearCanvas}
        disabled={!hasPlacedObjects}
        label="Clear all placed objects"
        className="hover:bg-red-500/20 hover:text-red-300"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18" />
          <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
          <path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" />
        </svg>
      </ToolButton>
    </div>
  );
}
