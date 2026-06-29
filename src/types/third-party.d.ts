declare module "*?raw" {
  const content: string;
  export default content;
}
declare module "react-split" {
  import type { ComponentType, ReactNode } from "react";
  export interface SplitProps {
    className?: string;
    sizes?: number[];
    minSize?: number | number[];
    maxSize?: number | number[];
    expandToMin?: boolean;
    gutterSize?: number;
    gutterAlign?: "start" | "center" | "end";
    snapOffset?: number;
    dragInterval?: number;
    direction?: "horizontal" | "vertical";
    cursor?: string;
    onDrag?: (sizes: number[]) => void;
    onDragStart?: (sizes: number[]) => void;
    onDragEnd?: (sizes: number[]) => void;
    children?: ReactNode;
  }
  const Split: ComponentType<SplitProps>;
  export default Split;
}
declare module "consola/browser" {
  export interface ConsolaInstance {
    info(message: string, ...args: unknown[]): void;
    success(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
    debug(message: string, ...args: unknown[]): void;
    withTag(tag: string): ConsolaInstance;
  }
  export function createConsola(options?: Record<string, unknown>): ConsolaInstance;
}
declare module '*.css' {
  const content: { [className: string]: string };
  export default content;
}
