export type AssignmentMethod = 'deterministic' | 'ai' | 'none';

export interface AssignmentPrediction {
  issueKey: string | null;
  confidence: number;
  method: AssignmentMethod;
  reasons: string[];
}

export interface LabeledSegment {
  id: string;
  start: string;
  end: string;
  expectedIssueKey: string | null;
  prediction: AssignmentPrediction;
}

export interface LabeledDayFixture {
  schemaVersion: 1;
  day: string;
  synthetic: boolean;
  candidateIssueKeys: string[];
  reviewDurationSeconds?: number;
  segments: LabeledSegment[];
}

export interface DayEvaluationMetrics {
  labeledMinutes: number;
  correctMinutes: number;
  incorrectMinutes: number;
  unassignedMinutes: number;
  destinationAccuracy: number;
  suggestionPrecision: number;
  deterministicCoverage: number;
  aiCoverage: number;
  reviewDurationSeconds: number | null;
  reviewUnderTwoMinutes: boolean | null;
  meetsDestinationTarget: boolean;
  inventedSuggestionCount: number;
  meetsAssignmentGate: boolean;
}

const ASSIGNMENT_METHODS = new Set<AssignmentMethod>(['deterministic', 'ai', 'none']);

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }

  return value as Record<string, unknown>;
}

function requireNullableString(value: unknown, label: string): string | null {
  if (value !== null && (typeof value !== 'string' || value.length === 0)) {
    throw new Error(`${label} must be a non-empty string or null`);
  }

  return value as string | null;
}

function parseTimestamp(value: unknown, label: string): { iso: string; milliseconds: number } {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be an ISO-8601 timestamp`);
  }

  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    throw new Error(`${label} must be an ISO-8601 timestamp`);
  }

  return { iso: value, milliseconds };
}

export function validateDayFixture(value: unknown): LabeledDayFixture {
  const fixture = requireRecord(value, 'fixture');
  if (fixture.schemaVersion !== 1) {
    throw new Error('schemaVersion must be 1');
  }
  if (typeof fixture.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fixture.day)) {
    throw new Error('day must use YYYY-MM-DD');
  }
  if (typeof fixture.synthetic !== 'boolean') {
    throw new Error('synthetic must be a boolean');
  }
  if (
    !Array.isArray(fixture.candidateIssueKeys) ||
    !fixture.candidateIssueKeys.every(
      (issueKey) => typeof issueKey === 'string' && /^[A-Z][A-Z0-9]+-[0-9]+$/.test(issueKey),
    ) ||
    new Set(fixture.candidateIssueKeys).size !== fixture.candidateIssueKeys.length
  ) {
    throw new Error('candidateIssueKeys must be unique normalized issue keys');
  }
  if (
    fixture.reviewDurationSeconds !== undefined &&
    (typeof fixture.reviewDurationSeconds !== 'number' || fixture.reviewDurationSeconds < 0)
  ) {
    throw new Error('reviewDurationSeconds must be a non-negative number');
  }
  if (!Array.isArray(fixture.segments)) {
    throw new Error('segments must be an array');
  }

  const ids = new Set<string>();
  let previousEnd = Number.NEGATIVE_INFINITY;
  const segments = fixture.segments
    .map((value, index) => {
      const segment = requireRecord(value, `segments[${index}]`);
      if (typeof segment.id !== 'string' || segment.id.length === 0) {
        throw new Error(`segments[${index}].id must be a non-empty string`);
      }
      if (ids.has(segment.id)) {
        throw new Error('segment ids must be unique');
      }
      ids.add(segment.id);

      const start = parseTimestamp(segment.start, `segments[${index}].start`);
      const end = parseTimestamp(segment.end, `segments[${index}].end`);
      if (end.milliseconds <= start.milliseconds) {
        throw new Error('segment end must be after start');
      }

      const prediction = requireRecord(segment.prediction, `segments[${index}].prediction`);
      const confidence = prediction.confidence;
      if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
        throw new Error('confidence must be between 0 and 1');
      }
      if (!ASSIGNMENT_METHODS.has(prediction.method as AssignmentMethod)) {
        throw new Error('prediction method must be deterministic, ai, or none');
      }
      if (
        !Array.isArray(prediction.reasons) ||
        !prediction.reasons.every((reason) => typeof reason === 'string')
      ) {
        throw new Error('prediction reasons must be strings');
      }

      return {
        id: segment.id,
        start: start.iso,
        end: end.iso,
        expectedIssueKey: requireNullableString(
          segment.expectedIssueKey,
          `segments[${index}].expectedIssueKey`,
        ),
        prediction: {
          issueKey: requireNullableString(
            prediction.issueKey,
            `segments[${index}].prediction.issueKey`,
          ),
          confidence,
          method: prediction.method as AssignmentMethod,
          reasons: prediction.reasons as string[],
        },
        startMilliseconds: start.milliseconds,
        endMilliseconds: end.milliseconds,
      };
    })
    .sort((left, right) => left.startMilliseconds - right.startMilliseconds)
    .map((segment) => {
      if (segment.startMilliseconds < previousEnd) {
        throw new Error('segments must not overlap');
      }
      previousEnd = segment.endMilliseconds;

      const {
        startMilliseconds: _startMilliseconds,
        endMilliseconds: _endMilliseconds,
        ...result
      } = segment;
      return result;
    });

  return {
    schemaVersion: 1,
    day: fixture.day,
    synthetic: fixture.synthetic,
    candidateIssueKeys: fixture.candidateIssueKeys as string[],
    ...(fixture.reviewDurationSeconds === undefined
      ? {}
      : { reviewDurationSeconds: fixture.reviewDurationSeconds as number }),
    segments,
  };
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

export function evaluateDay(value: unknown): DayEvaluationMetrics {
  const fixture = validateDayFixture(value);
  let labeledMinutes = 0;
  let correctMinutes = 0;
  let incorrectMinutes = 0;
  let unassignedMinutes = 0;
  let deterministicMinutes = 0;
  let aiMinutes = 0;
  let inventedSuggestionCount = 0;
  const candidates = new Set(fixture.candidateIssueKeys);

  for (const segment of fixture.segments) {
    if (segment.prediction.issueKey !== null && !candidates.has(segment.prediction.issueKey)) {
      inventedSuggestionCount += 1;
    }
    if (segment.expectedIssueKey === null) {
      continue;
    }

    const minutes = (Date.parse(segment.end) - Date.parse(segment.start)) / 60_000;
    labeledMinutes += minutes;
    if (segment.prediction.method === 'deterministic') {
      deterministicMinutes += minutes;
    } else if (segment.prediction.method === 'ai') {
      aiMinutes += minutes;
    }

    if (segment.prediction.issueKey === segment.expectedIssueKey) {
      correctMinutes += minutes;
    } else if (segment.prediction.issueKey === null) {
      unassignedMinutes += minutes;
    } else {
      incorrectMinutes += minutes;
    }
  }

  const suggestedMinutes = correctMinutes + incorrectMinutes;
  const destinationAccuracy = ratio(correctMinutes, labeledMinutes);
  const reviewDurationSeconds = fixture.reviewDurationSeconds ?? null;
  const meetsDestinationTarget = ratio(correctMinutes, labeledMinutes) >= 0.8;

  return {
    labeledMinutes,
    correctMinutes,
    incorrectMinutes,
    unassignedMinutes,
    destinationAccuracy,
    suggestionPrecision: ratio(correctMinutes, suggestedMinutes),
    deterministicCoverage: ratio(deterministicMinutes, labeledMinutes),
    aiCoverage: ratio(aiMinutes, labeledMinutes),
    reviewDurationSeconds,
    reviewUnderTwoMinutes: reviewDurationSeconds === null ? null : reviewDurationSeconds < 120,
    meetsDestinationTarget,
    inventedSuggestionCount,
    meetsAssignmentGate: meetsDestinationTarget && inventedSuggestionCount === 0,
  };
}
