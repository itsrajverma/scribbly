import rough from "roughjs";
import type { AppState, LibraryItem, SceneData, SceneElement } from "./types";
import { FONT_FAMILIES, LINE_HEIGHT, restoreElement, syncBindings } from "./scene/elements";
import { getCommonBounds } from "./scene/geometry";
import { getFreedrawPath, getShapes } from "./scene/shapes";

const STORAGE_KEY = "scribbly-scene";
const STORAGE_STATE_KEY = "scribbly-state";
const LIBRARY_KEY = "scribbly-library";
export const FILE_EXTENSION = ".scribbly";

// ---------- serialization ----------

export const serializeScene = (elements: readonly SceneElement[], appState: AppState): string => {
  const data: SceneData = {
    type: "scribbly",
    version: 1,
    source: location.origin,
    elements: [...elements],
    appState: {
      viewBackgroundColor: appState.viewBackgroundColor,
      gridMode: appState.gridMode,
      name: appState.name,
    },
  };
  return JSON.stringify(data, null, 2);
};

/** Accepts Scribbly files and .excalidraw files. */
export const parseScene = (text: string): { elements: SceneElement[]; appState: Partial<AppState> } => {
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.elements)) throw new Error("Not a valid scene file");
  const files = data.files ?? {};
  const elements = (data.elements as any[])
    .map((raw) => {
      if (raw?.type === "image" && !raw.dataURL && raw.fileId && files[raw.fileId]) {
        raw = { ...raw, dataURL: files[raw.fileId].dataURL };
      }
      return restoreElement(raw);
    })
    .filter((e): e is SceneElement => !!e);
  const appState: Partial<AppState> = {};
  if (typeof data.appState?.viewBackgroundColor === "string") {
    appState.viewBackgroundColor = data.appState.viewBackgroundColor;
  }
  if (typeof data.appState?.gridMode === "boolean") appState.gridMode = data.appState.gridMode;
  if (typeof data.appState?.name === "string") appState.name = data.appState.name;
  return { elements: syncBindings(elements), appState };
};

// ---------- local persistence ----------

export const saveToLocalStorage = (elements: readonly SceneElement[], appState: AppState) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(elements));
    localStorage.setItem(
      STORAGE_STATE_KEY,
      JSON.stringify({
        theme: appState.theme,
        viewBackgroundColor: appState.viewBackgroundColor,
        gridMode: appState.gridMode,
        zoom: appState.zoom,
        scrollX: appState.scrollX,
        scrollY: appState.scrollY,
        currentStyle: appState.currentStyle,
        name: appState.name,
      }),
    );
    return true;
  } catch {
    return false;
  }
};

export const loadFromLocalStorage = (): {
  elements: SceneElement[];
  appState: Partial<AppState>;
} => {
  let elements: SceneElement[] = [];
  let appState: Partial<AppState> = {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      elements = (JSON.parse(raw) as any[])
        .map(restoreElement)
        .filter((e): e is SceneElement => !!e);
    }
    const rawState = localStorage.getItem(STORAGE_STATE_KEY);
    if (rawState) appState = JSON.parse(rawState);
  } catch {
    /* corrupted storage: start fresh */
  }
  return { elements, appState };
};

export const loadLibrary = (): LibraryItem[] => {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const saveLibrary = (items: LibraryItem[]) => {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(items));
  } catch {
    /* quota */
  }
};

// ---------- files ----------

export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const pickFile = (accept: string): Promise<File | null> =>
  new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });

// ---------- shareable links (scene compressed into the URL hash) ----------

const toBase64Url = (bytes: Uint8Array) => {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64Url = (str: string) => {
  const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
};

const pipeThrough = async (bytes: Uint8Array, stream: CompressionStream | DecompressionStream) => {
  const res = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
};

export const createShareLink = async (elements: readonly SceneElement[], appState: AppState) => {
  const json = serializeScene(elements, appState);
  const compressed = await pipeThrough(new TextEncoder().encode(json), new CompressionStream("deflate"));
  return `${location.origin}${location.pathname}#scene=${toBase64Url(compressed)}`;
};

export const readSceneFromHash = async () => {
  const match = location.hash.match(/^#scene=([\w-]+)$/);
  if (!match) return null;
  const bytes = await pipeThrough(fromBase64Url(match[1]), new DecompressionStream("deflate"));
  return parseScene(new TextDecoder().decode(bytes));
};

// ---------- SVG export ----------

const SVG_NS = "http://www.w3.org/2000/svg";

export const exportToSvg = (
  elements: readonly SceneElement[],
  {
    background,
    backgroundColor = "#ffffff",
    padding = 10,
    dark = false,
  }: { background: boolean; backgroundColor?: string; padding?: number; dark?: boolean },
): SVGSVGElement => {
  const [minX, minY, maxX, maxY] = elements.length ? getCommonBounds(elements) : [0, 0, 0, 0];
  const width = maxX - minX + padding * 2;
  const height = maxY - minY + padding * 2;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("xmlns", SVG_NS);
  svg.setAttribute("version", "1.1");
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  if (dark) svg.setAttribute("filter", "invert(93%) hue-rotate(180deg)");

  const style = document.createElementNS(SVG_NS, "style");
  style.textContent = `@import url('https://fonts.googleapis.com/css2?family=Kalam&display=swap');`;
  svg.appendChild(style);

  if (background) {
    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("width", "100%");
    rect.setAttribute("height", "100%");
    rect.setAttribute("fill", backgroundColor);
    svg.appendChild(rect);
  }

  const rsvg = rough.svg(svg);
  for (const el of elements) {
    const g = document.createElementNS(SVG_NS, "g");
    const cx = el.x - minX + padding + el.width / 2;
    const cy = el.y - minY + padding + el.height / 2;
    g.setAttribute(
      "transform",
      `translate(${cx} ${cy}) rotate(${(el.angle * 180) / Math.PI}) translate(${-el.width / 2} ${-el.height / 2})`,
    );
    if (el.opacity !== 100) g.setAttribute("opacity", String(el.opacity / 100));
    switch (el.type) {
      case "freedraw": {
        const path = document.createElementNS(SVG_NS, "path");
        path.setAttribute("d", getFreedrawPath(el));
        path.setAttribute("fill", el.strokeColor);
        g.appendChild(path);
        break;
      }
      case "text": {
        const lineH = el.fontSize * LINE_HEIGHT;
        const anchor = el.textAlign === "center" ? "middle" : el.textAlign === "right" ? "end" : "start";
        const x = el.textAlign === "center" ? el.width / 2 : el.textAlign === "right" ? el.width : 0;
        el.text.split("\n").forEach((line, i) => {
          const t = document.createElementNS(SVG_NS, "text");
          t.setAttribute("x", String(x));
          t.setAttribute("y", String(i * lineH + lineH / 2));
          t.setAttribute("dominant-baseline", "central");
          t.setAttribute("text-anchor", anchor);
          t.setAttribute("font-family", FONT_FAMILIES[el.fontFamily]);
          t.setAttribute("font-size", String(el.fontSize));
          t.setAttribute("fill", el.strokeColor);
          t.setAttribute("xml:space", "preserve");
          t.textContent = line;
          g.appendChild(t);
        });
        break;
      }
      case "image": {
        const img = document.createElementNS(SVG_NS, "image");
        img.setAttribute("href", el.dataURL);
        img.setAttribute("width", String(el.width));
        img.setAttribute("height", String(el.height));
        img.setAttribute("preserveAspectRatio", "none");
        g.appendChild(img);
        break;
      }
      default:
        for (const d of getShapes(el)) g.appendChild(rsvg.draw(d));
    }
    if (el.link) {
      const a = document.createElementNS(SVG_NS, "a");
      a.setAttribute("href", el.link);
      a.appendChild(g);
      svg.appendChild(a);
    } else {
      svg.appendChild(g);
    }
  }
  return svg;
};
