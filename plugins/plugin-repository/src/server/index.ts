import type { PluginContext } from '@weaver/sdk';

export async function onInstall(context: PluginContext): Promise<void> {
  context.logger.info('Installing Repository Integration plugin');

  // The registry runs the manifest's versioned migrations before onInstall.

  // Register custom fields
  await context.api.customFields.register({
    name: 'Repository URL',
    slug: 'repo_url',
    fieldType: 'url',
    entityType: 'project',
  });

  await context.api.customFields.register({
    name: 'Default Branch',
    slug: 'default_branch',
    fieldType: 'text',
    entityType: 'project',
  });

  await context.api.customFields.register({
    name: 'PR URL',
    slug: 'pr_url',
    fieldType: 'url',
    entityType: 'issue',
  });

  await context.api.customFields.register({
    name: 'Branch Name',
    slug: 'branch_name',
    fieldType: 'text',
    entityType: 'issue',
  });

  context.logger.info('Repository Integration plugin installed successfully');
}

export async function onUninstall(context: PluginContext): Promise<void> {
  context.logger.info('Uninstalling Repository Integration plugin');

  // Drop plugin tables
  await context.db.runMigration('DROP TABLE IF EXISTS issue_repository_links CASCADE');
  await context.db.runMigration('DROP TABLE IF EXISTS repository_links CASCADE');

  // Custom fields are auto-cleaned by the framework via pluginId deletion

  context.logger.info('Repository Integration plugin uninstalled');
}

export async function onEnable(context: PluginContext): Promise<void> {
  context.logger.info('Repository Integration plugin enabled');
}

export async function onDisable(context: PluginContext): Promise<void> {
  context.logger.info('Repository Integration plugin disabled');
}
