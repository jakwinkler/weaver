import { configureHttpSecurity } from './http-security';

describe('HTTP application security', () => {
  it('defaults to trusting no proxy and installs headers plus global validation', () => {
    const express = { set: jest.fn() };
    const app = {
      getHttpAdapter: jest.fn().mockReturnValue({ getInstance: () => express }),
      use: jest.fn(),
      useGlobalPipes: jest.fn(),
    };

    configureHttpSecurity(app as never);

    expect(express.set).toHaveBeenCalledWith('trust proxy', false);
    expect(app.use).toHaveBeenCalledTimes(1);
    expect(app.useGlobalPipes).toHaveBeenCalledTimes(1);
  });
});
