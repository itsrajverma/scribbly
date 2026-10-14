import { useSyncExternalStore } from "react";
import { getSelected, insertElements, toast, viewportCenter } from "./actions";
import { downloadBlob, loadLibrary, pickFile, saveLibrary } from "./data";
import { randomId, restoreElement, withBoundTexts } from "./scene/elements";
import { store } from "./store";
import type { LibraryItem, SceneElement } from "./types";

let items: LibraryItem[] = loadLibrary();
const listeners = new Set<() => void>();

const setItems = (next: LibraryItem[]) => {
  items = next;
  saveLibrary(items);
  listeners.forEach((l) => l());
};

export const useLibrary = () =>
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => items,
  );

export const addSelectionToLibrary = () => {
  const sel = getSelected();
  if (!sel.length) return;
  const ids = withBoundTexts(store.elements, sel.map((e) => e.id));
  const els = store.elements.filter((e) => ids.has(e.id));
  setItems([{ id: randomId(), created: Date.now(), elements: structuredClone(els) }, ...items]);
  store.setAppState({ libraryOpen: true });
  toast("Added to library");
};

export const removeLibraryItem = (id: string) => setItems(items.filter((i) => i.id !== id));

export const insertLibraryItem = (item: LibraryItem) => insertElements(item.elements, viewportCenter());

export const exportLibrary = () => {
  const json = JSON.stringify({ type: "scribbly-library", version: 1, items }, null, 2);
  downloadBlob(new Blob([json], { type: "application/json" }), "library.scribblylib");
};

export const importLibrary = async () => {
  const file = await pickFile(".scribblylib,.excalidrawlib,.json");
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    // accept our format and the common "libraryItems"/"library" shapes
    const raw: any[] = data.items ?? data.libraryItems ?? data.library ?? [];
    const imported: LibraryItem[] = raw
      .map((it: any) => {
        const list = Array.isArray(it) ? it : it.elements;
        const elements = (list ?? []).map(restoreElement).filter(Boolean) as SceneElement[];
        return elements.length ? { id: randomId(), created: Date.now(), elements } : null;
      })
      .filter((x): x is LibraryItem => !!x);
    setItems([...imported, ...items]);
    toast(`Imported ${imported.length} item${imported.length === 1 ? "" : "s"}`);
  } catch {
    toast("Invalid library file");
  }
};
