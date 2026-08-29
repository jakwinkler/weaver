import { Injectable } from '@nestjs/common';

export interface PostFunctionContext {
  userId: string;
  issueId: string;
  tenantId: string;
  fromStatusId: string;
  toStatusId: string;
  issueData: Record<string, unknown>;
}

export type PostFunction = (
  context: PostFunctionContext,
  params: Record<string, unknown>,
) => Promise<void>;

@Injectable()
export class PostFunctionRegistry {
  private functions = new Map<string, PostFunction>();

  register(name: string, fn: PostFunction): void {
    this.functions.set(name, fn);
  }

  unregister(name: string): void {
    this.functions.delete(name);
  }

  has(name: string): boolean {
    return this.functions.has(name);
  }

  get(name: string): PostFunction | undefined {
    return this.functions.get(name);
  }

  async execute(
    name: string,
    context: PostFunctionContext,
    params: Record<string, unknown>,
  ): Promise<void> {
    const fn = this.functions.get(name);
    if (!fn) {
      throw new Error(`Post-function "${name}" not registered`);
    }
    return fn(context, params);
  }

  async executeAll(
    postFunctions: Array<{
      type: string;
      params?: Record<string, unknown>;
      [key: string]: unknown;
    }>,
    context: PostFunctionContext,
  ): Promise<void> {
    for (const pf of postFunctions) {
      const { type, params, ...flatParams } = pf;
      await this.execute(type, context, params ?? flatParams);
    }
  }

  getRegisteredNames(): string[] {
    return Array.from(this.functions.keys());
  }
}
