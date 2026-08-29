import { useState, useRef, useEffect } from 'react';
import { Camera } from 'lucide-react';
import {
  useProfile,
  useUpdateNotificationPreferences,
  useUpdateProfile,
  useUploadAvatar,
} from '@/api';
import { type NotificationPreferenceKey, type NotificationPreferences } from '@weaver/shared';
import { useAuthStore } from '@/stores';
import { UserAvatar } from '@/components/UserAvatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

const EMAIL_PREFERENCES: Array<{
  key: NotificationPreferenceKey;
  label: string;
  description: string;
}> = [
  {
    key: 'emailOnAssign',
    label: 'Issue assignments',
    description: 'When an issue is assigned to you.',
  },
  {
    key: 'emailOnMention',
    label: 'Mentions in comments',
    description: 'When someone mentions you in a comment.',
  },
  {
    key: 'emailOnComment',
    label: 'New comments',
    description: 'When someone comments on an issue you reported or own.',
  },
  {
    key: 'emailOnStatusChange',
    label: 'Status changes',
    description: 'When an issue you reported or own changes status.',
  },
];

const DEFAULT_EMAIL_PREFERENCES: NotificationPreferences = {
  emailOnAssign: true,
  emailOnMention: true,
  emailOnComment: true,
  emailOnStatusChange: true,
};

export function ProfilePage() {
  const { data: profile, isLoading } = useProfile();
  const updateProfile = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();
  const updateNotificationPreferences = useUpdateNotificationPreferences();
  const updateUser = useAuthStore((s) => s.updateUser);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState('');
  const [dirty, setDirty] = useState(false);
  const [notificationPreferences, setNotificationPreferences] =
    useState<NotificationPreferences>(DEFAULT_EMAIL_PREFERENCES);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName || '');
      setNotificationPreferences({
        ...DEFAULT_EMAIL_PREFERENCES,
        ...(profile.notificationPreferences ?? {}),
      });
    }
  }, [profile]);

  const handleSave = async () => {
    if (!dirty) return;
    const updated = await updateProfile.mutateAsync({ displayName });
    updateUser({ displayName: updated.displayName, avatarUrl: updated.avatarUrl });
    setDirty(false);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const updated = await uploadAvatar.mutateAsync(file);
    updateUser({ displayName: updated.displayName, avatarUrl: updated.avatarUrl });
  };

  const handlePreferenceChange = async (key: NotificationPreferenceKey, checked: boolean) => {
    const previous = notificationPreferences[key];
    setNotificationPreferences((current) => ({
      ...current,
      [key]: checked,
    }));
    try {
      await updateNotificationPreferences.mutateAsync({ [key]: checked });
    } catch {
      setNotificationPreferences((current) => ({
        ...current,
        [key]: previous,
      }));
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-8 py-8">
      <h1 className="text-2xl font-bold">Profile</h1>

      <div className="flex flex-col items-center gap-4">
        <div className="group relative">
          <UserAvatar user={profile} size="lg" />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100"
          >
            <Camera className="h-6 w-6 text-white" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarUpload}
          />
        </div>
        {uploadAvatar.isPending && <p className="text-sm text-muted-foreground">Uploading...</p>}
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="displayName">Display name</Label>
          <Input
            id="displayName"
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              setDirty(true);
            }}
            placeholder="Your display name"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" value={profile?.email || ''} readOnly className="bg-muted" />
        </div>

        <Button onClick={handleSave} disabled={!dirty || updateProfile.isPending}>
          {updateProfile.isPending ? 'Saving...' : 'Save'}
        </Button>
      </div>

      <section
        aria-labelledby="email-notifications-heading"
        className="space-y-4 border-t border-border pt-8"
      >
        <div>
          <h2 id="email-notifications-heading" className="text-lg font-semibold">
            Email notifications
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose which activity reaches your inbox.
          </p>
        </div>

        <div className="divide-y divide-border border border-border">
          {EMAIL_PREFERENCES.map((preference) => (
            <div key={preference.key} className="flex items-center justify-between gap-6 p-4">
              <div>
                <Label htmlFor={preference.key}>{preference.label}</Label>
                <p className="mt-1 text-sm text-muted-foreground">{preference.description}</p>
              </div>
              <Switch
                id={preference.key}
                aria-label={preference.label}
                checked={notificationPreferences[preference.key]}
                disabled={updateNotificationPreferences.isPending}
                onCheckedChange={(checked) => handlePreferenceChange(preference.key, checked)}
              />
            </div>
          ))}
        </div>
        {updateNotificationPreferences.isError && (
          <p className="text-sm text-destructive">
            Could not save your email preference. Please try again.
          </p>
        )}
      </section>
    </div>
  );
}
