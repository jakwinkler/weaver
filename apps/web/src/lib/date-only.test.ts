import { describe, expect, it } from 'vitest';
import { parseDateOnly, formatDateOnly } from './date-only';

describe('local calendar dates', () => {
  it('preserves the selected date west of UTC', () => {
    const date = parseDateOnly('2026-09-23');
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 8, 23]);
  });
  it('formats local evening without jumping to the next UTC day', () => {
    expect(formatDateOnly(new Date(2026, 8, 23, 23, 30))).toBe('2026-09-23');
  });
});
