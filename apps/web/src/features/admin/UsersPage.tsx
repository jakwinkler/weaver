import { useUsers, useUpdateUserRole } from '@/api';
import { useAuthStore } from '@/stores';
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
    return <div className="flex items-center justify-center py-12 text-gray-500">Loading...</div>;
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Users</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage team members and their roles.
        </p>
      </div>

      {!users || users.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white py-12 text-center">
          <Users className="mx-auto h-10 w-10 text-gray-400" />
          <p className="mt-2 text-sm font-medium text-gray-900">No users</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">User</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Role</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-medium text-indigo-600">
                        {(user.displayName || user.email).slice(0, 2).toUpperCase()}
                      </div>
                      <span className="text-sm font-medium text-gray-900">
                        {user.displayName || '—'}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{user.email}</td>
                  <td className="px-4 py-3">
                    {user.id === currentUserId ? (
                      <span className="inline-flex items-center rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-800">
                        {user.role} (you)
                      </span>
                    ) : (
                      <select
                        value={user.role}
                        onChange={(e) => handleRoleChange(user.id, e.target.value)}
                        disabled={updateRole.isPending}
                        className="rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
