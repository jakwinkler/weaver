import type { PluginContext } from '@weaver/sdk';

export async function onInstall(context: PluginContext): Promise<void> {
  context.logger.info('Plugin Template installed');
}
