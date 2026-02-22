import { useState, type FormEvent } from 'react';
import {
  useRoles,
  useCreateRole,
  useDeleteRole,
  useUpdateRole,
  usePluginPermissions,
} from '@/api';
import type { PluginPermissionsMap } from '@/api';
import { Plus, Trash2, Shield, Pencil, Puzzle } from 'lucide-react';

const PERMISSION_GROUPS: Record<string, string[]> = {
  Projects: ['projects.create', 'projects.read', 'projects.update', 'projects.delete'],
  Issues: ['issues.create', 'issues.read', 'issues.update', 'issues.delete', 'issues.transition', 'issues.assign'],
  Workflows: ['workflows.create', 'workflows.read', 'workflows.update', 'workflows.delete'],
  Comments: ['comments.create', 'comments.read', 'comments.update', 'comments.delete'],
  Sprints: ['sprints.create', 'sprints.read', 'sprints.update', 'sprints.delete', 'sprints.manage'],
  'Custom Fields': ['custom_fields.create', 'custom_fields.read', 'custom_fields.update', 'custom_fields.delete'],
  Admin: ['admin.manage_users', 'admin.manage_roles', 'admin.manage_plugins'],
};

export function RolesPage() {
  const { data: roles, isLoading } = useRoles();
  const createRole = useCreateRole();
  const deleteRole = useDeleteRole();
  const updateRole = useUpdateRole();
  const { data: pluginPermissions } = usePluginPermissions();

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editIsSystem, setEditIsSystem] = useState(false);
  const [name, setName] = useState('');
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});

  const resetForm = () => {
    setName('');
    setPermissions({});
    setEditId(null);
    setEditIsSystem(false);
    setShowForm(false);
  };

  const togglePermission = (perm: string) => {
    setPermissions((prev) => ({ ...prev, [perm]: !prev[perm] }));
  };

  const handleEdit = (role: any) => {
    setEditId(role.id);
    setEditIsSystem(role.isSystem);
    setName(role.name);
    const perms: Record<string, boolean> = {};
    if (role.permissions) {
      for (const [key, val] of Object.entries(role.permissions)) {
        if (val === true) perms[key] = true;
      }
    }
    setPermissions(perms);
    setShowForm(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const filteredPerms: Record<string, boolean> = {};
    for (const [key, val] of Object.entries(permissions)) {
      if (val) filteredPerms[key] = true;
    }

    if (editId) {
      const data: any = { id: editId, permissions: filteredPerms };
      if (!editIsSystem) data.name = name;
      await updateRole.mutateAsync(data);
    } else {
      await createRole.mutateAsync({ name, permissions: filteredPerms });
    }
    resetForm();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this role?')) return;
    await deleteRole.mutateAsync(id);
  };

  // Build plugin permission groups
  const pluginGroups: Record<string, string[]> = {};
  const pluginGroupNames: Record<string, string> = {};
  if (pluginPermissions) {
    for (const [pluginId, info] of Object.entries(pluginPermissions as PluginPermissionsMap)) {
      const groupKey = `plugin:${pluginId}`;
      pluginGroupNames[groupKey] = info.pluginName;
      pluginGroups[groupKey] = info.permissions.map((p) => p.key);
    }
  }

  if (isLoading) {
    return <div className="flex items-center justify-center py-12 text-gray-500">Loading...</div>;
  }

  const allGroups = { ...PERMISSION_GROUPS, ...pluginGroups };

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Roles & Permissions</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage roles and their associated permissions.
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          New Role
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-medium text-gray-900">
            {editId ? (editIsSystem ? 'Edit System Role Permissions' : 'Edit Role') : 'Create Role'}
          </h3>
          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-gray-700">Role Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={editIsSystem}
              placeholder="e.g., Project Lead"
              className="block w-full max-w-sm rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-500"
            />
            {editIsSystem && (
              <p className="mt-1 text-xs text-gray-500">System role names cannot be changed.</p>
            )}
          </div>

          {name === 'admin' && editIsSystem ? (
            <div className="mb-4 rounded-md bg-indigo-50 p-3">
              <p className="text-sm text-indigo-700">
                The admin role has full access (wildcard permission). All permission checks are bypassed.
              </p>
            </div>
          ) : (
            <div className="mb-4">
              <h3 className="mb-2 text-sm font-medium text-gray-700">Permissions</h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(allGroups).map(([group, perms]) => {
                  const isPlugin = group.startsWith('plugin:');
                  const displayName = isPlugin ? pluginGroupNames[group] : group;
                  return (
                    <div key={group} className="rounded-md border border-gray-200 p-3">
                      <div className="mb-2 flex items-center gap-1.5">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                          {displayName}
                        </h4>
                        {isPlugin && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700">
                            <Puzzle className="h-2.5 w-2.5" />
                            Plugin
                          </span>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        {perms.map((perm) => (
                          <label key={perm} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={permissions[perm] || false}
                              onChange={() => togglePermission(perm)}
                              className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600"
                            />
                            <span className="text-xs text-gray-600">
                              {perm.includes('.') ? perm.split('.').pop() : perm}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={createRole.isPending || updateRole.isPending}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {editId ? 'Save Changes' : 'Create Role'}
            </button>
            <button type="button" onClick={resetForm} className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200">
              Cancel
            </button>
          </div>
        </form>
      )}

      {!roles || roles.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white py-12 text-center">
          <Shield className="mx-auto h-10 w-10 text-gray-400" />
          <p className="mt-2 text-sm font-medium text-gray-900">No roles</p>
          <p className="mt-1 text-sm text-gray-500">Create your first custom role.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {roles.map((role: any) => (
            <div key={role.id} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium text-gray-900">{role.name}</h3>
                  {role.isSystem && (
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                      System
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleEdit(role)}
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    title="Edit role"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  {!role.isSystem && (
                    <button
                      onClick={() => handleDelete(role.id)}
                      className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                      title="Delete role"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
              {role.permissions && Object.keys(role.permissions).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {Object.entries(role.permissions)
                    .filter(([, v]) => v)
                    .map(([perm]) => (
                      <span key={perm} className="inline-flex items-center rounded bg-indigo-50 px-1.5 py-0.5 text-xs text-indigo-700">
                        {perm}
                      </span>
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
