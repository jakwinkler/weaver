import type { PluginContext } from '@weaver/sdk';

// The host runs migrations/001_create_jam_tables.sql on install. Uninstall is confirmed by the
// administrator (manifest uninstall.deletesPrivateData), then removes everything the plugin owns.
export async function onUninstall(context: PluginContext): Promise<void> {
  await context.db.runMigration(
    'DROP TABLE IF EXISTS jam_issue_links, jam_items, jam_plugin_state CASCADE',
  );
  context.logger.info('Jam plugin uninstalled');
}

export async function onEnable(context: PluginContext): Promise<void> {
  context.logger.info('Jam plugin enabled');
}

export async function onDisable(context: PluginContext): Promise<void> {
  context.logger.info('Jam plugin disabled');
}
