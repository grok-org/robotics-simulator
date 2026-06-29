import { useState } from "react";
import type { CodePreviewProps } from "../types/vmc";
import { Panel } from "./Panel";
export function CodePreview({ code }: CodePreviewProps) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    if (!code) return;
    navigator.clipboard.writeText(code)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(console.error);
  };
  return (
    <Panel title="Code Preview">
      <div className="relative flex-1 min-h-0 overflow-auto p-2.5 bg-vmc-code-bg group">
        {code && (
          <button
            onClick={handleCopy}
            className="absolute top-2 right-2 px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-opacity opacity-0 group-hover:opacity-100 focus:opacity-100"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        )}
        <pre className="m-0 text-green-300 text-[11.5px] leading-[1.55] font-mono whitespace-pre-wrap break-all pr-14">
          <code>{code || "# Blockly output appears here"}</code>
        </pre>
      </div>
    </Panel>
  );
}
