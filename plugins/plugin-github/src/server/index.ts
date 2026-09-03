import type { WeaverPlugin, PluginContext, PluginRouter } from '@weaver/sdk';
import { handleGitHubWebhook, getGitHubLinks } from './webhook.handler';

const manifest = require('../../weaver-plugin.json');

export const plugin: WeaverPlugin = {
  manifest,

  async onInstall(context: PluginContext) {
    context.logger.info('GitHub plugin installed');
    // Run migrations to create github_links table
    const migrationSql = require('fs').readFileSync(
      require('path').join(__dirname, '../../migrations/001_create_github_links.sql'),
      'utf-8',
    );
    await context.db.runMigration(migrationSql);
  },

  async onEnable(context: PluginContext) {
    context.logger.info('GitHub plugin enabled');
  },

  async onDisable(context: PluginContext) {
    context.logger.info('GitHub plugin disabled');
  },

  async onUninstall(context: PluginContext) {
    context.logger.info('GitHub plugin uninstalled');
    await context.db.query('DROP TABLE IF EXISTS github_links');
  },

  async onEvent(event: string, _data: unknown, context: PluginContext) {
    if (event === 'issue.created') {
      context.logger.info('New issue created, checking for GitHub references');
    }
  },

  registerRoutes(router: PluginRouter) {
    router.post('/webhook', handleGitHubWebhook);
    router.get('/links/:issueKey', getGitHubLinks);
  },
};
