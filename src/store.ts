import { useSyncExternalStore } from "react";
import type { AppState, SceneElement, StyleProps } from "./types";

export const DEFAULT_STYLE: StyleProps = {
  strokeColor: "#1e1e1e",
  backgroundColor: "transparent",
  fillStyle: "solid",
  strokeWidth: 2,
  strokeStyle: "solid",
  roughness: 1,
  opacity: 100,
  roundness: true,
  fontSize: 20,
  fontFamily: 1,
  textAlign: "left",
  startArrowhead: null,
  endArrowhead: "arrow",
};

export const getDefaultAppState = (): AppState => ({
  tool: "selection",
  toolLocked: false,
  selectedIds: [],
  scrollX: 0,
  scrollY: 0,
  zoom: 1,
  theme: window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  viewBackgroundColor: "#ffffff",
  gridMode: false,
  zenMode: false,
  viewMode: false,
  currentStyle: { ...DEFAULT_STYLE },
  editingTextId: null,
  multiPointId: null,
  selectionBox: null,
  suggestedBindingId: null,
  eraserPending: [],
  dialog: null,
  libraryOpen: false,
  menuOpen: false,
  contextMenu: null,
  toast: null,
  name: `Untitled-${new Date().toISOString().slice(0, 10)}`,
  showStats: false,
});

interface Snapshot {
  elements: SceneElement[];
  appState: AppState;
}

const HISTORY_LIMIT = 200;

class Store {
  private snapshot: Snapshot = { elements: [], appState: getDefaultAppState() };
  private listeners = new Set<() => void>();
  private past: SceneElement[][] = [];
  private future: SceneElement[][] = [];
  private committed: SceneElement[] = [];

  get elements() {
    return this.snapshot.elements;
  }
  get appState() {
    return this.snapshot.appState;
  }
  getSnapshot = () => this.snapshot;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private emit() {
    for (const fn of this.listeners) fn();
  }

  setElements(elements: SceneElement[], { commit = false } = {}) {
    this.snapshot = { ...this.snapshot, elements };
    if (commit) this.commitHistory();
    this.emit();
  }

  setAppState(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) {
    const p = typeof patch === "function" ? patch(this.snapshot.appState) : patch;
    this.snapshot = { ...this.snapshot, appState: { ...this.snapshot.appState, ...p } };
    this.emit();
  }

  update(elements: SceneElement[], patch: Partial<AppState>, { commit = false } = {}) {
    this.snapshot = { elements, appState: { ...this.snapshot.appState, ...patch } };
    if (commit) this.commitHistory();
    this.emit();
  }

  /** Record the current elements as an undo step if they changed since the last commit. */
  commitHistory() {
    if (this.snapshot.elements === this.committed) return;
    this.past.push(this.committed);
    if (this.past.length > HISTORY_LIMIT) this.past.shift();
    this.future = [];
    this.committed = this.snapshot.elements;
  }

  /** Replace the scene without creating an undo step (initial load). */
  resetHistory(elements: SceneElement[]) {
    this.past = [];
    this.future = [];
    this.committed = elements;
    this.snapshot = { ...this.snapshot, elements };
    this.emit();
  }

  private restore(elements: SceneElement[]) {
    this.committed = elements;
    const ids = new Set(elements.map((e) => e.id));
    this.snapshot = {
      elements,
      appState: {
        ...this.snapshot.appState,
        selectedIds: this.snapshot.appState.selectedIds.filter((id) => ids.has(id)),
        editingTextId: null,
        multiPointId: null,
      },
    };
    this.emit();
  }

  undo() {
    this.commitHistory();
    const prev = this.past.pop();
    if (!prev) return;
    this.future.push(this.committed);
    this.restore(prev);
  }

  redo() {
    const next = this.future.pop();
    if (!next) return;
    this.past.push(this.committed);
    this.restore(next);
  }

  get canUndo() {
    return this.past.length > 0 || this.snapshot.elements !== this.committed;
  }
  get canRedo() {
    return this.future.length > 0;
  }
}

export const store = new Store();

export const useStore = () => useSyncExternalStore(store.subscribe, store.getSnapshot);
