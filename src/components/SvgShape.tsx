import { useLayoutEffect, useRef } from "react";
import { cn } from "../utils/cn";
import { mountSvg } from "../utils/svgAssets";

export function SvgShape({
  svgAsset,
  className,
}: {
  svgAsset: string;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!hostRef.current) return;
    mountSvg(hostRef.current, svgAsset, {
      fillContainer: true,
      preserveAspectRatio: "xMidYMid meet",
    });
  }, [svgAsset]);
  return <div ref={hostRef} className={cn("w-full h-full", className)} />;
}
