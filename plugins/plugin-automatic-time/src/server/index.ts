import type { PluginContext } from '@weaver/sdk';

export async function onInstall(context: PluginContext): Promise<void> {
  context.logger.info('Automatic Time plugin installed with private draft storage');
}

export async function onEnable(context: PluginContext): Promise<void> {
  context.logger.info('Automatic Time plugin enabled');
}

export async function onDisable(context: PluginContext): Promise<void> {
  await context.db.query(
    `UPDATE automatic_time_devices
        SET revoked_at = COALESCE(revoked_at, now())
      WHERE revoked_at IS NULL`,
  );
  context.logger.info('Automatic Time plugin disabled and device credentials revoked');
}

export async function onUninstall(context: PluginContext): Promise<void> {
  await context.db.runMigration(`
    DROP TABLE IF EXISTS automatic_time_drafts CASCADE;
    DROP TABLE IF EXISTS automatic_time_correction_memories CASCADE;
    DROP TABLE IF EXISTS automatic_time_release_batches CASCADE;
    DROP TABLE IF EXISTS automatic_time_user_settings CASCADE;
    DROP TABLE IF EXISTS automatic_time_devices CASCADE;
  `);
  context.logger.info('Automatic Time private plugin data deleted; official time was preserved');
}
