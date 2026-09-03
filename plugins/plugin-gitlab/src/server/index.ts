import type { WeaverPlugin, PluginContext, PluginRouter } from '@weaver/sdk';
import { handleGitLabWebhook, getGitLabLinks } from './webhook.handler';

const manifest = require('../../weaver-plugin.json');

export const plugin: WeaverPlugin = {
  manifest,

  async onInstall(context: PluginContext) {
    context.logger.info('GitLab plugin installed');
    const migrationSql = require('fs').readFileSync(
      require('path').join(__dirname, '../../migrations/001_create_gitlab_links.sql'),
      'utf-8',
    );
    await context.db.runMigration(migrationSql);
  },

  async onEnable(context: PluginContext) {
    context.logger.info('GitLab plugin enabled');
  },

  async onDisable(context: PluginContext) {
    context.logger.info('GitLab plugin disabled');
  },

  async onUninstall(context: PluginContext) {
    context.logger.info('GitLab plugin uninstalled');
    await context.db.query('DROP TABLE IF EXISTS gitlab_links');
  },

  async onEvent(event: string, _data: unknown, context: PluginContext) {
    if (event === 'issue.created') {
      context.logger.info('New issue created, checking for GitLab references');
    }
  },

  registerRoutes(router: PluginRouter) {
    router.post('/webhook', handleGitLabWebhook);
    router.get('/links/:issueKey', getGitLabLinks);
  },
};
