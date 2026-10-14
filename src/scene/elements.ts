import type {
  ElementType,
  FontFamily,
  LinearElement,
  Point,
  SceneElement,
  StyleProps,
  TextElement,
} from "../types";
import {
  boundaryPointTowards,
  boundsOfPoints,
  getCenter,
  hasPoints,
  isLinear,
} from "./geometry";

export const randomId = () =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const randomSeed = () => Math.floor(Math.random() * 2 ** 31);

export const FONT_FAMILIES: Record<FontFamily, string> = {
  1: "Kalam, 'Segoe Print', 'Comic Sans MS', cursive",
  2: "'Segoe UI', Helvetica, Arial, sans-serif",
  3: "'Cascadia Code', Consolas, 'Courier New', monospace",
};

export const LINE_HEIGHT = 1.35;

export const getFontString = (fontSize: number, fontFamily: FontFamily) =>
  `${fontSize}px ${FONT_FAMILIES[fontFamily]}`;

let measureCtx: CanvasRenderingContext2D | null = null;
export const measureText = (text: string, fontSize: number, fontFamily: FontFamily) => {
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d")!;
  measureCtx.font = getFontString(fontSize, fontFamily);
  const lines = text.split("\n");
  let width = 0;
  for (const line of lines) width = Math.max(width, measureCtx.measureText(line).width);
  return { width: Math.ceil(width) + 2, height: Math.ceil(lines.length * fontSize * LINE_HEIGHT) };
};

export const mutate = <T extends SceneElement>(el: T, patch: Partial<T>): T =>
  ({ ...el, ...patch, version: el.version + 1 }) as T;

export const newElement = (
  type: ElementType,
  x: number,
  y: number,
  style: StyleProps,
  extra: Partial<SceneElement> = {},
): SceneElement => {
  const base = {
    id: randomId(),
    x,
    y,
    width: 0,
    height: 0,
    angle: 0,
    strokeColor: style.strokeColor,
    backgroundColor: style.backgroundColor,
    fillStyle: style.fillStyle,
    strokeWidth: style.strokeWidth,
    strokeStyle: style.strokeStyle,
    roughness: style.roughness,
    opacity: style.opacity,
    roundness: style.roundness,
    seed: randomSeed(),
    version: 1,
    groupIds: [] as string[],
    locked: false,
    link: null,
  };
  let el: SceneElement;
  switch (type) {
    case "arrow":
    case "line":
      el = {
        ...base,
        type,
        points: [[0, 0]],
        startArrowhead: type === "arrow" ? style.startArrowhead : null,
        endArrowhead: type === "arrow" ? style.endArrowhead : null,
        startBinding: null,
        endBinding: null,
      };
      break;
    case "freedraw":
      el = { ...base, type, points: [[0, 0]], pressures: [], backgroundColor: "transparent" };
      break;
    case "text":
      el = {
        ...base,
        type,
        text: "",
        fontSize: style.fontSize,
        fontFamily: style.fontFamily,
        textAlign: style.textAlign,
        containerId: null,
        backgroundColor: "transparent",
      };
      break;
    case "image":
      el = { ...base, type, dataURL: "", backgroundColor: "transparent", strokeColor: "transparent" };
      break;
    default:
      el = { ...base, type };
  }
  return { ...el, ...extra } as SceneElement;
};

export const getAbsPoints = (el: SceneElement & { points: Point[] }): Point[] =>
  el.points.map(([x, y]) => [el.x + x, el.y + y] as Point);

/** Set scene-space points on a point-based element, re-normalizing x/y/width/height. */
export const withAbsPoints = <T extends SceneElement & { points: Point[] }>(
  el: T,
  abs: Point[],
  extra: Partial<T> = {},
): T => {
  const [minX, minY, maxX, maxY] = boundsOfPoints(abs);
  return mutate(el, {
    ...extra,
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    angle: 0,
    points: abs.map(([x, y]) => [x - minX, y - minY] as Point),
  } as Partial<T>);
};

export const refreshTextDimensions = (el: TextElement, patch: Partial<TextElement> = {}) => {
  const next = { ...el, ...patch };
  const { width, height } = measureText(next.text, next.fontSize, next.fontFamily);
  // keep the anchor according to alignment
  let x = next.x;
  if (!next.containerId) {
    if (next.textAlign === "center") x = next.x + (el.width - width) / 2;
    else if (next.textAlign === "right") x = next.x + el.width - width;
  }
  return mutate(el, { ...patch, width, height, x } as Partial<TextElement>);
};

export const getBoundText = (elements: readonly SceneElement[], containerId: string) =>
  elements.find((e) => e.type === "text" && e.containerId === containerId) as
    | TextElement
    | undefined;

const near = (a: number, b: number) => Math.abs(a - b) < 0.01;

const syncContainedText = (text: TextElement, container: SceneElement): TextElement => {
  const [cx, cy] = getCenter(container);
  const x = cx - text.width / 2;
  const y = cy - text.height / 2;
  if (near(x, text.x) && near(y, text.y) && near(text.angle, container.angle)) return text;
  return mutate(text, { x, y, angle: container.angle });
};

const syncArrow = (el: LinearElement, map: Map<string, SceneElement>): LinearElement => {
  let { startBinding, endBinding } = el;
  const startTarget = startBinding ? map.get(startBinding.elementId) : undefined;
  const endTarget = endBinding ? map.get(endBinding.elementId) : undefined;
  if (startBinding && !startTarget) startBinding = null;
  if (endBinding && !endTarget) endBinding = null;
  const abs = getAbsPoints(el);
  const n = abs.length;
  if (n < 2) return el;
  if (startTarget && startBinding) {
    const ref: Point =
      n > 2 ? abs[1] : endTarget && endBinding ? getCenter(endTarget) : abs[n - 1];
    abs[0] = boundaryPointTowards(startTarget, ref);
  }
  if (endTarget && endBinding) {
    const ref: Point =
      n > 2 ? abs[n - 2] : startTarget && startBinding ? getCenter(startTarget) : abs[0];
    abs[n - 1] = boundaryPointTowards(endTarget, ref);
  }
  const old = getAbsPoints(el);
  const changed =
    startBinding !== el.startBinding ||
    endBinding !== el.endBinding ||
    abs.some((p, i) => !near(p[0], old[i][0]) || !near(p[1], old[i][1]));
  if (!changed) return el;
  return withAbsPoints(el, abs, { startBinding, endBinding });
};

/** Keep bound texts centred in containers and bound arrows attached to their targets. */
export const syncBindings = (elements: SceneElement[]): SceneElement[] => {
  let changed = false;
  let map = new Map(elements.map((e) => [e.id, e]));
  let out = elements.map((el) => {
    if (el.type === "text" && el.containerId) {
      const c = map.get(el.containerId);
      if (!c) return el;
      const next = syncContainedText(el, c);
      if (next !== el) changed = true;
      return next;
    }
    return el;
  });
  if (changed) map = new Map(out.map((e) => [e.id, e]));
  out = out.map((el) => {
    if (isLinear(el) && (el.startBinding || el.endBinding)) {
      const next = syncArrow(el, map);
      if (next !== el) changed = true;
      return next;
    }
    return el;
  });
  return changed ? out : elements;
};

/** Remove elements plus anything that only makes sense with them (bound text). */
export const deleteElements = (elements: SceneElement[], ids: Set<string>) => {
  const all = new Set(ids);
  for (const el of elements) {
    if (el.type === "text" && el.containerId && all.has(el.containerId)) all.add(el.id);
  }
  return syncBindings(elements.filter((e) => !all.has(e.id)));
};

/** Clone elements with fresh ids, remapping groups, bindings and containers. */
export const duplicateElements = (
  els: readonly SceneElement[],
  dx = 0,
  dy = 0,
): SceneElement[] => {
  const idMap = new Map<string, string>();
  const groupMap = new Map<string, string>();
  for (const el of els) idMap.set(el.id, randomId());
  return els.map((el) => {
    const copy: any = {
      ...structuredClone(el),
      id: idMap.get(el.id)!,
      x: el.x + dx,
      y: el.y + dy,
      seed: randomSeed(),
      version: 1,
      groupIds: el.groupIds.map((g) => {
        if (!groupMap.has(g)) groupMap.set(g, randomId());
        return groupMap.get(g)!;
      }),
    };
    if (isLinear(el)) {
      copy.startBinding =
        el.startBinding && idMap.has(el.startBinding.elementId)
          ? { elementId: idMap.get(el.startBinding.elementId)! }
          : null;
      copy.endBinding =
        el.endBinding && idMap.has(el.endBinding.elementId)
          ? { elementId: idMap.get(el.endBinding.elementId)! }
          : null;
    }
    if (el.type === "text" && el.containerId) {
      copy.containerId = idMap.get(el.containerId) ?? null;
    }
    return copy as SceneElement;
  });
};

/** Move an element (and its points) by dx/dy */
export const translateElement = (el: SceneElement, dx: number, dy: number) =>
  mutate(el, { x: el.x + dx, y: el.y + dy });

/** Rotate an element around an arbitrary pivot. Point-based elements get the rotation baked in. */
export const rotateElementAround = (
  el: SceneElement,
  cx: number,
  cy: number,
  delta: number,
): SceneElement => {
  if (hasPoints(el)) {
    const abs = getAbsPoints(el).map(([x, y]) => rotatePt(x, y, cx, cy, delta));
    return withAbsPoints(el, abs);
  }
  const [ecx, ecy] = getCenter(el);
  const [ncx, ncy] = rotatePt(ecx, ecy, cx, cy, delta);
  return mutate(el, {
    x: ncx - el.width / 2,
    y: ncy - el.height / 2,
    angle: normalizeAngle(el.angle + delta),
  });
};

const rotatePt = (x: number, y: number, cx: number, cy: number, a: number): Point => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];
};

export const normalizeAngle = (a: number) => {
  const TWO_PI = Math.PI * 2;
  a %= TWO_PI;
  if (a < 0) a += TWO_PI;
  return a;
};

/** Scale an element's geometry relative to an origin point (used for multi-resize). */
export const scaleElementFrom = (
  el: SceneElement,
  ox: number,
  oy: number,
  sx: number,
  sy: number,
): SceneElement => {
  if (hasPoints(el)) {
    const abs = getAbsPoints(el).map(
      ([x, y]) => [ox + (x - ox) * sx, oy + (y - oy) * sy] as Point,
    );
    return withAbsPoints(el, abs);
  }
  const [cx, cy] = getCenter(el);
  const ncx = ox + (cx - ox) * sx;
  const ncy = oy + (cy - oy) * sy;
  const w = el.width * Math.abs(sx);
  const h = el.height * Math.abs(sy);
  if (el.type === "text") {
    const fontSize = Math.max(4, el.fontSize * Math.abs(sx));
    const { width, height } = measureText(el.text, fontSize, el.fontFamily);
    return mutate(el, { fontSize, width, height, x: ncx - width / 2, y: ncy - height / 2 });
  }
  return mutate(el, { width: w, height: h, x: ncx - w / 2, y: ncy - h / 2 });
};

/** Expand an id list to whole groups (outermost group) and bound text. */
export const expandSelection = (elements: readonly SceneElement[], ids: string[]) => {
  const set = new Set(ids);
  const groups = new Set<string>();
  for (const el of elements) {
    if (set.has(el.id) && el.groupIds.length) groups.add(el.groupIds[el.groupIds.length - 1]);
  }
  if (groups.size) {
    for (const el of elements) {
      if (el.groupIds.some((g) => groups.has(g))) set.add(el.id);
    }
  }
  return [...set];
};

export const withBoundTexts = (elements: readonly SceneElement[], ids: Iterable<string>) => {
  const set = new Set(ids);
  for (const el of elements) {
    if (el.type === "text" && el.containerId && set.has(el.containerId)) set.add(el.id);
  }
  return set;
};

/** Pull an .excalidraw (or our own) element into the Scribbly shape, tolerating missing fields. */
export const restoreElement = (raw: any): SceneElement | null => {
  if (!raw || typeof raw !== "object" || raw.isDeleted) return null;
  const allowed = ["rectangle", "diamond", "ellipse", "arrow", "line", "freedraw", "text", "image"];
  if (!allowed.includes(raw.type)) return null;
  const el: any = {
    id: String(raw.id ?? randomId()),
    type: raw.type,
    x: Number(raw.x) || 0,
    y: Number(raw.y) || 0,
    width: Number(raw.width) || 0,
    height: Number(raw.height) || 0,
    angle: Number(raw.angle) || 0,
    strokeColor: raw.strokeColor ?? "#1e1e1e",
    backgroundColor: raw.backgroundColor ?? "transparent",
    fillStyle: raw.fillStyle ?? "solid",
    strokeWidth: Number(raw.strokeWidth) || 2,
    strokeStyle: raw.strokeStyle ?? "solid",
    roughness: raw.roughness ?? 1,
    opacity: raw.opacity ?? 100,
    roundness: typeof raw.roundness === "boolean" ? raw.roundness : !!raw.roundness,
    seed: raw.seed ?? randomSeed(),
    version: raw.version ?? 1,
    groupIds: Array.isArray(raw.groupIds) ? raw.groupIds : [],
    locked: !!raw.locked,
    link: raw.link ?? null,
  };
  if (raw.type === "arrow" || raw.type === "line" || raw.type === "freedraw") {
    const pts: Point[] = Array.isArray(raw.points) && raw.points.length ? raw.points : [[0, 0]];
    const abs = pts.map(([px, py]) => [el.x + px, el.y + py] as Point);
    if (el.angle) {
      const [minX, minY, maxX, maxY] = boundsOfPoints(abs);
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      for (let i = 0; i < abs.length; i++) abs[i] = rotatePt(abs[i][0], abs[i][1], cx, cy, el.angle);
    }
    if (raw.type === "freedraw") {
      el.pressures = Array.isArray(raw.pressures) ? raw.pressures : [];
    } else {
      el.startArrowhead = raw.startArrowhead ?? null;
      el.endArrowhead = raw.endArrowhead ?? null;
      el.startBinding = raw.startBinding?.elementId ? { elementId: raw.startBinding.elementId } : null;
      el.endBinding = raw.endBinding?.elementId ? { elementId: raw.endBinding.elementId } : null;
    }
    el.points = [[0, 0]];
    return withAbsPoints(el, abs, { version: el.version } as any);
  }
  if (raw.type === "text") {
    el.text = String(raw.originalText ?? raw.text ?? "");
    el.fontSize = Number(raw.fontSize) || 20;
    el.fontFamily = [1, 2, 3].includes(raw.fontFamily) ? raw.fontFamily : 1;
    el.textAlign = raw.textAlign ?? "left";
    el.containerId = raw.containerId ?? null;
  }
  if (raw.type === "image") {
    el.dataURL = raw.dataURL ?? "";
  }
  return el as SceneElement;
};
