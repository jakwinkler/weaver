import { matchPluginRoute } from './plugin-route.matcher';

describe('interactive plugin route isolation', () => {
  it.each(['pairing', 'device'])('does not expose %s routes through interactive dispatch', (auth) => {
    const loader = { getManifest: () => ({ routes: [{ method: 'POST', path: '/sync', auth }] }) };
    expect(matchPluginRoute(loader as never, { path: '/api/v1/plugin-routes/example/sync', method: 'POST' })).toBeUndefined();
  });

  it('retains default interactive routes', () => {
    const route = { method: 'GET', path: '/items/:id' };
    const loader = { getManifest: () => ({ routes: [route] }) };
    expect(matchPluginRoute(loader as never, { path: '/api/v1/plugin-routes/example/items/123', method: 'GET' })?.params).toEqual({ id: '123' });
  });
});
