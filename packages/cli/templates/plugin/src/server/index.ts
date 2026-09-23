import type { PluginContext } from '@weaver/sdk';

const pluginName = WEAVER_PLUGIN_DISPLAY_NAME;

export async function onInstall(context: PluginContext): Promise<void> {
  context.logger.info(`${pluginName} installed`);
}

export async function onEnable(context: PluginContext): Promise<void> {
  context.logger.info(`${pluginName} enabled`);
}

export async function onDisable(context: PluginContext): Promise<void> {
  context.logger.info(`${pluginName} disabled`);
}

export async function onUninstall(context: PluginContext): Promise<void> {
  context.logger.info(`${pluginName} uninstalled`);
}
