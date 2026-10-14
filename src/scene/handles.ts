import type { Point, SceneElement } from "../types";
import { getCommonBounds, hasPoints, isLinear, rotatePoint } from "./geometry";

export type HandleType = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw" | "rotation";

export const HANDLE_SIZE = 9;
export const SELECTION_PADDING = 5;

export interface TransformTarget {
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
}

export type Handles = Partial<Record<HandleType, Point>>;

/** Where the transform box sits for the current selection (null = no transform box). */
export const getTransformTarget = (selected: SceneElement[]): TransformTarget | null => {
  if (!selected.length) return null;
  if (selected.length === 1) {
    const el = selected[0];
    if (isLinear(el) && el.points.length === 2) return null; // point handles only
    if (hasPoints(el) || el.type !== "text" || !el.containerId) {
      return { x: el.x, y: el.y, width: el.width, height: el.height, angle: el.angle };
    }
  }
  const [minX, minY, maxX, maxY] = getCommonBounds(selected);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY, angle: 0 };
};

export const getHandles = (
  t: TransformTarget,
  zoom: number,
  { cornersOnly = false }: { cornersOnly?: boolean } = {},
): Handles => {
  const p = SELECTION_PADDING / zoom;
  const cx = t.x + t.width / 2;
  const cy = t.y + t.height / 2;
  const left = t.x - p;
  const right = t.x + t.width + p;
  const top = t.y - p;
  const bottom = t.y + t.height + p;
  const local: Handles = {
    nw: [left, top],
    ne: [right, top],
    sw: [left, bottom],
    se: [right, bottom],
    rotation: [cx, top - 24 / zoom],
  };
  const screenW = t.width * zoom;
  const screenH = t.height * zoom;
  if (!cornersOnly) {
    if (screenW > 40) {
      local.n = [cx, top];
      local.s = [cx, bottom];
    }
    if (screenH > 40) {
      local.w = [left, cy];
      local.e = [right, cy];
    }
  }
  const out: Handles = {};
  for (const key of Object.keys(local) as HandleType[]) {
    const [x, y] = local[key]!;
    out[key] = rotatePoint(x, y, cx, cy, t.angle);
  }
  return out;
};

export const getHandleAt = (handles: Handles, px: number, py: number, zoom: number) => {
  const r = (HANDLE_SIZE / 2 + 3) / zoom;
  for (const key of Object.keys(handles) as HandleType[]) {
    const [x, y] = handles[key]!;
    if (Math.abs(px - x) <= r && Math.abs(py - y) <= r) return key;
  }
  return null;
};

const HANDLE_ANGLES: Record<Exclude<HandleType, "rotation">, number> = {
  e: 0,
  se: 45,
  s: 90,
  sw: 135,
  w: 180,
  nw: 225,
  n: 270,
  ne: 315,
};

export const getHandleCursor = (handle: HandleType, angle: number) => {
  if (handle === "rotation") return "grab";
  const deg = (HANDLE_ANGLES[handle] + (angle * 180) / Math.PI) % 180;
  const idx = Math.round(((deg + 180) % 180) / 45) % 4;
  return ["ew-resize", "nwse-resize", "ns-resize", "nesw-resize"][idx];
};
