import { Suspense, lazy, useEffect, useState } from "react";
import { sheetsEqual } from "../../theme/compile";
import { useStyleSheet } from "../../theme/styleSheetStore";
import "./launcher.css";

// Loaded on first open, so the map itself never ships the editor.
const StyleEditor = lazy(() => import("./StyleEditor"));

/** F2 (or #style-editor in the URL) opens the UI style editor. Under the
 * dev server a small button offers it too. */
export function StyleEditorLauncher() {
  const [open, setOpen] = useState(() => location.hash === "#style-editor");
  const dirty = useStyleSheet((s) => !sheetsEqual(s.sheet, s.saved));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "F2" || e.repeat) return;
      e.preventDefault();
      setOpen((o) => !o);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Unsaved style edits stay on the map after the editor closes; don't let
  // a reload drop them silently.
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirty]);

  return (
    <>
      {!open && (import.meta.env.DEV || dirty) && (
        <button type="button" className="se-launcher" onClick={() => setOpen(true)}>
          {dirty && <span className="se-launcher__dot" aria-label="Unsaved changes" />}
          Style editor <kbd>F2</kbd>
        </button>
      )}
      {open && (
        <Suspense fallback={null}>
          <StyleEditor onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
