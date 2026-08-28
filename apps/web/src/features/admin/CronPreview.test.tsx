// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CronPreview, describeCronExpression } from './CronPreview';

describe('CronPreview', () => {
  it('describes common custom cron expressions in UTC', () => {
    expect(describeCronExpression('0 9 * * 1-5')).toBe('Every weekday at 9:00 AM UTC');
    expect(describeCronExpression('15 14 * * 2')).toBe('Every Tuesday at 2:15 PM UTC');
    expect(describeCronExpression('*/15 * * * *')).toBe('Every 15 minutes UTC');
  });

  it('shows invalid expressions without pretending they will run', () => {
    render(<CronPreview expression="not cron" />);
    expect(screen.getByRole('status')).toHaveTextContent('Invalid cron expression');
    expect(describeCronExpression('0 9 * * 99')).toBe('Invalid cron expression');
  });
});
