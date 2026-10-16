import { assertTenantSchemaName } from '@weaver/server-common';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, In, IsNull } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import {
  ImportedAudienceEntity,
  ImportedPersonEntity,
  ImportJobEntity,
  ProjectMemberEntity,
  CommentEntity,
  IssueEntity,
  AttachmentEntity,
  ImportRecordEntity,
} from '@weaver/db';
import { requireTenantContext, TenantConnectionProvider } from '../../core/tenant';
import { AuthService } from '../../core/auth/auth.service';
import { MailService } from '../mail';

export type ImportedInvitationInput = {
  personId: string;
  email: string;
  role: 'member' | 'viewer';
  projectIds: string[];
  delivery: 'email' | 'link';
};

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
function remapMentions(value: any, from: string, to: string): any {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((node) => remapMentions(node, from, to));
  return {
    ...value,
    ...(value.type === 'mention' && value.attrs?.id === from
      ? { attrs: { ...value.attrs, id: to } }
      : {}),
    ...(Array.isArray(value.content) ? { content: remapMentions(value.content, from, to) } : {}),
  };
}

@Injectable()
export class ImportPeopleService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly connections: TenantConnectionProvider,
    private readonly auth: AuthService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  async people() {
    const em = await this.connections.getEntityManager();
    const people = await em
      .getRepository(ImportedPersonEntity)
      .find({ order: { displayName: 'ASC' } });
    return people.map(({ inviteTokenHash: _secret, ...person }) => ({
      ...person,
      status: person.acceptedAt
        ? 'active'
        : person.inviteExpiresAt && person.inviteExpiresAt > new Date()
          ? 'invited'
          : 'uninvited',
    }));
  }

  async audiences() {
    return (await this.connections.getEntityManager())
      .getRepository(ImportedAudienceEntity)
      .find({ order: { name: 'ASC' } });
  }

  async reviewAttachment(id: string, audienceId: string | null) {
    const em = await this.connections.getEntityManager();
    if (await em.getRepository(ImportJobEntity).countBy({ status: In(['queued', 'running']) }))
      throw new ConflictException('Finish or cancel the import before reviewing file access');
    const repo = em.getRepository(AttachmentEntity);
    const file = await repo.findOneBy({ id });
    const record = await em
      .getRepository(ImportRecordEntity)
      .findOneBy({ localId: id, externalType: 'attachment' });
    if (!file?.sourceId || !record) throw new NotFoundException('Imported file not found');
    let visibility: AttachmentEntity['visibility'] = null;
    if (audienceId) {
      const audience = await em
        .getRepository(ImportedAudienceEntity)
        .findOneBy({ id: audienceId, sourceInstance: record.sourceInstance });
      if (!audience || !['role', 'group'].includes(audience.kind))
        throw new BadRequestException('Choose a verified source audience');
      visibility = {
        sourceInstance: record.sourceInstance,
        type: audience.kind,
        identifier: audience.identifier,
        value: audience.name,
      };
    }
    await repo.update(id, { visibility });
    return { id, visibility };
  }

  async mapAudience(id: string, userIds: string[]) {
    const { tenantId } = requireTenantContext();
    const em = await this.connections.getEntityManager();
    const repo = em.getRepository(ImportedAudienceEntity);
    const audience = await repo.findOneBy({ id });
    if (!audience) throw new NotFoundException('Imported audience not found');
    if (!['role', 'group'].includes(audience.kind))
      throw new BadRequestException(
        'Reimport to verify unknown source restrictions before granting access',
      );
    const unique = [...new Set(userIds)];
    const rows = await em.query(
      'SELECT user_id FROM public.tenant_memberships WHERE tenant_id = $1 AND user_id = ANY($2::uuid[])',
      [tenantId, unique],
    );
    if (rows.length !== unique.length)
      throw new BadRequestException(
        'Choose active organization members for the restricted audience',
      );
    audience.userIds = unique;
    return repo.save(audience);
  }

  async invite(inputs: ImportedInvitationInput[]) {
    const { tenantId } = requireTenantContext();
    const em = await this.connections.getEntityManager();
    const repo = em.getRepository(ImportedPersonEntity);
    if (await em.getRepository(ImportJobEntity).countBy({ status: In(['queued', 'running']) }))
      throw new ConflictException('Finish or cancel the running import before inviting people');
    // Validate the entire selection before creating or delivering any invitation.
    if (new Set(inputs.map((v) => v.personId)).size !== inputs.length)
      throw new BadRequestException('Duplicate imported person');
    const people = await repo.findBy({ id: In(inputs.map((v) => v.personId)) });
    for (const input of inputs) {
      const person = people.find((v) => v.id === input.personId);
      if (!person) throw new NotFoundException('Imported person not found');
      if (person.linkedUserId)
        throw new ConflictException('This imported person has already accepted an invitation');
      if (person.accountType !== 'atlassian' && person.accountType !== 'customer')
        throw new BadRequestException('System and unidentified accounts cannot be invited');
      if (
        !input.projectIds.length ||
        input.projectIds.some((id) => !person.projectIds.includes(id))
      )
        throw new BadRequestException('Choose projects associated with this imported person');
    }
    const results: Array<{ personId: string; email: string; status: string; url?: string }> = [];
    for (const input of inputs) {
      const secret = randomBytes(32).toString('hex');
      const url = `${this.config.get('WEB_APP_URL', 'http://localhost:5173').replace(/\/$/, '')}/import-invite/${tenantId}.${secret}`;
      const updated = await repo.update(
        { id: input.personId, linkedUserId: IsNull() },
        {
          inviteTokenHash: hash(secret),
          inviteEmail: input.email.trim().toLowerCase(),
          inviteRole: input.role,
          inviteProjectIds: [...new Set(input.projectIds)],
          invitedAt: new Date(),
          inviteExpiresAt: new Date(Date.now() + 7 * 86400_000),
        },
      );
      if (!updated.affected)
        throw new ConflictException('This imported person has already accepted an invitation');
      if (input.delivery === 'email') {
        try {
          await this.mail.sendInvitation(tenantId, input.email, url);
          results.push({ personId: input.personId, email: input.email, status: 'sent' });
        } catch {
          // An undelivered bearer token must not remain usable.
          await repo.update(
            { id: input.personId, inviteTokenHash: hash(secret) },
            { inviteTokenHash: null, inviteExpiresAt: null },
          );
          results.push({ personId: input.personId, email: input.email, status: 'delivery_failed' });
        }
      } else
        results.push({ personId: input.personId, email: input.email, status: 'link_created', url });
    }
    return results;
  }

  async revoke(id: string): Promise<void> {
    const em = await this.connections.getEntityManager();
    await em
      .getRepository(ImportedPersonEntity)
      .update(id, { inviteTokenHash: null, inviteExpiresAt: null });
  }

  private async locate(token: string) {
    const match = token.match(
      /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([0-9a-f]{64})$/,
    );
    if (!match) throw new UnauthorizedException('Invalid invitation');
    const [tenant] = await this.dataSource.query(
      'SELECT id, name, schema_name FROM public.tenants WHERE id = $1',
      [match[1]],
    );
    if (!tenant) throw new UnauthorizedException('Invalid invitation');
    assertTenantSchemaName(tenant.schema_name);
    const ds = await this.connections.getConnection(tenant.schema_name);
    return { tenant, ds, tokenHash: hash(match[2]) };
  }

  async preview(token: string) {
    const { tenant, ds, tokenHash } = await this.locate(token);
    const person = await ds
      .getRepository(ImportedPersonEntity)
      .findOneBy({ inviteTokenHash: tokenHash });
    if (
      !person ||
      person.linkedUserId ||
      !person.inviteExpiresAt ||
      person.inviteExpiresAt <= new Date()
    )
      throw new UnauthorizedException('Invalid or expired invitation');
    return {
      organizationName: tenant.name,
      email: person.inviteEmail,
      displayName: person.displayName,
    };
  }

  async accept(
    token: string,
    input: { displayName?: string; password?: string },
    authenticatedUserId?: string,
  ) {
    const { tenant, ds, tokenHash } = await this.locate(token);
    const userId = await ds.transaction(async (em) => {
      const repo = em.getRepository(ImportedPersonEntity);
      const person = await repo
        .createQueryBuilder('person')
        .addSelect('person.inviteTokenHash')
        .where('person.invite_token_hash = :tokenHash', { tokenHash })
        .setLock('pessimistic_write')
        .getOne();
      if (
        !person ||
        person.linkedUserId ||
        !person.inviteExpiresAt ||
        person.inviteExpiresAt <= new Date() ||
        !person.inviteEmail
      )
        throw new UnauthorizedException('Invalid or expired invitation');
      await em.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `registration-email:${person.inviteEmail}`,
      ]);
      let [user] = await em.query(
        'SELECT id, email, password_hash FROM public.users WHERE lower(email) = $1',
        [person.inviteEmail],
      );
      if (user) {
        if (
          authenticatedUserId !== user.id &&
          (!input.password ||
            !user.password_hash ||
            !(await bcrypt.compare(input.password, user.password_hash)))
        )
          throw new UnauthorizedException(
            'Sign in with the invited account or enter its current password',
          );
      } else {
        if (authenticatedUserId)
          throw new UnauthorizedException('The signed-in account does not match this invitation');
        if (!input.password || input.password.length < 10)
          throw new BadRequestException('Choose a password with at least 10 characters');
        [user] = await em.query(
          `INSERT INTO public.users(email, display_name, password_hash, auth_provider, auth_providers) VALUES ($1, $2, $3, 'local', 'local') RETURNING id`,
          [
            person.inviteEmail,
            (input.displayName || person.displayName).slice(0, 255),
            await bcrypt.hash(input.password, 10),
          ],
        );
      }
      await em.query(
        `INSERT INTO public.tenant_memberships(tenant_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [tenant.id, user.id, person.inviteRole],
      );
      for (const projectId of person.inviteProjectIds) {
        const r = em.getRepository(ProjectMemberEntity);
        if (!(await r.findOneBy({ projectId, userId: user.id })))
          await r.save(r.create({ projectId, userId: user.id, role: person.inviteRole }));
      }
      // Attribution remains the same person; only the local principal changes.
      const schema = `"${tenant.schema_name}"`;
      for (const [table, column] of [
        ['projects', 'lead_user_id'],
        ['issues', 'reporter_id'],
        ['issues', 'assignee_id'],
        ['comments', 'author_id'],
        ['attachments', 'uploader_id'],
        ['time_entries', 'user_id'],
        ['activity_logs', 'user_id'],
      ]) {
        await em.query(`UPDATE ${schema}."${table}" SET "${column}" = $1 WHERE "${column}" = $2`, [
          user.id,
          person.id,
        ]);
      }
      for (const [entity, column] of [
        [CommentEntity, 'body'],
        [IssueEntity, 'description'],
      ] as const) {
        const rows = await em
          .getRepository(entity)
          .createQueryBuilder('item')
          .where(`item.${column}::text LIKE :match`, { match: `%${person.id}%` })
          .getMany();
        for (const row of rows)
          await em.getRepository(entity).update(row.id, {
            [column]: remapMentions((row as any)[column], person.id, user.id),
            updatedAt: row.updatedAt,
          });
      }
      person.linkedUserId = user.id;
      person.acceptedAt = new Date();
      person.inviteTokenHash = null;
      person.inviteExpiresAt = null;
      await repo.save(person);
      return user.id;
    });
    return this.auth.createSessionForUser(userId, tenant.id);
  }
}
