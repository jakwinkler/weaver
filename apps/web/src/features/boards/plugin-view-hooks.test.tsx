// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CalendarView } from './CalendarView';
import { GanttChart } from './GanttChart';

let projectPlugins: Array<{ pluginId: string }> | undefined;

vi.mock('@/api', () => ({
  useProjectPlugins: () => ({ data: projectPlugins }),
  useProjectIssues: () => ({ data: { data: [] }, isLoading: false, isError: false }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>(
    'react-router-dom',
  );
  return {
    ...actual,
    useParams: () => ({ projectKey: 'TEST' }),
  };
});

describe.each([
  ['Gantt chart', GanttChart],
  ['Calendar', CalendarView],
])('%s plugin gating', (_name, Component) => {
  afterEach(() => {
    cleanup();
    projectPlugins = undefined;
  });

  it('does not change hook order when plugin availability resolves', () => {
    projectPlugins = undefined;
    const view = render(
      <MemoryRouter>
        <Component />
      </MemoryRouter>,
    );

    projectPlugins = [];

    expect(() =>
      view.rerender(
        <MemoryRouter>
          <Component />
        </MemoryRouter>,
      ),
    ).not.toThrow();
  });
});
