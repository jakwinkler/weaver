import { useUsers, useUpdateUserRole } from '@/api';
import { useAuthStore } from '@/stores';
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
