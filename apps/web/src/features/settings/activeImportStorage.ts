export const ACTIVE_IMPORT_STORAGE_KEY = 'weaver:active-jira-import-id';

/** Forgets the Jira import this tab was following, so the next account in the tab does not poll it. */
export function clearActiveImportId(): void {
  try {
    window.sessionStorage.removeItem(ACTIVE_IMPORT_STORAGE_KEY);
  } catch {
    // Storage may be unavailable; the rest of logout must still run.
  }
}
