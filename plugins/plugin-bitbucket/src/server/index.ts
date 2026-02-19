import type { WeaverPlugin, PluginContext, PluginRouter } from '@weaver/sdk';
import { handleBitbucketWebhook, getBitbucketLinks } from './webhook.handler';

const manifest = require('../../weaver-plugin.json');

export const plugin: WeaverPlugin = {
  manifest,

  async onInstall(context: PluginContext) {
    context.logger.info('Bitbucket plugin installed');
    const migrationSql = require('fs').readFileSync(
      require('path').join(__dirname, '../../migrations/001_create_bitbucket_links.sql'),
      'utf-8',
    );
    await context.db.runMigration(migrationSql);
  },

  async onEnable(context: PluginContext) {
    context.logger.info('Bitbucket plugin enabled');
  },

  async onDisable(context: PluginContext) {
    context.logger.info('Bitbucket plugin disabled');
  },

  async onUninstall(context: PluginContext) {
    context.logger.info('Bitbucket plugin uninstalled');
    await context.db.query('DROP TABLE IF EXISTS bitbucket_links');
  },

  async onEvent(event: string, data: unknown, context: PluginContext) {
    if (event === 'issue.created') {
      context.logger.info('New issue created, checking for Bitbucket references');
    }
  },

  registerRoutes(router: PluginRouter) {
    router.post('/webhook', handleBitbucketWebhook);
    router.get('/links/:issueKey', getBitbucketLinks);
  },
};
