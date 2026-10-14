import {
  ArrowRight,
  Circle,
  Diamond,
  Eraser,
  Hand,
  Image,
  Lock,
  LockOpen,
  Minus,
  MousePointer2,
  Pencil,
  Square,
  Type,
  WandSparkles,
} from "lucide-react";
import type { ReactNode } from "react";
import { store, useStore } from "../store";
import type { ToolType } from "../types";
import { setTool } from "../tools";

interface ToolDef {
  tool: ToolType;
  icon: ReactNode;
  label: string;
  key: string;
}

export const TOOLS: ToolDef[] = [
  { tool: "hand", icon: <Hand size={17} />, label: "Hand (panning tool)", key: "H" },
  { tool: "selection", icon: <MousePointer2 size={17} />, label: "Selection", key: "V or 1" },
  { tool: "rectangle", icon: <Square size={17} />, label: "Rectangle", key: "R or 2" },
  { tool: "diamond", icon: <Diamond size={17} />, label: "Diamond", key: "D or 3" },
  { tool: "ellipse", icon: <Circle size={17} />, label: "Ellipse", key: "O or 4" },
  { tool: "arrow", icon: <ArrowRight size={17} />, label: "Arrow", key: "A or 5" },
  { tool: "line", icon: <Minus size={17} />, label: "Line", key: "L or 6" },
  { tool: "freedraw", icon: <Pencil size={17} />, label: "Draw", key: "P or 7" },
  { tool: "text", icon: <Type size={17} />, label: "Text", key: "T or 8" },
  { tool: "image", icon: <Image size={17} />, label: "Insert image", key: "9" },
  { tool: "eraser", icon: <Eraser size={17} />, label: "Eraser", key: "E or 0" },
  { tool: "laser", icon: <WandSparkles size={17} />, label: "Laser pointer", key: "K" },
];

const NUMBER_BADGE: Partial<Record<ToolType, string>> = {
  selection: "1",
  rectangle: "2",
  diamond: "3",
  ellipse: "4",
  arrow: "5",
  line: "6",
  freedraw: "7",
  text: "8",
  image: "9",
  eraser: "0",
  laser: "K",
};

export function Toolbar() {
  const { appState } = useStore();
  const { tool, toolLocked } = appState;
  return (
    <div className="island toolbar" role="toolbar" aria-label="Shapes">
      <button
        className={`tool-btn ${toolLocked ? "active" : ""}`}
        title="Keep selected tool active after drawing — Q"
        aria-pressed={toolLocked}
        onClick={() => store.setAppState({ toolLocked: !toolLocked })}
      >
        {toolLocked ? <Lock size={15} /> : <LockOpen size={15} />}
      </button>
      <div className="toolbar-divider" />
      {TOOLS.map((t) => (
        <button
          key={t.tool}
          className={`tool-btn ${tool === t.tool ? "active" : ""}`}
          title={`${t.label} — ${t.key}`}
          aria-label={t.label}
          aria-pressed={tool === t.tool}
          onClick={() => setTool(t.tool)}
        >
          {t.icon}
          {NUMBER_BADGE[t.tool] && <span className="tool-key">{NUMBER_BADGE[t.tool]}</span>}
        </button>
      ))}
    </div>
  );
}
