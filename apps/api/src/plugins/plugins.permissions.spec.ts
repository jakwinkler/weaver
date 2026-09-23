import 'reflect-metadata';
import { PluginsController } from './plugins.controller';
import { PermissionGuard } from '../core/auth';
import { PERMISSION_KEY } from '../core/auth/require-permission.decorator';
describe('plugin administration boundaries', () => {
  it.each(['upgrade', 'getSettings'] as const)('%s requires plugin administration permission', (name) => {
    expect(Reflect.getMetadata('__guards__', PluginsController.prototype[name])).toContain(PermissionGuard);
    expect(Reflect.getMetadata(PERMISSION_KEY, PluginsController.prototype[name])).toEqual({ category: 'admin', action: 'manage_plugins' });
  });
});
