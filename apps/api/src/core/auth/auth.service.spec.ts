import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService, BCRYPT_ROUNDS } from './auth.service';

const DUMMY_HASH = '$2b$10$dummy-hash-for-unknown-accounts';

jest.mock('bcrypt', () => ({
  hash: jest.fn(async () => DUMMY_HASH),
  compare: jest.fn(async () => false),
}));

describe('AuthService login timing', () => {
  const compare = bcrypt.compare as jest.Mock;

  function serviceWithUser(user: { id: string; email: string; passwordHash: string | null } | null) {
    const userRepo = { findOneBy: jest.fn().mockResolvedValue(user) };
    const membershipRepo = { findOneBy: jest.fn(), findOne: jest.fn() };
    const service = new AuthService(
      userRepo as never,
      membershipRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, userRepo, membershipRepo };
  }

  beforeEach(() => compare.mockClear());

  it('prepares the placeholder hash with the real work factor', () => {
    serviceWithUser(null);
    expect(bcrypt.hash).toHaveBeenCalledWith(expect.any(String), BCRYPT_ROUNDS);
  });

  it('still runs a bcrypt comparison for an unknown email', async () => {
    const { service, membershipRepo } = serviceWithUser(null);

    await expect(service.login({ email: 'nobody@example.com', password: 'guess-123' }))
      .rejects.toThrow(new UnauthorizedException('Invalid credentials'));

    expect(compare).toHaveBeenCalledTimes(1);
    expect(compare).toHaveBeenCalledWith('guess-123', DUMMY_HASH);
    expect(membershipRepo.findOne).not.toHaveBeenCalled();
  });

  it('runs the same comparison for an account without a password', async () => {
    const { service } = serviceWithUser({ id: 'u1', email: 'sso@example.com', passwordHash: null });

    await expect(service.login({ email: 'sso@example.com', password: 'guess-123' }))
      .rejects.toThrow(new UnauthorizedException('Invalid credentials'));

    expect(compare).toHaveBeenCalledWith('guess-123', DUMMY_HASH);
  });

  it('compares against the stored hash for a known account', async () => {
    const { service } = serviceWithUser({ id: 'u1', email: 'known@example.com', passwordHash: '$2b$10$stored' });

    await expect(service.login({ email: 'known@example.com', password: 'guess-123' }))
      .rejects.toThrow(new UnauthorizedException('Invalid credentials'));

    expect(compare).toHaveBeenCalledWith('guess-123', '$2b$10$stored');
  });
});
