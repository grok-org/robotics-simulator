import { PALETTE_ITEMS } from "../utils/paletteRegistry";
import { SvgShape } from "./SvgShape";

function PaletteItemPreview({ svgAsset }: { svgAsset: string }) {
  return <SvgShape svgAsset={svgAsset} className="w-10 h-10" />;
}
export function PaletteOverlay() {
  return (
    <div
      className="grid gap-1.5"
      style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}
    >
      {PALETTE_ITEMS.map((item) => (
        <div
          key={item.id}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("paletteItemId", item.id);
            e.dataTransfer.effectAllowed = "copy";
          }}
          title={`Drag ${item.label} onto the canvas`}
          className="group flex flex-col items-center gap-1 p-2 rounded-[9px] border border-slate-500/20 bg-linear-to-b from-[#334155] to-[#1e293b] cursor-grab active:cursor-grabbing transition-[filter] duration-120 hover:brightness-110 select-none"
        >
          <PaletteItemPreview svgAsset={item.svgAsset} />
          <span className="text-[10px] font-medium text-slate-300 group-hover:text-white">
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}
