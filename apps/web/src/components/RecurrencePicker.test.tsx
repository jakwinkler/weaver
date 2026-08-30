// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RecurrencePicker } from './RecurrencePicker';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('RecurrencePicker', () => {
  it('creates a weekly rule and allows selecting weekdays', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-24T12:00:00.000Z'));
    const onChange = vi.fn();
    const { rerender } = render(<RecurrencePicker value={null} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Repeat'), { target: { value: 'weekly' } });
    expect(onChange).toHaveBeenLastCalledWith({
      frequency: 'weekly',
      interval: 1,
      daysOfWeek: [1],
    });

    rerender(
      <RecurrencePicker
        value={{ frequency: 'weekly', interval: 1, daysOfWeek: [1] }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Friday' }));
    expect(onChange).toHaveBeenLastCalledWith({
      frequency: 'weekly',
      interval: 1,
      daysOfWeek: [1, 5],
    });
  });

  it('sets and clears an occurrence limit', () => {
    const onChange = vi.fn();
    const value = { frequency: 'daily' as const, interval: 1 };
    const { rerender } = render(<RecurrencePicker value={value} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Ends'), { target: { value: 'count' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...value, maxOccurrences: 1 });

    rerender(<RecurrencePicker value={{ ...value, maxOccurrences: 1 }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Occurrences'), { target: { value: '4' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...value, maxOccurrences: 4 });

    fireEvent.change(screen.getByLabelText('Ends'), { target: { value: 'never' } });
    expect(onChange).toHaveBeenLastCalledWith(value);
  });

  it('defaults monthly recurrence to the current day of month', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-24T12:00:00.000Z'));
    const onChange = vi.fn();
    render(<RecurrencePicker value={null} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Repeat'), { target: { value: 'monthly' } });
    expect(onChange).toHaveBeenLastCalledWith({
      frequency: 'monthly',
      interval: 1,
      dayOfMonth: 24,
    });
  });
});
