import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import {
  PasswordResetTokenEntity,
  RefreshSessionEntity,
  TenantMembershipEntity,
  UserEntity,
} from '@weaver/db';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import type { Request } from 'express';
import { LessThan, Raw, Repository } from 'typeorm';
import { AuditService } from '../../modules/audit/audit.service';
import { MailService } from '../../modules/mail/mail.service';
import { RateLimitingGuard } from '../rate-limiting/rate-limiting.guard';
import { tenantStorage } from '../tenant/tenant.context';
import { BCRYPT_ROUNDS } from './auth.service';

export const PASSWORD_RESET_TOKEN_LIFETIME_MS = 30 * 60 * 1000;
/** Per client address and per email address, enforced by the global rate-limit guard. */
export const PASSWORD_RESET_REQUESTS_PER_WINDOW = 5;
export const PASSWORD_RESET_CONFIRMS_PER_WINDOW = 10;
export const PASSWORD_RESET_RATE_WINDOW_MS = 15 * 60 * 1000;
/** Confirm attempts against one account, counted once a link's selector names that account. */
export const PASSWORD_RESET_CONFIRMS_PER_ACCOUNT = 5;

export const PASSWORD_RESET_REQUESTED_MESSAGE =
  'If an account uses that email address, we sent it a link to reset the password.';
export const PASSWORD_RESET_INVALID_MESSAGE =
  'This reset link is invalid or has expired. Request a new one.';

const SELECTOR_LENGTH = 32;
const TOKEN_PATTERN = /^[a-f0-9]{96}$/;

interface IssuedToken {
  token: string;
  selector: string;
  verifierHash: string;
}

@Injectable()
export class PasswordResetService implements OnModuleDestroy {
  private readonly logger = new Logger(PasswordResetService.name);
  private readonly pending = new Set<Promise<void>>();

  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(PasswordResetTokenEntity)
    private readonly tokens: Repository<PasswordResetTokenEntity>,
    @InjectRepository(TenantMembershipEntity)
    private readonly memberships: Repository<TenantMembershipEntity>,
    private readonly mail: MailService,
    private readonly rateLimiting: RateLimitingGuard,
    // AuditModule's controller imports the auth barrel, so AuthModule cannot import that
    // module without a load-order cycle. Resolve the service from the application instead.
    private readonly moduleRef: ModuleRef,
  ) {}

  /**
   * Returns before looking the address up. The account lookup, token, and email happen
   * afterwards, so the reply and its timing are the same whether or not the account exists.
   */
  requestReset(email: string): void {
    const work = this.processRequest(email)
      .catch((error: unknown) => {
        this.logger.error(`Password reset request failed: ${this.errorMessage(error)}`);
      })
      .finally(() => this.pending.delete(work));
    this.pending.add(work);
  }

  async confirmReset(token: string, password: string, request: Request): Promise<void> {
    if (!TOKEN_PATTERN.test(token)) {
      throw new BadRequestException(PASSWORD_RESET_INVALID_MESSAGE);
    }
    const selector = token.slice(0, SELECTOR_LENGTH);
    const verifier = token.slice(SELECTOR_LENGTH);

    const candidate = await this.tokens.findOneBy({ selector });
    if (!candidate) {
      throw new BadRequestException(PASSWORD_RESET_INVALID_MESSAGE);
    }
    const withinBudget = await this.rateLimiting.consume(
      `password-reset-confirm:${candidate.userId}`,
      PASSWORD_RESET_CONFIRMS_PER_ACCOUNT,
      PASSWORD_RESET_RATE_WINDOW_MS,
    );
    if (!withinBudget) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many attempts. Try again later.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const { user, revokedSessions } = await this.tokens.manager.transaction(async (manager) => {
      const tokenRepo = manager.getRepository(PasswordResetTokenEntity);
      const row = await tokenRepo.findOne({
        where: { selector },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !row ||
        !this.verifierMatches(verifier, row.verifierHash) ||
        row.expiresAt.getTime() <= Date.now()
      ) {
        throw new BadRequestException(PASSWORD_RESET_INVALID_MESSAGE);
      }

      const userRepo = manager.getRepository(UserEntity);
      const account = await userRepo.findOneBy({ id: row.userId });
      // Links are only issued to accounts with a password; never add one to an SSO-only account.
      if (!account?.passwordHash) {
        throw new BadRequestException(PASSWORD_RESET_INVALID_MESSAGE);
      }

      await userRepo.update(
        { id: account.id },
        { passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS) },
      );
      // Single use: this link and any other outstanding link for the account stop working.
      await tokenRepo.delete({ userId: account.id });
      const revoked = await manager
        .getRepository(RefreshSessionEntity)
        .delete({ userId: account.id });
      return { user: account, revokedSessions: revoked.affected ?? 0 };
    });

    this.logger.log(`Password reset completed for user ${user.id}`);
    await this.recordAudit(user.id, revokedSessions, request);
    await this.mail.enqueueAccountEmail(user, 'password-changed', {
      changedAt: new Date().toUTCString(),
      forgotPasswordUrl: this.mail.webUrl('/forgot-password'),
    });
  }

  /** Waits for reset requests still being processed. Tests and shutdown use it. */
  async settle(): Promise<void> {
    await Promise.all([...this.pending]);
  }

  async onModuleDestroy(): Promise<void> {
    await this.settle();
  }

  private async processRequest(email: string): Promise<void> {
    const user = await this.findUserByEmail(email);
    if (!user) {
      return;
    }

    if (!user.passwordHash) {
      await this.mail.enqueueAccountEmail(user, 'password-reset-unavailable', {
        providers: this.describeSignInMethods(user),
        loginUrl: this.mail.webUrl('/login'),
      });
      return;
    }

    if (!this.mail.hasSystemSmtp()) {
      this.logger.warn(
        `SMTP_HOST and SMTP_FROM are not set, so no password reset link was created for user ${user.id}`,
      );
      return;
    }

    const issued = this.issueToken();
    await this.tokens.manager.transaction(async (manager) => {
      // Serialize requests for one account so only the newest link survives.
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `password-reset:${user.id}`,
      ]);
      const repo = manager.getRepository(PasswordResetTokenEntity);
      await repo.delete({ userId: user.id });
      await repo.delete({ expiresAt: LessThan(new Date()) });
      await repo.save(
        repo.create({
          userId: user.id,
          selector: issued.selector,
          verifierHash: issued.verifierHash,
          expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_LIFETIME_MS),
        }),
      );
    });

    const queued = await this.mail.enqueueAccountEmail(user, 'password-reset', {
      resetUrl: this.mail.webUrl(`/reset-password/${issued.token}`),
      expiresInMinutes: PASSWORD_RESET_TOKEN_LIFETIME_MS / 60_000,
    });
    if (!queued) {
      await this.tokens.delete({ selector: issued.selector });
    }
  }

  private issueToken(): IssuedToken {
    const selector = randomBytes(SELECTOR_LENGTH / 2).toString('hex');
    const verifier = randomBytes(32).toString('hex');
    return { token: `${selector}${verifier}`, selector, verifierHash: this.hash(verifier) };
  }

  private verifierMatches(verifier: string, storedHash: string): boolean {
    const supplied = Buffer.from(this.hash(verifier), 'hex');
    const stored = Buffer.from(storedHash, 'hex');
    return supplied.length === stored.length && timingSafeEqual(supplied, stored);
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private describeSignInMethods(user: UserEntity): string {
    const providers = user.authProviders?.length ? user.authProviders : [user.authProvider];
    const names = [
      providers.includes('google') ? 'Google' : null,
      providers.includes('github') ? 'GitHub' : null,
    ].filter((name): name is string => name !== null);
    return names.length ? names.join(' or ') : "your organization's single sign-on";
  }

  private async recordAudit(userId: string, revokedSessions: number, request: Request) {
    const memberships = await this.memberships.find({
      where: { userId },
      relations: { tenant: true },
    });
    const audit = this.moduleRef.get(AuditService, { strict: false });
    for (const membership of memberships) {
      try {
        await tenantStorage.run(
          { tenantId: membership.tenantId, schemaName: membership.tenant.schemaName },
          () =>
            audit.log(
              userId,
              'user.password_reset',
              'user',
              userId,
              { method: 'email_link', revokedSessions },
              request,
            ),
        );
      } catch (error) {
        this.logger.warn(
          `Could not record the password reset for organization ${membership.tenantId}: ${this.errorMessage(error)}`,
        );
      }
    }
  }

  private findUserByEmail(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    return this.users.findOneBy({
      email: Raw((column) => `LOWER(${column}) = :normalizedEmail`, { normalizedEmail }),
    });
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
