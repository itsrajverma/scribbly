import rough from "roughjs";
import type { Drawable, Options } from "roughjs/bin/core";
import { getStroke } from "perfect-freehand";
import type { FreeDrawElement, LinearElement, Point, SceneElement } from "../types";
import { isClosedPath } from "./geometry";

const generator = rough.generator();
const shapeCache = new WeakMap<SceneElement, Drawable[]>();
const freedrawCache = new WeakMap<SceneElement, string>();

const adjustedRoughness = (el: SceneElement) => {
  if (el.roughness === 0) return 0;
  const size =
    el.type === "arrow" || el.type === "line"
      ? Math.max(el.width, el.height)
      : Math.min(el.width, el.height);
  if (size >= 40) return el.roughness;
  return Math.max(0.4, (el.roughness * size) / 40);
};

const baseOptions = (el: SceneElement): Options => {
  const dashed = el.strokeStyle === "dashed";
  const dotted = el.strokeStyle === "dotted";
  const opts: Options = {
    seed: el.seed,
    stroke: el.strokeColor,
    strokeWidth: dashed || dotted ? el.strokeWidth + 0.5 : el.strokeWidth,
    roughness: adjustedRoughness(el),
    bowing: 1,
    disableMultiStroke: dashed || dotted,
    preserveVertices: el.roughness < 2,
    fillWeight: el.strokeWidth / 2,
    hachureGap: el.strokeWidth * 4,
  };
  if (dashed) opts.strokeLineDash = [8, 8 + el.strokeWidth];
  if (dotted) opts.strokeLineDash = [1.5, 6 + el.strokeWidth];
  if (el.backgroundColor !== "transparent") {
    opts.fill = el.backgroundColor;
    opts.fillStyle = el.fillStyle;
  }
  return opts;
};

/** Build an SVG path for a polygon whose corners are softened with quadratic curves. */
const roundedPolygonPath = (pts: Point[], radius: number) => {
  const n = pts.length;
  let d = "";
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const cur = pts[i];
    const next = pts[(i + 1) % n];
    const lenA = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
    const lenB = Math.hypot(next[0] - cur[0], next[1] - cur[1]);
    const r = Math.min(radius, lenA / 2, lenB / 2);
    const a: Point = [
      cur[0] + ((prev[0] - cur[0]) / (lenA || 1)) * r,
      cur[1] + ((prev[1] - cur[1]) / (lenA || 1)) * r,
    ];
    const b: Point = [
      cur[0] + ((next[0] - cur[0]) / (lenB || 1)) * r,
      cur[1] + ((next[1] - cur[1]) / (lenB || 1)) * r,
    ];
    d += `${i === 0 ? "M" : "L"} ${a[0]} ${a[1]} Q ${cur[0]} ${cur[1]} ${b[0]} ${b[1]} `;
  }
  return d + "Z";
};

const arrowheadDrawables = (el: LinearElement, opts: Options): Drawable[] => {
  const out: Drawable[] = [];
  const pts = el.points;
  if (pts.length < 2) return out;
  const headOpts: Options = {
    ...opts,
    strokeLineDash: undefined,
    fill: undefined,
    disableMultiStroke: false,
  };
  const build = (tip: Point, from: Point, kind: LinearElement["endArrowhead"]) => {
    if (!kind) return;
    const dx = tip[0] - from[0];
    const dy = tip[1] - from[1];
    const segLen = Math.hypot(dx, dy);
    if (segLen < 1) return;
    const ux = dx / segLen;
    const uy = dy / segLen;
    const size = Math.min(14 + el.strokeWidth * 3, segLen * 0.6);
    const spread = kind === "arrow" ? Math.PI / 7 : Math.PI / 8;
    const wing = (sign: number): Point => {
      const a = Math.atan2(uy, ux) + Math.PI + sign * spread;
      return [tip[0] + Math.cos(a) * size, tip[1] + Math.sin(a) * size];
    };
    switch (kind) {
      case "arrow":
        out.push(generator.linearPath([wing(1), tip, wing(-1)], headOpts));
        break;
      case "triangle":
        out.push(
          generator.polygon([tip, wing(1), wing(-1)], {
            ...headOpts,
            fill: el.strokeColor,
            fillStyle: "solid",
          }),
        );
        break;
      case "dot": {
        const r = Math.max(4, el.strokeWidth * 2.2);
        out.push(
          generator.circle(tip[0] - ux * r, tip[1] - uy * r, r * 2, {
            ...headOpts,
            fill: el.strokeColor,
            fillStyle: "solid",
          }),
        );
        break;
      }
      case "bar": {
        const h = size * 0.6;
        out.push(
          generator.line(
            tip[0] - uy * h,
            tip[1] + ux * h,
            tip[0] + uy * h,
            tip[1] - ux * h,
            headOpts,
          ),
        );
        break;
      }
    }
  };
  build(pts[pts.length - 1], pts[pts.length - 2], el.endArrowhead);
  build(pts[0], pts[1], el.startArrowhead);
  return out;
};

/** Rough drawables in element-local coordinates (top-left = 0,0). Cached per element version. */
export const getShapes = (el: SceneElement): Drawable[] => {
  const cached = shapeCache.get(el);
  if (cached) return cached;
  const opts = baseOptions(el);
  const w = el.width;
  const h = el.height;
  let shapes: Drawable[] = [];
  switch (el.type) {
    case "rectangle": {
      if (el.roundness) {
        const r = Math.min(Math.min(w, h) * 0.25, 32);
        shapes = [
          generator.path(
            roundedPolygonPath(
              [
                [0, 0],
                [w, 0],
                [w, h],
                [0, h],
              ],
              r,
            ),
            opts,
          ),
        ];
      } else {
        shapes = [generator.rectangle(0, 0, w, h, opts)];
      }
      break;
    }
    case "diamond": {
      const pts: Point[] = [
        [w / 2, 0],
        [w, h / 2],
        [w / 2, h],
        [0, h / 2],
      ];
      shapes = [
        el.roundness
          ? generator.path(roundedPolygonPath(pts, Math.min(w, h) * 0.18), opts)
          : generator.polygon(pts, opts),
      ];
      break;
    }
    case "ellipse":
      shapes = [generator.ellipse(w / 2, h / 2, w, h, opts)];
      break;
    case "arrow":
    case "line": {
      const pts = el.points;
      const closed = el.type === "line" && isClosedPath(pts);
      const lineOpts = closed ? opts : { ...opts, fill: undefined };
      if (pts.length < 2) {
        shapes = [];
      } else if (closed) {
        shapes = [
          el.roundness ? generator.curve([...pts], lineOpts) : generator.polygon(pts, lineOpts),
        ];
      } else if (el.roundness && pts.length > 2) {
        shapes = [generator.curve(pts, lineOpts)];
      } else {
        shapes = [generator.linearPath(pts, lineOpts)];
      }
      if (el.type === "arrow") shapes.push(...arrowheadDrawables(el, opts));
      break;
    }
    default:
      shapes = [];
  }
  shapeCache.set(el, shapes);
  return shapes;
};

const averagePoint = (a: number[], b: number[]) => `${((a[0] + b[0]) / 2).toFixed(2)},${((a[1] + b[1]) / 2).toFixed(2)}`;

/** Filled outline path (SVG d-string) for a freehand stroke. */
export const getFreedrawPath = (el: FreeDrawElement): string => {
  const cached = freedrawCache.get(el);
  if (cached !== undefined) return cached;
  const hasPressure = el.pressures.length === el.points.length && el.pressures.some((p) => p !== 0.5);
  const input = el.points.map(([x, y], i) => [x, y, hasPressure ? el.pressures[i] : 0.5]);
  const outline = getStroke(input, {
    size: el.strokeWidth * 4.2,
    thinning: 0.6,
    smoothing: 0.5,
    streamline: 0.5,
    simulatePressure: !hasPressure,
    last: true,
  });
  let d = "";
  if (outline.length) {
    d = `M ${outline[0][0].toFixed(2)},${outline[0][1].toFixed(2)} Q`;
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i];
      const b = outline[(i + 1) % outline.length];
      d += ` ${a[0].toFixed(2)},${a[1].toFixed(2)} ${averagePoint(a, b)}`;
    }
    d += " Z";
  }
  freedrawCache.set(el, d);
  return d;
};
