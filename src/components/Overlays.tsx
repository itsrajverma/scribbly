import { CircleHelp, FolderOpen } from "lucide-react";
import { openSceneFile } from "../fileActions";
import { getCommonBounds } from "../scene/geometry";
import { store, useStore } from "../store";

export function WelcomeScreen() {
  const { elements, appState } = useStore();
  if (elements.length || appState.viewMode || appState.zenMode || appState.tool !== "selection") return null;
  return (
    <div className="welcome">
      <div className="welcome-hint hint-menu">
        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M55 35C40 30 25 25 8 8" />
          <path d="M8 8l2 9M8 8l9 1" />
        </svg>
        <span>Export, preferences, languages…</span>
      </div>
      <div className="welcome-hint hint-tools">
        <svg width="40" height="50" viewBox="0 0 40 50" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M20 48C22 30 22 18 20 4" />
          <path d="M20 4l-5 8M20 4l5 8" />
        </svg>
        <span>Pick a tool &amp; start drawing!</span>
      </div>
      <div className="welcome-center">
        <div className="logo">
          <svg width="44" height="44" viewBox="0 0 32 32" aria-hidden>
            <rect width="32" height="32" rx="8" fill="#6965db" />
            <path d="M8 22c3-6 6-12 9-12s-2 9 1 9 4-5 6-7" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Scribbly</span>
        </div>
        <p>All your data is saved locally in your browser.</p>
        <div className="welcome-actions">
          <button onClick={openSceneFile}>
            <FolderOpen size={16} /> Open <kbd>Ctrl+O</kbd>
          </button>
          <button onClick={() => store.setAppState({ dialog: "help" })}>
            <CircleHelp size={16} /> Help <kbd>?</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}

export function StatsPanel() {
  const { elements, appState } = useStore();
  if (!appState.showStats) return null;
  const ids = new Set(appState.selectedIds);
  const sel = elements.filter((e) => ids.has(e.id));
  const fmt = (n: number) => Math.round(n).toLocaleString();
  const scene = elements.length ? getCommonBounds(elements) : null;
  const bounds = sel.length ? getCommonBounds(sel) : null;
  return (
    <div className="island stats-panel">
      <h3>Stats</h3>
      <dl>
        <dt>Elements</dt>
        <dd>{elements.length}</dd>
        {scene && (
          <>
            <dt>Scene size</dt>
            <dd>
              {fmt(scene[2] - scene[0])} × {fmt(scene[3] - scene[1])}
            </dd>
          </>
        )}
        <dt>Zoom</dt>
        <dd>{Math.round(appState.zoom * 100)}%</dd>
      </dl>
      {bounds && (
        <>
          <h3>{sel.length === 1 ? sel[0].type : `${sel.length} selected`}</h3>
          <dl>
            <dt>X</dt>
            <dd>{fmt(bounds[0])}</dd>
            <dt>Y</dt>
            <dd>{fmt(bounds[1])}</dd>
            <dt>W</dt>
            <dd>{fmt(bounds[2] - bounds[0])}</dd>
            <dt>H</dt>
            <dd>{fmt(bounds[3] - bounds[1])}</dd>
            {sel.length === 1 && (
              <>
                <dt>Angle</dt>
                <dd>{Math.round((sel[0].angle * 180) / Math.PI)}°</dd>
              </>
            )}
          </dl>
        </>
      )}
    </div>
  );
}

export function Toast() {
  const { appState } = useStore();
  if (!appState.toast) return null;
  return (
    <div className="toast" role="status" onClick={() => store.setAppState({ toast: null })}>
      {appState.toast}
    </div>
  );
}

export function ModeBadge() {
  const { appState } = useStore();
  if (!appState.viewMode && !appState.zenMode) return null;
  return (
    <button
      className="island mode-badge"
      onClick={() => store.setAppState({ viewMode: false, zenMode: false })}
      title="Exit (Alt+R / Alt+Z)"
    >
      Exit {appState.viewMode ? "view" : "zen"} mode
    </button>
  );
}
