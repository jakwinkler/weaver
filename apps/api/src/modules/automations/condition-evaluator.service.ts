import { Injectable } from '@nestjs/common';
import { IssueEntity, IssueTypeEntity, WorkflowStatusEntity } from '@weaver/db';
import { TenantConnectionProvider } from '../../core/tenant';
import { AutomationCondition, automationConditionSchema } from './automation.types';

@Injectable()
export class AutomationConditionEvaluatorService {
  constructor(private readonly tenantConnections: TenantConnectionProvider) {}

  async evaluate(
    rawCondition: AutomationCondition | Record<string, unknown>,
    issue: IssueEntity,
  ): Promise<boolean> {
    const condition = automationConditionSchema.parse(rawCondition);

    switch (condition.type) {
      case 'field_equals':
        return this.valuesEqual(this.readField(issue, condition.field), condition.value);
      case 'field_not_equals':
        return !this.valuesEqual(this.readField(issue, condition.field), condition.value);
      case 'field_empty':
        return this.isEmpty(this.readField(issue, condition.field));
      case 'field_contains':
        return this.contains(this.readField(issue, condition.field), condition.value);
      case 'status_category': {
        const em = await this.tenantConnections.getEntityManager();
        const status = await em
          .getRepository(WorkflowStatusEntity)
          .findOneBy({ id: issue.statusId });
        return status?.category === condition.value;
      }
      case 'issue_type': {
        if (!issue.issueTypeId) return false;
        const em = await this.tenantConnections.getEntityManager();
        const issueType = await em
          .getRepository(IssueTypeEntity)
          .findOneBy({ id: issue.issueTypeId });
        const expected = condition.value.toLowerCase();
        return (
          issueType?.slug.toLowerCase() === expected || issueType?.name.toLowerCase() === expected
        );
      }
      case 'query': {
        const actual = this.readField(issue, condition.field);
        if (!(actual instanceof Date) && typeof actual !== 'string') return false;
        const actualTime = new Date(actual).getTime();
        const expectedTime =
          condition.value === 'now' ? Date.now() : new Date(condition.value).getTime();
        if (Number.isNaN(actualTime) || Number.isNaN(expectedTime)) return false;
        return condition.operator === 'before'
          ? actualTime < expectedTime
          : actualTime > expectedTime;
      }
    }
  }

  async evaluateAll(
    conditions: Array<AutomationCondition | Record<string, unknown>>,
    issue: IssueEntity,
  ): Promise<boolean> {
    for (const condition of conditions) {
      if (!(await this.evaluate(condition, issue))) return false;
    }
    return true;
  }

  private readField(issue: IssueEntity, field: string): unknown {
    if (!Object.prototype.hasOwnProperty.call(issue, field)) return undefined;
    return (issue as unknown as Record<string, unknown>)[field];
  }

  private isEmpty(value: unknown): boolean {
    return (
      value === null ||
      value === undefined ||
      value === '' ||
      (Array.isArray(value) && value.length === 0)
    );
  }

  private valuesEqual(actual: unknown, expected: unknown): boolean {
    if (actual === expected) return true;
    if (
      actual !== null &&
      expected !== null &&
      typeof actual === 'object' &&
      typeof expected === 'object'
    ) {
      return JSON.stringify(actual) === JSON.stringify(expected);
    }
    return false;
  }

  private contains(actual: unknown, expected: unknown): boolean {
    if (typeof actual === 'string' && typeof expected === 'string') {
      return actual.toLocaleLowerCase().includes(expected.toLocaleLowerCase());
    }
    if (Array.isArray(actual)) {
      return actual.some((value) => this.valuesEqual(value, expected));
    }
    return false;
  }
}
