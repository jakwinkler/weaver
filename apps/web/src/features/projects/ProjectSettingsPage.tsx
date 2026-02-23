import { useState, useCallback, useRef, type FormEvent } from 'react';
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
  useGenericUploadAttachment,
  getAttachmentUrl,
} from '@/api';
import type { TenantUser } from '@/api';
import { Settings, Users, Tag, FileText, Plus, Trash2, X, Upload } from 'lucide-react';
import { RichTextEditor, normalizeCommentBody, serializeDoc } from '@/components/RichTextEditor';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

export function ProjectIcon({
  iconAttachmentId,
  projectKey,
  size = 'md',
}: {
  iconAttachmentId?: string | null;
  projectKey: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizeClasses = { sm: 'h-6 w-6 text-xs', md: 'h-8 w-8 text-sm', lg: 'h-12 w-12 text-lg' };
  const cls = sizeClasses[size];

  if (iconAttachmentId) {
    return (
      <img
        src={getAttachmentUrl(iconAttachmentId)}
        alt={projectKey}
        className={`${cls} rounded-md object-cover`}
      />
    );
  }

  const initials = projectKey.slice(0, 2);
  return (
    <span
      className={`${cls} inline-flex items-center justify-center rounded-md bg-indigo-100 font-semibold text-indigo-700`}
    >
      {initials}
    </span>
  );
}

type Tab = 'general' | 'members' | 'issue-types' | 'custom-fields';

const MEMBER_ROLES = ['lead', 'member', 'viewer'] as const;

export function ProjectSettingsPage() {
  const { projectKey } = useParams<{ projectKey: string }>();
  const [activeTab, setActiveTab] = useState<Tab>('general');

  if (!projectKey) return null;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Project Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage settings for {projectKey}
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Tab)} className="mb-6">
        <TabsList className="w-full">
          {([
            { key: 'general', label: 'General', icon: Settings },
            { key: 'members', label: 'Members', icon: Users },
            { key: 'issue-types', label: 'Issue Types', icon: Tag },
            { key: 'custom-fields', label: 'Custom Fields', icon: FileText },
          ] as const).map(({ key, label, icon: Icon }) => (
            <TabsTrigger key={key} value={key} className="flex flex-1 items-center gap-1.5">
              <Icon className="h-4 w-4" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="general">
          <GeneralTab projectKey={projectKey} />
        </TabsContent>
        <TabsContent value="members">
          <MembersTab projectKey={projectKey} />
        </TabsContent>
        <TabsContent value="issue-types">
          <IssueTypesTab projectKey={projectKey} />
        </TabsContent>
        <TabsContent value="custom-fields">
          <CustomFieldsTab projectKey={projectKey} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function GeneralTab({ projectKey }: { projectKey: string }) {
  const { data: project, isLoading } = useProject(projectKey);
  const { data: workflows } = useWorkflows();
  const { data: users } = useUsers();
  const updateProject = useUpdateProject();
  const uploadAttachment = useGenericUploadAttachment();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [descriptionJson, setDescriptionJson] = useState<Record<string, unknown> | null>(null);
  const [editingDesc, setEditingDesc] = useState(false);
  const [leadUserId, setLeadUserId] = useState('');
  const [workflowId, setWorkflowId] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleDescriptionChange = useCallback((json: Record<string, unknown>) => {
    setDescriptionJson(json);
  }, []);

  if (project && !initialized) {
    setName(project.name);
    setDescriptionJson(normalizeCommentBody(project.description || ''));
    setLeadUserId(project.leadUserId || '');
    setWorkflowId(project.workflowId || '');
    setInitialized(true);
  }

  const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const result = await uploadAttachment.mutateAsync(file);
    await updateProject.mutateAsync({ key: projectKey, iconAttachmentId: result.id });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveIcon = async () => {
    await updateProject.mutateAsync({ key: projectKey, iconAttachmentId: null });
  };

  if (isLoading || !project) {
    return <div className="py-8 text-center text-muted-foreground">Loading...</div>;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaved(false);
    const descStr = serializeDoc(descriptionJson);
    await updateProject.mutateAsync({
      key: projectKey,
      name: name.trim(),
      description: descStr || undefined,
      leadUserId: leadUserId || undefined,
      workflowId: workflowId || undefined,
    });
    setEditingDesc(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label className="mb-1 block">Project Icon</Label>
            <div className="flex items-center gap-4">
              <ProjectIcon iconAttachmentId={project.iconAttachmentId} projectKey={project.key} size="lg" />
              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleIconUpload}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadAttachment.isPending}
                >
                  <Upload className="h-3.5 w-3.5" />
                  {uploadAttachment.isPending ? 'Uploading...' : 'Change Icon'}
                </Button>
                {project.iconAttachmentId && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleRemoveIcon}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div>
            <Label className="mb-1 block">Key</Label>
            <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">{project.key}</p>
          </div>

          <div>
            <Label className="mb-1 block">Project Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <Label>Description</Label>
              {!editingDesc && (
                <button
                  type="button"
                  onClick={() => setEditingDesc(true)}
                  className="text-xs font-medium text-primary hover:opacity-80"
                >
                  Edit
                </button>
              )}
              {editingDesc && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingDesc(false);
                    setDescriptionJson(normalizeCommentBody(project.description || ''));
                  }}
                  className="text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              )}
            </div>
            {editingDesc ? (
              <RichTextEditor
                content={descriptionJson}
                onChange={handleDescriptionChange}
                placeholder="Project description..."
              />
            ) : (
              <div className="rounded-md border border-border bg-muted/50 px-3 py-2">
                {project.description ? (
                  <RichTextEditor
                    content={normalizeCommentBody(project.description)}
                    editable={false}
                  />
                ) : (
                  <p className="text-sm italic text-muted-foreground">No description.</p>
                )}
              </div>
            )}
          </div>

          <div>
            <Label className="mb-1 block">Lead</Label>
            <select
              value={leadUserId}
              onChange={(e) => setLeadUserId(e.target.value)}
              className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
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
            <Label className="mb-1 block">Workflow</Label>
            <select
              value={workflowId}
              onChange={(e) => setWorkflowId(e.target.value)}
              className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Default</option>
              {workflows?.map((w: any) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={updateProject.isPending}>
              {updateProject.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
            {saved && (
              <span className="text-sm text-green-600">Changes saved!</span>
            )}
            {updateProject.isError && (
              <span className="text-sm text-destructive">Failed to save changes.</span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
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
    return <div className="py-8 text-center text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">
          {members?.length || 0} member{members?.length !== 1 ? 's' : ''}
        </h3>
        <Button size="sm" onClick={() => setShowAdd(!showAdd)}>
          <Plus className="h-3.5 w-3.5" />
          Add Member
        </Button>
      </div>

      {showAdd && (
        <Card>
          <CardContent className="pt-4">
            <form onSubmit={handleAdd}>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <Label className="mb-1 block">User</Label>
                  <select
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                    required
                    className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
                  <Label className="mb-1 block">Role</Label>
                  <select
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value)}
                    className="block rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {MEMBER_ROLES.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
                <Button type="submit" disabled={addMember.isPending}>
                  Add
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  onClick={() => setShowAdd(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        {!members || members.length === 0 ? (
          <CardContent className="pt-6">
            <div className="py-4 text-center">
              <Users className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">No members yet</p>
            </div>
          </CardContent>
        ) : (
          <div className="divide-y divide-border">
            {members.map((member) => {
              const user = users?.find((u: TenantUser) => u.id === member.userId);
              return (
                <div key={member.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {user?.displayName || user?.email || member.userId}
                    </p>
                    {user?.email && user.displayName && (
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={member.role}
                      onChange={(e) => handleRoleChange(member.userId, e.target.value)}
                      className="rounded border border-input bg-background px-2 py-1 text-xs"
                    >
                      {MEMBER_ROLES.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemove(member.userId)}
                      title="Remove member"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
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
    return <div className="py-8 text-center text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Select which issue types are available in this project. If none are selected, all types will be available.
      </p>
      <Card>
        <CardContent className="pt-4">
          <div className="space-y-2">
            {allIssueTypes?.map((it: any) => (
              <label
                key={it.id}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-md p-2 hover:bg-muted/50',
                )}
              >
                <Checkbox
                  checked={selectedIds.has(it.id)}
                  onCheckedChange={() => handleToggle(it.id)}
                />
                <div>
                  <span className="text-sm font-medium text-foreground">{it.name}</span>
                  {it.isSubtask && (
                    <span className="ml-2 inline-flex rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      Subtask
                    </span>
                  )}
                </div>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>
      <Button onClick={handleSave} disabled={setProjectIssueTypes.isPending}>
        Save
      </Button>
    </div>
  );
}

function CustomFieldsTab({ projectKey }: { projectKey: string }) {
  const { data: project } = useProject(projectKey);

  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">
          Project-scoped custom field values are stored here. Use the Custom Fields admin page to define project-type fields.
        </p>
        {project?.customFields && Object.keys(project.customFields).length > 0 ? (
          <div className="mt-4 space-y-2">
            {Object.entries(project.customFields).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between rounded border border-border px-3 py-2">
                <span className="text-sm font-medium text-foreground">{key}</span>
                <span className="text-sm text-muted-foreground">{String(value)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">No project custom fields set.</p>
        )}
      </CardContent>
    </Card>
  );
}
