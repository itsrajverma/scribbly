import { toast, zoomToElements } from "./actions";
import { downloadBlob, FILE_EXTENSION, parseScene, pickFile, serializeScene } from "./data";
import { store } from "./store";

export const loadSceneText = (text: string) => {
  const { elements, appState } = parseScene(text);
  store.update(elements, { ...appState, selectedIds: [], editingTextId: null }, { commit: true });
  zoomToElements(elements);
};

export const openSceneFile = async () => {
  const file = await pickFile(`${FILE_EXTENSION},.excalidraw,.json,application/json`);
  if (!file) return;
  try {
    loadSceneText(await file.text());
    toast(`Opened ${file.name}`);
  } catch {
    toast("Couldn't open file — is it a valid scene?");
  }
};

export const saveSceneFile = async () => {
  const { elements, appState } = store;
  const json = serializeScene(elements, appState);
  const filename = `${appState.name || "scene"}${FILE_EXTENSION}`;
  // Prefer the native save dialog where available
  const picker = (window as any).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({
        suggestedName: filename,
        types: [{ description: "Scribbly scene", accept: { "application/json": [FILE_EXTENSION] } }],
      });
      const w = await handle.createWritable();
      await w.write(json);
      await w.close();
      toast("Saved");
      return;
    } catch (err: any) {
      if (err?.name === "AbortError") return;
    }
  }
  downloadBlob(new Blob([json], { type: "application/json" }), filename);
  toast("Saved");
};
