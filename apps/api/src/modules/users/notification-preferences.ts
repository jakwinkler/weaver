import type { UserEntity } from '@weaver/db';
import { DEFAULT_NOTIFICATION_PREFERENCES, type NotificationPreferences } from '@weaver/shared';
import type { Repository } from 'typeorm';

/**
 * Merges `changes` into the stored preferences in one statement, so two requests that change
 * different preferences both keep their change. Returns the stored preferences, or null when
 * there is no such user.
 */
export async function mergeNotificationPreferences(
  userRepo: Repository<UserEntity>,
  userId: string,
  changes: Partial<NotificationPreferences>,
): Promise<NotificationPreferences | null> {
  const [rows] = await userRepo.query(
    `UPDATE public.users
        SET notification_preferences = $2::jsonb || COALESCE(notification_preferences, '{}'::jsonb) || $3::jsonb,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING notification_preferences`,
    [userId, JSON.stringify(DEFAULT_NOTIFICATION_PREFERENCES), JSON.stringify(changes)],
  );
  return rows[0]?.notification_preferences ?? null;
}
