export function todayLocalDate(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.valueOf() - offset).toISOString().slice(0, 10);
}

export function formatDraftTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export function formatMinutes(minutes: number): string {
  const sign = minutes < 0 ? '-' : '';
  const absoluteMinutes = Math.abs(minutes);
  const hours = Math.floor(absoluteMinutes / 60);
  const remainder = absoluteMinutes % 60;
  if (hours === 0) return `${sign}${remainder}m`;
  if (remainder === 0) return `${sign}${hours}h`;
  return `${sign}${hours}h ${remainder}m`;
}
