import type { UserEntity } from '@weaver/db';
import type { Repository } from 'typeorm';

export interface UserRowHold {
  /** Resolves once the held call has reached the row. */
  reached: Promise<void>;
  release(): void;
  restore(): void;
}

/**
 * Pauses the first call through `repo` that touches the user's row: just after findOneBy
 * reads it, or just before update() or an UPDATE query writes it. Later calls pass straight
 * through, so another request can change the row while the first one waits.
 */
export function holdFirstTouch(repo: Repository<UserEntity>, userId: string): UserRowHold {
  let held = false;
  let markReached!: () => void;
  const reached = new Promise<void>((resolve) => (markReached = resolve));
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  const pause = async () => {
    if (held) return;
    held = true;
    markReached();
    await released;
  };

  const findOneBy = repo.findOneBy.bind(repo);
  const update = repo.update.bind(repo);
  const query = repo.query.bind(repo);
  const spies = [
    jest.spyOn(repo, 'findOneBy').mockImplementation(async (where) => {
      const user = await findOneBy(where);
      if (user?.id === userId) await pause();
      return user;
    }),
    jest.spyOn(repo, 'update').mockImplementation(async (criteria, changes) => {
      if ((criteria as { id?: unknown }).id === userId) await pause();
      return update(criteria, changes);
    }),
    jest.spyOn(repo, 'query').mockImplementation(async (sql: string, params?: unknown[]) => {
      if (/^\s*UPDATE public\.users\b/.test(sql) && params?.[0] === userId) await pause();
      return query(sql, params);
    }),
  ];

  return {
    reached,
    release,
    restore: () => {
      release();
      for (const spy of spies) spy.mockRestore();
    },
  };
}
