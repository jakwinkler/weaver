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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';

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
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        Loading...
      </div>
    );
  }

  const allGroups = { ...PERMISSION_GROUPS, ...pluginGroups };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Roles & Permissions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage roles and their associated permissions.
          </p>
        </div>
        <Button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          New Role
        </Button>
      </div>

      {showForm && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-foreground">
              {editId ? (editIsSystem ? 'Edit System Role Permissions' : 'Edit Role') : 'Create Role'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <Label htmlFor="role-name" className="mb-1.5 block">
                  Role Name
                </Label>
                <Input
                  id="role-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  disabled={editIsSystem}
                  placeholder="e.g., Project Lead"
                  className="max-w-sm"
                />
                {editIsSystem && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    System role names cannot be changed.
                  </p>
                )}
              </div>

              {name === 'admin' && editIsSystem ? (
                <div className="mb-4 rounded-md bg-primary/10 p-3">
                  <p className="text-sm text-primary">
                    The admin role has full access (wildcard permission). All permission checks are bypassed.
                  </p>
                </div>
              ) : (
                <div className="mb-4">
                  <h3 className="mb-2 text-sm font-medium text-foreground">Permissions</h3>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {Object.entries(allGroups).map(([group, perms]) => {
                      const isPlugin = group.startsWith('plugin:');
                      const displayName = isPlugin ? pluginGroupNames[group] : group;
                      return (
                        <div
                          key={group}
                          className="rounded-md border border-border bg-muted/50 p-3"
                        >
                          <div className="mb-2 flex items-center gap-1.5">
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              {displayName}
                            </h4>
                            {isPlugin && (
                              <Badge
                                variant="secondary"
                                className="gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium"
                              >
                                <Puzzle className="h-2.5 w-2.5" />
                                Plugin
                              </Badge>
                            )}
                          </div>
                          <div className="space-y-1.5">
                            {perms.map((perm) => (
                              <div key={perm} className="flex items-center gap-2">
                                <Checkbox
                                  id={`perm-${perm}`}
                                  checked={permissions[perm] || false}
                                  onCheckedChange={() => togglePermission(perm)}
                                  className="h-3.5 w-3.5"
                                />
                                <Label
                                  htmlFor={`perm-${perm}`}
                                  className={cn(
                                    'cursor-pointer text-xs font-normal',
                                    permissions[perm] ? 'text-foreground' : 'text-muted-foreground',
                                  )}
                                >
                                  {perm.includes('.') ? perm.split('.').pop() : perm}
                                </Label>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  type="submit"
                  disabled={createRole.isPending || updateRole.isPending}
                >
                  {editId ? 'Save Changes' : 'Create Role'}
                </Button>
                <Button type="button" variant="secondary" onClick={resetForm}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {!roles || roles.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Shield className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium text-foreground">No roles</p>
            <p className="mt-1 text-sm text-muted-foreground">Create your first custom role.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {roles.map((role: any) => (
            <Card key={role.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-foreground">{role.name}</h3>
                    {role.isSystem && (
                      <Badge variant="secondary" className="rounded-full text-xs font-medium">
                        System
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(role)}
                      title="Edit role"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {!role.isSystem && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(role.id)}
                        title="Delete role"
                        className="h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
                {role.permissions && Object.keys(role.permissions).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {Object.entries(role.permissions)
                      .filter(([, v]) => v)
                      .map(([perm]) => (
                        <Badge
                          key={perm}
                          variant="outline"
                          className="rounded px-1.5 py-0.5 text-xs text-primary"
                        >
                          {perm}
                        </Badge>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
