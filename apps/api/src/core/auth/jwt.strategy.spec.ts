import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import { rememberSessionVersion } from './session-version';

describe('JwtStrategy session version', () => {
  const payload = {
    sub: 'user-1',
    email: 'owner@example.com',
    tenantId: '11111111-1111-4111-8111-111111111111',
    role: 'owner',
    tokenType: 'access' as const,
  };

  function setup(accountVersion: number | null) {
    const users = {
      findOne: jest
        .fn()
        .mockResolvedValue(accountVersion === null ? null : { id: 'user-1', sessionVersion: accountVersion }),
    };
    const config = { get: jest.fn().mockReturnValue('test-secret') };
    return { strategy: new JwtStrategy(config as never, users as never), users };
  }

  it('accepts a token issued under the current version', async () => {
    const { strategy, users } = setup(2);
    await expect(
      strategy.validate({} as never, { ...payload, sessionVersion: 2 }),
    ).resolves.toEqual({
      userId: 'user-1',
      email: 'owner@example.com',
      tenantId: payload.tenantId,
      role: 'owner',
    });
    expect(users.findOne).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { id: true, sessionVersion: true },
    });
  });

  it('counts a token without a version as version 0', async () => {
    const { strategy } = setup(0);
    await expect(strategy.validate({} as never, payload)).resolves.toMatchObject({ userId: 'user-1' });
  });

  it('rejects a token issued before the last password reset', async () => {
    const { strategy } = setup(1);
    await expect(strategy.validate({} as never, payload)).rejects.toThrow(
      new UnauthorizedException('Session has ended'),
    );
  });

  it('rejects a token for an account that no longer exists', async () => {
    const { strategy } = setup(null);
    await expect(
      strategy.validate({} as never, { ...payload, sessionVersion: 0 }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('reuses the version the tenant middleware already read', async () => {
    const { strategy, users } = setup(0);
    const req = {};
    rememberSessionVersion(req, 'user-1', 5);

    await expect(strategy.validate(req as never, payload)).rejects.toThrow('Session has ended');
    await expect(
      strategy.validate(req as never, { ...payload, sessionVersion: 5 }),
    ).resolves.toMatchObject({ userId: 'user-1' });
    expect(users.findOne).not.toHaveBeenCalled();
  });

  it('does not reuse a version read for a different account', async () => {
    const { strategy, users } = setup(0);
    const req = {};
    rememberSessionVersion(req, 'someone-else', 5);

    await expect(strategy.validate(req as never, payload)).resolves.toMatchObject({ userId: 'user-1' });
    expect(users.findOne).toHaveBeenCalledTimes(1);
  });
});
