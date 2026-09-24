type RecordValue = Record<string, any>;
const object = (value: unknown): value is RecordValue =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, limit = 65_536): boolean =>
  typeof value === 'string' && value.length <= limit;
const optionalText = (value: unknown, limit = 255): boolean => value == null || text(value, limit);
const url = (value: unknown): boolean => {
  if (!text(value, 2048)) return false;
  try {
    return ['https:', 'http:'].includes(new URL(value as string).protocol);
  } catch {
    return false;
  }
};
const array = (value: unknown, check: (item: RecordValue) => boolean): boolean =>
  Array.isArray(value) &&
  value.length <= 2048 &&
  value.every((item) => object(item) && check(item));
const optionalObject = (value: unknown, check: (item: RecordValue) => boolean): boolean =>
  value == null || (object(value) && check(value));

/** Validate the fields consumed by bundled SCM handlers; ignore bounded provider extensions. */
export function validScmWebhook(
  provider: 'github' | 'gitlab' | 'bitbucket',
  event: string,
  body: unknown,
): body is RecordValue {
  if (!object(body)) return false;
  const pending = [{ value: body as unknown, depth: 0 }];
  let nodes = 0;
  while (pending.length) {
    const { value, depth } = pending.pop()!;
    if (++nodes > 20_000 || depth > 16) return false;
    if (typeof value === 'string' && value.length > 65_536) return false;
    if (value && typeof value === 'object') {
      const children = Object.values(value);
      if (children.length + pending.length + nodes > 20_000) return false;
      for (const child of children) pending.push({ value: child, depth: depth + 1 });
    }
  }
  if (!optionalObject(body.repository, (repository) => optionalText(repository.full_name, 500)))
    return false;
  if (provider === 'github' || provider === 'gitlab') {
    if (event === 'push' || event === 'Push Hook') {
      return (
        optionalText(body.ref, 1024) &&
        optionalObject(body.project, (project) => optionalText(project.path_with_namespace, 500)) &&
        array(
          body.commits,
          (commit) =>
            text(commit.message) &&
            url(commit.url) &&
            optionalObject(commit.author, (author) => optionalText(author.name)),
        )
      );
    }
    if (provider === 'github' && event === 'pull_request') {
      const pr = body.pull_request;
      return (
        text(body.action, 64) &&
        object(pr) &&
        text(pr.title, 4096) &&
        optionalText(pr.body, 65_536) &&
        url(pr.html_url) &&
        Number.isSafeInteger(pr.number) &&
        ['open', 'closed'].includes(pr.state) &&
        (pr.merged === undefined || typeof pr.merged === 'boolean') &&
        optionalObject(pr.user, (user) => optionalText(user.login))
      );
    }
    if (provider === 'gitlab' && event === 'Merge Request Hook') {
      const attrs = body.object_attributes;
      return (
        object(attrs) &&
        text(attrs.title, 4096) &&
        optionalText(attrs.description, 65_536) &&
        url(attrs.url) &&
        Number.isSafeInteger(attrs.iid) &&
        text(attrs.action, 64) &&
        text(attrs.state, 64) &&
        optionalObject(body.user, (user) => optionalText(user.username)) &&
        optionalObject(body.project, (project) => optionalText(project.path_with_namespace, 500))
      );
    }
  }
  if (provider === 'bitbucket') {
    if (event === 'repo:push')
      return (
        object(body.push) &&
        array(body.push.changes, (change) =>
          array(
            change.commits ?? [],
            (commit) =>
              text(commit.message) &&
              object(commit.links) &&
              object(commit.links.html) &&
              url(commit.links.html.href) &&
              optionalObject(
                commit.author,
                (author) =>
                  optionalText(author.raw) &&
                  optionalObject(author.user, (user) => optionalText(user.display_name)),
              ),
          ),
        )
      );
    if (['pullrequest:created', 'pullrequest:updated', 'pullrequest:fulfilled'].includes(event)) {
      const pr = body.pullrequest;
      return (
        object(pr) &&
        text(pr.title, 4096) &&
        optionalText(pr.description, 65_536) &&
        Number.isSafeInteger(pr.id) &&
        text(pr.state, 64) &&
        (event !== 'pullrequest:fulfilled' || pr.state === 'MERGED') &&
        object(pr.links) &&
        object(pr.links.html) &&
        url(pr.links.html.href) &&
        optionalObject(pr.author, (author) => optionalText(author.display_name))
      );
    }
  }
  return true; // Authenticated, unsupported event types are acknowledged without processing.
}
