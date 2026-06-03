import { useState } from "react";

const KEY = "arcanum.extraReasoning";

/**
 * Shared per-browser "Extra reasoning" preference (default on). Governs whether
 * deep-interpretation, oracle-insight, and trend-insight requests run through the
 * reporeason reasoning loop. Returns [value, toggle].
 */
export function useExtraReasoning(): [boolean, () => void] {
  const [value, setValue] = useState<boolean>(() => {
    try { return localStorage.getItem(KEY) !== "false"; } catch { return true; }
  });
  const toggle = () => setValue((v) => {
    const next = !v;
    try { localStorage.setItem(KEY, String(next)); } catch { /* ignore */ }
    return next;
  });
  return [value, toggle];
}
