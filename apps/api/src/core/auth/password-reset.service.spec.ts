import { BadRequestException, HttpException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { PASSWORD_RESET_INVALID_MESSAGE, PasswordResetService } from './password-reset.service';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

describe('PasswordResetService', () => {
  const passwordUser = {
    id: 'user-1',
    email: 'owner@example.com',
    displayName: 'Owner',
    passwordHash: 'existing-hash',
    authProvider: 'local',
    authProviders: ['local', 'google'],
  };

  let users: { findOneBy: jest.Mock; update: jest.Mock };
  let tokens: {
    findOneBy: jest.Mock;
    findOne: jest.Mock;
    delete: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
  };
  let sessions: { delete: jest.Mock };
  let memberships: { find: jest.Mock };
  let manager: { query: jest.Mock; getRepository: jest.Mock };
  let mail: { enqueueAccountEmail: jest.Mock; hasSystemSmtp: jest.Mock; webUrl: jest.Mock };
  let audit: { log: jest.Mock };
  let rateLimiting: { consume: jest.Mock };
  let service: PasswordResetService;
  const request = { ip: '203.0.113.9', get: () => 'jest' } as never;

  beforeEach(() => {
    users = { findOneBy: jest.fn().mockResolvedValue(passwordUser), update: jest.fn() };
    tokens = {
      findOneBy: jest.fn(),
      findOne: jest.fn(),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      save: jest.fn(async (row) => row),
      create: jest.fn((row) => row),
    };
    sessions = { delete: jest.fn().mockResolvedValue({ affected: 3 }) };
    memberships = {
      find: jest.fn().mockResolvedValue([
        { tenantId: 'tenant-a', tenant: { schemaName: 'tenant_a' } },
        { tenantId: 'tenant-b', tenant: { schemaName: 'tenant_b' } },
      ]),
    };
    manager = {
      query: jest.fn(),
      getRepository: jest.fn((entity: { name: string }) => {
        if (entity.name === 'UserEntity') return users;
        if (entity.name === 'RefreshSessionEntity') return sessions;
        return tokens;
      }),
    };
    (tokens as unknown as { manager: unknown }).manager = {
      transaction: jest.fn(async (work: (m: typeof manager) => unknown) => work(manager)),
    };
    mail = {
      enqueueAccountEmail: jest.fn().mockResolvedValue(true),
      hasSystemSmtp: jest.fn().mockReturnValue(true),
      webUrl: jest.fn((path: string) => `https://weaver.example.com${path}`),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    rateLimiting = { consume: jest.fn().mockResolvedValue(true) };
    service = new PasswordResetService(
      users as never,
      tokens as never,
      memberships as never,
      mail as never,
      rateLimiting as never,
      { get: jest.fn(() => audit) } as never,
    );
  });

  describe('requestReset', () => {
    it('returns before the account lookup finishes', async () => {
      let finishLookup: (value: unknown) => void = () => undefined;
      users.findOneBy.mockReturnValue(
        new Promise((resolve) => {
          finishLookup = resolve;
        }),
      );

      expect(service.requestReset('owner@example.com')).toBeUndefined();
      expect(mail.enqueueAccountEmail).not.toHaveBeenCalled();

      finishLookup(null);
      await service.settle();
      expect(mail.enqueueAccountEmail).not.toHaveBeenCalled();
      expect(tokens.save).not.toHaveBeenCalled();
    });

    it('replaces earlier links with one hashed, 30-minute token and emails it', async () => {
      service.requestReset('Owner@Example.com');
      await service.settle();

      expect(manager.query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock(hashtext($1))', [
        'password-reset:user-1',
      ]);
      expect(tokens.delete).toHaveBeenCalledWith({ userId: 'user-1' });
      const saved = tokens.save.mock.calls[0][0];
      const [, template, context] = mail.enqueueAccountEmail.mock.calls[0];
      expect(template).toBe('password-reset');
      const token = String(context.resetUrl).split('/reset-password/')[1];
      expect(token).toMatch(/^[a-f0-9]{96}$/);
      expect(saved.selector).toBe(token.slice(0, 32));
      expect(saved.verifierHash).toBe(sha256(token.slice(32)));
      expect(JSON.stringify(saved)).not.toContain(token.slice(32));
      expect(saved.expiresAt.getTime() - Date.now()).toBeGreaterThan(29 * 60_000);
      expect(context.expiresInMinutes).toBe(30);
    });

    it('explains SSO sign-in instead of issuing a link to an account with no password', async () => {
      users.findOneBy.mockResolvedValue({
        ...passwordUser,
        passwordHash: null,
        authProvider: 'github',
        authProviders: ['github', 'saml'],
      });
      service.requestReset('owner@example.com');
      await service.settle();

      expect(tokens.save).not.toHaveBeenCalled();
      expect(mail.enqueueAccountEmail).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'user-1' }),
        'password-reset-unavailable',
        { providers: 'GitHub', loginUrl: 'https://weaver.example.com/login' },
      );
    });

    it('names organization single sign-on when the account has no social provider', async () => {
      users.findOneBy.mockResolvedValue({
        ...passwordUser,
        passwordHash: null,
        authProvider: 'oidc',
        authProviders: ['oidc'],
      });
      service.requestReset('owner@example.com');
      await service.settle();
      expect(mail.enqueueAccountEmail.mock.calls[0][2].providers).toBe(
        "your organization's single sign-on",
      );
    });

    it('creates no link when the installation has no SMTP server', async () => {
      mail.hasSystemSmtp.mockReturnValue(false);
      service.requestReset('owner@example.com');
      await service.settle();
      expect(tokens.save).not.toHaveBeenCalled();
      expect(mail.enqueueAccountEmail).not.toHaveBeenCalled();
    });

    it('drops the new link when the email cannot be queued', async () => {
      mail.enqueueAccountEmail.mockResolvedValue(false);
      service.requestReset('owner@example.com');
      await service.settle();
      const saved = tokens.save.mock.calls[0][0];
      expect(tokens.delete).toHaveBeenLastCalledWith({ selector: saved.selector });
    });

    it('logs failures without the address', async () => {
      users.findOneBy.mockRejectedValue(new Error('database unavailable'));
      const logError = jest
        .spyOn((service as any).logger, 'error')
        .mockImplementation(() => undefined);
      service.requestReset('owner@example.com');
      await service.settle();
      expect(logError).toHaveBeenCalledWith('Password reset request failed: database unavailable');
    });
  });

  describe('confirmReset', () => {
    const selector = 'a'.repeat(32);
    const verifier = 'b'.repeat(64);
    const token = `${selector}${verifier}`;
    const row = () => ({
      userId: 'user-1',
      selector,
      verifierHash: sha256(verifier),
      expiresAt: new Date(Date.now() + 60_000),
    });

    beforeEach(() => {
      tokens.findOneBy.mockResolvedValue(row());
      tokens.findOne.mockResolvedValue(row());
    });

    it.each(['', 'not-a-token', `${token}0`, token.toUpperCase()])(
      'rejects the malformed link %p without a lookup',
      async (candidate) => {
        await expect(service.confirmReset(candidate, 'new-password-1', request)).rejects.toThrow(
          new BadRequestException(PASSWORD_RESET_INVALID_MESSAGE),
        );
        expect(tokens.findOneBy).not.toHaveBeenCalled();
      },
    );

    it('rejects an unknown selector with the same message', async () => {
      tokens.findOneBy.mockResolvedValue(null);
      await expect(service.confirmReset(token, 'new-password-1', request)).rejects.toThrow(
        PASSWORD_RESET_INVALID_MESSAGE,
      );
      expect(rateLimiting.consume).not.toHaveBeenCalled();
    });

    it('rejects a wrong verifier and keeps the password', async () => {
      await expect(
        service.confirmReset(`${selector}${'c'.repeat(64)}`, 'new-password-1', request),
      ).rejects.toThrow(PASSWORD_RESET_INVALID_MESSAGE);
      expect(users.update).not.toHaveBeenCalled();
      expect(tokens.delete).not.toHaveBeenCalled();
    });

    it('rejects an expired link', async () => {
      tokens.findOne.mockResolvedValue({ ...row(), expiresAt: new Date(Date.now() - 1) });
      await expect(service.confirmReset(token, 'new-password-1', request)).rejects.toThrow(
        PASSWORD_RESET_INVALID_MESSAGE,
      );
      expect(users.update).not.toHaveBeenCalled();
    });

    it('refuses to give a password to an account that has none', async () => {
      users.findOneBy.mockResolvedValue({ ...passwordUser, passwordHash: null });
      await expect(service.confirmReset(token, 'new-password-1', request)).rejects.toThrow(
        PASSWORD_RESET_INVALID_MESSAGE,
      );
      expect(users.update).not.toHaveBeenCalled();
    });

    it('answers 429 once the account has used its confirm budget', async () => {
      rateLimiting.consume.mockResolvedValue(false);
      await expect(service.confirmReset(token, 'new-password-1', request)).rejects.toBeInstanceOf(
        HttpException,
      );
      expect(rateLimiting.consume).toHaveBeenCalledWith(
        'password-reset-confirm:user-1',
        5,
        15 * 60_000,
      );
      expect(tokens.findOne).not.toHaveBeenCalled();
    });

    it('sets the password, spends every link, revokes sessions, audits, and emails', async () => {
      await service.confirmReset(token, 'new-password-1', request);

      expect(tokens.findOne).toHaveBeenCalledWith({
        where: { selector },
        lock: { mode: 'pessimistic_write' },
      });
      const [where, change] = users.update.mock.calls[0];
      expect(where).toEqual({ id: 'user-1' });
      await expect(bcrypt.compare('new-password-1', change.passwordHash)).resolves.toBe(true);
      expect(tokens.delete).toHaveBeenCalledWith({ userId: 'user-1' });
      expect(sessions.delete).toHaveBeenCalledWith({ userId: 'user-1' });
      expect(audit.log).toHaveBeenCalledTimes(2);
      expect(audit.log).toHaveBeenCalledWith(
        'user-1',
        'user.password_reset',
        'user',
        'user-1',
        { method: 'email_link', revokedSessions: 3 },
        request,
      );
      expect(mail.enqueueAccountEmail).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'user-1' }),
        'password-changed',
        expect.objectContaining({
          forgotPasswordUrl: 'https://weaver.example.com/forgot-password',
        }),
      );
    });

    it('still completes when one organization cannot record the audit entry', async () => {
      audit.log.mockRejectedValueOnce(new Error('schema missing')).mockResolvedValueOnce(undefined);
      await expect(service.confirmReset(token, 'new-password-1', request)).resolves.toBeUndefined();
      expect(audit.log).toHaveBeenCalledTimes(2);
      expect(mail.enqueueAccountEmail).toHaveBeenCalled();
    });
  });
});
