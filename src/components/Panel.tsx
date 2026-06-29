import { cn } from "../utils/cn";
import type { PanelProps } from "../types/vmc";
export function Panel({
    title,
    toolbar,
    children,
    className,
}: PanelProps) {
    return (
        <section
            className={cn(

                "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[14px]",
                "border border-slate-500/18",
                "bg-linear-to-b from-vmc-card to-vmc-panel",
                className,
            )}
        >
            <header
                className="
                    flex shrink-0 items-center justify-between gap-3
                    h-9 px-3
                    border-b border-slate-500/14
                    bg-vmc-panel/60
                "
            >
                <h2
                    className="
                        min-w-0 flex-1 truncate
                        text-[10px] font-bold uppercase
                        tracking-[0.18em] text-blue-300
                    "
                >
                    {title}
                </h2>
                {toolbar && (
                    <div
                        className="
                            flex shrink-0 items-center gap-2
                            text-sm font-normal tracking-normal
                        "
                    >
                        {toolbar}
                    </div>
                )}
            </header>
            { }
            <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden">
                {children}
            </div>
        </section>
    );
}
