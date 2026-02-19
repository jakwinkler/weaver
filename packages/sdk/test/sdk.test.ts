import {
  WEAVER_EVENTS,
  OnWeaverEvent,
  WeaverRoute,
} from '../src';
import type {
  WeaverPlugin,
  PluginManifest,
  PluginContext,
} from '../src';

describe('@weaver/sdk', () => {
  it('should export WEAVER_EVENTS constants', () => {
    expect(WEAVER_EVENTS.ISSUE_CREATED).toBe('issue.created');
    expect(WEAVER_EVENTS.ISSUE_STATUS_CHANGED).toBe('issue.status_changed');
    expect(WEAVER_EVENTS.COMMENT_ADDED).toBe('comment.added');
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
