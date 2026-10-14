import type { Point, SceneElement } from "../types";

export type Bounds = [minX: number, minY: number, maxX: number, maxY: number];

export const rotatePoint = (
  x: number,
  y: number,
  cx: number,
  cy: number,
  angle: number,
): Point => {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = x - cx;
  const dy = y - cy;
  return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
};

export const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export const getCenter = (el: SceneElement): Point => [
  el.x + el.width / 2,
  el.y + el.height / 2,
];

export const isLinear = (el: SceneElement): el is Extract<SceneElement, { type: "arrow" | "line" }> =>
  el.type === "arrow" || el.type === "line";

export const hasPoints = (
  el: SceneElement,
): el is Extract<SceneElement, { type: "arrow" | "line" | "freedraw" }> =>
  el.type === "arrow" || el.type === "line" || el.type === "freedraw";

export const isBindable = (el: SceneElement) =>
  el.type === "rectangle" ||
  el.type === "diamond" ||
  el.type === "ellipse" ||
  el.type === "image" ||
  (el.type === "text" && !el.containerId);

export const isTextContainer = (el: SceneElement) =>
  el.type === "rectangle" || el.type === "diamond" || el.type === "ellipse";

/** Scene point -> element-local, unrotated coordinates (0,0 = element top-left). */
export const toLocal = (el: SceneElement, px: number, py: number): Point => {
  const [cx, cy] = getCenter(el);
  const [rx, ry] = rotatePoint(px, py, cx, cy, -el.angle);
  return [rx - el.x, ry - el.y];
};

export const toScene = (el: SceneElement, lx: number, ly: number): Point => {
  const [cx, cy] = getCenter(el);
  return rotatePoint(el.x + lx, el.y + ly, cx, cy, el.angle);
};

export const getCorners = (el: SceneElement): Point[] => [
  toScene(el, 0, 0),
  toScene(el, el.width, 0),
  toScene(el, el.width, el.height),
  toScene(el, 0, el.height),
];

export const boundsOfPoints = (pts: Point[]): Bounds => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
};

export const getElementBounds = (el: SceneElement): Bounds => {
  if (hasPoints(el)) {
    return boundsOfPoints(el.points.map(([x, y]) => [el.x + x, el.y + y] as Point));
  }
  return boundsOfPoints(getCorners(el));
};

export const getCommonBounds = (els: readonly SceneElement[]): Bounds => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of els) {
    const [a, b, c, d] = getElementBounds(el);
    minX = Math.min(minX, a);
    minY = Math.min(minY, b);
    maxX = Math.max(maxX, c);
    maxY = Math.max(maxY, d);
  }
  return [minX, minY, maxX, maxY];
};

export const distToSegment = (p: Point, a: Point, b: Point) => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
};

export const pointInPolygon = (p: Point, poly: Point[]) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
};

const diamondPoints = (w: number, h: number): Point[] => [
  [w / 2, 0],
  [w, h / 2],
  [w / 2, h],
  [0, h / 2],
];

const minDistToPolyline = (p: Point, pts: Point[], closed = false) => {
  let min = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    min = Math.min(min, distToSegment(p, pts[i], pts[i + 1]));
  }
  if (closed && pts.length > 2) {
    min = Math.min(min, distToSegment(p, pts[pts.length - 1], pts[0]));
  }
  if (pts.length === 1) min = distance(p, pts[0]);
  return min;
};

export const isClosedPath = (pts: Point[]) =>
  pts.length > 2 && distance(pts[0], pts[pts.length - 1]) < 8;

/** Is the scene point strictly within the element's area (ignores fill). */
export const isInsideShape = (el: SceneElement, px: number, py: number) => {
  const [lx, ly] = toLocal(el, px, py);
  const { width: w, height: h } = el;
  switch (el.type) {
    case "ellipse": {
      const rx = w / 2;
      const ry = h / 2;
      if (rx === 0 || ry === 0) return false;
      return ((lx - rx) / rx) ** 2 + ((ly - ry) / ry) ** 2 <= 1;
    }
    case "diamond":
      return pointInPolygon([lx, ly], diamondPoints(w, h));
    case "line":
    case "arrow":
    case "freedraw":
      return isClosedPath(el.points) && pointInPolygon([lx, ly], el.points);
    default:
      return lx >= 0 && lx <= w && ly >= 0 && ly <= h;
  }
};

/** Pointer hit-test, taking fill into account (transparent shapes only hit on the stroke). */
export const hitTest = (el: SceneElement, px: number, py: number, tol: number) => {
  const [lx, ly] = toLocal(el, px, py);
  const p: Point = [lx, ly];
  const { width: w, height: h } = el;
  const filled = el.backgroundColor !== "transparent";
  const t = tol + el.strokeWidth / 2;
  switch (el.type) {
    case "text":
    case "image":
      return lx >= -tol && lx <= w + tol && ly >= -tol && ly <= h + tol;
    case "rectangle": {
      if (filled && lx >= 0 && lx <= w && ly >= 0 && ly <= h) return true;
      return (
        minDistToPolyline(
          p,
          [
            [0, 0],
            [w, 0],
            [w, h],
            [0, h],
          ],
          true,
        ) <= t
      );
    }
    case "diamond": {
      const poly = diamondPoints(w, h);
      if (filled && pointInPolygon(p, poly)) return true;
      return minDistToPolyline(p, poly, true) <= t;
    }
    case "ellipse": {
      const rx = w / 2;
      const ry = h / 2;
      if (rx < 1 || ry < 1) return Math.abs(lx - rx) <= t + rx && Math.abs(ly - ry) <= t + ry;
      const v = Math.sqrt(((lx - rx) / rx) ** 2 + ((ly - ry) / ry) ** 2);
      if (filled && v <= 1) return true;
      return Math.abs(v - 1) * Math.min(rx, ry) <= t;
    }
    case "line":
    case "arrow":
    case "freedraw": {
      if (filled && isClosedPath(el.points) && pointInPolygon(p, el.points)) return true;
      const extra = el.type === "freedraw" ? el.strokeWidth * 1.5 : 0;
      return minDistToPolyline(p, el.points) <= t + extra;
    }
  }
};

/** Point on the boundary of `target` on the ray from its center towards `ref`, pushed out by `gap`. */
export const boundaryPointTowards = (
  target: SceneElement,
  ref: Point,
  gap = 6,
): Point => {
  const [cx, cy] = getCenter(target);
  let dx = ref[0] - cx;
  let dy = ref[1] - cy;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) {
    dx = 1;
    dy = 0;
  } else {
    dx /= len;
    dy /= len;
  }
  let lo = 0;
  let hi = Math.hypot(target.width, target.height) / 2 + 2;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    if (isInsideShape(target, cx + dx * mid, cy + dy * mid)) lo = mid;
    else hi = mid;
  }
  return [cx + dx * (hi + gap), cy + dy * (hi + gap)];
};

export const snapAngle = (origin: Point, p: Point, stepDeg = 15): Point => {
  const dx = p[0] - origin[0];
  const dy = p[1] - origin[1];
  const len = Math.hypot(dx, dy);
  const step = (stepDeg * Math.PI) / 180;
  const a = Math.round(Math.atan2(dy, dx) / step) * step;
  return [origin[0] + Math.cos(a) * len, origin[1] + Math.sin(a) * len];
};

export const boundsIntersect = (a: Bounds, b: Bounds) =>
  a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
