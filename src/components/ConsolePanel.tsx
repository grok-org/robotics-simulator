import { useEffect, useRef } from "react";
import { useSimulatorStore } from "../store/useSimulatorStore";
import { Panel } from "./Panel";
export function ConsolePanel() {
  const printLog = useSimulatorStore((s) => s.printLog);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [printLog]);
  return (
    <Panel title="Serial Output">
      <div ref={scrollRef} className="relative flex-1 min-h-0 overflow-auto p-2.5 bg-vmc-code-bg">
        {printLog.length === 0 ? (
          <p className="text-slate-500 text-[11px] leading-relaxed font-mono">
            {"// output appears here"}
          </p>
        ) : (
          <ul className="m-0 p-0 list-none flex flex-col gap-0.5">
            {printLog.map((line, index) => (
              <li
                key={index}
                className="text-green-300 text-[11.5px] leading-normal font-mono whitespace-pre-wrap wrap-break-word"
              >
                <span className="text-slate-600 select-none">{"> "}</span>
                {line}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
