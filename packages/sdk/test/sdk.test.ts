import { WEAVER_EVENTS, OnWeaverEvent, WeaverRoute } from '../src';
import type { WeaverPlugin, PluginManifest } from '../src';

describe('@weaver/sdk', () => {
  it('should export WEAVER_EVENTS constants', () => {
    expect(WEAVER_EVENTS.ISSUE_CREATED).toBe('issue.created');
    expect(WEAVER_EVENTS.ISSUE_STATUS_CHANGED).toBe('issue.status_changed');
    expect(WEAVER_EVENTS.COMMENT_CREATED).toBe('comment.created');
  });

  it('should name core events the way the API emits them', () => {
    // Plugins that still compare against COMMENT_ADDED receive the event the API sends.
    expect(WEAVER_EVENTS.COMMENT_ADDED).toBe(WEAVER_EVENTS.COMMENT_CREATED);
    expect([
      WEAVER_EVENTS.ISSUE_MOVED,
      WEAVER_EVENTS.ISSUE_SPRINT_CHANGED,
      WEAVER_EVENTS.ISSUE_REORDERED,
      WEAVER_EVENTS.ISSUE_BULK_UPDATED,
      WEAVER_EVENTS.ISSUE_BULK_DELETED,
      WEAVER_EVENTS.SPRINT_CREATED,
      WEAVER_EVENTS.SPRINT_UPDATED,
      WEAVER_EVENTS.SPRINT_STARTED,
      WEAVER_EVENTS.SPRINT_COMPLETED,
      WEAVER_EVENTS.SPRINT_DELETED,
      WEAVER_EVENTS.TIME_LOGGED,
      WEAVER_EVENTS.TIME_UPDATED,
      WEAVER_EVENTS.TIME_DELETED,
    ]).toEqual([
      'issue.moved',
      'issue.sprint_changed',
      'issue.reordered',
      'issue.bulk_updated',
      'issue.bulk_deleted',
      'sprint.created',
      'sprint.updated',
      'sprint.started',
      'sprint.completed',
      'sprint.deleted',
      'time.logged',
      'time.updated',
      'time.deleted',
    ]);
  });

  it('should allow creating a plugin manifest', () => {
    const manifest: PluginManifest = {
      id: '@weaver/plugin-test',
      name: 'Test Plugin',
      version: '1.0.0',
      entrypoints: { server: './dist/server.js' },
      permissions: ['issues:read'],
    };
    expect(manifest.id).toBe('@weaver/plugin-test');
  });

  it('should type versioned migrations and the upgrade lifecycle hook', () => {
    const manifest: PluginManifest = {
      id: '@weaver/plugin-upgrade-test',
      name: 'Upgrade Test Plugin',
      version: '1.1.0',
      entrypoints: { server: './dist/server.js' },
      permissions: [],
      migrations: [
        './migrations/001_install.sql',
        { version: '1.1.0', sql: './migrations/002_upgrade.sql' },
      ],
    };
    const plugin: WeaverPlugin = {
      manifest,
      async onUpgrade(fromVersion, toVersion, context) {
        context.logger.info(`Upgraded from ${fromVersion} to ${toVersion}`);
      },
    };

    expect(plugin.onUpgrade).toBeDefined();
    expect(manifest.migrations?.[1]).toEqual({
      version: '1.1.0',
      sql: './migrations/002_upgrade.sql',
    });
  });

  it('should support OnWeaverEvent decorator', () => {
    class TestPlugin {
      @OnWeaverEvent('issue.created')
      async onIssueCreated() {}
    }
    const events = Reflect.getMetadata('weaver:events', TestPlugin);
    expect(events).toEqual([{ event: 'issue.created', handler: 'onIssueCreated' }]);
  });

  it('should support WeaverRoute decorator', () => {
    class TestPlugin {
      @WeaverRoute('POST', '/webhook')
      async handleWebhook() {}
    }
    const routes = Reflect.getMetadata('weaver:routes', TestPlugin);
    expect(routes).toEqual([{ method: 'POST', path: '/webhook', handler: 'handleWebhook' }]);
  });
});
