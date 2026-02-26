import type { PluginContext } from '@weaver/sdk';

export async function onInstall(context: PluginContext): Promise<void> {
  context.logger.info('Installing Issue Relations plugin');
  // No migration needed — uses the core issue_links table created by TypeORM synchronize
  context.logger.info('Issue Relations plugin installed successfully');
}

export async function onUninstall(context: PluginContext): Promise<void> {
  context.logger.info('Uninstalling Issue Relations plugin');
  // No tables to drop — issue_links is a core table
  context.logger.info('Issue Relations plugin uninstalled');
}

export async function onEnable(context: PluginContext): Promise<void> {
  context.logger.info('Issue Relations plugin enabled');
}

export async function onDisable(context: PluginContext): Promise<void> {
  context.logger.info('Issue Relations plugin disabled');
}
