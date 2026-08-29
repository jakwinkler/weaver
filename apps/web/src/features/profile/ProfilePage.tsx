import { useState, useRef, useEffect } from 'react';
import { Camera } from 'lucide-react';
import { useProfile, useUpdateProfile, useUploadAvatar } from '@/api';
import { useAuthStore } from '@/stores';
import { UserAvatar } from '@/components/UserAvatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ApiKeysTab } from './ApiKeysTab';

export function ProfilePage() {
  const { data: profile, isLoading } = useProfile();
  const updateProfile = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();
  const updateUser = useAuthStore((s) => s.updateUser);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName || '');
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 py-8">
      <h1 className="text-2xl font-bold">Profile</h1>

      <Tabs defaultValue="account" className="space-y-6">
        <TabsList>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="api-keys">API Keys</TabsTrigger>
        </TabsList>

        <TabsContent value="account" className="max-w-lg space-y-8">
          <div className="flex flex-col items-center gap-4">
            <div className="group relative">
              <UserAvatar user={profile} size="lg" />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-label="Upload profile picture"
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
            {uploadAvatar.isPending ? (
              <p className="text-sm text-muted-foreground">Uploading...</p>
            ) : null}
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
        </TabsContent>

        <TabsContent value="api-keys">
          <ApiKeysTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
