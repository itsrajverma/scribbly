import { CircleHelp, Minus, Plus, Redo2, Undo2 } from "lucide-react";
import { resetZoom, zoomStep } from "../actions";
import { store, useStore } from "../store";

export function Footer() {
  const { appState } = useStore();
  return (
    <>
      <div className="footer-left">
        <div className="island btn-group">
          <button className="icon-btn" title="Zoom out — Ctrl+-" aria-label="Zoom out" onClick={() => zoomStep(-1)}>
            <Minus size={16} />
          </button>
          <button className="zoom-value" title="Reset zoom — Ctrl+0" onClick={resetZoom}>
            {Math.round(appState.zoom * 100)}%
          </button>
          <button className="icon-btn" title="Zoom in — Ctrl++" aria-label="Zoom in" onClick={() => zoomStep(1)}>
            <Plus size={16} />
          </button>
        </div>
        {!appState.viewMode && (
          <div className="island btn-group">
            <button className="icon-btn" title="Undo — Ctrl+Z" aria-label="Undo" disabled={!store.canUndo} onClick={() => store.undo()}>
              <Undo2 size={16} />
            </button>
            <button className="icon-btn" title="Redo — Ctrl+Shift+Z" aria-label="Redo" disabled={!store.canRedo} onClick={() => store.redo()}>
              <Redo2 size={16} />
            </button>
          </div>
        )}
      </div>
      <div className="footer-right">
        <button
          className="island icon-btn"
          title="Help — ?"
          aria-label="Help"
          onClick={() => store.setAppState({ dialog: "help" })}
        >
          <CircleHelp size={17} />
        </button>
      </div>
    </>
  );
}
