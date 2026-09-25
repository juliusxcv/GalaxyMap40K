import type { StyleSheetData } from "../../theme/catalog";
import { formatSheet } from "../../theme/compile";
import { BROWSER_SAVE_KEY } from "../../theme/styleSheetStore";

/** Under `vite dev` the editor saves straight into the repo through the
 * dev-server endpoint (see vite.config.ts); a built site can only keep the
 * style sheet in this browser, or hand it over as a file. */
export const SAVES_TO_FILE = import.meta.env.DEV;

export async function saveSheet(sheet: StyleSheetData): Promise<"file" | "browser"> {
  const text = formatSheet(sheet);
  if (SAVES_TO_FILE) {
    const res = await fetch("/__ui-style-sheet", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: text,
    });
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()) || res.statusText}`);
    try {
      localStorage.removeItem(BROWSER_SAVE_KEY);
    } catch {
      // Nothing stored there, then.
    }
    return "file";
  }
  localStorage.setItem(BROWSER_SAVE_KEY, text);
  return "browser";
}

export function downloadText(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Opens a file dialog for a .json style sheet. */
export function pickJsonFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) file.text().then(resolve, () => resolve(null));
      else resolve(null);
    };
    input.click();
  });
}
