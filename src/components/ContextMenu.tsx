import { useLayoutEffect, useRef, useState } from "react";
import {
  copySelectionAsPng,
  copyStyles,
  deleteSelected,
  duplicateSelected,
  flipSelected,
  getSelected,
  groupSelected,
  pasteFromText,
  pasteStyles,
  reorderSelected,
  selectAll,
  serializeSelection,
  setLinkOnSelected,
  toggleLockSelected,
  ungroupSelected,
  unlockAll,
  zoomToElements,
} from "../actions";
import { addSelectionToLibrary } from "../library";
import { store, useStore } from "../store";

type Entry = { label: string; shortcut?: string; action: () => void; danger?: boolean } | "sep";

const copyToClipboard = async (cut = false) => {
  const data = serializeSelection();
  if (!data) return;
  try {
    await navigator.clipboard.writeText(data);
  } catch {
    /* clipboard denied */
  }
  if (cut) deleteSelected();
};

const pasteFromClipboard = async (x: number, y: number) => {
  try {
    const text = await navigator.clipboard.readText();
    pasteFromText(text, [x, y]);
  } catch {
    store.setAppState({ toast: "Use Ctrl+V to paste" });
  }
};

export function ContextMenu() {
  const { appState, elements } = useStore();
  const menu = appState.contextMenu;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<[number, number]>([0, 0]);

  useLayoutEffect(() => {
    if (!menu || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos([
      Math.min(menu.x, window.innerWidth - r.width - 8),
      Math.max(8, Math.min(menu.y, window.innerHeight - r.height - 8)),
    ]);
  }, [menu]);

  if (!menu) return null;
  const selected = getSelected();
  const anyLocked = elements.some((e) => e.locked);

  const entries: Entry[] = menu.onElement
    ? [
        { label: "Cut", shortcut: "Ctrl+X", action: () => copyToClipboard(true) },
        { label: "Copy", shortcut: "Ctrl+C", action: () => copyToClipboard() },
        { label: "Paste", shortcut: "Ctrl+V", action: () => pasteFromClipboard(menu.sceneX, menu.sceneY) },
        { label: "Copy to clipboard as PNG", shortcut: "Shift+Alt+C", action: copySelectionAsPng },
        "sep",
        { label: "Copy styles", shortcut: "Ctrl+Alt+C", action: copyStyles },
        { label: "Paste styles", shortcut: "Ctrl+Alt+V", action: pasteStyles },
        "sep",
        ...(selected.length > 1 ? [{ label: "Group selection", shortcut: "Ctrl+G", action: groupSelected }] : []),
        ...(selected.some((e) => e.groupIds.length)
          ? [{ label: "Ungroup", shortcut: "Ctrl+Shift+G", action: ungroupSelected }]
          : []),
        { label: "Add to library", action: addSelectionToLibrary },
        "sep",
        { label: "Send backward", shortcut: "Ctrl+[", action: () => reorderSelected("backward") },
        { label: "Bring forward", shortcut: "Ctrl+]", action: () => reorderSelected("forward") },
        { label: "Send to back", shortcut: "Ctrl+Shift+[", action: () => reorderSelected("back") },
        { label: "Bring to front", shortcut: "Ctrl+Shift+]", action: () => reorderSelected("front") },
        "sep",
        { label: "Flip horizontal", shortcut: "Shift+H", action: () => flipSelected("horizontal") },
        { label: "Flip vertical", shortcut: "Shift+V", action: () => flipSelected("vertical") },
        { label: selected[0]?.link ? "Edit link" : "Add link", shortcut: "Ctrl+K", action: setLinkOnSelected },
        {
          label: selected.every((e) => e.locked) ? "Unlock" : "Lock",
          shortcut: "Ctrl+Shift+L",
          action: toggleLockSelected,
        },
        "sep",
        { label: "Duplicate", shortcut: "Ctrl+D", action: duplicateSelected },
        { label: "Delete", shortcut: "Delete", action: deleteSelected, danger: true },
      ]
    : [
        { label: "Paste", shortcut: "Ctrl+V", action: () => pasteFromClipboard(menu.sceneX, menu.sceneY) },
        "sep",
        { label: "Select all", shortcut: "Ctrl+A", action: selectAll },
        ...(anyLocked ? [{ label: "Unlock all", action: unlockAll }] : []),
        { label: "Zoom to fit all elements", shortcut: "Shift+1", action: () => zoomToElements(store.elements) },
        "sep",
        {
          label: appState.gridMode ? "Hide grid" : "Show grid",
          shortcut: "Ctrl+'",
          action: () => store.setAppState({ gridMode: !appState.gridMode }),
        },
        {
          label: "Zen mode",
          shortcut: "Alt+Z",
          action: () => store.setAppState({ zenMode: !appState.zenMode }),
        },
        {
          label: "View mode",
          shortcut: "Alt+R",
          action: () => store.setAppState({ viewMode: !appState.viewMode, selectedIds: [] }),
        },
        {
          label: appState.theme === "dark" ? "Light mode" : "Dark mode",
          shortcut: "Alt+Shift+D",
          action: () => store.setAppState({ theme: appState.theme === "dark" ? "light" : "dark" }),
        },
        "sep",
        { label: "Copy to clipboard as PNG", shortcut: "Shift+Alt+C", action: copySelectionAsPng },
      ];

  return (
    <div
      ref={ref}
      className="island context-menu"
      role="menu"
      style={{ left: pos[0], top: pos[1] }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {entries.map((entry, i) =>
        entry === "sep" ? (
          <div key={i} className="menu-sep" />
        ) : (
          <button
            key={i}
            role="menuitem"
            className={`menu-item ${entry.danger ? "danger" : ""}`}
            onClick={() => {
              store.setAppState({ contextMenu: null });
              entry.action();
            }}
          >
            <span className="menu-label">{entry.label}</span>
            {entry.shortcut && <kbd className="menu-shortcut">{entry.shortcut}</kbd>}
          </button>
        ),
      )}
    </div>
  );
}
