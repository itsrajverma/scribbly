import {
  copySelectionAsPng,
  copyStyles,
  deleteSelected,
  duplicateSelected,
  flipSelected,
  getSelected,
  groupSelected,
  nudgeSelected,
  pasteStyles,
  reorderSelected,
  resetZoom,
  selectAll,
  setLinkOnSelected,
  toggleLockSelected,
  ungroupSelected,
  zoomStep,
  zoomToElements,
  editContainerText,
} from "./actions";
import { openSceneFile, saveSceneFile } from "./fileActions";
import { interaction } from "./interaction";
import { store } from "./store";
import { setTool } from "./tools";
import type { ToolType } from "./types";

const TOOL_KEYS: Record<string, ToolType> = {
  v: "selection",
  "1": "selection",
  r: "rectangle",
  "2": "rectangle",
  d: "diamond",
  "3": "diamond",
  o: "ellipse",
  "4": "ellipse",
  a: "arrow",
  "5": "arrow",
  l: "line",
  "6": "line",
  p: "freedraw",
  x: "freedraw",
  "7": "freedraw",
  t: "text",
  "8": "text",
  "9": "image",
  e: "eraser",
  "0": "eraser",
  h: "hand",
  k: "laser",
};

const isEditable = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);

export const onKeyDown = (e: KeyboardEvent) => {
  if (isEditable(e.target)) return;
  const s = store.appState;
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();

  if (e.key === " " && !e.repeat) {
    interaction.spaceDown = true;
    interaction.updateCursorForTool();
    e.preventDefault();
    return;
  }

  if (e.key === "Escape") {
    if (s.dialog) store.setAppState({ dialog: null });
    else if (s.contextMenu || s.menuOpen) store.setAppState({ contextMenu: null, menuOpen: false });
    else if (s.multiPointId) interaction.finalizeMultiPoint();
    else if (interaction.isBusy) interaction.abortSession();
    else if (s.tool !== "selection") setTool("selection");
    else store.setAppState({ selectedIds: [] });
    return;
  }
  if (s.dialog) return;

  if (e.key === "Enter") {
    if (s.multiPointId) {
      interaction.finalizeMultiPoint();
      return;
    }
    const sel = getSelected();
    if (sel.length === 1 && !s.viewMode) {
      const el = sel[0];
      if (el.type === "text") store.setAppState({ editingTextId: el.id });
      else if (el.type === "rectangle" || el.type === "diamond" || el.type === "ellipse") editContainerText(el);
      e.preventDefault();
    }
    return;
  }

  // ----- modifier shortcuts
  if (mod) {
    if (key === "z") {
      e.preventDefault();
      if (s.viewMode) return;
      if (e.shiftKey) store.redo();
      else store.undo();
      return;
    }
    if (key === "y") {
      e.preventDefault();
      store.redo();
      return;
    }
    if (key === "s") {
      e.preventDefault();
      saveSceneFile();
      return;
    }
    if (key === "o") {
      e.preventDefault();
      openSceneFile();
      return;
    }
    if (key === "e" && e.shiftKey) {
      e.preventDefault();
      store.setAppState({ dialog: "export" });
      return;
    }
    if (key === "'" || e.code === "Quote") {
      e.preventDefault();
      store.setAppState({ gridMode: !s.gridMode });
      return;
    }
    if (key === "0") {
      e.preventDefault();
      resetZoom();
      return;
    }
    if (key === "=" || key === "+") {
      e.preventDefault();
      zoomStep(1);
      return;
    }
    if (key === "-") {
      e.preventDefault();
      zoomStep(-1);
      return;
    }
    if (s.viewMode) return;
    if (key === "a") {
      e.preventDefault();
      selectAll();
      return;
    }
    if (key === "d") {
      e.preventDefault();
      duplicateSelected();
      return;
    }
    if (key === "g") {
      e.preventDefault();
      if (e.shiftKey) ungroupSelected();
      else groupSelected();
      return;
    }
    if (key === "k") {
      e.preventDefault();
      setLinkOnSelected();
      return;
    }
    if (key === "l" && e.shiftKey) {
      e.preventDefault();
      toggleLockSelected();
      return;
    }
    if (e.altKey && key === "c") {
      e.preventDefault();
      copyStyles();
      return;
    }
    if (e.altKey && key === "v") {
      e.preventDefault();
      pasteStyles();
      return;
    }
    if (e.code === "BracketRight") {
      e.preventDefault();
      reorderSelected(e.shiftKey ? "front" : "forward");
      return;
    }
    if (e.code === "BracketLeft") {
      e.preventDefault();
      reorderSelected(e.shiftKey ? "back" : "backward");
      return;
    }
    return;
  }

  // ----- alt shortcuts
  if (e.altKey) {
    if (e.code === "KeyZ") store.setAppState({ zenMode: !s.zenMode });
    else if (e.code === "KeyR") store.setAppState({ viewMode: !s.viewMode, selectedIds: [] });
    else if (e.code === "Slash") store.setAppState({ showStats: !s.showStats });
    else if (e.code === "KeyD" && e.shiftKey) store.setAppState({ theme: s.theme === "dark" ? "light" : "dark" });
    else if (e.code === "KeyC" && e.shiftKey) copySelectionAsPng();
    else return;
    e.preventDefault();
    return;
  }

  // ----- shift shortcuts
  if (e.shiftKey && !s.viewMode) {
    if (e.code === "Digit1") return zoomToElements(store.elements);
    if (e.code === "Digit2") return zoomToElements(getSelected(), 3);
    if (key === "h") return flipSelected("horizontal");
    if (key === "v") return flipSelected("vertical");
  }

  if (e.key === "?" || (e.shiftKey && e.code === "Slash")) {
    store.setAppState({ dialog: "help" });
    return;
  }

  if (e.key === "Delete" || e.key === "Backspace") {
    if (!s.viewMode) deleteSelected();
    return;
  }

  if (e.key.startsWith("Arrow") && s.selectedIds.length && !s.viewMode) {
    e.preventDefault();
    const step = e.shiftKey ? 10 : s.gridMode ? 20 : 1;
    const d: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    nudgeSelected(...d[e.key]);
    return;
  }

  if (key === "q" && !e.shiftKey) {
    store.setAppState({ toolLocked: !s.toolLocked });
    return;
  }

  const tool = TOOL_KEYS[key];
  if (tool && !e.shiftKey && !e.repeat) {
    if (s.viewMode && tool !== "laser" && tool !== "hand") return;
    setTool(tool);
  }
};

export const onKeyUp = (e: KeyboardEvent) => {
  if (e.key === " ") {
    interaction.spaceDown = false;
    interaction.updateCursorForTool();
  }
};
