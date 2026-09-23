import { useState, type FormEvent } from 'react';
import {
  useTeams,
  useCreateTeam,
  useDeleteTeam,
  useTeamMembers,
  useAddTeamMember,
  useRemoveTeamMember,
  useUsers,
} from '@/api';
import { Plus, Trash2, UsersRound, UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

export function TeamsPage() {
  const { data: teams, isLoading } = useTeams();
  const { data: users } = useUsers();
  const createTeam = useCreateTeam();
  const deleteTeam = useDeleteTeam();

  const [showForm, setShowForm] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    await createTeam.mutateAsync({ name: teamName });
    setTeamName('');
    setShowForm(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this team?')) return;
    await deleteTeam.mutateAsync(id);
    if (selectedTeamId === id) setSelectedTeamId(null);
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground">Loading...</div>;
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Teams</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Organize users into teams for better collaboration.
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4" />
          New Team
        </Button>
      </div>

      {showForm && (
        <Card className="mb-6">
          <CardContent className="pt-4">
            <form onSubmit={handleCreate}>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <Label className="mb-1 block">Team Name</Label>
                  <Input
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    required
                    placeholder="e.g., Frontend Team"
                  />
                </div>
                <Button type="submit" disabled={createTeam.isPending}>
                  Create
                </Button>
                <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Team list */}
        <div>
          {!teams || teams.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <UsersRound className="mx-auto h-10 w-10 text-muted-foreground" />
                <p className="mt-2 text-sm font-medium text-foreground">No teams</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {teams.map((team: any) => (
                <Card
                  key={team.id}
                  className={cn(
                    'cursor-pointer transition-colors',
                    selectedTeamId === team.id
                      ? 'border-primary ring-1 ring-primary'
                      : 'hover:border-border/80',
                  )}
                  onClick={() => setSelectedTeamId(team.id)}
                >
                  <CardContent className="flex items-center justify-between p-3">
                    <div>
                      <h3 className="text-sm font-medium text-foreground">{team.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        Created {new Date(team.createdAt ?? team.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); handleDelete(team.id); }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Team detail / members */}
        {selectedTeamId && (
          <TeamMembersPanel teamId={selectedTeamId} users={users || []} />
        )}
      </div>
    </div>
  );
}

function TeamMembersPanel({ teamId, users }: { teamId: string; users: any[] }) {
  const { data: members, isLoading } = useTeamMembers(teamId);
  const addMember = useAddTeamMember();
  const removeMember = useRemoveTeamMember();
  const [addUserId, setAddUserId] = useState('');

  const memberIds = new Set(members?.map((m) => m.id) || []);
  const availableUsers = users.filter((u) => !memberIds.has(u.id));

  const handleAdd = async () => {
    if (!addUserId) return;
    await addMember.mutateAsync({ teamId, userId: addUserId });
    setAddUserId('');
  };

  const handleRemove = async (userId: string) => {
    await removeMember.mutateAsync({ teamId, userId });
  };

  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="mb-3 text-sm font-medium text-foreground">Team Members</h3>

        {/* Add member */}
        <div className="mb-4 flex gap-2">
          <select
            value={addUserId}
            onChange={(e) => setAddUserId(e.target.value)}
            className={cn(
              'flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground',
              'focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary',
            )}
          >
            <option value="">Select a user...</option>
            {availableUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.displayName || u.email}
              </option>
            ))}
          </select>
          <Button
            onClick={handleAdd}
            disabled={!addUserId || addMember.isPending}
            size="sm"
            className="gap-1"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Add
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading members...</p>
        ) : !members || members.length === 0 ? (
          <p className="text-sm text-muted-foreground">No members yet. Add users to this team.</p>
        ) : (
          <ul className="space-y-2">
            {members.map((member) => (
              <li key={member.id} className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2">
                <div className="flex items-center gap-2">
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="text-xs font-medium">
                      {(member.displayName || member.email).slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm text-foreground">{member.displayName || member.email}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  onClick={() => handleRemove(member.id)}
                  title="Remove member"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
