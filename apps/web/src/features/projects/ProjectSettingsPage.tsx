import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import {
  useProject,
  useUpdateProject,
  useUsers,
  useIssueTypes,
  useWorkflows,
  useProjectMembers,
  useAddProjectMember,
  useUpdateProjectMemberRole,
  useRemoveProjectMember,
  useProjectIssueTypes,
  useSetProjectIssueTypes,
} from '@/api';
import type { TenantUser } from '@/api';
import { Settings, Users, Tag, FileText, Plus, Trash2, X } from 'lucide-react';

type Tab = 'general' | 'members' | 'issue-types' | 'custom-fields';

const MEMBER_ROLES = ['lead', 'member', 'viewer'] as const;

export function ProjectSettingsPage() {
  const { projectKey } = useParams<{ projectKey: string }>();
  const [activeTab, setActiveTab] = useState<Tab>('general');

  if (!projectKey) return null;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Project Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage settings for {projectKey}
        </p>
      </div>

      <div className="mb-6 flex gap-1 rounded-lg bg-gray-100 p-1">
        {([
          { key: 'general', label: 'General', icon: Settings },
          { key: 'members', label: 'Members', icon: Users },
          { key: 'issue-types', label: 'Issue Types', icon: Tag },
          { key: 'custom-fields', label: 'Custom Fields', icon: FileText },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'general' && <GeneralTab projectKey={projectKey} />}
      {activeTab === 'members' && <MembersTab projectKey={projectKey} />}
      {activeTab === 'issue-types' && <IssueTypesTab projectKey={projectKey} />}
      {activeTab === 'custom-fields' && <CustomFieldsTab projectKey={projectKey} />}
    </div>
  );
}

function GeneralTab({ projectKey }: { projectKey: string }) {
  const { data: project, isLoading } = useProject(projectKey);
  const { data: workflows } = useWorkflows();
  const { data: users } = useUsers();
  const updateProject = useUpdateProject();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [leadUserId, setLeadUserId] = useState('');
  const [workflowId, setWorkflowId] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [saved, setSaved] = useState(false);

  if (project && !initialized) {
    setName(project.name);
    setDescription(project.description || '');
    setLeadUserId(project.leadUserId || '');
    setWorkflowId(project.workflowId || '');
    setInitialized(true);
  }

  if (isLoading || !project) {
    return <div className="py-8 text-center text-gray-500">Loading...</div>;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaved(false);
    await updateProject.mutateAsync({
      key: projectKey,
      name: name.trim(),
      description: description.trim() || undefined,
      leadUserId: leadUserId || undefined,
      workflowId: workflowId || undefined,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Key</label>
          <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-500">{project.key}</p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Project Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            placeholder="Project description..."
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Lead</label>
          <select
            value={leadUserId}
            onChange={(e) => setLeadUserId(e.target.value)}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">No lead</option>
            {users?.map((u: TenantUser) => (
              <option key={u.id} value={u.id}>
                {u.displayName || u.email}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Workflow</label>
          <select
            value={workflowId}
            onChange={(e) => setWorkflowId(e.target.value)}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">Default</option>
            {workflows?.map((w: any) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          type="submit"
          disabled={updateProject.isPending}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {updateProject.isPending ? 'Saving...' : 'Save Changes'}
        </button>
        {saved && (
          <span className="text-sm text-green-600">Changes saved!</span>
        )}
        {updateProject.isError && (
          <span className="text-sm text-red-600">Failed to save changes.</span>
        )}
      </div>
    </form>
  );
}

function MembersTab({ projectKey }: { projectKey: string }) {
  const { data: members, isLoading } = useProjectMembers(projectKey);
  const { data: users } = useUsers();
  const addMember = useAddProjectMember();
  const updateRole = useUpdateProjectMemberRole();
  const removeMember = useRemoveProjectMember();

  const [showAdd, setShowAdd] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState('member');

  const memberUserIds = new Set(members?.map((m) => m.userId) || []);
  const availableUsers = users?.filter((u: TenantUser) => !memberUserIds.has(u.id)) || [];

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) return;
    await addMember.mutateAsync({ projectKey, userId: selectedUserId, role: selectedRole });
    setSelectedUserId('');
    setSelectedRole('member');
    setShowAdd(false);
  };

  const handleRemove = async (userId: string) => {
    if (!confirm('Remove this member?')) return;
    await removeMember.mutateAsync({ projectKey, userId });
  };

  const handleRoleChange = async (userId: string, role: string) => {
    await updateRole.mutateAsync({ projectKey, userId, role });
  };

  if (isLoading) {
    return <div className="py-8 text-center text-gray-500">Loading...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700">
          {members?.length || 0} member{members?.length !== 1 ? 's' : ''}
        </h3>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Member
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-gray-700">User</label>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                required
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Select user...</option>
                {availableUsers.map((u: TenantUser) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName || u.email}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Role</label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="block rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                {MEMBER_ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={addMember.isPending}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-700 hover:bg-gray-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </form>
      )}

      <div className="rounded-lg border border-gray-200 bg-white">
        {!members || members.length === 0 ? (
          <div className="py-8 text-center">
            <Users className="mx-auto h-8 w-8 text-gray-400" />
            <p className="mt-2 text-sm text-gray-500">No members yet</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {members.map((member) => {
              const user = users?.find((u: TenantUser) => u.id === member.userId);
              return (
                <div key={member.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {user?.displayName || user?.email || member.userId}
                    </p>
                    {user?.email && user.displayName && (
                      <p className="text-xs text-gray-500">{user.email}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={member.role}
                      onChange={(e) => handleRoleChange(member.userId, e.target.value)}
                      className="rounded border border-gray-300 px-2 py-1 text-xs"
                    >
                      {MEMBER_ROLES.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleRemove(member.userId)}
                      className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                      title="Remove member"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function IssueTypesTab({ projectKey }: { projectKey: string }) {
  const { data: projectIssueTypes, isLoading } = useProjectIssueTypes(projectKey);
  const { data: allIssueTypes } = useIssueTypes();
  const setProjectIssueTypes = useSetProjectIssueTypes();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);

  if (projectIssueTypes && allIssueTypes && !initialized) {
    const currentIds = new Set(projectIssueTypes.map((it: any) => it.id));
    // If all are selected, it means no scoping - show all checked
    if (currentIds.size === allIssueTypes.length) {
      setSelectedIds(new Set(allIssueTypes.map((it: any) => it.id)));
    } else {
      setSelectedIds(currentIds);
    }
    setInitialized(true);
  }

  const handleToggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSave = async () => {
    const allIds = allIssueTypes?.map((it: any) => it.id) || [];
    // If all selected, send empty array to mean "no restriction"
    const ids = selectedIds.size === allIds.length ? [] : Array.from(selectedIds);
    await setProjectIssueTypes.mutateAsync({ projectKey, issueTypeIds: ids });
  };

  if (isLoading) {
    return <div className="py-8 text-center text-gray-500">Loading...</div>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Select which issue types are available in this project. If none are selected, all types will be available.
      </p>
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="space-y-2">
          {allIssueTypes?.map((it: any) => (
            <label key={it.id} className="flex items-center gap-3 rounded-md p-2 hover:bg-gray-50">
              <input
                type="checkbox"
                checked={selectedIds.has(it.id)}
                onChange={() => handleToggle(it.id)}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600"
              />
              <div>
                <span className="text-sm font-medium text-gray-900">{it.name}</span>
                {it.isSubtask && (
                  <span className="ml-2 inline-flex rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                    Subtask
                  </span>
                )}
              </div>
            </label>
          ))}
        </div>
      </div>
      <button
        onClick={handleSave}
        disabled={setProjectIssueTypes.isPending}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        Save
      </button>
    </div>
  );
}

function CustomFieldsTab({ projectKey }: { projectKey: string }) {
  const { data: project } = useProject(projectKey);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <p className="text-sm text-gray-500">
        Project-scoped custom field values are stored here. Use the Custom Fields admin page to define project-type fields.
      </p>
      {project?.customFields && Object.keys(project.customFields).length > 0 ? (
        <div className="mt-4 space-y-2">
          {Object.entries(project.customFields).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between rounded border border-gray-100 px-3 py-2">
              <span className="text-sm font-medium text-gray-700">{key}</span>
              <span className="text-sm text-gray-500">{String(value)}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-gray-400">No project custom fields set.</p>
      )}
    </div>
  );
}
