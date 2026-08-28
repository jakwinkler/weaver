import { AsyncLocalStorage } from 'async_hooks';

export interface AutomationExecutionContext {
  depth: number;
  chainId: string;
}

export const automationExecutionStorage = new AsyncLocalStorage<AutomationExecutionContext>();

export function getAutomationExecutionContext(): AutomationExecutionContext | undefined {
  return automationExecutionStorage.getStore();
}
