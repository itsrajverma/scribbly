import { Copy, Download, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { getSelected, toast } from "../actions";
import { createShareLink, downloadBlob, exportToSvg } from "../data";
import { withBoundTexts } from "../scene/elements";
import { exportToCanvas } from "../scene/render";
import { store, useStore } from "../store";

function Modal({ title, children, wide }: { title: string; children: ReactNode; wide?: boolean }) {
  const close = () => store.setAppState({ dialog: null });
  return (
    <div className="modal-backdrop" onPointerDown={close}>
      <div
        className={`modal island ${wide ? "wide" : ""}`}
        role="dialog"
        aria-label={title}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="Close" onClick={close}>
            <X size={18} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

const SHORTCUTS: [string, [string, string][]][] = [
  [
    "Tools",
    [
      ["Hand (panning)", "H"],
      ["Selection", "V / 1"],
      ["Rectangle", "R / 2"],
      ["Diamond", "D / 3"],
      ["Ellipse", "O / 4"],
      ["Arrow", "A / 5"],
      ["Line", "L / 6"],
      ["Draw", "P / 7"],
      ["Text", "T / 8"],
      ["Insert image", "9"],
      ["Eraser", "E / 0"],
      ["Laser pointer", "K"],
      ["Keep tool active", "Q"],
      ["Add text / edit text", "Double-click / Enter"],
      ["Constrain angle / square", "Shift"],
      ["Draw from center", "Alt"],
      ["Finish line / arrow", "Enter / Esc"],
    ],
  ],
  [
    "View",
    [
      ["Zoom in / out", "Ctrl + / Ctrl -"],
      ["Reset zoom", "Ctrl 0"],
      ["Zoom to fit all", "Shift 1"],
      ["Zoom to selection", "Shift 2"],
      ["Pan", "Space + drag / wheel"],
      ["Toggle grid", "Ctrl '"],
      ["Zen mode", "Alt Z"],
      ["View mode", "Alt R"],
      ["Dark mode", "Alt Shift D"],
      ["Stats", "Alt /"],
    ],
  ],
  [
    "Editor",
    [
      ["Undo / Redo", "Ctrl Z / Ctrl Shift Z"],
      ["Select all", "Ctrl A"],
      ["Copy / Cut / Paste", "Ctrl C / X / V"],
      ["Duplicate", "Ctrl D / Alt + drag"],
      ["Delete", "Delete"],
      ["Group / Ungroup", "Ctrl G / Ctrl Shift G"],
      ["Bring forward / backward", "Ctrl ] / Ctrl ["],
      ["Bring to front / back", "Ctrl Shift ] / ["],
      ["Copy / paste styles", "Ctrl Alt C / V"],
      ["Copy as PNG", "Shift Alt C"],
      ["Flip horizontal / vertical", "Shift H / Shift V"],
      ["Add link", "Ctrl K"],
      ["Lock / unlock", "Ctrl Shift L"],
      ["Move selection", "Arrow keys (+Shift)"],
      ["Save / Open", "Ctrl S / Ctrl O"],
      ["Export image", "Ctrl Shift E"],
    ],
  ],
];

export function HelpDialog() {
  return (
    <Modal title="Keyboard shortcuts & help" wide>
      <div className="help-grid">
        {SHORTCUTS.map(([section, rows]) => (
          <section key={section}>
            <h3>{section}</h3>
            <dl>
              {rows
                .map(([label, keys]) => (
                  <div key={label} className="help-row">
                    <dt>{label}</dt>
                    <dd>
                      {keys.split(" / ").map((k, i) => (
                        <kbd key={i}>{k}</kbd>
                      ))}
                    </dd>
                  </div>
                ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  );
}

export function ExportDialog() {
  const { elements, appState } = useStore();
  const selected = getSelected();
  const [onlySelected, setOnlySelected] = useState(selected.length > 0);
  const [background, setBackground] = useState(true);
  const [dark, setDark] = useState(false);
  const [scale, setScale] = useState(2);
  const [name, setName] = useState(appState.name);

  const exportEls = useMemo(() => {
    if (!onlySelected || !selected.length) return elements;
    const ids = withBoundTexts(elements, selected.map((e) => e.id));
    return elements.filter((e) => ids.has(e.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlySelected, elements]);

  const opts = { background, backgroundColor: appState.viewBackgroundColor, dark };
  const preview = useMemo(() => {
    if (!exportEls.length) return null;
    return exportToCanvas(exportEls, { ...opts, scale: 1 }).toDataURL();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportEls, background, dark, appState.viewBackgroundColor]);

  const toBlob = () =>
    new Promise<Blob>((res, rej) =>
      exportToCanvas(exportEls, { ...opts, scale }).toBlob((b) => (b ? res(b) : rej()), "image/png"),
    );

  const exportPng = async () => downloadBlob(await toBlob(), `${name || "scene"}.png`);
  const exportSvg = () => {
    const svg = exportToSvg(exportEls, opts);
    downloadBlob(new Blob([svg.outerHTML], { type: "image/svg+xml" }), `${name || "scene"}.svg`);
  };
  const copyPng = async () => {
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": await toBlob() })]);
      toast("Copied PNG to clipboard");
    } catch {
      toast("Clipboard access was denied");
    }
  };

  return (
    <Modal title="Export image" wide>
      <div className="export-layout">
        <div className={`export-preview ${background ? "" : "checker"}`}>
          {preview ? <img src={preview} alt="Export preview" /> : <p>Nothing to export — the canvas is empty.</p>}
        </div>
        <div className="export-options">
          <label className="field">
            <span>File name</span>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                store.setAppState({ name: e.target.value });
              }}
              onKeyDown={(e) => e.stopPropagation()}
            />
          </label>
          {selected.length > 0 && (
            <label className="toggle">
              <input type="checkbox" checked={onlySelected} onChange={(e) => setOnlySelected(e.target.checked)} />
              <span>Only selected</span>
            </label>
          )}
          <label className="toggle">
            <input type="checkbox" checked={background} onChange={(e) => setBackground(e.target.checked)} />
            <span>Background</span>
          </label>
          <label className="toggle">
            <input type="checkbox" checked={dark} onChange={(e) => setDark(e.target.checked)} />
            <span>Dark mode</span>
          </label>
          <div className="field">
            <span>Scale</span>
            <div className="seg">
              {[1, 2, 3].map((s) => (
                <button key={s} className={scale === s ? "active" : ""} onClick={() => setScale(s)}>
                  {s}×
                </button>
              ))}
            </div>
          </div>
          <div className="export-buttons">
            <button className="primary-btn" disabled={!exportEls.length} onClick={exportPng}>
              <Download size={15} /> PNG
            </button>
            <button className="primary-btn" disabled={!exportEls.length} onClick={exportSvg}>
              <Download size={15} /> SVG
            </button>
            <button className="secondary-btn" disabled={!exportEls.length} onClick={copyPng}>
              <Copy size={15} /> Copy PNG
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function ShareDialog() {
  const { elements, appState } = useStore();
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    createShareLink(elements, appState)
      .then(setLink)
      .catch(() => setError("Your browser can't create share links (CompressionStream unavailable)."));
    // generate once per open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Modal title="Shareable link">
      <p className="muted">
        The whole scene is compressed into the link itself — nothing is uploaded to a server. Anyone opening
        it gets their own copy of the drawing.
      </p>
      {error && <p className="error">{error}</p>}
      {link && (
        <>
          {link.length > 60000 && (
            <p className="error">This scene is large; some apps may truncate links this long. Prefer “Save to…”.</p>
          )}
          <div className="share-row">
            <input readOnly value={link} onFocus={(e) => e.target.select()} onKeyDown={(e) => e.stopPropagation()} />
            <button
              className="primary-btn"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  toast("Link copied");
                } catch {
                  toast("Couldn't copy — select the link and copy manually");
                }
              }}
            >
              <Copy size={15} /> Copy
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

export function ClearDialog() {
  return (
    <Modal title="Reset the canvas">
      <p>This will clear the whole canvas. You can still undo afterwards.</p>
      <div className="dialog-actions">
        <button className="secondary-btn" onClick={() => store.setAppState({ dialog: null })}>
          Cancel
        </button>
        <button
          className="danger-btn"
          onClick={() => {
            store.update([], { dialog: null, selectedIds: [], editingTextId: null }, { commit: true });
          }}
        >
          Reset
        </button>
      </div>
    </Modal>
  );
}

export function Dialogs() {
  const { appState } = useStore();
  switch (appState.dialog) {
    case "help":
      return <HelpDialog />;
    case "export":
      return <ExportDialog />;
    case "share":
      return <ShareDialog />;
    case "clear":
      return <ClearDialog />;
    default:
      return null;
  }
}
