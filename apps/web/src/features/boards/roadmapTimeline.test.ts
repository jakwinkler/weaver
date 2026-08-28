import { describe, expect, it } from 'vitest';
import {
  buildTimeline,
  dateToTimelineX,
  timelineXToDate,
  resizeEpicRange,
  type TimelineZoom,
} from './roadmapTimeline';

describe('roadmap timeline', () => {
  it.each<[TimelineZoom, number, string]>([
    ['month', 4, 'Sep 2026'],
    ['quarter', 3, 'Q3 2026'],
  ])('builds padded %s periods around the epic range', (zoom, expectedCount, firstLabel) => {
    const timeline = buildTimeline(
      [{ startDate: '2026-10-04', dueDate: '2026-11-20' }],
      zoom,
      new Date('2026-10-12T12:00:00Z'),
    );

    expect(timeline.periods).toHaveLength(expectedCount);
    expect(timeline.periods[0].label).toBe(firstLabel);
    expect(timeline.start.toISOString().slice(0, 10)).toBe(
      zoom === 'month' ? '2026-09-01' : '2026-07-01',
    );
  });

  it('round trips dates through timeline coordinates', () => {
    const timeline = buildTimeline(
      [{ startDate: '2026-08-01', dueDate: '2026-12-31' }],
      'month',
      new Date('2026-10-12T12:00:00Z'),
    );
    const date = new Date('2026-10-17T00:00:00Z');
    const x = dateToTimelineX(date, timeline);

    expect(timelineXToDate(x, timeline).toISOString().slice(0, 10)).toBe('2026-10-17');
  });

  it('resizes one edge without allowing an inverted date range', () => {
    expect(
      resizeEpicRange(
        { startDate: '2026-10-01', dueDate: '2026-10-31' },
        'start',
        new Date('2026-11-05T00:00:00Z'),
      ),
    ).toEqual({ startDate: '2026-10-31', dueDate: '2026-10-31' });

    expect(
      resizeEpicRange(
        { startDate: '2026-10-01', dueDate: '2026-10-31' },
        'end',
        new Date('2026-09-15T00:00:00Z'),
      ),
    ).toEqual({ startDate: '2026-10-01', dueDate: '2026-10-01' });
  });
});
