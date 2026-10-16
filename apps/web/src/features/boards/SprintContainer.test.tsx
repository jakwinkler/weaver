// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { DndContext } from '@dnd-kit/core';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Sprint } from '@weaver/shared';
import { SprintContainer } from './SprintContainer';

vi.mock('@/api', () => ({ useSprintStats: () => ({ data: undefined }) }));

const originalTimeZone = process.env.TZ;

const sprint: Sprint = {
  id: 'sprint-1',
  projectId: 'project-1',
  name: 'Sprint 7',
  startDate: '2026-09-23',
  endDate: '2026-10-06',
  status: 'planned',
  createdAt: new Date('2026-09-01T12:00:00.000Z'),
};

describe('SprintContainer', () => {
  beforeAll(() => {
    // Date-only values parsed as UTC midnight show the previous day west of UTC.
    process.env.TZ = 'America/Los_Angeles';
  });

  afterAll(() => {
    if (originalTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimeZone;
  });

  afterEach(cleanup);

  it('shows sprint dates as the stored calendar days west of UTC', () => {
    render(
      <MemoryRouter>
        <DndContext>
          <SprintContainer
            sprint={sprint}
            issues={[]}
            collapsed
            isOver={false}
            canDrag={false}
            onToggle={() => undefined}
          />
        </DndContext>
      </MemoryRouter>,
    );

    const start = new Date(2026, 8, 23).toLocaleDateString();
    const end = new Date(2026, 9, 6).toLocaleDateString();
    expect(screen.getByText(`${start} to ${end}`)).toBeInTheDocument();
  });
});
