export type TimelineZoom = 'month' | 'quarter';

export interface TimelineDateRange {
  startDate: string | null;
  dueDate: string | null;
}

export interface TimelinePeriod {
  key: string;
  label: string;
  start: Date;
  end: Date;
  width: number;
}

export interface RoadmapTimeline {
  zoom: TimelineZoom;
  start: Date;
  end: Date;
  periods: TimelinePeriod[];
  width: number;
}

const MONTH_WIDTH = 152;
const QUARTER_WIDTH = 264;
const DAY_MS = 24 * 60 * 60 * 1000;

export function parseDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfPeriod(date: Date, zoom: TimelineZoom): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const periodMonth = zoom === 'quarter' ? Math.floor(month / 3) * 3 : month;
  return new Date(Date.UTC(year, periodMonth, 1));
}

function addPeriods(date: Date, amount: number, zoom: TimelineZoom): Date {
  const months = zoom === 'quarter' ? amount * 3 : amount;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function periodLabel(date: Date, zoom: TimelineZoom): string {
  if (zoom === 'quarter') {
    return `Q${Math.floor(date.getUTCMonth() / 3) + 1} ${date.getUTCFullYear()}`;
  }
  return date.toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function buildTimeline(
  ranges: TimelineDateRange[],
  zoom: TimelineZoom,
  today = new Date(),
): RoadmapTimeline {
  const dates = ranges.flatMap((range) =>
    [range.startDate, range.dueDate].filter((date): date is string => Boolean(date)).map(parseDate),
  );
  const utcToday = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  dates.push(utcToday);

  const earliest = new Date(Math.min(...dates.map((date) => date.getTime())));
  const latest = new Date(Math.max(...dates.map((date) => date.getTime())));
  const start = addPeriods(startOfPeriod(earliest, zoom), -1, zoom);
  const end = addPeriods(startOfPeriod(latest, zoom), 2, zoom);
  const periodWidth = zoom === 'quarter' ? QUARTER_WIDTH : MONTH_WIDTH;
  const periods: TimelinePeriod[] = [];

  for (let cursor = start; cursor < end; cursor = addPeriods(cursor, 1, zoom)) {
    const periodStart = new Date(cursor);
    const periodEnd = addPeriods(periodStart, 1, zoom);
    periods.push({
      key: formatDate(periodStart),
      label: periodLabel(periodStart, zoom),
      start: periodStart,
      end: periodEnd,
      width: periodWidth,
    });
  }

  return {
    zoom,
    start,
    end,
    periods,
    width: periods.length * periodWidth,
  };
}

export function dateToTimelineX(date: Date, timeline: RoadmapTimeline): number {
  if (date <= timeline.start) return 0;
  if (date >= timeline.end) return timeline.width;

  let offset = 0;
  for (const period of timeline.periods) {
    if (date < period.end) {
      const progress =
        (date.getTime() - period.start.getTime()) / (period.end.getTime() - period.start.getTime());
      return offset + progress * period.width;
    }
    offset += period.width;
  }

  return timeline.width;
}

export function timelineXToDate(x: number, timeline: RoadmapTimeline): Date {
  const clampedX = Math.min(Math.max(x, 0), timeline.width - 1);
  let offset = 0;

  for (const period of timeline.periods) {
    if (clampedX < offset + period.width) {
      const progress = (clampedX - offset) / period.width;
      const time =
        period.start.getTime() + progress * (period.end.getTime() - period.start.getTime());
      return new Date(Math.round(time / DAY_MS) * DAY_MS);
    }
    offset += period.width;
  }

  return new Date(timeline.end.getTime() - DAY_MS);
}

export function resizeEpicRange(
  range: { startDate: string; dueDate: string },
  edge: 'start' | 'end',
  nextDate: Date,
): { startDate: string; dueDate: string } {
  const start = parseDate(range.startDate);
  const due = parseDate(range.dueDate);

  if (edge === 'start') {
    return {
      startDate: formatDate(nextDate > due ? due : nextDate),
      dueDate: range.dueDate,
    };
  }

  return {
    startDate: range.startDate,
    dueDate: formatDate(nextDate < start ? start : nextDate),
  };
}
