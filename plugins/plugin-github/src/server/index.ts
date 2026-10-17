import type { PluginContext } from '@weaver/sdk';

// No onInstall: the registry runs the manifest's migrations (github_links) only for plugins
// without one. Routes come from the manifest and webhook.handler.ts, so nothing is registered here.

export async function onEnable(context: PluginContext): Promise<void> {
  context.logger.info('GitHub plugin enabled');
}

export async function onDisable(context: PluginContext): Promise<void> {
  context.logger.info('GitHub plugin disabled');
}

export async function onUninstall(context: PluginContext): Promise<void> {
  context.logger.info('GitHub plugin uninstalled');
  await context.db.query('DROP TABLE IF EXISTS github_links');
}

export async function onEvent(event: string, _data: unknown, context: PluginContext): Promise<void> {
  if (event === 'issue.created') {
    context.logger.info('New issue created, checking for GitHub references');
  }
}
