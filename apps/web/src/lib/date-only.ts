/** Parse calendar dates as local midnight; timestamps retain their timezone. */
export function parseDateOnly(value: string | Date): Date {
  if (value instanceof Date) return new Date(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(value);
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return date;
}
export function formatDateOnly(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}
export function calendarDaysBetween(a: Date, b: Date): number {
  return (
    (Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) -
      Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) /
    86400000
  );
}
