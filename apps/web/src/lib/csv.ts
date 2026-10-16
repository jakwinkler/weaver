/**
 * Formats one CSV cell. A spreadsheet reads a cell that starts with =, +, - or @ (after optional
 * whitespace), or with a tab or carriage return, as a formula, so those get a leading apostrophe.
 */
export function csvCell(raw: string): string {
  const safe = /^(?:[\t\r]|\s*[=+@-])/.test(raw) ? `'${raw}` : raw;
  const escaped = safe.replace(/"/g, '""');
  return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
}
