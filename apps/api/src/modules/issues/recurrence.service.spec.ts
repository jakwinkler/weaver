import { getOccurrenceDate } from './recurrence.service';

const issue = (startDate: string) => ({
  startDate,
  dueDate: null,
  createdAt: new Date(`${startDate}T12:00:00.000Z`),
});

describe('getOccurrenceDate', () => {
  it('applies daily intervals', () => {
    expect(getOccurrenceDate(issue('2026-08-29'), { frequency: 'daily', interval: 2 }, 3)).toEqual(
      new Date('2026-09-04T00:00:00.000Z'),
    );
  });

  it('supports multiple weekdays in each active week', () => {
    const rule = { frequency: 'weekly' as const, interval: 1, daysOfWeek: [1, 3] };
    expect(getOccurrenceDate(issue('2026-08-24'), rule, 1)).toEqual(
      new Date('2026-08-26T00:00:00.000Z'),
    );
    expect(getOccurrenceDate(issue('2026-08-24'), rule, 2)).toEqual(
      new Date('2026-08-31T00:00:00.000Z'),
    );
  });

  it('clamps monthly recurrences to the last day of shorter months', () => {
    const rule = { frequency: 'monthly' as const, interval: 1, dayOfMonth: 31 };
    expect(getOccurrenceDate(issue('2026-01-31'), rule, 1)).toEqual(
      new Date('2026-02-28T00:00:00.000Z'),
    );
    expect(getOccurrenceDate(issue('2026-01-31'), rule, 2)).toEqual(
      new Date('2026-03-31T00:00:00.000Z'),
    );
  });
});
