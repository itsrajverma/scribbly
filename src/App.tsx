import { useEffect, useLayoutEffect, useRef } from "react";
import { insertImageFile, pasteFromText, screenToScene, serializeSelection, deleteSelected, toast } from "./actions";
import { ContextMenu } from "./components/ContextMenu";
import { Dialogs } from "./components/Dialogs";
import { Footer } from "./components/Footer";
import { LibraryButton, LibrarySidebar } from "./components/LibrarySidebar";
import { MainMenu } from "./components/MainMenu";
import { ModeBadge, StatsPanel, Toast, WelcomeScreen } from "./components/Overlays";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { TextEditor } from "./components/TextEditor";
import { Toolbar } from "./components/Toolbar";
import { loadFromLocalStorage, readSceneFromHash, saveToLocalStorage } from "./data";
import { loadSceneText } from "./fileActions";
import { interaction } from "./interaction";
import { refreshTextDimensions, syncBindings } from "./scene/elements";
import { setImageLoadCallback } from "./scene/images";
import { renderScene } from "./scene/render";
import { onKeyDown, onKeyUp } from "./shortcuts";
import { store, useStore } from "./store";
import type { SceneElement } from "./types";

let lastPointer: [number, number] = [window.innerWidth / 2, window.innerHeight / 2];

/** Loads the initial scene: shared link first, then whatever was saved locally. */
const bootstrap = async () => {
  const local = loadFromLocalStorage();
  store.setAppState({ ...local.appState });
  store.resetHistory(syncBindings(local.elements));
  try {
    const shared = await readSceneFromHash();
    if (shared) {
      const replace =
        !store.elements.length ||
        window.confirm("Loading the shared drawing will replace your current canvas. Continue?");
      if (replace) {
        store.resetHistory(shared.elements);
        store.setAppState({ ...shared.appState, selectedIds: [] });
      }
      history.replaceState(null, "", location.pathname);
    }
  } catch {
    toast("The shared link is invalid or corrupted");
  }
};

/** Once web fonts are ready, text needs re-measuring (it may have been measured with a fallback). */
const remeasureTexts = () => {
  const elements = store.elements.map((e) => (e.type === "text" ? refreshTextDimensions(e) : e));
  store.setElements(syncBindings(elements as SceneElement[]));
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { appState } = useStore();
  const { zenMode, viewMode, theme } = appState;

  // canvas sizing + rendering
  useLayoutEffect(() => {
    const canvas = canvasRef.current!;
    let frame = 0;
    let laserFrame = 0;
    const draw = () => {
      frame = 0;
      const dpr = window.devicePixelRatio || 1;
      renderScene(canvas, {
        elements: store.elements,
        appState: store.appState,
        width: window.innerWidth,
        height: window.innerHeight,
        dpr,
        laser: interaction.laserTrails,
      });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      draw();
    };
    // keep animating while laser trails are fading
    const laserLoop = () => {
      const now = performance.now();
      interaction.laserTrails = interaction.laserTrails.filter(
        (t) => now - t.points[t.points.length - 1].t < 800,
      );
      draw();
      laserFrame = interaction.laserTrails.length ? requestAnimationFrame(laserLoop) : 0;
    };
    interaction.onLaserFrame = () => {
      if (!laserFrame) laserFrame = requestAnimationFrame(laserLoop);
    };
    setImageLoadCallback(schedule);
    resize();
    const unsub = store.subscribe(schedule);
    const detach = interaction.attach(canvas);
    window.addEventListener("resize", resize);
    return () => {
      unsub();
      detach();
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(frame);
      cancelAnimationFrame(laserFrame);
    };
  }, []);

  // initial load, fonts, persistence
  useEffect(() => {
    bootstrap();
    document.fonts?.ready.then(remeasureTexts);
    document.fonts?.load("20px Kalam").then(remeasureTexts).catch(() => {});

    let timer = 0;
    let lastElements = store.elements;
    let lastState = store.appState;
    const unsub = store.subscribe(() => {
      if (store.elements === lastElements && store.appState === lastState) return;
      lastElements = store.elements;
      lastState = store.appState;
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (!saveToLocalStorage(store.elements, store.appState)) {
          toast("Couldn't save locally — storage is full. Use Save to… to keep your work.");
        }
      }, 400);
    });
    const flush = () => saveToLocalStorage(store.elements, store.appState);
    window.addEventListener("beforeunload", flush);
    return () => {
      unsub();
      window.removeEventListener("beforeunload", flush);
    };
  }, []);

  // keyboard, clipboard, drag & drop
  useEffect(() => {
    const trackPointer = (e: PointerEvent) => {
      lastPointer = [e.clientX, e.clientY];
    };
    const isEditing = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA");

    const onCopy = (e: ClipboardEvent) => {
      if (isEditing(e.target) || window.getSelection()?.toString()) return;
      const data = serializeSelection();
      if (!data) return;
      e.preventDefault();
      e.clipboardData?.setData("text/plain", data);
    };
    const onCut = (e: ClipboardEvent) => {
      if (isEditing(e.target)) return;
      const data = serializeSelection();
      if (!data) return;
      e.preventDefault();
      e.clipboardData?.setData("text/plain", data);
      deleteSelected();
    };
    const onPaste = (e: ClipboardEvent) => {
      if (isEditing(e.target) || store.appState.viewMode) return;
      const at = screenToScene(lastPointer[0], lastPointer[1]);
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      e.preventDefault();
      if (file) {
        insertImageFile(file, at);
        return;
      }
      const text = e.clipboardData?.getData("text/plain");
      if (text) pasteFromText(text, at);
    };
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (!file) {
        const text = e.dataTransfer?.getData("text/plain");
        if (text) pasteFromText(text, screenToScene(e.clientX, e.clientY));
        return;
      }
      if (file.type.startsWith("image/")) {
        insertImageFile(file, screenToScene(e.clientX, e.clientY));
        return;
      }
      try {
        loadSceneText(await file.text());
        toast(`Opened ${file.name}`);
      } catch {
        toast("Unsupported file");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("pointermove", trackPointer);
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCut);
    document.addEventListener("paste", onPaste);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("pointermove", trackPointer);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("paste", onPaste);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    interaction.updateCursorForTool();
  }, [appState.tool, viewMode]);

  const showUI = !zenMode && !viewMode;

  return (
    <div className={`app theme-${theme}`}>
      <canvas ref={canvasRef} className="scene-canvas" />
      <TextEditor />
      <WelcomeScreen />

      <div className="top-bar">
        <div className="top-left">
          {!zenMode && <MainMenu />}
          {showUI && <PropertiesPanel />}
        </div>
        {showUI && <Toolbar />}
        <div className="top-right">{!zenMode && <LibraryButton />}</div>
      </div>

      {!zenMode && <Footer />}
      <ModeBadge />
      <StatsPanel />
      <LibrarySidebar />
      <ContextMenu />
      <Dialogs />
      <Toast />
    </div>
  );
}
