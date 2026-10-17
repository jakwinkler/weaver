import { tenantStorage } from '../core/tenant';
import { PluginEventBridgeService } from './plugin-event-bridge.service';

describe('PluginEventBridgeService subscriptions', () => {
  const subscriptions: Record<string, string[]> = {
    '@acme/legacy-comments': ['comment.added'],
    '@acme/comments': ['comment.created'],
    '@acme/everything': ['*'],
    '@acme/issues': ['issue.created'],
  };
  const onEvent = jest.fn().mockResolvedValue(undefined);
  const repo = {
    find: jest
      .fn()
      .mockResolvedValue(
        Object.keys(subscriptions).map((pluginId) => ({ pluginId, settings: {}, enabled: true })),
      ),
  };
  const loader = {
    getManifest: jest.fn((pluginId: string) => ({
      events: { subscribes: subscriptions[pluginId] },
    })),
    getModule: jest.fn(async (pluginId: string) => ({
      onEvent: (event: string, payload: unknown) => onEvent(pluginId, event, payload),
    })),
  };
  let dispatch: (event: string, payload: Record<string, unknown>) => Promise<void>;

  beforeEach(() => {
    jest.clearAllMocks();
    const eventDispatcher = {
      registerPluginDispatcher: jest.fn((fn) => {
        dispatch = fn;
      }),
    };
    new PluginEventBridgeService(
      repo as never,
      eventDispatcher as never,
      loader as never,
      { create: jest.fn().mockResolvedValue({}) } as never,
      { mergeSettingsWithDefaults: jest.fn((_id, settings) => settings) } as never,
    ).onModuleInit();
  });

  const deliver = (event: string, payload: Record<string, unknown>) =>
    tenantStorage.run({ tenantId: 'tenant-a', schemaName: 'tenant_a' }, () =>
      dispatch(event, payload),
    );

  it('delivers comment.created, under that name, to a plugin still subscribed to comment.added', async () => {
    const payload = { commentId: 'c-1', issueKey: 'A-1', projectKey: 'A', userId: 'u-1' };

    await deliver('comment.created', payload);

    expect(onEvent.mock.calls.map(([pluginId]) => pluginId).sort()).toEqual([
      '@acme/comments',
      '@acme/everything',
      '@acme/legacy-comments',
    ]);
    expect(onEvent).toHaveBeenCalledWith('@acme/legacy-comments', 'comment.created', payload);
  });

  it('keeps comment.added subscribers out of other comment events', async () => {
    await deliver('comment.deleted', { commentId: 'c-1', issueKey: 'A-1', projectKey: 'A' });

    expect(onEvent.mock.calls.map(([pluginId]) => pluginId)).toEqual(['@acme/everything']);
  });
});
