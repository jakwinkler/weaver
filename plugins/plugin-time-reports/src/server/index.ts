import type { PluginContext } from '@weaver/sdk';

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS saved_time_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}',
  group_by VARCHAR(50) NOT NULL DEFAULT 'project',
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

export async function onInstall(context: PluginContext): Promise<void> {
  context.logger.info('Installing Time Reports plugin');
  await context.db.runMigration(CREATE_TABLE_SQL);
  context.logger.info('Time Reports plugin installed successfully');
}

export async function onUninstall(context: PluginContext): Promise<void> {
  context.logger.info('Uninstalling Time Reports plugin');
  await context.db.runMigration('DROP TABLE IF EXISTS saved_time_reports CASCADE');
  context.logger.info('Time Reports plugin uninstalled');
}

export async function onEnable(context: PluginContext): Promise<void> {
  context.logger.info('Time Reports plugin enabled');
}

export async function onDisable(context: PluginContext): Promise<void> {
  context.logger.info('Time Reports plugin disabled');
}
