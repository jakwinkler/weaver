import { boardConfigSchema, createBoardSchema, updateBoardSchema } from '../src/schemas';

const statusId = '550e8400-e29b-41d4-a716-446655440000';

describe('board configuration schemas', () => {
  it('accepts supported swimlanes and positive integer WIP limits', () => {
    expect(
      boardConfigSchema.parse({
        swimlaneField: 'assignee',
        wipLimits: { [statusId]: 3 },
      }),
    ).toEqual({
      swimlaneField: 'assignee',
      wipLimits: { [statusId]: 3 },
    });
  });

  it.each(['team', 'status', 'label'])('rejects unsupported swimlane field %s', (field) => {
    expect(
      boardConfigSchema.safeParse({
        swimlaneField: field,
      }).success,
    ).toBe(false);
  });

  it.each([0, -1, 1.5])('rejects invalid WIP limit %s', (limit) => {
    expect(
      boardConfigSchema.safeParse({
        wipLimits: { [statusId]: limit },
      }).success,
    ).toBe(false);
  });

  it('validates board configuration during create and update', () => {
    expect(
      createBoardSchema.safeParse({
        name: 'Delivery',
        type: 'kanban',
        config: { swimlaneField: 'priority' },
      }).success,
    ).toBe(true);
    expect(
      updateBoardSchema.safeParse({
        config: { wipLimits: { [statusId]: 5 } },
      }).success,
    ).toBe(true);
    expect(
      updateBoardSchema.safeParse({
        config: { wipLimits: { 'not-a-status': 5 } },
      }).success,
    ).toBe(false);
  });
});
