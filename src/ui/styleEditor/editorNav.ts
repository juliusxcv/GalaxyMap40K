import { createContext, useContext } from "react";

/** Lets any color picker deep in the detail pane open the palette editor. */
export const EditorNav = createContext<{ editPalette: (token?: string) => void } | null>(null);

export const useEditorNav = () => useContext(EditorNav);

/** Which color picker is open, for a palette color. */
export const paletteColorKey = (token: string) => `@palette.${token}`;
