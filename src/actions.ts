import { store } from "./store";
import type { AppState, Point, SceneElement, StyleProps, TextElement } from "./types";
import {
  deleteElements,
  duplicateElements,
  expandSelection,
  getAbsPoints,
  getBoundText,
  mutate,
  newElement,
  randomId,
  refreshTextDimensions,
  restoreElement,
  syncBindings,
  withAbsPoints,
  withBoundTexts,
} from "./scene/elements";
import { getCommonBounds, getElementBounds, hasPoints, isLinear } from "./scene/geometry";
import { prepareImage } from "./scene/images";
import { exportToCanvas } from "./scene/render";

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 30;

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export const toast = (message: string) => {
  store.setAppState({ toast: message });
  const current = message;
  setTimeout(() => {
    if (store.appState.toast === current) store.setAppState({ toast: null });
  }, 2600);
};

// ---------- viewport ----------

export const screenToScene = (sx: number, sy: number, s: AppState = store.appState): Point => [
  sx / s.zoom - s.scrollX,
  sy / s.zoom - s.scrollY,
];

export const sceneToScreen = (x: number, y: number, s: AppState = store.appState): Point => [
  (x + s.scrollX) * s.zoom,
  (y + s.scrollY) * s.zoom,
];

export const zoomAt = (zoom: number, sx: number, sy: number) => {
  const s = store.appState;
  const next = clampZoom(zoom);
  const [x, y] = screenToScene(sx, sy, s);
  store.setAppState({ zoom: next, scrollX: sx / next - x, scrollY: sy / next - y });
};

export const zoomStep = (dir: 1 | -1) => {
  const z = store.appState.zoom;
  const next = dir > 0 ? z * 1.1 : z / 1.1;
  zoomAt(Math.round(next * 100) / 100, window.innerWidth / 2, window.innerHeight / 2);
};

export const resetZoom = () => zoomAt(1, window.innerWidth / 2, window.innerHeight / 2);

export const zoomToElements = (els: readonly SceneElement[], maxZoom = 1) => {
  if (!els.length) {
    store.setAppState({ zoom: 1, scrollX: 0, scrollY: 0 });
    return;
  }
  const [minX, minY, maxX, maxY] = getCommonBounds(els);
  const w = window.innerWidth;
  const h = window.innerHeight;
  const margin = 80;
  const zoom = clampZoom(
    Math.min(maxZoom, (w - margin * 2) / Math.max(1, maxX - minX), (h - margin * 2) / Math.max(1, maxY - minY)),
  );
  store.setAppState({
    zoom,
    scrollX: w / 2 / zoom - (minX + maxX) / 2,
    scrollY: h / 2 / zoom - (minY + maxY) / 2,
  });
};

export const viewportCenter = (): Point =>
  screenToScene(window.innerWidth / 2, window.innerHeight / 2);

// ---------- selection helpers ----------

export const getSelected = () => {
  const ids = new Set(store.appState.selectedIds);
  return store.elements.filter((e) => ids.has(e.id));
};

export const selectAll = () => {
  const ids = store.elements
    .filter((e) => !e.locked && !(e.type === "text" && e.containerId))
    .map((e) => e.id);
  store.setAppState({ selectedIds: ids, tool: "selection" });
};

export const deleteSelected = () => {
  const ids = new Set(store.appState.selectedIds);
  if (!ids.size) return;
  store.update(deleteElements(store.elements, ids), { selectedIds: [] }, { commit: true });
};

export const duplicateSelected = () => {
  const ids = withBoundTexts(store.elements, store.appState.selectedIds);
  const sel = store.elements.filter((e) => ids.has(e.id));
  if (!sel.length) return;
  const copies = duplicateElements(sel, 12, 12);
  const lastIdx = Math.max(...sel.map((e) => store.elements.indexOf(e)));
  const next = [...store.elements];
  next.splice(lastIdx + 1, 0, ...copies);
  store.update(
    syncBindings(next),
    { selectedIds: copies.filter((c) => !(c.type === "text" && c.containerId)).map((c) => c.id) },
    { commit: true },
  );
};

export const groupSelected = () => {
  const ids = withBoundTexts(store.elements, store.appState.selectedIds);
  if (store.appState.selectedIds.length < 2) return;
  const gid = randomId();
  const elements = store.elements.map((e) => (ids.has(e.id) ? mutate(e, { groupIds: [...e.groupIds, gid] }) : e));
  // keep group members contiguous in z-order
  const members = elements.filter((e) => ids.has(e.id));
  const lastIdx = Math.max(...members.map((m) => elements.indexOf(m)));
  const before = elements.slice(0, lastIdx + 1).filter((e) => !ids.has(e.id));
  const after = elements.slice(lastIdx + 1);
  store.setElements([...before, ...members, ...after], { commit: true });
};

export const ungroupSelected = () => {
  const ids = new Set(store.appState.selectedIds);
  const elements = store.elements.map((e) =>
    ids.has(e.id) && e.groupIds.length ? mutate(e, { groupIds: e.groupIds.slice(0, -1) }) : e,
  );
  store.setElements(elements, { commit: true });
};

// ---------- z-order ----------

type ZMove = "front" | "back" | "forward" | "backward";

export const reorderSelected = (move: ZMove) => {
  const ids = withBoundTexts(store.elements, store.appState.selectedIds);
  if (!ids.size) return;
  let els = [...store.elements];
  const isSel = (e: SceneElement) => ids.has(e.id);
  if (move === "front") els = [...els.filter((e) => !isSel(e)), ...els.filter(isSel)];
  else if (move === "back") els = [...els.filter(isSel), ...els.filter((e) => !isSel(e))];
  else if (move === "forward") {
    // walking downwards lets a run of selected elements hop over one element together
    for (let i = els.length - 2; i >= 0; i--) {
      if (isSel(els[i]) && !isSel(els[i + 1])) [els[i], els[i + 1]] = [els[i + 1], els[i]];
    }
  } else {
    for (let i = 1; i < els.length; i++) {
      if (isSel(els[i]) && !isSel(els[i - 1])) [els[i], els[i - 1]] = [els[i - 1], els[i]];
    }
  }
  store.setElements(els, { commit: true });
};

// ---------- alignment ----------

/** Selection split into units that move together (groups or single elements). */
const getUnits = (sel: SceneElement[]) => {
  const units = new Map<string, SceneElement[]>();
  for (const el of sel) {
    if (el.type === "text" && el.containerId) continue;
    const key = el.groupIds.length ? el.groupIds[el.groupIds.length - 1] : el.id;
    if (!units.has(key)) units.set(key, []);
    units.get(key)!.push(el);
  }
  return [...units.values()];
};

const moveUnits = (moves: Map<SceneElement[], Point>) => {
  const delta = new Map<string, Point>();
  for (const [unit, d] of moves) for (const el of unit) delta.set(el.id, d);
  const elements = store.elements.map((e) => {
    const d = delta.get(e.id);
    if (!d || (d[0] === 0 && d[1] === 0)) return e;
    const moved = mutate(e, { x: e.x + d[0], y: e.y + d[1] });
    if (isLinear(moved)) {
      // detach from shapes that are not moving with it
      const keep = (b: { elementId: string } | null) => (b && delta.has(b.elementId) ? b : null);
      return { ...moved, startBinding: keep(moved.startBinding), endBinding: keep(moved.endBinding) };
    }
    return moved;
  });
  store.setElements(syncBindings(elements), { commit: true });
};

export type Alignment = "left" | "centerX" | "right" | "top" | "centerY" | "bottom";

export const alignSelected = (how: Alignment) => {
  const units = getUnits(getSelected());
  if (units.length < 2) return;
  const [minX, minY, maxX, maxY] = getCommonBounds(units.flat());
  const moves = new Map<SceneElement[], Point>();
  for (const unit of units) {
    const [a, b, c, d] = getCommonBounds(unit);
    let dx = 0;
    let dy = 0;
    if (how === "left") dx = minX - a;
    if (how === "right") dx = maxX - c;
    if (how === "centerX") dx = (minX + maxX) / 2 - (a + c) / 2;
    if (how === "top") dy = minY - b;
    if (how === "bottom") dy = maxY - d;
    if (how === "centerY") dy = (minY + maxY) / 2 - (b + d) / 2;
    moves.set(unit, [dx, dy]);
  }
  moveUnits(moves);
};

export const distributeSelected = (axis: "x" | "y") => {
  const units = getUnits(getSelected());
  if (units.length < 3) return;
  const i0 = axis === "x" ? 0 : 1;
  const i1 = axis === "x" ? 2 : 3;
  const withBounds = units
    .map((u) => ({ u, b: getCommonBounds(u) }))
    .sort((a, b) => a.b[i0] + a.b[i1] - (b.b[i0] + b.b[i1]));
  const total = withBounds.reduce((s, { b }) => s + (b[i1] - b[i0]), 0);
  const start = Math.min(...withBounds.map(({ b }) => b[i0]));
  const end = Math.max(...withBounds.map(({ b }) => b[i1]));
  const gap = (end - start - total) / (withBounds.length - 1);
  let cursor = start;
  const moves = new Map<SceneElement[], Point>();
  for (const { u, b } of withBounds) {
    const d = cursor - b[i0];
    moves.set(u, axis === "x" ? [d, 0] : [0, d]);
    cursor += b[i1] - b[i0] + gap;
  }
  moveUnits(moves);
};

export const flipSelected = (axis: "horizontal" | "vertical") => {
  const ids = withBoundTexts(store.elements, store.appState.selectedIds);
  const sel = store.elements.filter((e) => ids.has(e.id));
  if (!sel.length) return;
  const [minX, minY, maxX, maxY] = getCommonBounds(sel);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const elements = store.elements.map((e) => {
    if (!ids.has(e.id) || (e.type === "text" && e.containerId)) return e;
    if (hasPoints(e)) {
      const abs = getAbsPoints(e).map(
        ([x, y]) => (axis === "horizontal" ? [2 * cx - x, y] : [x, 2 * cy - y]) as Point,
      );
      let next = withAbsPoints(e, abs);
      if (isLinear(next) && isLinear(e)) next = { ...next, startBinding: null, endBinding: null };
      return next;
    }
    return axis === "horizontal"
      ? mutate(e, { x: 2 * cx - e.x - e.width, angle: e.type === "text" ? e.angle : -e.angle })
      : mutate(e, { y: 2 * cy - e.y - e.height, angle: e.type === "text" ? e.angle : -e.angle });
  });
  store.setElements(syncBindings(elements), { commit: true });
};

export const nudgeSelected = (dx: number, dy: number) => {
  const ids = new Set(store.appState.selectedIds);
  if (!ids.size) return;
  const units = getUnits(store.elements.filter((e) => ids.has(e.id)));
  moveUnits(new Map(units.map((u) => [u, [dx, dy] as Point])));
};

export const toggleLockSelected = () => {
  const sel = getSelected();
  if (!sel.length) return;
  const lock = !sel.every((e) => e.locked);
  const ids = withBoundTexts(store.elements, sel.map((e) => e.id));
  store.update(
    store.elements.map((e) => (ids.has(e.id) ? mutate(e, { locked: lock }) : e)),
    { selectedIds: lock ? [] : store.appState.selectedIds },
    { commit: true },
  );
};

export const unlockAll = () => {
  store.setElements(
    store.elements.map((e) => (e.locked ? mutate(e, { locked: false }) : e)),
    { commit: true },
  );
};

// ---------- styles ----------

const TEXT_PROPS = new Set(["fontSize", "fontFamily", "textAlign"]);

/** Apply a style change to the selection (and remember it for new elements). */
export const applyStyle = <K extends keyof StyleProps>(key: K, value: StyleProps[K]) => {
  const { selectedIds, currentStyle } = store.appState;
  const ids = withBoundTexts(store.elements, selectedIds);
  store.setAppState({ currentStyle: { ...currentStyle, [key]: value } });
  if (!ids.size) return;
  const elements = store.elements.map((e) => {
    if (!ids.has(e.id)) return e;
    if (TEXT_PROPS.has(key)) {
      return e.type === "text" ? refreshTextDimensions(e, { [key]: value } as Partial<TextElement>) : e;
    }
    if ((key === "startArrowhead" || key === "endArrowhead") && e.type !== "arrow") return e;
    if (key === "backgroundColor" && (e.type === "text" || e.type === "freedraw")) return e;
    return mutate(e, { [key]: value } as Partial<SceneElement>);
  });
  store.setElements(syncBindings(elements), { commit: true });
};

let copiedStyle: Partial<StyleProps> | null = null;

export const copyStyles = () => {
  const el = getSelected()[0];
  if (!el) return;
  const s: any = {};
  for (const k of Object.keys(store.appState.currentStyle)) if (k in el) s[k] = (el as any)[k];
  copiedStyle = s;
  toast("Styles copied");
};

export const pasteStyles = () => {
  if (!copiedStyle) return;
  const ids = withBoundTexts(store.elements, store.appState.selectedIds);
  const style = copiedStyle;
  const elements = store.elements.map((e) => {
    if (!ids.has(e.id)) return e;
    const patch: any = {};
    for (const [k, v] of Object.entries(style)) if (k in e) patch[k] = v;
    return e.type === "text" ? refreshTextDimensions(e, patch) : mutate(e, patch);
  });
  store.setElements(syncBindings(elements), { commit: true });
};

// ---------- clipboard ----------

const CLIPBOARD_TYPE = "scribbly/clipboard";

export const serializeSelection = () => {
  const ids = withBoundTexts(store.elements, store.appState.selectedIds);
  const sel = store.elements.filter((e) => ids.has(e.id));
  if (!sel.length) return null;
  return JSON.stringify({ type: CLIPBOARD_TYPE, elements: sel });
};

/** Insert elements centred around a scene point, selecting them. */
export const insertElements = (raw: SceneElement[], at: Point, { select = true } = {}) => {
  if (!raw.length) return;
  const [minX, minY, maxX, maxY] = getCommonBounds(raw);
  const dx = at[0] - (minX + maxX) / 2;
  const dy = at[1] - (minY + maxY) / 2;
  const copies = duplicateElements(raw, dx, dy);
  store.update(
    syncBindings([...store.elements, ...copies]),
    select
      ? {
          selectedIds: copies.filter((c) => !(c.type === "text" && c.containerId)).map((c) => c.id),
          tool: "selection",
        }
      : {},
    { commit: true },
  );
};

export const pasteFromText = (text: string, at: Point) => {
  try {
    const data = JSON.parse(text);
    if ((data?.type === CLIPBOARD_TYPE || data?.type === "excalidraw/clipboard") && Array.isArray(data.elements)) {
      const els = data.elements.map(restoreElement).filter(Boolean) as SceneElement[];
      insertElements(els, at);
      return;
    }
  } catch {
    /* plain text */
  }
  const trimmed = text.trim();
  if (!trimmed) return;
  const { currentStyle } = store.appState;
  const el = refreshTextDimensions(
    newElement("text", at[0], at[1], currentStyle, { text: trimmed } as Partial<SceneElement>) as TextElement,
  );
  const placed = mutate(el, { x: at[0] - el.width / 2, y: at[1] - el.height / 2 });
  store.update([...store.elements, placed], { selectedIds: [placed.id], tool: "selection" }, { commit: true });
};

export const insertImageFile = async (file: File, at?: Point) => {
  if (!file.type.startsWith("image/")) {
    toast("Unsupported file type");
    return;
  }
  try {
    const { dataURL, width, height } = await prepareImage(file);
    const z = store.appState.zoom;
    const max = Math.min(window.innerWidth, window.innerHeight) * 0.5 / z;
    const scale = Math.min(1, max / Math.max(width, height));
    const w = width * scale;
    const h = height * scale;
    const [cx, cy] = at ?? viewportCenter();
    const el = newElement("image", cx - w / 2, cy - h / 2, store.appState.currentStyle, {
      width: w,
      height: h,
      dataURL,
    } as Partial<SceneElement>);
    store.update([...store.elements, el], { selectedIds: [el.id], tool: "selection" }, { commit: true });
  } catch {
    toast("Couldn't load image");
  }
};

export const copySelectionAsPng = async () => {
  const sel = getSelected();
  const els = sel.length ? [...withBoundTexts(store.elements, sel.map((e) => e.id))].map((id) => store.elements.find((e) => e.id === id)!) : store.elements;
  if (!els.length) return;
  const canvas = exportToCanvas(els, {
    background: true,
    backgroundColor: store.appState.viewBackgroundColor,
    scale: 2,
  });
  try {
    const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej()), "image/png"));
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    toast("Copied as PNG");
  } catch {
    toast("Clipboard access was denied");
  }
};

// ---------- text containers ----------

/** Start editing the bound text of a shape (creating it if needed). Returns the text id. */
export const editContainerText = (container: SceneElement) => {
  const existing = getBoundText(store.elements, container.id);
  if (existing) {
    store.setAppState({ editingTextId: existing.id, selectedIds: [container.id] });
    return existing.id;
  }
  const { currentStyle } = store.appState;
  const text = refreshTextDimensions(
    newElement("text", 0, 0, currentStyle, {
      containerId: container.id,
      textAlign: "center",
      strokeColor: container.strokeColor,
      opacity: container.opacity,
      groupIds: container.groupIds,
      text: "",
    } as Partial<SceneElement>) as TextElement,
  );
  const idx = store.elements.indexOf(container);
  const next = [...store.elements];
  next.splice(idx + 1, 0, text);
  store.update(syncBindings(next), { editingTextId: text.id, selectedIds: [container.id] });
  return text.id;
};

export const getElementLink = (el: SceneElement) => el.link;

export const setLinkOnSelected = () => {
  const sel = getSelected();
  if (!sel.length) return;
  const current = sel[0].link ?? "";
  const value = window.prompt("Link (leave empty to remove)", current);
  if (value === null) return;
  let link: string | null = value.trim() || null;
  if (link && !/^[a-z]+:/i.test(link)) link = `https://${link}`;
  const ids = new Set(sel.map((e) => e.id));
  store.setElements(
    store.elements.map((e) => (ids.has(e.id) ? mutate(e, { link }) : e)),
    { commit: true },
  );
};

export const selectionBoundsOnScreen = () => {
  const sel = getSelected();
  if (!sel.length) return null;
  return getCommonBounds(sel);
};

export { expandSelection, getElementBounds };
