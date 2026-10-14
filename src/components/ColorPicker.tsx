import { useState } from "react";

const EXTENDED = [
  "#1e1e1e", "#343a40", "#868e96", "#ced4da", "#ffffff",
  "#e03131", "#c2255c", "#9c36b5", "#6741d9", "#3b5bdb",
  "#1971c2", "#0c8599", "#099268", "#2f9e44", "#66a80f",
  "#f08c00", "#e8590c", "#ffc9c9", "#eebefa", "#a5d8ff",
  "#b2f2bb", "#ffec99", "#ffd8a8", "#d0bfff", "#99e9f2",
];

export function Swatch({ color, active, onClick, title }: { color: string; active?: boolean; onClick: () => void; title?: string }) {
  return (
    <button
      className={`swatch ${active ? "active" : ""} ${color === "transparent" ? "transparent" : ""}`}
      style={{ background: color === "transparent" ? undefined : color }}
      title={title ?? color}
      aria-label={title ?? color}
      aria-pressed={active}
      onClick={onClick}
    />
  );
}

export function ColorPicker({
  colors,
  value,
  onChange,
  label,
}: {
  colors: string[];
  value: string | null;
  onChange: (c: string) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [hex, setHex] = useState("");
  const isCustom = value !== null && !colors.includes(value);
  return (
    <div className="color-picker">
      {colors.map((c) => (
        <Swatch key={c} color={c} active={value === c} onClick={() => onChange(c)} />
      ))}
      <span className="swatch-divider" />
      <button
        className={`swatch current ${isCustom ? "active" : ""} ${value === "transparent" ? "transparent" : ""}`}
        style={{ background: value && value !== "transparent" ? value : undefined }}
        title={`${label} — more colors`}
        aria-label={`${label} — more colors`}
        aria-expanded={open}
        onClick={() => {
          setHex(value && value !== "transparent" ? value.replace("#", "") : "");
          setOpen(!open);
        }}
      />
      {open && (
        <div className="color-popover island" onPointerDown={(e) => e.stopPropagation()}>
          <div className="color-grid">
            {EXTENDED.map((c) => (
              <Swatch
                key={c}
                color={c}
                active={value === c}
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                }}
              />
            ))}
          </div>
          <div className="hex-row">
            <span>#</span>
            <input
              value={hex}
              placeholder="hex"
              maxLength={8}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9a-f]/gi, "");
                setHex(v);
                if (/^([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v)) onChange(`#${v}`);
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter" || e.key === "Escape") setOpen(false);
              }}
              aria-label="Hex color"
            />
            <input
              type="color"
              value={value && /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"}
              onChange={(e) => onChange(e.target.value)}
              aria-label="Pick any color"
            />
          </div>
        </div>
      )}
    </div>
  );
}
