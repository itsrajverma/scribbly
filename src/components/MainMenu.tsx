import {
  BarChart3,
  CircleHelp,
  Download,
  Eye,
  FolderOpen,
  Grid3x3,
  ImageDown,
  Maximize,
  Menu,
  Moon,
  Share2,
  Sun,
  Trash2,
} from "lucide-react";
import type { ReactNode } from "react";
import { openSceneFile, saveSceneFile } from "../fileActions";
import { store, useStore } from "../store";
import { Swatch } from "./ColorPicker";

const CANVAS_BACKGROUNDS = ["#ffffff", "#f8f9fa", "#f5faff", "#fffce8", "#fdf8f6"];

const Item = ({
  icon,
  label,
  shortcut,
  onClick,
  checked,
}: {
  icon: ReactNode;
  label: string;
  shortcut?: string;
  onClick: () => void;
  checked?: boolean;
}) => (
  <button
    className="menu-item"
    role="menuitem"
    onClick={() => {
      store.setAppState({ menuOpen: false });
      onClick();
    }}
  >
    <span className="menu-icon">{icon}</span>
    <span className="menu-label">{label}</span>
    {checked !== undefined && <span className="menu-check">{checked ? "✓" : ""}</span>}
    {shortcut && <kbd className="menu-shortcut">{shortcut}</kbd>}
  </button>
);

export function MainMenu() {
  const { appState } = useStore();
  const { menuOpen, theme, gridMode, viewMode, zenMode, showStats } = appState;
  return (
    <div className="main-menu">
      <button
        className={`island icon-btn ${menuOpen ? "active" : ""}`}
        aria-label="Main menu"
        aria-expanded={menuOpen}
        onClick={() => store.setAppState({ menuOpen: !menuOpen, contextMenu: null })}
      >
        <Menu size={18} />
      </button>
      {menuOpen && (
        <div className="island dropdown" role="menu" onPointerDown={(e) => e.stopPropagation()}>
          <Item icon={<FolderOpen size={16} />} label="Open" shortcut="Ctrl+O" onClick={openSceneFile} />
          <Item icon={<Download size={16} />} label="Save to..." shortcut="Ctrl+S" onClick={saveSceneFile} />
          <Item
            icon={<ImageDown size={16} />}
            label="Export image..."
            shortcut="Ctrl+Shift+E"
            onClick={() => store.setAppState({ dialog: "export" })}
          />
          <Item icon={<Share2 size={16} />} label="Share link" onClick={() => store.setAppState({ dialog: "share" })} />
          <Item icon={<CircleHelp size={16} />} label="Help" shortcut="?" onClick={() => store.setAppState({ dialog: "help" })} />
          <Item icon={<Trash2 size={16} />} label="Reset the canvas" onClick={() => store.setAppState({ dialog: "clear" })} />
          <div className="menu-sep" />
          <Item icon={<Grid3x3 size={16} />} label="Grid" shortcut="Ctrl+'" checked={gridMode} onClick={() => store.setAppState({ gridMode: !gridMode })} />
          <Item icon={<Maximize size={16} />} label="Zen mode" shortcut="Alt+Z" checked={zenMode} onClick={() => store.setAppState({ zenMode: !zenMode })} />
          <Item icon={<Eye size={16} />} label="View mode" shortcut="Alt+R" checked={viewMode} onClick={() => store.setAppState({ viewMode: !viewMode, selectedIds: [] })} />
          <Item icon={<BarChart3 size={16} />} label="Stats" shortcut="Alt+/" checked={showStats} onClick={() => store.setAppState({ showStats: !showStats })} />
          <Item
            icon={theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            label={theme === "dark" ? "Light mode" : "Dark mode"}
            shortcut="Alt+Shift+D"
            onClick={() => store.setAppState({ theme: theme === "dark" ? "light" : "dark" })}
          />
          <div className="menu-sep" />
          <div className="menu-subtitle">Canvas background</div>
          <div className="menu-swatches">
            {CANVAS_BACKGROUNDS.map((c) => (
              <Swatch
                key={c}
                color={c}
                active={appState.viewBackgroundColor === c}
                onClick={() => store.setAppState({ viewBackgroundColor: c })}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
