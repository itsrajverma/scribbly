import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  ArrowDown,
  ArrowUp,
  ChevronsDown,
  ChevronsUp,
  Copy,
  Group,
  Link,
  Lock,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignStart,
  Trash2,
  Ungroup,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  alignSelected,
  applyStyle,
  deleteSelected,
  distributeSelected,
  duplicateSelected,
  groupSelected,
  reorderSelected,
  setLinkOnSelected,
  toggleLockSelected,
  ungroupSelected,
} from "../actions";
import { useStore } from "../store";
import type { ElementType, SceneElement, StyleProps } from "../types";
import { ColorPicker } from "./ColorPicker";

export const STROKE_COLORS = ["#1e1e1e", "#e03131", "#2f9e44", "#1971c2", "#f08c00"];
export const BG_COLORS = ["transparent", "#ffc9c9", "#b2f2bb", "#a5d8ff", "#ffec99"];

const TOOL_TYPES: Partial<Record<string, ElementType>> = {
  rectangle: "rectangle",
  diamond: "diamond",
  ellipse: "ellipse",
  arrow: "arrow",
  line: "line",
  freedraw: "freedraw",
  text: "text",
};

function Option<T>({
  value,
  current,
  onSelect,
  title,
  children,
}: {
  value: T;
  current: T | null;
  onSelect: (v: T) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      className={`opt-btn ${current === value ? "active" : ""}`}
      title={title}
      aria-pressed={current === value}
      onClick={() => onSelect(value)}
    >
      {children}
    </button>
  );
}

const Section = ({ label, children }: { label: string; children: ReactNode }) => (
  <fieldset className="panel-section">
    <legend>{label}</legend>
    <div className="panel-row">{children}</div>
  </fieldset>
);

// small inline SVG glyphs for stroke options
const Glyph = ({ children }: { children: ReactNode }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

const ArrowheadGlyph = ({ kind, flip }: { kind: StyleProps["endArrowhead"]; flip?: boolean }) => (
  <Glyph>
    <g transform={flip ? "translate(24 0) scale(-1 1)" : undefined} strokeWidth="2">
      <path d="M3 12h15" />
      {kind === "arrow" && <path d="M13 7l6 5-6 5" />}
      {kind === "triangle" && <path d="M14 7l6 5-6 5z" fill="currentColor" />}
      {kind === "dot" && <circle cx="18" cy="12" r="3" fill="currentColor" />}
      {kind === "bar" && <path d="M19 6v12" />}
    </g>
  </Glyph>
);

export function PropertiesPanel() {
  const { elements, appState } = useStore();
  const { selectedIds, tool, currentStyle } = appState;
  const ids = new Set(selectedIds);
  const selected = elements.filter((e) => ids.has(e.id));
  const boundTexts = elements.filter(
    (e) => e.type === "text" && e.containerId && ids.has(e.containerId),
  );
  const targets: SceneElement[] = [...selected, ...boundTexts];

  const types = new Set<ElementType>(
    targets.length ? targets.map((e) => e.type) : TOOL_TYPES[tool] ? [TOOL_TYPES[tool]!] : [],
  );
  if (!types.size) return null;

  const value = <K extends keyof StyleProps>(key: K, filter?: (e: SceneElement) => boolean): StyleProps[K] | null => {
    if (!targets.length) return currentStyle[key];
    const vals = targets.filter((e) => key in e && (!filter || filter(e))).map((e) => (e as any)[key]);
    if (!vals.length) return currentStyle[key];
    return vals.every((v) => v === vals[0]) ? vals[0] : null;
  };
  const set = <K extends keyof StyleProps>(key: K) => (v: StyleProps[K]) => applyStyle(key, v);

  const has = (...t: ElementType[]) => t.some((x) => types.has(x));
  const hasShapes = has("rectangle", "diamond", "ellipse", "line");
  const hasStrokeWidth = has("rectangle", "diamond", "ellipse", "arrow", "line", "freedraw");
  const hasRough = has("rectangle", "diamond", "ellipse", "arrow", "line");
  const hasText = has("text");
  const hasArrow = has("arrow");
  const hasEdges = has("rectangle", "diamond");
  const hasLinear = has("arrow", "line");
  const nonText = (e: SceneElement) => e.type !== "text";

  const multi = selected.length > 1;
  const hasSelection = selected.length > 0;
  const isGrouped = selected.some((e) => e.groupIds.length > 0);

  return (
    <div className="island properties-panel" onPointerDown={(e) => e.stopPropagation()}>
      <Section label="Stroke">
        <ColorPicker
          colors={STROKE_COLORS}
          value={value("strokeColor", hasText && types.size > 1 ? nonText : undefined)}
          onChange={set("strokeColor")}
          label="Stroke"
        />
      </Section>

      {(hasShapes || has("image")) && (
        <Section label="Background">
          <ColorPicker
            colors={BG_COLORS}
            value={value("backgroundColor", nonText)}
            onChange={set("backgroundColor")}
            label="Background"
          />
        </Section>
      )}

      {hasShapes && (
        <Section label="Fill">
          {(["hachure", "cross-hatch", "solid", "zigzag"] as const).map((f) => (
            <Option key={f} value={f} current={value("fillStyle", nonText)} onSelect={set("fillStyle")} title={f}>
              <Glyph>
                <rect x="4" y="4" width="16" height="16" rx="2" strokeWidth="1.6" />
                {f === "hachure" && <path d="M4 14l10-10M8 20l12-12M4 20l0 0" strokeWidth="1.4" />}
                {f === "cross-hatch" && <path d="M4 14l10-10M8 20l12-12M10 4l10 10M4 10l10 10" strokeWidth="1.2" />}
                {f === "solid" && <rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor" />}
                {f === "zigzag" && <path d="M5 8l3 3 3-3 3 3 3-3 2 2M5 14l3 3 3-3 3 3 3-3 2 2" strokeWidth="1.3" />}
              </Glyph>
            </Option>
          ))}
        </Section>
      )}

      {hasStrokeWidth && (
        <Section label="Stroke width">
          {[1, 2, 4].map((w) => (
            <Option key={w} value={w} current={value("strokeWidth", nonText)} onSelect={set("strokeWidth")} title={w === 1 ? "Thin" : w === 2 ? "Bold" : "Extra bold"}>
              <Glyph>
                <path d="M4 12h16" strokeWidth={w * 1.2} />
              </Glyph>
            </Option>
          ))}
        </Section>
      )}

      {hasRough && (
        <>
          <Section label="Stroke style">
            {(["solid", "dashed", "dotted"] as const).map((st) => (
              <Option key={st} value={st} current={value("strokeStyle", nonText)} onSelect={set("strokeStyle")} title={st}>
                <Glyph>
                  <path d="M4 12h16" strokeWidth="2" strokeDasharray={st === "dashed" ? "5 3" : st === "dotted" ? "0.5 4" : undefined} />
                </Glyph>
              </Option>
            ))}
          </Section>
          <Section label="Sloppiness">
            {[0, 1, 2].map((r) => (
              <Option key={r} value={r} current={value("roughness", nonText)} onSelect={set("roughness")} title={["Architect", "Artist", "Cartoonist"][r]}>
                <Glyph>
                  {r === 0 && <path d="M3 15c4-6 8 2 18-4" strokeWidth="1.8" />}
                  {r === 1 && <path d="M3 15c4-7 8 3 18-5M4 16c4-6 9 1 16-4" strokeWidth="1.4" />}
                  {r === 2 && <path d="M3 16c3-9 7 4 10-3s5 1 8-3M4 14c4-5 7 3 9-2s6-2 8 0" strokeWidth="1.3" />}
                </Glyph>
              </Option>
            ))}
          </Section>
        </>
      )}

      {hasEdges && (
        <Section label="Edges">
          <Option value={false} current={value("roundness", (e) => e.type === "rectangle" || e.type === "diamond")} onSelect={set("roundness")} title="Sharp">
            <Glyph>
              <path d="M5 19V5h14" strokeWidth="2" />
            </Glyph>
          </Option>
          <Option value={true} current={value("roundness", (e) => e.type === "rectangle" || e.type === "diamond")} onSelect={set("roundness")} title="Round">
            <Glyph>
              <path d="M5 19v-8a6 6 0 0 1 6-6h8" strokeWidth="2" />
            </Glyph>
          </Option>
        </Section>
      )}

      {hasLinear && (
        <Section label="Line type">
          <Option value={false} current={value("roundness", (e) => e.type === "arrow" || e.type === "line")} onSelect={set("roundness")} title="Sharp">
            <Glyph>
              <path d="M4 18l6-10 4 6 6-8" strokeWidth="2" />
            </Glyph>
          </Option>
          <Option value={true} current={value("roundness", (e) => e.type === "arrow" || e.type === "line")} onSelect={set("roundness")} title="Curved">
            <Glyph>
              <path d="M4 18c3-12 7-8 9-4s5 2 7-8" strokeWidth="2" />
            </Glyph>
          </Option>
        </Section>
      )}

      {hasArrow && (
        <Section label="Arrowheads">
          <select
            className="arrowhead-select"
            aria-label="Start arrowhead"
            value={value("startArrowhead", (e) => e.type === "arrow") ?? "none"}
            onChange={(e) => applyStyle("startArrowhead", e.target.value === "none" ? null : (e.target.value as any))}
          >
            {["none", "arrow", "triangle", "dot", "bar"].map((k) => (
              <option key={k} value={k}>
                ◀ {k}
              </option>
            ))}
          </select>
          <span className="arrowhead-preview">
            <ArrowheadGlyph kind={value("startArrowhead", (e) => e.type === "arrow")} flip />
            <ArrowheadGlyph kind={value("endArrowhead", (e) => e.type === "arrow")} />
          </span>
          <select
            className="arrowhead-select"
            aria-label="End arrowhead"
            value={value("endArrowhead", (e) => e.type === "arrow") ?? "none"}
            onChange={(e) => applyStyle("endArrowhead", e.target.value === "none" ? null : (e.target.value as any))}
          >
            {["none", "arrow", "triangle", "dot", "bar"].map((k) => (
              <option key={k} value={k}>
                {k} ▶
              </option>
            ))}
          </select>
        </Section>
      )}

      {hasText && (
        <>
          <Section label="Font size">
            {[
              [16, "S"],
              [20, "M"],
              [28, "L"],
              [36, "XL"],
            ].map(([size, label]) => (
              <Option key={size} value={size as number} current={value("fontSize")} onSelect={set("fontSize")} title={`${label} (${size}px)`}>
                <span className="opt-text">{label}</span>
              </Option>
            ))}
          </Section>
          <Section label="Font family">
            <Option value={1 as const} current={value("fontFamily")} onSelect={set("fontFamily")} title="Hand-drawn">
              <span className="opt-text" style={{ fontFamily: "Kalam, cursive" }}>Aa</span>
            </Option>
            <Option value={2 as const} current={value("fontFamily")} onSelect={set("fontFamily")} title="Normal">
              <span className="opt-text" style={{ fontFamily: "'Segoe UI', sans-serif" }}>Aa</span>
            </Option>
            <Option value={3 as const} current={value("fontFamily")} onSelect={set("fontFamily")} title="Code">
              <span className="opt-text" style={{ fontFamily: "Consolas, monospace" }}>{"</>"}</span>
            </Option>
          </Section>
          <Section label="Text align">
            <Option value="left" current={value("textAlign")} onSelect={set("textAlign")} title="Left">
              <TextAlignStart size={16} />
            </Option>
            <Option value="center" current={value("textAlign")} onSelect={set("textAlign")} title="Center">
              <TextAlignCenter size={16} />
            </Option>
            <Option value="right" current={value("textAlign")} onSelect={set("textAlign")} title="Right">
              <TextAlignEnd size={16} />
            </Option>
          </Section>
        </>
      )}

      <fieldset className="panel-section">
        <legend>Opacity</legend>
        <input
          type="range"
          min={0}
          max={100}
          step={10}
          value={value("opacity") ?? 100}
          onChange={(e) => applyStyle("opacity", Number(e.target.value))}
          className="opacity-slider"
          aria-label="Opacity"
        />
      </fieldset>

      {hasSelection && (
        <>
          <Section label="Layers">
            <button className="opt-btn" title="Send to back — Ctrl+Shift+[" onClick={() => reorderSelected("back")}>
              <ChevronsDown size={16} />
            </button>
            <button className="opt-btn" title="Send backward — Ctrl+[" onClick={() => reorderSelected("backward")}>
              <ArrowDown size={16} />
            </button>
            <button className="opt-btn" title="Bring forward — Ctrl+]" onClick={() => reorderSelected("forward")}>
              <ArrowUp size={16} />
            </button>
            <button className="opt-btn" title="Bring to front — Ctrl+Shift+]" onClick={() => reorderSelected("front")}>
              <ChevronsUp size={16} />
            </button>
          </Section>

          {multi && (
            <Section label="Align">
              <button className="opt-btn" title="Align left" onClick={() => alignSelected("left")}>
                <AlignStartVertical size={16} />
              </button>
              <button className="opt-btn" title="Center horizontally" onClick={() => alignSelected("centerX")}>
                <AlignCenterVertical size={16} />
              </button>
              <button className="opt-btn" title="Align right" onClick={() => alignSelected("right")}>
                <AlignEndVertical size={16} />
              </button>
              <button className="opt-btn" title="Align top" onClick={() => alignSelected("top")}>
                <AlignStartHorizontal size={16} />
              </button>
              <button className="opt-btn" title="Center vertically" onClick={() => alignSelected("centerY")}>
                <AlignCenterHorizontal size={16} />
              </button>
              <button className="opt-btn" title="Align bottom" onClick={() => alignSelected("bottom")}>
                <AlignEndHorizontal size={16} />
              </button>
              <button className="opt-btn" title="Distribute horizontally" onClick={() => distributeSelected("x")}>
                <AlignHorizontalDistributeCenter size={16} />
              </button>
              <button className="opt-btn" title="Distribute vertically" onClick={() => distributeSelected("y")}>
                <AlignVerticalDistributeCenter size={16} />
              </button>
            </Section>
          )}

          <Section label="Actions">
            <button className="opt-btn" title="Duplicate — Ctrl+D" onClick={duplicateSelected}>
              <Copy size={16} />
            </button>
            <button className="opt-btn" title="Delete — Delete" onClick={deleteSelected}>
              <Trash2 size={16} />
            </button>
            {multi && (
              <button className="opt-btn" title="Group selection — Ctrl+G" onClick={groupSelected}>
                <Group size={16} />
              </button>
            )}
            {isGrouped && (
              <button className="opt-btn" title="Ungroup — Ctrl+Shift+G" onClick={ungroupSelected}>
                <Ungroup size={16} />
              </button>
            )}
            <button className="opt-btn" title="Link — Ctrl+K" onClick={setLinkOnSelected}>
              <Link size={16} />
            </button>
            <button className="opt-btn" title="Lock — Ctrl+Shift+L" onClick={toggleLockSelected}>
              <Lock size={16} />
            </button>
          </Section>
        </>
      )}
    </div>
  );
}
