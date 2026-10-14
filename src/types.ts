export type Point = [number, number];

export type ToolType =
  | "hand"
  | "selection"
  | "rectangle"
  | "diamond"
  | "ellipse"
  | "arrow"
  | "line"
  | "freedraw"
  | "text"
  | "image"
  | "eraser"
  | "laser";

export type ElementType =
  | "rectangle"
  | "diamond"
  | "ellipse"
  | "arrow"
  | "line"
  | "freedraw"
  | "text"
  | "image";

export type FillStyle = "hachure" | "cross-hatch" | "solid" | "zigzag";
export type StrokeStyle = "solid" | "dashed" | "dotted";
export type Arrowhead = "arrow" | "triangle" | "dot" | "bar" | null;
export type FontFamily = 1 | 2 | 3;
export type TextAlign = "left" | "center" | "right";

export interface Binding {
  elementId: string;
}

export interface StyleProps {
  strokeColor: string;
  backgroundColor: string;
  fillStyle: FillStyle;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  roughness: number;
  opacity: number;
  roundness: boolean;
  fontSize: number;
  fontFamily: FontFamily;
  textAlign: TextAlign;
  startArrowhead: Arrowhead;
  endArrowhead: Arrowhead;
}

interface ElementBase {
  id: string;
  type: ElementType;
  /** top-left of the unrotated bounding box */
  x: number;
  y: number;
  width: number;
  height: number;
  /** radians, rotation around the bbox center */
  angle: number;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: FillStyle;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  roughness: number;
  opacity: number;
  roundness: boolean;
  seed: number;
  version: number;
  /** innermost group first, outermost last */
  groupIds: string[];
  locked: boolean;
  link: string | null;
}

export interface ShapeElement extends ElementBase {
  type: "rectangle" | "diamond" | "ellipse";
}

/** Points are relative to (x, y); the bbox of the points always starts at 0,0. Angle is always 0. */
export interface LinearElement extends ElementBase {
  type: "arrow" | "line";
  points: Point[];
  startArrowhead: Arrowhead;
  endArrowhead: Arrowhead;
  startBinding: Binding | null;
  endBinding: Binding | null;
}

export interface FreeDrawElement extends ElementBase {
  type: "freedraw";
  points: Point[];
  pressures: number[];
}

export interface TextElement extends ElementBase {
  type: "text";
  text: string;
  fontSize: number;
  fontFamily: FontFamily;
  textAlign: TextAlign;
  containerId: string | null;
}

export interface ImageElement extends ElementBase {
  type: "image";
  dataURL: string;
}

export type SceneElement =
  | ShapeElement
  | LinearElement
  | FreeDrawElement
  | TextElement
  | ImageElement;

export type Theme = "light" | "dark";

export type DialogType = "help" | "export" | "share" | "clear" | null;

export interface ContextMenuState {
  x: number;
  y: number;
  sceneX: number;
  sceneY: number;
  onElement: boolean;
}

export interface AppState {
  tool: ToolType;
  toolLocked: boolean;
  selectedIds: string[];
  scrollX: number;
  scrollY: number;
  zoom: number;
  theme: Theme;
  viewBackgroundColor: string;
  gridMode: boolean;
  zenMode: boolean;
  viewMode: boolean;
  currentStyle: StyleProps;
  editingTextId: string | null;
  multiPointId: string | null;
  selectionBox: [number, number, number, number] | null;
  suggestedBindingId: string | null;
  eraserPending: string[];
  dialog: DialogType;
  libraryOpen: boolean;
  menuOpen: boolean;
  contextMenu: ContextMenuState | null;
  toast: string | null;
  name: string;
  showStats: boolean;
}

export interface LibraryItem {
  id: string;
  created: number;
  elements: SceneElement[];
}

export interface SceneData {
  type: "scribbly";
  version: 1;
  source: string;
  elements: SceneElement[];
  appState: Partial<Pick<AppState, "viewBackgroundColor" | "gridMode" | "theme" | "name">>;
}
