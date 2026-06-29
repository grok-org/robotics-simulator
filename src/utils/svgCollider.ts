import type { Vector } from "../types/vmc";

interface Pt {
  x: number;
  y: number;
}
const TOKEN_RE = /[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
function isNumToken(t: string | undefined): boolean {
  return !!t && /[0-9.]/.test(t) && !/[a-zA-Z]/.test(t);
}
function parseViewBox(svg: string): { w: number; h: number } {
  const vb = svg.match(
    /<svg[^>]*viewBox=["']\s*[-\d.eE+]+\s*[, ]\s*[-\d.eE+]+\s*[, ]\s*([-\d.eE+]+)\s*[, ]\s*([-\d.eE+]+)/i,
  );
  if (vb) {
    const w = parseFloat(vb[1]);
    const h = parseFloat(vb[2]);
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return { w, h };
  }
  const wMatch = svg.match(/<svg[^>]*\swidth=["']([-\d.eE+]+)/i);
  const hMatch = svg.match(/<svg[^>]*\sheight=["']([-\d.eE+]+)/i);
  return {
    w: wMatch ? parseFloat(wMatch[1]) || 100 : 100,
    h: hMatch ? parseFloat(hMatch[1]) || 100 : 100,
  };
}
function sampleCubic(
  out: Pt[],
  p0: Pt,
  p1: Pt,
  p2: Pt,
  p3: Pt,
  steps = 14,
): void {
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    const u = 1 - t;
    out.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    });
  }
}
function sampleQuad(out: Pt[], p0: Pt, p1: Pt, p2: Pt, steps = 12): void {
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    const u = 1 - t;
    out.push({
      x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
      y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
    });
  }
}

function tokenizePath(d: string): Pt[] {
  const tokens = d.match(TOKEN_RE) ?? [];
  const pts: Pt[] = [];
  let i = 0;
  let cur: Pt = { x: 0, y: 0 };
  let start: Pt = { x: 0, y: 0 };
  let lastCtrl: Pt | null = null;
  const num = () => parseFloat(tokens[i++]);
  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (!cmd || /[a-zA-Z]/.test(cmd) === false) continue;
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    switch (C) {
      case "M": {
        let x = num();
        let y = num();
        if (rel) { x += cur.x; y += cur.y; }
        cur = { x, y };
        start = { x, y };
        pts.push(cur);
        while (isNumToken(tokens[i]) && isNumToken(tokens[i + 1])) {
          let lx = num();
          let ly = num();
          if (rel) { lx += cur.x; ly += cur.y; }
          cur = { x: lx, y: ly };
          pts.push(cur);
        }
        lastCtrl = null;
        break;
      }
      case "L": {
        while (isNumToken(tokens[i]) && isNumToken(tokens[i + 1])) {
          let x = num();
          let y = num();
          if (rel) { x += cur.x; y += cur.y; }
          cur = { x, y };
          pts.push(cur);
        }
        lastCtrl = null;
        break;
      }
      case "H": {
        while (isNumToken(tokens[i])) {
          let x = num();
          if (rel) x += cur.x;
          cur = { x, y: cur.y };
          pts.push(cur);
        }
        lastCtrl = null;
        break;
      }
      case "V": {
        while (isNumToken(tokens[i])) {
          let y = num();
          if (rel) y += cur.y;
          cur = { x: cur.x, y };
          pts.push(cur);
        }
        lastCtrl = null;
        break;
      }
      case "C": {
        while (
          isNumToken(tokens[i]) && isNumToken(tokens[i + 1]) &&
          isNumToken(tokens[i + 2]) && isNumToken(tokens[i + 3]) &&
          isNumToken(tokens[i + 4]) && isNumToken(tokens[i + 5])
        ) {
          let x1 = num(), y1 = num(), x2 = num(), y2 = num(), x = num(), y = num();
          if (rel) {
            x1 += cur.x; y1 += cur.y;
            x2 += cur.x; y2 += cur.y;
            x += cur.x; y += cur.y;
          }
          sampleCubic(pts, cur, { x: x1, y: y1 }, { x: x2, y: y2 }, { x, y });
          lastCtrl = { x: x2, y: y2 };
          cur = { x, y };
        }
        break;
      }
      case "Q": {
        while (
          isNumToken(tokens[i]) && isNumToken(tokens[i + 1]) &&
          isNumToken(tokens[i + 2]) && isNumToken(tokens[i + 3])
        ) {
          let x1 = num(), y1 = num(), x = num(), y = num();
          if (rel) {
            x1 += cur.x; y1 += cur.y;
            x += cur.x; y += cur.y;
          }
          sampleQuad(pts, cur, { x: x1, y: y1 }, { x, y });
          lastCtrl = { x: x1, y: y1 };
          cur = { x, y };
        }
        break;
      }
      case "S":
      case "T": {

        const reflect: Pt = lastCtrl
          ? { x: 2 * cur.x - lastCtrl.x, y: 2 * cur.y - lastCtrl.y }
          : { x: cur.x, y: cur.y };
        if (C === "S") {
          if (
            isNumToken(tokens[i]) && isNumToken(tokens[i + 1]) &&
            isNumToken(tokens[i + 2]) && isNumToken(tokens[i + 3])
          ) {
            let x2 = num(), y2 = num(), x = num(), y = num();
            if (rel) { x2 += cur.x; y2 += cur.y; x += cur.x; y += cur.y; }
            sampleCubic(pts, cur, reflect, { x: x2, y: y2 }, { x, y });
            lastCtrl = { x: x2, y: y2 };
            cur = { x, y };
          }
        } else {
          if (isNumToken(tokens[i]) && isNumToken(tokens[i + 1])) {
            let x = num(), y = num();
            if (rel) { x += cur.x; y += cur.y; }
            sampleQuad(pts, cur, reflect, { x, y });
            lastCtrl = reflect;
            cur = { x, y };
          }
        }
        break;
      }
      case "A": {

        if (
          isNumToken(tokens[i]) && isNumToken(tokens[i + 1]) &&
          isNumToken(tokens[i + 2]) && isNumToken(tokens[i + 3]) &&
          isNumToken(tokens[i + 4]) && isNumToken(tokens[i + 5]) &&
          isNumToken(tokens[i + 6])
        ) {
          i += 5;
          i += 1;
          let x = num(), y = num();
          if (rel) { x += cur.x; y += cur.y; }
          cur = { x, y };
          pts.push(cur);
          lastCtrl = null;
        }
        break;
      }
      case "Z": {
        cur = { x: start.x, y: start.y };
        lastCtrl = null;
        break;
      }
      default:
        lastCtrl = null;
        break;
    }
  }
  return pts;
}
function collectPoints(svgAsset: string): Pt[] {
  const pts: Pt[] = [];
  try {
    const doc = new DOMParser().parseFromString(svgAsset, "image/svg+xml");
    for (const path of Array.from(doc.querySelectorAll("path"))) {
      const d = path.getAttribute("d");
      if (d) pts.push(...tokenizePath(d));
    }
    for (const el of Array.from(doc.querySelectorAll("polygon,polyline"))) {
      const raw = el.getAttribute("points");
      if (!raw) continue;
      const coords = raw.match(/-?(?:\d+\.?\d*|\.\d+)/g) ?? [];
      for (let k = 0; k + 1 < coords.length; k += 2) {
        pts.push({ x: parseFloat(coords[k]), y: parseFloat(coords[k + 1]) });
      }
    }
  } catch {

    const coords = svgAsset.match(/-?(?:\d+\.?\d*|\.\d+)/g) ?? [];
    for (let k = 0; k + 1 < coords.length; k += 2) {
      pts.push({ x: parseFloat(coords[k]), y: parseFloat(coords[k + 1]) });
    }
  }
  return pts.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
}
function cross(O: Pt, A: Pt, B: Pt): number {
  return (A.x - O.x) * (B.y - O.y) - (A.y - O.y) * (B.x - O.x);
}

function convexHull(points: Pt[]): Pt[] {
  if (points.length < 3) return points.slice();
  const pts = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const lower: Pt[] = [];
  for (const p of pts) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
    ) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
    ) {
      upper.pop();
    }
    upper.push(p);
  }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  return hull.length >= 3 ? hull : pts;
}
export function extractConvexHull(svgAsset: string): Vector[] {
  const hull = convexHull(collectPoints(svgAsset));
  if (hull.length === 0) return [];
  const { w, h } = parseViewBox(svgAsset);
  const cx = w / 2;
  const cy = h / 2;
  return hull.map((p) => ({ x: p.x - cx, y: p.y - cy }));
}
