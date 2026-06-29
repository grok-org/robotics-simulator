
export interface MountSvgOptions {
  width?: number | string;
  height?: number | string;
  cssClass?: string;
  preserveAspectRatio?: string;
  fillContainer?: boolean;
  pointerEvents?: boolean;
}

export function mountSvg(
  host: HTMLElement,
  svgAsset: string,
  options: MountSvgOptions = {},
): SVGSVGElement | null {
  host.innerHTML = svgAsset;
  const svg = host.querySelector("svg");
  if (!svg) return null;
  if (options.fillContainer) {
    svg.removeAttribute("width");
    svg.removeAttribute("height");
    svg.style.width = "100%";
    svg.style.height = "100%";
  } else {
    if (options.width !== undefined) svg.setAttribute("width", String(options.width));
    if (options.height !== undefined) svg.setAttribute("height", String(options.height));
  }
  if (options.preserveAspectRatio) {
    svg.setAttribute("preserveAspectRatio", options.preserveAspectRatio);
  }
  if (options.cssClass) {
    svg.setAttribute("class", options.cssClass);
  }
  svg.style.display = "block";
  svg.style.overflow = "visible";
  svg.style.pointerEvents = options.pointerEvents ? "auto" : "none";
  return svg;
}
