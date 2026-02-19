import { Injectable } from '@nestjs/common';

export interface ConditionContext {
  userId: string;
  issueId: string;
  tenantId: string;
  currentStatusId: string;
  targetStatusId: string;
  issueData: Record<string, unknown>;
}

export type ConditionEvaluator = (
  context: ConditionContext,
  params: Record<string, unknown>,
) => Promise<boolean>;

@Injectable()
export class ConditionEvaluatorRegistry {
  private evaluators = new Map<string, ConditionEvaluator>();

  register(name: string, evaluator: ConditionEvaluator): void {
    this.evaluators.set(name, evaluator);
  }

  unregister(name: string): void {
    this.evaluators.delete(name);
  }

  has(name: string): boolean {
    return this.evaluators.has(name);
  }

  get(name: string): ConditionEvaluator | undefined {
    return this.evaluators.get(name);
  }

  async evaluate(
    name: string,
    context: ConditionContext,
    params: Record<string, unknown>,
  ): Promise<boolean> {
    const evaluator = this.evaluators.get(name);
    if (!evaluator) {
      throw new Error(`Condition evaluator "${name}" not registered`);
    }
    return evaluator(context, params);
  }

  async evaluateAll(
    conditions: Array<{ type: string; params: Record<string, unknown> }>,
    context: ConditionContext,
  ): Promise<boolean> {
    for (const condition of conditions) {
      const result = await this.evaluate(condition.type, context, condition.params);
      if (!result) return false;
    }
    return true;
  }

  getRegisteredNames(): string[] {
    return Array.from(this.evaluators.keys());
  }
}
