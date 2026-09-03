import { configureHttpSecurity } from './http-security';

describe('HTTP application security', () => {
  it('trusts exactly one proxy and installs headers plus global validation', () => {
    const express = { set: jest.fn() };
    const app = {
      getHttpAdapter: jest.fn().mockReturnValue({ getInstance: () => express }),
      use: jest.fn(),
      useGlobalPipes: jest.fn(),
    };

    configureHttpSecurity(app as never);

    expect(express.set).toHaveBeenCalledWith('trust proxy', 1);
    expect(app.use).toHaveBeenCalledTimes(1);
    expect(app.useGlobalPipes).toHaveBeenCalledTimes(1);
  });
});
