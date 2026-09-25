# Star Map // Astra Cartographica

## UI style sheet and style editor

All paint on the map UI (text color, text outline, fill, frame lines, shadows and glows) comes from one style sheet, [src/theme/uiStyleSheet.json](src/theme/uiStyleSheet.json). The CSS files only hold layout. [src/theme/catalog.ts](src/theme/catalog.ts) lists every element it covers.

Press **F2** in the running app (or open it with `#style-editor` in the URL) to fine-tune it:

- **Pick on map** – click any UI element to select it (Esc cancels). Or choose from the list, which also holds hover/focus states and `::before` parts.
- Each element exposes text color, outline, fill, frame line, and text/box shadow layers: sliders and number fields, plus a color picker with the palette colors (`$phosphor`, `$signal`, …) as swatches.
- **Palette colors** (top of the list, or the ✎ in any color picker) edits those presets themselves: every element linked to one follows immediately. Overrides are saved under `"tokens"`; the base values stay in `src/index.css`. Type `$phosphor` in the filter to list everything linked to a color.
- Drag the panel's inner edge to resize it (double-click resets the width).
- **Show …** buttons bring up the target callout, dossier or search results when the selected element isn't on screen.
- **Save** (Ctrl+S) writes `uiStyleSheet.json` under `npm run dev`. On a built site it saves in that browser only; use ⋯ → *Download uiStyleSheet.json* and commit the file. Undo/Redo: Ctrl+Z / Ctrl+Y.
- *Reset to default* goes back to the original look in `uiStyleSheet.defaults.json`.

---

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
