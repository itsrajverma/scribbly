import { store } from "./store";
import type { LinearElement, Point, SceneElement, TextElement, ToolType } from "./types";
import {
  editContainerText,
  getSelected,
  screenToScene,
  zoomAt,
} from "./actions";
import {
  deleteElements,
  duplicateElements,
  expandSelection,
  getAbsPoints,
  LINE_HEIGHT,
  mutate,
  newElement,
  refreshTextDimensions,
  rotateElementAround,
  scaleElementFrom,
  syncBindings,
  withAbsPoints,
  withBoundTexts,
} from "./scene/elements";
import {
  distance,
  distToSegment,
  getCenter,
  getCommonBounds,
  getElementBounds,
  hasPoints,
  hitTest,
  isBindable,
  isInsideShape,
  isLinear,
  isTextContainer,
  rotatePoint,
  snapAngle,
} from "./scene/geometry";
import {
  getHandleAt,
  getHandleCursor,
  getHandles,
  getTransformTarget,
  type HandleType,
  type TransformTarget,
} from "./scene/handles";
import { getLinkIconBounds, GRID_SIZE, type LaserTrail } from "./scene/render";

type Mode =
  | "idle"
  | "panning"
  | "creating"
  | "creatingLinear"
  | "freedraw"
  | "dragging"
  | "resizing"
  | "rotating"
  | "boxSelect"
  | "erasing"
  | "linearPoint"
  | "laser";

interface Session {
  mode: Mode;
  pointerId: number;
  startScene: Point;
  lastScreen: Point;
  lastScene: Point;
  elementsAtStart: SceneElement[];
  orig: Map<string, SceneElement>;
  moved: boolean;
  elementId?: string;
  handle?: HandleType;
  target?: TransformTarget;
  pointIndex?: number;
  duplicated?: boolean;
  clickedGroup?: string[];
  prevSelection?: string[];
  absPoints?: Point[];
  pressures?: number[];
  laser?: LaserTrail;
}

const SHAPE_TOOLS: ToolType[] = ["rectangle", "diamond", "ellipse"];

const ERASER_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="6" fill="white" stroke="black" stroke-width="1.5"/></svg>',
)}") 10 10, crosshair`;

const replaceById = (elements: SceneElement[], el: SceneElement) =>
  elements.map((e) => (e.id === el.id ? el : e));

const detachBindings = (el: SceneElement, moving: Set<string>): SceneElement => {
  if (!isLinear(el)) return el;
  const keep = (b: LinearElement["startBinding"]) => (b && moving.has(b.elementId) ? b : null);
  const startBinding = keep(el.startBinding);
  const endBinding = keep(el.endBinding);
  if (startBinding === el.startBinding && endBinding === el.endBinding) return el;
  return { ...el, startBinding, endBinding };
};

export const finishTextEditing = () => {
  const id = store.appState.editingTextId;
  if (!id) return;
  const el = store.elements.find((e) => e.id === id) as TextElement | undefined;
  const keep = !!el && el.text.trim().length > 0;
  const elements = keep ? store.elements : deleteElements(store.elements, new Set([id]));
  const selectedIds = keep ? [el!.containerId ?? el!.id] : el?.containerId ? [el.containerId] : [];
  store.update(elements, { editingTextId: null, selectedIds }, { commit: true });
};

export const updateEditingText = (text: string) => {
  const id = store.appState.editingTextId;
  const el = store.elements.find((e) => e.id === id);
  if (!el || el.type !== "text") return;
  store.setElements(syncBindings(replaceById(store.elements, refreshTextDimensions(el, { text }))));
};

export const getElementAt = (x: number, y: number, { includeLocked = false } = {}) => {
  const { zoom, editingTextId } = store.appState;
  const tol = 10 / zoom;
  const els = store.elements;
  for (let i = els.length - 1; i >= 0; i--) {
    const el = els[i];
    if (el.id === editingTextId || (el.locked && !includeLocked)) continue;
    if (hitTest(el, x, y, tol)) {
      if (el.type === "text" && el.containerId) {
        const container = els.find((c) => c.id === el.containerId);
        if (container && (!container.locked || includeLocked)) return container;
        continue;
      }
      return el;
    }
  }
  return null;
};

/** Topmost shape that can hold text and whose interior contains the point (fill doesn't matter). */
const getContainerAt = (x: number, y: number, hit: SceneElement | null) => {
  if (hit && isTextContainer(hit)) return hit;
  if (hit) return null;
  const els = store.elements;
  for (let i = els.length - 1; i >= 0; i--) {
    const el = els[i];
    if (!el.locked && isTextContainer(el) && isInsideShape(el, x, y)) return el;
  }
  return null;
};

const getBindableAt = (x: number, y: number, excludeId?: string) => {
  const { zoom } = store.appState;
  const els = store.elements;
  for (let i = els.length - 1; i >= 0; i--) {
    const el = els[i];
    if (el.id === excludeId || !isBindable(el)) continue;
    if (isInsideShape(el, x, y) || hitTest(el, x, y, 12 / zoom)) return el;
  }
  return null;
};

export class Interaction {
  private canvas: HTMLCanvasElement | null = null;
  private session: Session | null = null;
  private touches = new Map<number, Point>();
  private pinch: { dist: number; center: Point; zoom: number; scroll: Point } | null = null;
  spaceDown = false;
  laserTrails: LaserTrail[] = [];
  onLaserFrame: () => void = () => {};

  attach(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerCancel);
    canvas.addEventListener("dblclick", this.onDoubleClick);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("contextmenu", this.onContextMenu);
    return () => {
      canvas.removeEventListener("pointerdown", this.onPointerDown);
      canvas.removeEventListener("pointermove", this.onPointerMove);
      canvas.removeEventListener("pointerup", this.onPointerUp);
      canvas.removeEventListener("pointercancel", this.onPointerCancel);
      canvas.removeEventListener("dblclick", this.onDoubleClick);
      canvas.removeEventListener("wheel", this.onWheel);
      canvas.removeEventListener("contextmenu", this.onContextMenu);
    };
  }

  get isBusy() {
    return !!this.session;
  }

  private setCursor(cursor: string) {
    if (this.canvas && this.canvas.style.cursor !== cursor) this.canvas.style.cursor = cursor;
  }

  updateCursorForTool() {
    const { tool, viewMode } = store.appState;
    if (this.spaceDown || tool === "hand" || (viewMode && tool !== "laser")) this.setCursor("grab");
    else if (tool === "text") this.setCursor("text");
    else if (tool === "eraser") this.setCursor(ERASER_CURSOR);
    else if (tool === "selection") this.setCursor("default");
    else this.setCursor("crosshair");
  }

  private snap(p: Point, e?: PointerEvent): Point {
    if (!store.appState.gridMode || e?.ctrlKey || e?.metaKey) return p;
    return [Math.round(p[0] / GRID_SIZE) * GRID_SIZE, Math.round(p[1] / GRID_SIZE) * GRID_SIZE];
  }

  private resetToolAfterCreate() {
    const { toolLocked } = store.appState;
    if (!toolLocked) store.setAppState({ tool: "selection" });
    this.updateCursorForTool();
  }

  // ---------------------------------------------------------------- pointer down

  private onPointerDown = (e: PointerEvent) => {
    const s = store.appState;
    if (s.contextMenu || s.menuOpen) store.setAppState({ contextMenu: null, menuOpen: false });
    if (s.editingTextId) finishTextEditing();

    if (e.pointerType === "touch") {
      this.touches.set(e.pointerId, [e.clientX, e.clientY]);
      if (this.touches.size === 2) {
        this.abortSession();
        this.startPinch();
        return;
      }
    }
    if (e.button === 2) return;
    e.preventDefault();
    this.canvas?.setPointerCapture(e.pointerId);

    const scene = screenToScene(e.clientX, e.clientY);
    const base: Session = {
      mode: "idle",
      pointerId: e.pointerId,
      startScene: scene,
      lastScreen: [e.clientX, e.clientY],
      lastScene: scene,
      elementsAtStart: store.elements,
      orig: new Map(),
      moved: false,
    };

    if (e.button === 1 || this.spaceDown || s.tool === "hand" || (s.viewMode && s.tool !== "laser")) {
      this.session = { ...base, mode: "panning" };
      this.setCursor("grabbing");
      return;
    }

    if (s.multiPointId) {
      this.multiPointClick(scene, e);
      return;
    }

    switch (s.tool) {
      case "selection":
        this.selectionDown(e, scene, base);
        break;
      case "eraser":
        this.session = { ...base, mode: "erasing" };
        store.setAppState({ eraserPending: [] });
        this.eraseAlong(scene, scene);
        break;
      case "laser": {
        const trail: LaserTrail = { points: [{ x: scene[0], y: scene[1], t: performance.now() }] };
        this.laserTrails.push(trail);
        this.session = { ...base, mode: "laser", laser: trail };
        this.onLaserFrame();
        break;
      }
      case "text":
        this.textDown(scene);
        break;
      case "freedraw": {
        const el = newElement("freedraw", scene[0], scene[1], s.currentStyle);
        store.update([...store.elements, el], { selectedIds: [] });
        this.session = {
          ...base,
          mode: "freedraw",
          elementId: el.id,
          absPoints: [scene],
          pressures: [e.pointerType === "pen" ? e.pressure : 0.5],
        };
        break;
      }
      case "arrow":
      case "line": {
        const start = this.snap(scene, e);
        const startTarget = s.tool === "arrow" ? getBindableAt(start[0], start[1]) : null;
        let el = newElement(s.tool, start[0], start[1], s.currentStyle) as LinearElement;
        el = withAbsPoints(el, [start, start], {
          startBinding: startTarget ? { elementId: startTarget.id } : null,
        });
        store.update([...store.elements, el], { selectedIds: [], suggestedBindingId: null });
        this.session = { ...base, mode: "creatingLinear", elementId: el.id, startScene: start };
        break;
      }
      default:
        if (SHAPE_TOOLS.includes(s.tool)) {
          const start = this.snap(scene, e);
          const el = newElement(s.tool as SceneElement["type"], start[0], start[1], s.currentStyle);
          store.update([...store.elements, el], { selectedIds: [] });
          this.session = { ...base, mode: "creating", elementId: el.id, startScene: start };
        }
    }
  };

  private selectionDown(e: PointerEvent, scene: Point, base: Session) {
    const s = store.appState;
    const zoom = s.zoom;
    const selected = getSelected();
    const locked = selected.some((el) => el.locked);

    if (selected.length && !locked) {
      if (selected.length === 1 && isLinear(selected[0])) {
        const el = selected[0];
        const idx = el.points.findIndex(
          ([px, py]) => distance([el.x + px, el.y + py], scene) < 9 / zoom,
        );
        if (idx >= 0) {
          this.session = {
            ...base,
            mode: "linearPoint",
            elementId: el.id,
            pointIndex: idx,
            orig: new Map([[el.id, el]]),
          };
          return;
        }
      }
      const target = getTransformTarget(selected);
      if (target) {
        const single = selected.length === 1 ? selected[0] : null;
        const handle = getHandleAt(
          getHandles(target, zoom, { cornersOnly: single?.type === "text" }),
          scene[0],
          scene[1],
          zoom,
        );
        if (handle) {
          const ids = withBoundTexts(store.elements, s.selectedIds);
          this.session = {
            ...base,
            mode: handle === "rotation" ? "rotating" : "resizing",
            handle,
            target,
            orig: new Map(store.elements.filter((el) => ids.has(el.id)).map((el) => [el.id, el])),
          };
          return;
        }
      }
    }

    // link icons
    for (let i = store.elements.length - 1; i >= 0; i--) {
      const el = store.elements[i];
      if (!el.link) continue;
      const [lx, ly, size] = getLinkIconBounds(el, zoom);
      if (scene[0] >= lx && scene[0] <= lx + size && scene[1] >= ly && scene[1] <= ly + size) {
        window.open(el.link, "_blank", "noopener");
        return;
      }
    }

    const hit = getElementAt(scene[0], scene[1]);
    if (hit) {
      if ((e.ctrlKey || e.metaKey) && hit.link) {
        window.open(hit.link, "_blank", "noopener");
        return;
      }
      const group = expandSelection(store.elements, [hit.id]);
      let ids: string[];
      let clickedGroup: string[] | undefined;
      if (e.shiftKey) {
        if (s.selectedIds.includes(hit.id)) {
          const remove = new Set(group);
          store.setAppState({ selectedIds: s.selectedIds.filter((id) => !remove.has(id)) });
          return;
        }
        ids = [...new Set([...s.selectedIds, ...group])];
      } else if (s.selectedIds.includes(hit.id)) {
        ids = s.selectedIds;
        clickedGroup = group;
      } else {
        ids = group;
      }
      store.setAppState({ selectedIds: ids });
      this.startDrag(base, ids, clickedGroup);
      return;
    }

    if (selected.length > 1) {
      const [a, b, c, d] = getCommonBounds(selected);
      if (scene[0] >= a && scene[0] <= c && scene[1] >= b && scene[1] <= d) {
        this.startDrag(base, s.selectedIds);
        return;
      }
    }

    const prevSelection = e.shiftKey ? s.selectedIds : [];
    if (!e.shiftKey) store.setAppState({ selectedIds: [] });
    this.session = { ...base, mode: "boxSelect", prevSelection };
  }

  private startDrag(base: Session, ids: string[], clickedGroup?: string[]) {
    const all = withBoundTexts(store.elements, ids);
    const orig = new Map(
      store.elements.filter((el) => all.has(el.id) && !el.locked).map((el) => [el.id, el]),
    );
    this.session = { ...base, mode: "dragging", orig, clickedGroup };
    this.setCursor("move");
  }

  private textDown(scene: Point) {
    const hit = getElementAt(scene[0], scene[1]);
    const container = getContainerAt(scene[0], scene[1], hit);
    if (hit?.type === "text") {
      store.setAppState({ editingTextId: hit.id, selectedIds: [hit.id] });
    } else if (container) {
      editContainerText(container);
    } else {
      this.createTextAt(scene);
    }
    this.resetToolAfterCreate();
  }

  createTextAt(scene: Point) {
    const s = store.appState;
    const lineH = s.currentStyle.fontSize * LINE_HEIGHT;
    let el = newElement("text", scene[0], scene[1] - lineH / 2, s.currentStyle) as TextElement;
    el = refreshTextDimensions(el);
    store.update([...store.elements, el], { editingTextId: el.id, selectedIds: [el.id] });
  }

  private multiPointClick(scene: Point, e: PointerEvent) {
    const s = store.appState;
    const el = store.elements.find((x) => x.id === s.multiPointId);
    if (!el || !isLinear(el)) {
      store.setAppState({ multiPointId: null });
      return;
    }
    const abs = getAbsPoints(el);
    const fixed = abs.slice(0, -1);
    const lastFixed = fixed[fixed.length - 1];
    const tol = 9 / s.zoom;
    if (distance(scene, lastFixed) < tol) {
      this.finalizeMultiPoint();
      return;
    }
    if (el.type === "line" && fixed.length >= 3 && distance(scene, fixed[0]) < tol) {
      // close the polygon
      store.setElements(replaceById(store.elements, withAbsPoints(el, [...fixed, fixed[0], fixed[0]])));
      this.finalizeMultiPoint();
      return;
    }
    const p = this.constrainLinear(lastFixed, scene, e);
    store.setElements(replaceById(store.elements, withAbsPoints(el, [...fixed, p, p])));
  }

  finalizeMultiPoint() {
    const s = store.appState;
    const el = store.elements.find((x) => x.id === s.multiPointId);
    if (!el || !isLinear(el)) {
      store.setAppState({ multiPointId: null, suggestedBindingId: null });
      return;
    }
    const abs = getAbsPoints(el).slice(0, -1);
    if (abs.length < 2) {
      store.update(
        store.elements.filter((x) => x.id !== el.id),
        { multiPointId: null, suggestedBindingId: null },
        { commit: true },
      );
      this.resetToolAfterCreate();
      return;
    }
    const last = abs[abs.length - 1];
    const endTarget =
      el.type === "arrow" ? getBindableAt(last[0], last[1], el.id) : null;
    const finished = withAbsPoints(el, abs, {
      endBinding: endTarget ? { elementId: endTarget.id } : null,
    });
    store.update(
      syncBindings(replaceById(store.elements, finished)),
      { multiPointId: null, suggestedBindingId: null, selectedIds: [el.id] },
      { commit: true },
    );
    this.resetToolAfterCreate();
  }

  private constrainLinear(from: Point, to: Point, e: PointerEvent): Point {
    let p = this.snap(to, e);
    if (e.shiftKey) p = snapAngle(from, p);
    return p;
  }

  // ---------------------------------------------------------------- pointer move

  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerType === "touch" && this.touches.has(e.pointerId)) {
      this.touches.set(e.pointerId, [e.clientX, e.clientY]);
      if (this.pinch) {
        this.updatePinch();
        return;
      }
    }
    const scene = screenToScene(e.clientX, e.clientY);
    const session = this.session;
    if (!session || session.pointerId !== e.pointerId) {
      this.hover(scene, e);
      return;
    }
    const dist = Math.hypot(e.clientX - session.lastScreen[0], e.clientY - session.lastScreen[1]);
    if (!session.moved && dist < 3 && session.mode !== "panning" && session.mode !== "freedraw") {
      return;
    }
    if (dist >= 3 || session.mode === "freedraw") session.moved = true;

    switch (session.mode) {
      case "panning": {
        const { zoom, scrollX, scrollY } = store.appState;
        store.setAppState({
          scrollX: scrollX + (e.clientX - session.lastScreen[0]) / zoom,
          scrollY: scrollY + (e.clientY - session.lastScreen[1]) / zoom,
        });
        session.lastScreen = [e.clientX, e.clientY];
        break;
      }
      case "creating":
        this.updateCreatingShape(session, scene, e);
        break;
      case "creatingLinear":
        this.updateCreatingLinear(session, scene, e);
        break;
      case "freedraw":
        this.updateFreedraw(session, scene, e);
        break;
      case "dragging":
        this.updateDrag(session, scene, e);
        break;
      case "resizing":
        this.updateResize(session, scene, e);
        break;
      case "rotating":
        this.updateRotate(session, scene, e);
        break;
      case "boxSelect":
        this.updateBoxSelect(session, scene);
        break;
      case "erasing":
        this.eraseAlong(session.lastScene, scene);
        break;
      case "linearPoint":
        this.updateLinearPoint(session, scene, e);
        break;
      case "laser":
        session.laser!.points.push({ x: scene[0], y: scene[1], t: performance.now() });
        this.onLaserFrame();
        break;
    }
    session.lastScene = scene;
  };

  private hover(scene: Point, e: PointerEvent) {
    const s = store.appState;
    if (s.multiPointId) {
      const el = store.elements.find((x) => x.id === s.multiPointId);
      if (el && isLinear(el)) {
        const abs = getAbsPoints(el);
        const p = this.constrainLinear(abs[abs.length - 2], scene, e);
        abs[abs.length - 1] = p;
        const target = el.type === "arrow" ? getBindableAt(p[0], p[1], el.id) : null;
        store.update(replaceById(store.elements, withAbsPoints(el, abs)), {
          suggestedBindingId: target?.id ?? null,
        });
      }
      return;
    }
    if (this.spaceDown || s.tool !== "selection" || s.viewMode) {
      this.updateCursorForTool();
      return;
    }
    const selected = getSelected();
    if (selected.length && !selected.some((x) => x.locked)) {
      if (selected.length === 1 && isLinear(selected[0])) {
        const el = selected[0];
        if (el.points.some(([px, py]) => distance([el.x + px, el.y + py], scene) < 9 / s.zoom)) {
          this.setCursor("pointer");
          return;
        }
      }
      const target = getTransformTarget(selected);
      if (target) {
        const handle = getHandleAt(
          getHandles(target, s.zoom, { cornersOnly: selected.length === 1 && selected[0].type === "text" }),
          scene[0],
          scene[1],
          s.zoom,
        );
        if (handle) {
          this.setCursor(getHandleCursor(handle, target.angle));
          return;
        }
      }
    }
    const hit = getElementAt(scene[0], scene[1]);
    this.setCursor(hit ? "move" : "default");
  }

  private updateCreatingShape(session: Session, scene: Point, e: PointerEvent) {
    const el = store.elements.find((x) => x.id === session.elementId);
    if (!el) return;
    const [x0, y0] = session.startScene;
    let [x1, y1] = this.snap(scene, e);
    if (e.shiftKey) {
      const size = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      x1 = x0 + Math.sign(x1 - x0 || 1) * size;
      y1 = y0 + Math.sign(y1 - y0 || 1) * size;
    }
    let x: number, y: number, w: number, h: number;
    if (e.altKey) {
      w = Math.abs(x1 - x0) * 2;
      h = Math.abs(y1 - y0) * 2;
      x = x0 - w / 2;
      y = y0 - h / 2;
    } else {
      x = Math.min(x0, x1);
      y = Math.min(y0, y1);
      w = Math.abs(x1 - x0);
      h = Math.abs(y1 - y0);
    }
    store.setElements(replaceById(store.elements, mutate(el, { x, y, width: w, height: h })));
  }

  private updateCreatingLinear(session: Session, scene: Point, e: PointerEvent) {
    const el = store.elements.find((x) => x.id === session.elementId);
    if (!el || !isLinear(el)) return;
    const start = session.startScene;
    const end = this.constrainLinear(start, scene, e);
    const target = el.type === "arrow" ? getBindableAt(end[0], end[1], el.id) : null;
    const next = withAbsPoints(el, [start, end]);
    store.update(syncBindings(replaceById(store.elements, next)), {
      suggestedBindingId: target && target.id !== el.startBinding?.elementId ? target.id : null,
    });
  }

  private updateFreedraw(session: Session, scene: Point, e: PointerEvent) {
    const el = store.elements.find((x) => x.id === session.elementId);
    if (!el || el.type !== "freedraw") return;
    const events = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
    const list = events.length ? events : [e];
    for (const ev of list) {
      session.absPoints!.push(screenToScene(ev.clientX, ev.clientY));
      session.pressures!.push(ev.pointerType === "pen" ? ev.pressure : 0.5);
    }
    void scene;
    store.setElements(
      replaceById(
        store.elements,
        withAbsPoints(el, session.absPoints!, { pressures: [...session.pressures!] }),
      ),
    );
  }

  private updateDrag(session: Session, scene: Point, e: PointerEvent) {
    let dx = scene[0] - session.startScene[0];
    let dy = scene[1] - session.startScene[1];
    if (e.shiftKey) {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    const origEls = [...session.orig.values()];
    if (!origEls.length) return;
    if (store.appState.gridMode && !(e.ctrlKey || e.metaKey)) {
      const [minX, minY] = getCommonBounds(origEls);
      dx = Math.round((minX + dx) / GRID_SIZE) * GRID_SIZE - minX;
      dy = Math.round((minY + dy) / GRID_SIZE) * GRID_SIZE - minY;
    }
    let elements = store.elements;
    if (e.altKey && !session.duplicated) {
      // leave copies behind at the original position
      session.duplicated = true;
      const copies = duplicateElements(origEls);
      const firstIdx = Math.min(...origEls.map((o) => elements.findIndex((x) => x.id === o.id)));
      elements = [...elements];
      elements.splice(firstIdx, 0, ...copies);
    }
    const moving = new Set(session.orig.keys());
    elements = elements.map((el) => {
      const o = session.orig.get(el.id);
      if (!o) return el;
      return detachBindings(mutate(o, { x: o.x + dx, y: o.y + dy }), moving);
    });
    store.setElements(syncBindings(elements));
  }

  private updateResize(session: Session, scene: Point, e: PointerEvent) {
    const handle = session.handle!;
    const origEls = [...session.orig.values()].filter((o) => !(o.type === "text" && o.containerId));
    const sx = handle.includes("e") ? 1 : handle.includes("w") ? -1 : 0;
    const sy = handle.includes("s") ? 1 : handle.includes("n") ? -1 : 0;
    let elements = store.elements;

    if (origEls.length === 1) {
      const o = origEls[0];
      const w = o.width || 1;
      const h = o.height || 1;
      const [cx, cy] = getCenter(o);
      const fromCenter = e.altKey;
      const anchor: Point = fromCenter
        ? [cx, cy]
        : rotatePoint(cx - (sx * w) / 2, cy - (sy * h) / 2, cx, cy, o.angle);
      const [rx, ry] = rotatePoint(scene[0], scene[1], anchor[0], anchor[1], -o.angle);
      const lx = rx - anchor[0];
      const ly = ry - anchor[1];
      const k = fromCenter ? 2 : 1;
      let nw = sx ? lx * sx * k : w;
      let nh = sy ? ly * sy * k : h;
      const keepAspect = o.type === "text" || (o.type === "image" ? !e.shiftKey : e.shiftKey);
      if (keepAspect) {
        if (sx && sy) {
          if (Math.abs(nw) / w > Math.abs(nh) / h) nh = (Math.sign(nh) || 1) * (Math.abs(nw) / w) * h;
          else nw = (Math.sign(nw) || 1) * (Math.abs(nh) / h) * w;
        } else if (sx) nh = (Math.abs(nw) / w) * h;
        else nw = (Math.abs(nh) / h) * w;
      }
      if (Math.abs(nw) < 1) nw = Math.sign(nw) || 1;
      if (Math.abs(nh) < 1) nh = Math.sign(nh) || 1;
      const center: Point = fromCenter
        ? [cx, cy]
        : (() => {
            const off = rotatePoint((sx * nw) / 2, (sy * nh) / 2, 0, 0, o.angle);
            return [anchor[0] + off[0], anchor[1] + off[1]] as Point;
          })();
      const aw = Math.abs(nw);
      const ah = Math.abs(nh);
      let next: SceneElement;
      if (hasPoints(o)) {
        const fx = o.width ? nw / o.width : 1;
        const fy = o.height ? nh / o.height : 1;
        const abs = o.points.map(
          ([px, py]) => [center[0] + (px - o.width / 2) * fx, center[1] + (py - o.height / 2) * fy] as Point,
        );
        next = withAbsPoints(o, abs);
      } else if (o.type === "text") {
        const fontSize = Math.max(4, (o.fontSize * aw) / w);
        next = refreshTextDimensions(o, { fontSize });
        next = mutate(next, { x: center[0] - next.width / 2, y: center[1] - next.height / 2 });
      } else {
        next = mutate(o, { x: center[0] - aw / 2, y: center[1] - ah / 2, width: aw, height: ah });
      }
      elements = replaceById(elements, next);
    } else {
      const t = session.target!;
      const anchorX = sx > 0 ? t.x : t.x + t.width;
      const anchorY = sy > 0 ? t.y : t.y + t.height;
      const refX = sx > 0 ? t.x + t.width : t.x;
      const refY = sy > 0 ? t.y + t.height : t.y;
      let fx = sx ? (scene[0] - anchorX) / (refX - anchorX || 1) : 1;
      let fy = sy ? (scene[1] - anchorY) / (refY - anchorY || 1) : 1;
      if (sx && sy) fx = fy = Math.max(fx, fy);
      fx = Math.max(0.05, fx);
      fy = Math.max(0.05, fy);
      const ox = sx ? anchorX : t.x + t.width / 2;
      const oy = sy ? anchorY : t.y + t.height / 2;
      const map = new Map(origEls.map((o) => [o.id, scaleElementFrom(o, ox, oy, fx, fy)]));
      elements = elements.map((el) => map.get(el.id) ?? el);
    }
    store.setElements(syncBindings(elements));
  }

  private updateRotate(session: Session, scene: Point, e: PointerEvent) {
    const t = session.target!;
    const cx = t.x + t.width / 2;
    const cy = t.y + t.height / 2;
    const a0 = Math.atan2(session.startScene[1] - cy, session.startScene[0] - cx);
    const a1 = Math.atan2(scene[1] - cy, scene[0] - cx);
    let delta = a1 - a0;
    const step = Math.PI / 12;
    const origEls = [...session.orig.values()].filter((o) => !(o.type === "text" && o.containerId));
    if (e.shiftKey) {
      if (origEls.length === 1 && !hasPoints(origEls[0])) {
        const target = Math.round((origEls[0].angle + delta) / step) * step;
        delta = target - origEls[0].angle;
      } else {
        delta = Math.round(delta / step) * step;
      }
    }
    const moving = new Set(session.orig.keys());
    const map = new Map(
      origEls.map((o) => [o.id, detachBindings(rotateElementAround(o, cx, cy, delta), moving)]),
    );
    store.setElements(syncBindings(store.elements.map((el) => map.get(el.id) ?? el)));
  }

  private updateBoxSelect(session: Session, scene: Point) {
    const [x1, y1] = session.startScene;
    const [x2, y2] = scene;
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    const inside = store.elements
      .filter((el) => {
        if (el.locked || (el.type === "text" && el.containerId)) return false;
        const [a, b, c, d] = getElementBounds(el);
        return a >= minX && c <= maxX && b >= minY && d <= maxY;
      })
      .map((el) => el.id);
    store.setAppState({
      selectionBox: [x1, y1, x2, y2],
      selectedIds: expandSelection(store.elements, [...(session.prevSelection ?? []), ...inside]),
    });
  }

  private eraseAlong(from: Point, to: Point) {
    const { zoom, eraserPending } = store.appState;
    const pending = new Set(eraserPending);
    const steps = Math.max(1, Math.ceil(distance(from, to) / (4 / zoom)));
    let changed = false;
    for (let i = 0; i <= steps; i++) {
      const x = from[0] + ((to[0] - from[0]) * i) / steps;
      const y = from[1] + ((to[1] - from[1]) * i) / steps;
      const hit = getElementAt(x, y);
      if (hit && !pending.has(hit.id)) {
        for (const id of withBoundTexts(store.elements, expandSelection(store.elements, [hit.id]))) pending.add(id);
        changed = true;
      }
    }
    if (changed) store.setAppState({ eraserPending: [...pending] });
  }

  private updateLinearPoint(session: Session, scene: Point, e: PointerEvent) {
    const o = session.orig.get(session.elementId!);
    if (!o || !isLinear(o)) return;
    const abs = getAbsPoints(o);
    const idx = session.pointIndex!;
    const neighbour = abs[idx === 0 ? 1 : idx - 1] ?? abs[0];
    abs[idx] = this.constrainLinear(neighbour, scene, e);
    const isEnd = idx === 0 || idx === abs.length - 1;
    const target = isEnd && o.type === "arrow" ? getBindableAt(abs[idx][0], abs[idx][1], o.id) : null;
    const patch: Partial<LinearElement> = {};
    if (idx === 0) patch.startBinding = null;
    if (idx === abs.length - 1) patch.endBinding = null;
    store.update(syncBindings(replaceById(store.elements, withAbsPoints(o, abs, patch))), {
      suggestedBindingId: target?.id ?? null,
    });
  }

  // ---------------------------------------------------------------- pointer up

  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerType === "touch") {
      this.touches.delete(e.pointerId);
      if (this.pinch) {
        if (this.touches.size < 2) this.pinch = null;
        return;
      }
    }
    const session = this.session;
    if (!session || session.pointerId !== e.pointerId) return;
    this.session = null;
    const s = store.appState;

    switch (session.mode) {
      case "creating": {
        const el = store.elements.find((x) => x.id === session.elementId);
        if (!el) break;
        if (!session.moved || (el.width < 2 && el.height < 2)) {
          // simple click: drop a default-sized shape
          const size = 100;
          const placed = mutate(el, { x: el.x - size / 2, y: el.y - size / 2, width: size, height: size });
          store.update(replaceById(store.elements, placed), { selectedIds: [el.id] }, { commit: true });
        } else {
          store.update(store.elements, { selectedIds: [el.id] }, { commit: true });
        }
        this.resetToolAfterCreate();
        break;
      }
      case "creatingLinear": {
        const el = store.elements.find((x) => x.id === session.elementId);
        if (!el || !isLinear(el)) break;
        if (!session.moved) {
          store.setAppState({ multiPointId: el.id });
          break;
        }
        const abs = getAbsPoints(el);
        const last = abs[abs.length - 1];
        const target = el.type === "arrow" ? getBindableAt(last[0], last[1], el.id) : null;
        const finished = mutate(el, {
          endBinding: target && target.id !== el.startBinding?.elementId ? { elementId: target.id } : null,
        });
        store.update(
          syncBindings(replaceById(store.elements, finished)),
          { selectedIds: [el.id], suggestedBindingId: null },
          { commit: true },
        );
        this.resetToolAfterCreate();
        break;
      }
      case "freedraw": {
        const el = store.elements.find((x) => x.id === session.elementId);
        if (el && el.type === "freedraw" && session.absPoints!.length === 1) {
          const [x, y] = session.absPoints![0];
          store.setElements(
            replaceById(store.elements, withAbsPoints(el, [[x, y], [x + 0.5, y + 0.5]], { pressures: [0.5, 0.5] })),
          );
        }
        store.commitHistory();
        break;
      }
      case "dragging": {
        if (!session.moved) {
          if (session.clickedGroup && !e.shiftKey) store.setAppState({ selectedIds: session.clickedGroup });
        } else {
          store.commitHistory();
        }
        this.setCursor("move");
        break;
      }
      case "resizing":
      case "rotating":
      case "linearPoint": {
        if (session.mode === "linearPoint") {
          const el = store.elements.find((x) => x.id === session.elementId);
          const idx = session.pointIndex!;
          if (el && isLinear(el) && el.type === "arrow" && s.suggestedBindingId) {
            const isStart = idx === 0;
            const isEnd = idx === el.points.length - 1;
            const binding = { elementId: s.suggestedBindingId };
            const patch: Partial<LinearElement> = {};
            if (isStart && el.endBinding?.elementId !== binding.elementId) patch.startBinding = binding;
            if (isEnd && el.startBinding?.elementId !== binding.elementId) patch.endBinding = binding;
            store.setElements(syncBindings(replaceById(store.elements, mutate(el, patch))));
          }
          store.setAppState({ suggestedBindingId: null });
        }
        if (session.moved) store.commitHistory();
        break;
      }
      case "boxSelect":
        store.setAppState({ selectionBox: null });
        break;
      case "erasing": {
        const ids = new Set(s.eraserPending);
        if (ids.size) {
          store.update(deleteElements(store.elements, ids), { eraserPending: [], selectedIds: [] }, { commit: true });
        }
        break;
      }
      case "panning":
        this.updateCursorForTool();
        break;
      case "laser":
        this.onLaserFrame();
        break;
    }
  };

  private onPointerCancel = (e: PointerEvent) => {
    this.touches.delete(e.pointerId);
    if (this.touches.size < 2) this.pinch = null;
    if (this.session?.pointerId === e.pointerId) this.abortSession();
  };

  /** Throw away whatever the current gesture did. */
  abortSession() {
    const session = this.session;
    if (!session) return;
    this.session = null;
    store.update(session.elementsAtStart, {
      selectionBox: null,
      eraserPending: [],
      suggestedBindingId: null,
    });
  }

  // ---------------------------------------------------------------- pinch zoom

  private startPinch() {
    const [a, b] = [...this.touches.values()];
    const { zoom, scrollX, scrollY } = store.appState;
    this.pinch = {
      dist: distance(a, b),
      center: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
      zoom,
      scroll: [scrollX, scrollY],
    };
  }

  private updatePinch() {
    const p = this.pinch!;
    const [a, b] = [...this.touches.values()];
    if (!a || !b) return;
    const center: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const zoom = Math.min(30, Math.max(0.1, (p.zoom * distance(a, b)) / (p.dist || 1)));
    // scene point that was under the initial pinch center stays under the current center
    const sceneX = p.center[0] / p.zoom - p.scroll[0];
    const sceneY = p.center[1] / p.zoom - p.scroll[1];
    store.setAppState({ zoom, scrollX: center[0] / zoom - sceneX, scrollY: center[1] / zoom - sceneY });
  }

  // ---------------------------------------------------------------- misc events

  private onDoubleClick = (e: MouseEvent) => {
    const s = store.appState;
    if (s.viewMode || (s.tool !== "selection" && s.tool !== "text")) return;
    if (s.multiPointId) return;
    const scene = screenToScene(e.clientX, e.clientY);
    const hit = getElementAt(scene[0], scene[1]);
    const container = getContainerAt(scene[0], scene[1], hit);
    if (hit?.type === "text") {
      store.setAppState({ editingTextId: hit.id, selectedIds: [hit.id] });
    } else if (container) {
      editContainerText(container);
    } else if (hit && isLinear(hit)) {
      // insert a bend point on the nearest segment
      const abs = getAbsPoints(hit);
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < abs.length - 1; i++) {
        const d = distToSegment(scene, abs[i], abs[i + 1]);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      }
      abs.splice(best + 1, 0, scene);
      store.update(
        syncBindings(replaceById(store.elements, withAbsPoints(hit, abs))),
        { selectedIds: [hit.id] },
        { commit: true },
      );
    } else if (!hit) {
      this.createTextAt(scene);
    }
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const { zoom, scrollX, scrollY } = store.appState;
    if (e.ctrlKey || e.metaKey) {
      const factor = Math.exp(-Math.max(-50, Math.min(50, e.deltaY)) * 0.012);
      zoomAt(zoom * factor, e.clientX, e.clientY);
      return;
    }
    let dx = e.deltaX;
    let dy = e.deltaY;
    if (e.shiftKey && !dx) {
      dx = dy;
      dy = 0;
    }
    store.setAppState({ scrollX: scrollX - dx / zoom, scrollY: scrollY - dy / zoom });
  };

  private onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    const s = store.appState;
    if (s.multiPointId) this.finalizeMultiPoint();
    const scene = screenToScene(e.clientX, e.clientY);
    const hit = s.viewMode ? null : getElementAt(scene[0], scene[1], { includeLocked: true });
    if (hit && !s.selectedIds.includes(hit.id)) {
      store.setAppState({ selectedIds: expandSelection(store.elements, [hit.id]) });
    }
    store.setAppState({
      contextMenu: { x: e.clientX, y: e.clientY, sceneX: scene[0], sceneY: scene[1], onElement: !!hit },
      menuOpen: false,
    });
  };
}

export const interaction = new Interaction();
