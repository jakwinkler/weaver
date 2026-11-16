import { IssueAccessPolicyEntity, type IssueEntity, type ProjectEntity } from '@weaver/db';
import type { EntityManager } from 'typeorm';
import type { JiraIssue } from './types';

export function issueSecurityEnabled() {
  return process.env.JIRA_IMPORT_ISSUE_SECURITY_ENABLED === 'true';
}

export async function importedIssueAccess(
  manager: EntityManager,
  source: string,
  sourceProjectId: string,
  project: ProjectEntity,
  jira: JiraIssue,
  existing: IssueEntity | null,
): Promise<Pick<IssueEntity, 'accessState' | 'accessPolicyId' | 'sourceSecurity'>> {
  const security = jira.fields.security;
  const verified =
    Object.hasOwn(jira.fields, 'security') &&
    (security === null || (typeof security?.id === 'string' && !!security.id));
  const levelId = verified && security ? String(security.id) : null;
  let policyId: string | null = null;
  if (levelId) {
    const repo = manager.getRepository(IssueAccessPolicyEntity);
    let policy = await repo.findOneBy({
      sourceInstance: source,
      sourceProjectId,
      securityLevelId: levelId,
    });
    if (!policy)
      policy = await repo.save(
        repo.create({
          sourceInstance: source,
          sourceProjectId,
          securityLevelId: levelId,
          projectId: project.id,
          name: security.name || levelId,
          userIds: [],
          reviewed: false,
        }),
      );
    else if (security.name && security.name !== policy.name)
      await repo.update(policy.id, { name: security.name });
    policyId = policy.id;
  }
  const changed = existing?.sourceSecurity?.verified && existing.sourceSecurity.levelId !== levelId;
  // A previously quarantined restriction transition needs explicit review even after another pass.
  const pending = existing?.accessState === 'quarantined' && existing.sourceSecurity?.verified;
  return {
    accessState:
      !verified || changed || pending ? 'quarantined' : levelId ? 'restricted' : 'unrestricted',
    accessPolicyId: policyId,
    sourceSecurity: { verified, levelId },
  };
}
