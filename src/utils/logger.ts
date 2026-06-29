import { createConsola } from "consola/browser";

export const log = createConsola({
  level: 0, 
  defaults: { tag: "vmc" },
});

export function scopedLogger(scope: string) {
  return log.withTag(scope);
}
