import { describe, expect, it, vi } from 'vitest';
import config from '../../module-federation.config';
vi.mock('@module-federation/vite', () => ({ createModuleFederationConfig: (value: unknown) => value }));

describe('plugin router context', () => {
  it('publishes the host router as a singleton for federated plugin pages', () => {
    expect(config.shared).toHaveProperty('react-router-dom.singleton', true);
  });
});
