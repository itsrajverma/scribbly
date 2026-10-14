<div align="center">

<img src="public/favicon.svg" width="80" alt="Scribbly logo" />

# Scribbly

**A hand-drawn style virtual whiteboard that runs entirely in your browser.**

Sketch diagrams, wireframes and ideas that look like they were drawn by hand. You don't need to sign up or install anything, and no server is involved.

### [✏️ Open Scribbly →](https://itsrajverma.github.io/scribbly/)

[![Deploy](https://github.com/itsrajverma/scribbly/actions/workflows/deploy.yml/badge.svg)](https://github.com/itsrajverma/scribbly/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![React](https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-646cff?logo=vite&logoColor=white)

</div>

---

## ✨ Why Scribbly?

- 🎨 **Hand-drawn look.** Shapes are drawn with [rough.js](https://roughjs.com/) and pen strokes with [perfect-freehand](https://github.com/steveruizok/perfect-freehand).
- 🔒 **Private by default.** Your drawings are stored in your own browser. Share links hold the whole scene inside the URL, so nothing gets uploaded.
- ⚡ **Fast and light.** It's a static app of about 95 KB gzipped, with no backend.
- ⌨️ **Keyboard friendly.** Every tool has a shortcut. Press `?` in the app to see the full list.
- 🌙 **Dark mode, zen mode and view mode** for presenting.

> Scribbly is modelled on how [Excalidraw](https://excalidraw.com) behaves, but all of its code is new.

## 🧰 Features

<table>
<tr><td valign="top" width="50%">

### Drawing tools
Hand, selection, rectangle, diamond, ellipse, arrow, line, freehand pen, text, image, eraser and laser pointer. Press `Q` to lock a tool so it stays active.

### Styling
- Stroke and background colours, with a full colour picker
- Fill styles: hachure, cross-hatch, solid and zigzag
- Stroke width and style (solid, dashed or dotted)
- Sloppiness, sharp or round edges, and curved lines
- Arrowheads, font size, font family and alignment
- Opacity

### Arrows and lines
- Arrows **bind to shapes** and stay attached when the shapes move
- Click once for each point to draw a multi-point line
- Double-click a line to add a bend point, then drag its points to edit it

</td><td valign="top" width="50%">

### Editing
- Move, resize (`Shift` keeps the aspect ratio, `Alt` resizes from the centre) and rotate (`Shift` snaps to 15°)
- Select several elements with a marquee or with `Shift`-click
- `Alt`-drag to duplicate
- Flip, align and distribute, and change the stacking order
- Group, ungroup, lock, and add hyperlinks
- Full undo and redo history

### Canvas
- Infinite pan and zoom with the wheel, `Ctrl`+wheel, `Space`+drag or a pinch
- Grid with snapping
- Stats panel

### Text
- Double-click empty canvas to add text
- Double-click a shape to write text inside it. The text stays centred when the shape moves.

</td></tr>
</table>

### 💾 Saving, export and sharing

| What | How |
| --- | --- |
| Autosave | Your work is saved to `localStorage` automatically |
| Files | Save and open `.scribbly` files. `.excalidraw` files can be imported too |
| Export | PNG and SVG, with options for background, dark mode and scale |
| Clipboard | Copy as PNG, and copy or paste elements, text and images |
| Drag & drop | Drop images or scene files onto the canvas |
| Share links | The scene is compressed into the URL hash, so no server is needed |
| Library | Save selections as reusable items, then import or export them |

## 🚀 Getting started

**To use it:** open **https://itsrajverma.github.io/scribbly/**. That's all you need.

**To run it locally** you need [Node.js](https://nodejs.org/) 18 or newer:

```bash
git clone https://github.com/itsrajverma/scribbly.git
cd scribbly
npm install
npm run dev        # http://localhost:5173
```

| Script | Description |
| --- | --- |
| `npm run dev` | Starts the dev server with hot reload |
| `npm run build` | Type-checks and builds the production bundle into `dist/` |
| `npm run preview` | Serves the production build locally |
| `npm run typecheck` | Runs the TypeScript checks only |

## 🌐 Deployment

Every push to `main` builds the app and deploys it to **GitHub Pages** through [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). The production base path is set to `/scribbly/` in [`vite.config.ts`](vite.config.ts). If you fork the repo under a different name, change that path to match.

## 🗂️ Project structure

| Path | Purpose |
| --- | --- |
| `src/types.ts` | Element and app state model |
| `src/store.ts` | Observable store with undo/redo history |
| `src/interaction.ts` | Pointer state machine for drawing, selecting, dragging, resizing, rotating, binding, erasing, panning and pinching |
| `src/actions.ts` | Editor commands for z-order, alignment, grouping, the clipboard, zoom and styles |
| `src/shortcuts.ts` | Keyboard shortcuts |
| `src/scene/geometry.ts` | Bounds, rotation, hit-testing and boundary intersection |
| `src/scene/elements.ts` | Creating and changing elements, measuring text, and keeping arrow bindings in sync |
| `src/scene/shapes.ts` | rough.js drawables and freehand outlines, cached per element version |
| `src/scene/render.ts` | Canvas renderer, selection overlays and PNG export |
| `src/data.ts` | Serialization, localStorage, share links and SVG export |
| `src/components/` | Toolbar, properties panel, menus, dialogs, library and text editor |

## 🚧 Limitations

Scribbly doesn't have real-time collaboration, because that needs a backend relay server. A share link sends a copy of the scene, but it doesn't keep it in sync while people edit.

## 🤝 Contributing

Contributions are welcome. To contribute:

1. Fork the repo and create a branch: `git checkout -b feature/my-idea`
2. Make your changes and check that `npm run build` passes
3. Open a pull request

If you find a bug or want to suggest a feature, please [open an issue](https://github.com/itsrajverma/scribbly/issues).

## 🙏 Acknowledgements

- [rough.js](https://roughjs.com/) for the sketchy rendering
- [perfect-freehand](https://github.com/steveruizok/perfect-freehand) for the pressure-sensitive pen strokes
- [Kalam](https://fonts.google.com/specimen/Kalam) for the handwritten font
- [Lucide](https://lucide.dev/) for the icons
- [Excalidraw](https://excalidraw.com), which inspired the project

## 📄 License

[MIT](LICENSE) © Raj Verma
