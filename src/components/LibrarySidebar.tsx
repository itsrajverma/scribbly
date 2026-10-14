import { Download, Library, Plus, Trash2, Upload, X } from "lucide-react";
import { useMemo } from "react";
import { exportToSvg } from "../data";
import {
  addSelectionToLibrary,
  exportLibrary,
  importLibrary,
  insertLibraryItem,
  removeLibraryItem,
  useLibrary,
} from "../library";
import { store, useStore } from "../store";
import type { LibraryItem } from "../types";

function Preview({ item }: { item: LibraryItem }) {
  const src = useMemo(() => {
    const svg = exportToSvg(item.elements, { background: false, padding: 6 });
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.outerHTML)}`;
  }, [item]);
  return <img src={src} alt="Library item" draggable={false} />;
}

export function LibraryButton() {
  const { appState } = useStore();
  return (
    <button
      className={`island library-btn ${appState.libraryOpen ? "active" : ""}`}
      onClick={() => store.setAppState({ libraryOpen: !appState.libraryOpen })}
      aria-expanded={appState.libraryOpen}
    >
      <Library size={16} />
      <span>Library</span>
    </button>
  );
}

export function LibrarySidebar() {
  const items = useLibrary();
  const { appState } = useStore();
  if (!appState.libraryOpen) return null;
  return (
    <aside className="island library-sidebar" onPointerDown={(e) => e.stopPropagation()}>
      <header>
        <h2>Library</h2>
        <div className="library-actions">
          <button className="icon-btn" title="Import library" aria-label="Import library" onClick={importLibrary}>
            <Upload size={15} />
          </button>
          <button className="icon-btn" title="Export library" aria-label="Export library" onClick={exportLibrary} disabled={!items.length}>
            <Download size={15} />
          </button>
          <button className="icon-btn" aria-label="Close library" onClick={() => store.setAppState({ libraryOpen: false })}>
            <X size={16} />
          </button>
        </div>
      </header>
      <button className="library-add" disabled={!appState.selectedIds.length} onClick={addSelectionToLibrary}>
        <Plus size={15} /> Add selection to library
      </button>
      {items.length === 0 ? (
        <p className="library-empty">
          No items yet. Select elements on the canvas and add them here to reuse them later.
        </p>
      ) : (
        <div className="library-grid">
          {items.map((item) => (
            <div key={item.id} className="library-item">
              <button className="library-insert" title="Click to insert" onClick={() => insertLibraryItem(item)}>
                <Preview item={item} />
              </button>
              <button className="library-remove" title="Remove from library" aria-label="Remove from library" onClick={() => removeLibraryItem(item.id)}>
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
