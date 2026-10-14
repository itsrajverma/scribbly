import { useEffect, useRef } from "react";
import { getFontString, LINE_HEIGHT } from "../scene/elements";
import { finishTextEditing, updateEditingText } from "../interaction";
import { useStore } from "../store";
import type { TextElement } from "../types";

/** Transparent textarea laid exactly over the text element being edited. */
export function TextEditor() {
  const { elements, appState } = useStore();
  const ref = useRef<HTMLTextAreaElement>(null);
  const el = elements.find((e) => e.id === appState.editingTextId) as TextElement | undefined;
  const editingId = el?.id;

  useEffect(() => {
    if (!editingId) return;
    // focus after the pointer event that created us has finished
    const raf = requestAnimationFrame(() => {
      const ta = ref.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    });
    return () => cancelAnimationFrame(raf);
  }, [editingId]);

  if (!el) return null;
  const { zoom, scrollX, scrollY } = appState;
  const left = (el.x + scrollX) * zoom;
  const top = (el.y + scrollY) * zoom;
  return (
    <textarea
      ref={ref}
      className="text-editor"
      value={el.text}
      spellCheck={false}
      wrap="off"
      style={{
        left,
        top,
        width: Math.max(el.width, 4) * zoom + 24,
        height: Math.max(el.height, el.fontSize * LINE_HEIGHT) * zoom,
        font: getFontString(el.fontSize * zoom, el.fontFamily),
        lineHeight: LINE_HEIGHT,
        color: el.strokeColor,
        opacity: el.opacity / 100,
        textAlign: el.textAlign,
        transform: `rotate(${el.angle}rad)`,
        transformOrigin: `${(el.width * zoom) / 2}px ${(el.height * zoom) / 2}px`,
        marginLeft: el.textAlign === "center" ? -12 : el.textAlign === "right" ? -24 : 0,
      }}
      onChange={(e) => updateEditingText(e.target.value)}
      onBlur={() => finishTextEditing()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) {
          e.preventDefault();
          finishTextEditing();
        }
        if (e.key === "Tab") {
          e.preventDefault();
          const ta = e.currentTarget;
          const { selectionStart: s, selectionEnd: end, value } = ta;
          updateEditingText(value.slice(0, s) + "    " + value.slice(end));
          requestAnimationFrame(() => ta.setSelectionRange(s + 4, s + 4));
        }
      }}
    />
  );
}
