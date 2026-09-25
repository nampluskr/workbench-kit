// Global "Delete enabled" gate for Explorer delete (v0.3, user request
// 2026-09-25). Lives outside src/core — whether delete is allowed is a
// filesystem-semantics policy, not a UI mechanic the shell may know about
// (.claude/rules/common-core.md, D-30 · D-22). The menu checkbox and the
// status bar indicator both call setDeleteEnabled(), so there is exactly
// one place that writes the setting and one place (this module) that
// decides who else needs to know.
const STORAGE_KEY = 'workbench:delete-enabled';
const listeners = new Set<() => void>();

function loadDeleteEnabled(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

let deleteEnabled = loadDeleteEnabled();

export function getDeleteEnabled(): boolean {
  return deleteEnabled;
}

export function setDeleteEnabled(enabled: boolean): void {
  deleteEnabled = enabled;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch {
    /* ignore quota/disabled storage */
  }
  listeners.forEach((cb) => cb());
}

/** The menu's own check mark re-reads getDeleteEnabled() on every draw and needs no subscription; this is for the status bar indicator. */
export function onDeleteEnabledChanged(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
