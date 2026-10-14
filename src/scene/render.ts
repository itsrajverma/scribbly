import rough from "roughjs";
import type { RoughCanvas } from "roughjs/bin/canvas";
import type { AppState, SceneElement } from "../types";
import { getFontString, LINE_HEIGHT } from "./elements";
import {
  boundsIntersect,
  getCommonBounds,
  getElementBounds,
  isLinear,
} from "./geometry";
import { getHandles, getTransformTarget, HANDLE_SIZE, SELECTION_PADDING } from "./handles";
import { getImage } from "./images";
import { getFreedrawPath, getShapes } from "./shapes";

export const ACCENT = "#6965db";
export const GRID_SIZE = 20;

const pathCache = new WeakMap<SceneElement, Path2D>();

export const renderElement = (
  ctx: CanvasRenderingContext2D,
  rc: RoughCanvas,
  el: SceneElement,
  alpha = 1,
) => {
  ctx.save();
  ctx.globalAlpha = (el.opacity / 100) * alpha;
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  ctx.translate(cx, cy);
  ctx.rotate(el.angle);
  ctx.translate(-el.width / 2, -el.height / 2);
  switch (el.type) {
    case "freedraw": {
      let path = pathCache.get(el);
      if (!path) {
        path = new Path2D(getFreedrawPath(el));
        pathCache.set(el, path);
      }
      ctx.fillStyle = el.strokeColor;
      ctx.fill(path);
      break;
    }
    case "text": {
      ctx.font = getFontString(el.fontSize, el.fontFamily);
      ctx.fillStyle = el.strokeColor;
      ctx.textBaseline = "middle";
      ctx.textAlign = el.textAlign;
      const lineH = el.fontSize * LINE_HEIGHT;
      const x = el.textAlign === "center" ? el.width / 2 : el.textAlign === "right" ? el.width : 0;
      el.text.split("\n").forEach((line, i) => ctx.fillText(line, x, i * lineH + lineH / 2));
      break;
    }
    case "image": {
      const img = getImage(el.dataURL);
      if (img) {
        ctx.drawImage(img, 0, 0, el.width, el.height);
      } else {
        ctx.fillStyle = "rgba(128,128,128,0.15)";
        ctx.fillRect(0, 0, el.width, el.height);
      }
      break;
    }
    default:
      for (const d of getShapes(el)) rc.draw(d);
  }
  ctx.restore();
};

const drawLinkIcon = (ctx: CanvasRenderingContext2D, el: SceneElement, zoom: number) => {
  const [, minY, maxX] = getElementBounds(el);
  const s = 16 / zoom;
  const x = maxX + 4 / zoom;
  const y = minY - s - 4 / zoom;
  ctx.save();
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 1.5 / zoom;
  ctx.beginPath();
  ctx.roundRect(x, y, s, s, 4 / zoom);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + s * 0.3, y + s * 0.7);
  ctx.lineTo(x + s * 0.7, y + s * 0.3);
  ctx.moveTo(x + s * 0.45, y + s * 0.3);
  ctx.lineTo(x + s * 0.7, y + s * 0.3);
  ctx.lineTo(x + s * 0.7, y + s * 0.55);
  ctx.stroke();
  ctx.restore();
};

export const getLinkIconBounds = (el: SceneElement, zoom: number) => {
  const [, minY, maxX] = getElementBounds(el);
  const s = 16 / zoom;
  return [maxX + 4 / zoom, minY - s - 4 / zoom, s] as const;
};

export interface LaserTrail {
  points: { x: number; y: number; t: number }[];
}

export interface RenderOptions {
  elements: readonly SceneElement[];
  appState: AppState;
  width: number;
  height: number;
  dpr: number;
  laser: LaserTrail[];
}

const drawHandle = (ctx: CanvasRenderingContext2D, x: number, y: number, zoom: number, round = false) => {
  const s = HANDLE_SIZE / zoom;
  ctx.beginPath();
  if (round) ctx.arc(x, y, s / 2, 0, Math.PI * 2);
  else ctx.roundRect(x - s / 2, y - s / 2, s, s, 2 / zoom);
  ctx.fill();
  ctx.stroke();
};

const strokeRotatedBox = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  angle: number,
  pad: number,
) => {
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(angle);
  ctx.strokeRect(-w / 2 - pad, -h / 2 - pad, w + pad * 2, h + pad * 2);
  ctx.restore();
};

export const renderScene = (canvas: HTMLCanvasElement, opts: RenderOptions) => {
  const { elements, appState, width, height, dpr, laser } = opts;
  const { zoom, scrollX, scrollY } = appState;
  const ctx = canvas.getContext("2d")!;
  const rc = rough.canvas(canvas);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = appState.viewBackgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * zoom * scrollX, dpr * zoom * scrollY);

  const viewport: [number, number, number, number] = [
    -scrollX,
    -scrollY,
    -scrollX + width / zoom,
    -scrollY + height / zoom,
  ];

  if (appState.gridMode) {
    ctx.save();
    ctx.lineWidth = 1 / zoom;
    const startX = Math.floor(viewport[0] / GRID_SIZE) * GRID_SIZE;
    const startY = Math.floor(viewport[1] / GRID_SIZE) * GRID_SIZE;
    ctx.beginPath();
    for (let x = startX; x < viewport[2]; x += GRID_SIZE) {
      const major = Math.round(x / GRID_SIZE) % 5 === 0;
      if (!major && zoom < 0.5) continue;
      ctx.moveTo(x, viewport[1]);
      ctx.lineTo(x, viewport[3]);
    }
    for (let y = startY; y < viewport[3]; y += GRID_SIZE) {
      const major = Math.round(y / GRID_SIZE) % 5 === 0;
      if (!major && zoom < 0.5) continue;
      ctx.moveTo(viewport[0], y);
      ctx.lineTo(viewport[2], y);
    }
    ctx.strokeStyle = "rgba(0,0,0,0.07)";
    ctx.stroke();
    ctx.restore();
  }

  const pending = new Set(appState.eraserPending);
  const selected = new Set(appState.selectedIds);
  for (const el of elements) {
    if (el.id === appState.editingTextId) continue;
    if (!boundsIntersect(getElementBounds(el), [viewport[0] - 50, viewport[1] - 50, viewport[2] + 50, viewport[3] + 50])) continue;
    renderElement(ctx, rc, el, pending.has(el.id) ? 0.25 : 1);
    if (el.link && !appState.viewMode) drawLinkIcon(ctx, el, zoom);
  }

  // binding suggestion highlight
  if (appState.suggestedBindingId) {
    const target = elements.find((e) => e.id === appState.suggestedBindingId);
    if (target) {
      ctx.save();
      ctx.strokeStyle = "rgba(105,101,219,0.45)";
      ctx.lineWidth = 6 / zoom;
      strokeRotatedBox(ctx, target.x, target.y, target.width, target.height, target.angle, 4 / zoom);
      ctx.restore();
    }
  }

  // selection overlays
  const selectedEls = elements.filter((e) => selected.has(e.id));
  if (selectedEls.length && !appState.editingTextId && !appState.multiPointId) {
    ctx.save();
    ctx.strokeStyle = ACCENT;
    ctx.fillStyle = "#fff";
    ctx.lineWidth = 1 / zoom;
    const pad = SELECTION_PADDING / zoom;
    if (selectedEls.length > 1) {
      ctx.setLineDash([4 / zoom, 4 / zoom]);
      for (const el of selectedEls) {
        if (el.type === "text" && el.containerId) continue;
        strokeRotatedBox(ctx, el.x, el.y, el.width, el.height, el.angle, 0);
      }
      ctx.setLineDash([]);
    }
    const locked = selectedEls.some((e) => e.locked);
    const target = getTransformTarget(selectedEls);
    if (target) {
      ctx.lineWidth = 1.2 / zoom;
      strokeRotatedBox(ctx, target.x, target.y, target.width, target.height, target.angle, pad);
      if (!locked && !appState.viewMode) {
        const single = selectedEls.length === 1 ? selectedEls[0] : null;
        const handles = getHandles(target, zoom, { cornersOnly: single?.type === "text" });
        for (const [key, [hx, hy]] of Object.entries(handles)) {
          drawHandle(ctx, hx, hy, zoom, key === "rotation");
        }
      }
    }
    // linear point handles
    if (selectedEls.length === 1 && isLinear(selectedEls[0]) && !locked && !appState.viewMode) {
      const el = selectedEls[0];
      for (const [px, py] of el.points) drawHandle(ctx, el.x + px, el.y + py, zoom, true);
    }
    ctx.restore();
  }

  if (appState.selectionBox) {
    const [x1, y1, x2, y2] = appState.selectionBox;
    ctx.save();
    ctx.fillStyle = "rgba(105,101,219,0.08)";
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1 / zoom;
    ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    ctx.restore();
  }

  // laser pointer trails
  const now = performance.now();
  for (const trail of laser) {
    const pts = trail.points.filter((p) => now - p.t < 700);
    if (pts.length < 2) continue;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let i = 1; i < pts.length; i++) {
      const age = (now - pts[i].t) / 700;
      ctx.strokeStyle = `rgba(255, 40, 40, ${1 - age})`;
      ctx.lineWidth = (5 * (1 - age * 0.6)) / zoom;
      ctx.beginPath();
      ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
      ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }
    ctx.restore();
  }
};

/** Render elements into a standalone canvas (PNG export / clipboard / library previews). */
export const exportToCanvas = (
  elements: readonly SceneElement[],
  {
    background,
    backgroundColor = "#ffffff",
    padding = 10,
    scale = 1,
    dark = false,
  }: { background: boolean; backgroundColor?: string; padding?: number; scale?: number; dark?: boolean },
) => {
  const [minX, minY, maxX, maxY] = elements.length ? getCommonBounds(elements) : [0, 0, 0, 0];
  const width = Math.max(1, maxX - minX + padding * 2);
  const height = Math.max(1, maxY - minY + padding * 2);
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  const ctx = canvas.getContext("2d")!;
  if (background) {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.setTransform(scale, 0, 0, scale, (padding - minX) * scale, (padding - minY) * scale);
  const rc = rough.canvas(canvas);
  for (const el of elements) renderElement(ctx, rc, el);
  if (!dark) return canvas;
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height;
  const octx = out.getContext("2d")!;
  octx.filter = "invert(93%) hue-rotate(180deg)";
  octx.drawImage(canvas, 0, 0);
  return out;
};
