import type { StatusCategory } from '@weaver/shared';

const COLUMN_X: Record<StatusCategory, number> = {
  todo: 0,
  in_progress: 320,
  done: 640,
};

const NODE_HEIGHT = 80;
const NODE_GAP = 24;
const START_Y = 0;

export interface LayoutInput {
  id: string;
  category: StatusCategory;
}

export function autoLayout(
  statuses: LayoutInput[],
): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};
  const counters: Record<StatusCategory, number> = {
    todo: 0,
    in_progress: 0,
    done: 0,
  };

  for (const status of statuses) {
    const col = status.category;
    const idx = counters[col];
    positions[status.id] = {
      x: COLUMN_X[col],
      y: START_Y + idx * (NODE_HEIGHT + NODE_GAP),
    };
    counters[col]++;
  }

  return positions;
}
