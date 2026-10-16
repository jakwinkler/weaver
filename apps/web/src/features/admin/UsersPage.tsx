import { useState, type FormEvent } from 'react';
import { useUsers, useUpdateUserRole, useCreateInvitation, usePendingInvitations, useRevokeInvitation } from '@/api';
import { useAuthStore } from '@/stores';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { Users } from 'lucide-react';

const ROLES = ['owner', 'admin', 'member', 'viewer'];

export function UsersPage() {
  const { data: users, isLoading } = useUsers();
  const updateRole = useUpdateUserRole();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const createInvitation = useCreateInvitation();
  const { data: pendingInvitations, isLoading: invitationsLoading } = usePendingInvitations();
  const revokeInvitation = useRevokeInvitation();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'member' | 'viewer'>('member');
  const [invitationLink, setInvitationLink] = useState('');
  const [invitationId, setInvitationId] = useState('');

  const invite = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const invitation = await createInvitation.mutateAsync({ email: inviteEmail, role: inviteRole });
      setInvitationLink(`${window.location.origin}/invite/${invitation.token}`);
      setInvitationId(invitation.id);
    } catch {
      setInvitationLink('');
      setInvitationId('');
    }
  };

  const handleRevoke = async (id: string, email: string) => {
    if (!confirm(`Revoke the invitation for ${email}? Its link will stop working.`)) return;
    try {
      await revokeInvitation.mutateAsync(id);
      if (id === invitationId) {
        setInvitationLink('');
        setInvitationId('');
      }
    } catch {
      // The mutation error state shows the failure below the list.
    }
  };

  const handleRoleChange = async (userId: string, role: string) => {
    await updateRole.mutateAsync({ userId, role });
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground">Loading...</div>;
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Users</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage team members and their roles.
        </p>
      </div>

      <form onSubmit={invite} className="mb-6 space-y-3 rounded-lg border border-border bg-card p-4">
        <h2 className="text-lg font-semibold text-foreground">Invite a teammate</h2>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="inviteEmail">Email address</Label>
            <Input id="inviteEmail" type="email" required value={inviteEmail} onChange={(event) => { setInviteEmail(event.target.value); setInvitationLink(''); }} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="inviteRole">Role</Label>
            <select id="inviteRole" value={inviteRole} onChange={(event) => { setInviteRole(event.target.value as 'member' | 'viewer'); setInvitationLink(''); }}
              className="flex h-10 rounded-md border border-input bg-background px-3 text-sm">
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          <Button type="submit" disabled={createInvitation.isPending}>Create invitation</Button>
        </div>
        {createInvitation.isError && <p role="alert" className="text-sm text-destructive">Could not create invitation.</p>}
        {invitationLink && (
          <div className="space-y-2">
            <Label htmlFor="invitationLink">Invitation link</Label>
            <Input id="invitationLink" readOnly value={invitationLink} onFocus={(event) => event.target.select()} />
            <p className="text-xs text-muted-foreground">Anyone who has this link can join as that person until it is used, revoked, or expires in 7 days, so send it privately.</p>
          </div>
        )}
      </form>

      <section aria-labelledby="pendingInvitationsHeading" className="mb-6 space-y-3 rounded-lg border border-border bg-card p-4">
        <h2 id="pendingInvitationsHeading" className="text-lg font-semibold text-foreground">Pending invitations</h2>
        {invitationsLoading ? (
          <p className="text-sm text-muted-foreground">Loading invitations...</p>
        ) : !pendingInvitations || pendingInvitations.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending invitations.</p>
        ) : (
          <Table aria-labelledby="pendingInvitationsHeading">
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-muted/50">
                <TableHead className="text-xs font-medium uppercase tracking-wider">Email</TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wider">Role</TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wider">Expires</TableHead>
                <TableHead className="text-right text-xs font-medium uppercase tracking-wider">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingInvitations.map((invitation) => (
                <TableRow key={invitation.id}>
                  <TableCell className="text-sm text-foreground">{invitation.email}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{invitation.role}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(invitation.expiresAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={revokeInvitation.isPending}
                      aria-label={`Revoke invitation for ${invitation.email}`}
                      onClick={() => handleRevoke(invitation.id, invitation.email)}
                    >
                      Revoke
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {revokeInvitation.isError && <p role="alert" className="text-sm text-destructive">Could not revoke invitation.</p>}
      </section>

      {!users || users.length === 0 ? (
        <div className="rounded-lg border border-border bg-card py-12 text-center">
          <Users className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium text-foreground">No users</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-muted/50">
                <TableHead className="text-xs font-medium uppercase tracking-wider">User</TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wider">Email</TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wider">Role</TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wider">Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8 text-xs">
                        <AvatarFallback className="bg-primary/10 text-primary font-medium text-xs">
                          {(user.displayName || user.email).slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium text-foreground">
                        {user.displayName || '—'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{user.email}</TableCell>
                  <TableCell>
                    {user.id === currentUserId ? (
                      <Badge variant="secondary">
                        {user.role} (you)
                      </Badge>
                    ) : (
                      <select
                        value={user.role}
                        onChange={(e) => handleRoleChange(user.id, e.target.value)}
                        disabled={updateRole.isPending}
                        className={cn(
                          'rounded-md border border-input bg-background px-2 py-1 text-xs',
                          'focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring',
                          'disabled:cursor-not-allowed disabled:opacity-50'
                        )}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
