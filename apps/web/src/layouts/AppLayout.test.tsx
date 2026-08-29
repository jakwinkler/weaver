// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { adminNavItems } from './AppLayout';

describe('AppLayout admin navigation', () => {
  it('links administrators to the Jira import wizard', () => {
    expect(adminNavItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          to: '/settings/import-export',
          label: 'Import / Export',
        }),
      ]),
    );
  });
});
