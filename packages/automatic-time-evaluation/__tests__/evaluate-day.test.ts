import exampleDay from '../fixtures/example-day.json';
import { evaluateDay, validateDayFixture } from '../src';

describe('Automatic Time labeled-day evaluation', () => {
  it('weights assignment quality by captured minutes', () => {
    const metrics = evaluateDay(exampleDay);

    expect(metrics).toEqual({
      labeledMinutes: 450,
      correctMinutes: 360,
      incorrectMinutes: 45,
      unassignedMinutes: 45,
      destinationAccuracy: 0.8,
      suggestionPrecision: 360 / 405,
      deterministicCoverage: 0.4,
      aiCoverage: 0.5,
      reviewDurationSeconds: 95,
      reviewUnderTwoMinutes: true,
      meetsDestinationTarget: true,
    });
  });

  it('excludes intentionally untracked time from destination accuracy', () => {
    const metrics = evaluateDay({
      schemaVersion: 1,
      day: '2026-08-25',
      synthetic: true,
      segments: [
        {
          id: 'lunch',
          start: '2026-08-25T12:00:00-04:00',
          end: '2026-08-25T13:00:00-04:00',
          expectedIssueKey: null,
          prediction: {
            issueKey: null,
            confidence: 1,
            method: 'none',
            reasons: ['idle:60m'],
          },
        },
      ],
    });

    expect(metrics.labeledMinutes).toBe(0);
    expect(metrics.destinationAccuracy).toBe(0);
    expect(metrics.suggestionPrecision).toBe(0);
  });

  it('rejects overlapping segments so minutes are not double counted', () => {
    expect(() =>
      validateDayFixture({
        schemaVersion: 1,
        day: '2026-08-25',
        synthetic: true,
        segments: [
          {
            id: 'first',
            start: '2026-08-25T09:00:00-04:00',
            end: '2026-08-25T10:00:00-04:00',
            expectedIssueKey: 'WEAV-29',
            prediction: {
              issueKey: 'WEAV-29',
              confidence: 1,
              method: 'deterministic',
              reasons: ['branch:29-automatic-time'],
            },
          },
          {
            id: 'second',
            start: '2026-08-25T09:30:00-04:00',
            end: '2026-08-25T10:30:00-04:00',
            expectedIssueKey: 'WEAV-29',
            prediction: {
              issueKey: 'WEAV-29',
              confidence: 1,
              method: 'deterministic',
              reasons: ['branch:29-automatic-time'],
            },
          },
        ],
      }),
    ).toThrow('segments must not overlap');
  });

  it('rejects confidence outside the inclusive zero-to-one range', () => {
    const invalid = structuredClone(exampleDay);
    invalid.segments[0].prediction.confidence = 1.1;

    expect(() => validateDayFixture(invalid)).toThrow('confidence must be between 0 and 1');
  });
});
