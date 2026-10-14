import { insertImageFile } from "./actions";
import { pickFile } from "./data";
import { finishTextEditing, interaction } from "./interaction";
import { store } from "./store";
import type { ToolType } from "./types";

export const setTool = async (tool: ToolType) => {
  if (store.appState.multiPointId) interaction.finalizeMultiPoint();
  if (store.appState.editingTextId) finishTextEditing();
  if (tool === "image") {
    store.setAppState({ tool: "selection" });
    const file = await pickFile("image/*");
    if (file) await insertImageFile(file);
    return;
  }
  const keepSelection = tool === "selection" || tool === "hand" || tool === "laser";
  store.setAppState({
    tool,
    selectedIds: keepSelection ? store.appState.selectedIds : [],
    menuOpen: false,
  });
  interaction.updateCursorForTool();
};
