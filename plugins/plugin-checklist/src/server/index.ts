import type { PluginContext } from '@weaver/sdk';

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  subject VARCHAR(500) NOT NULL,
  is_done BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checklist_items_issue_id ON checklist_items(issue_id);
`;

export async function onInstall(context: PluginContext): Promise<void> {
  context.logger.info('Installing Checklist plugin');
  await context.db.runMigration(CREATE_TABLE_SQL);
  context.logger.info('Checklist plugin installed successfully');
}

export async function onUninstall(context: PluginContext): Promise<void> {
  context.logger.info('Uninstalling Checklist plugin');
  await context.db.runMigration('DROP TABLE IF EXISTS checklist_items CASCADE');
  context.logger.info('Checklist plugin uninstalled');
}

export async function onEnable(context: PluginContext): Promise<void> {
  context.logger.info('Checklist plugin enabled');
}

export async function onDisable(context: PluginContext): Promise<void> {
  context.logger.info('Checklist plugin disabled');
}
