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
    return <div className="flex items-center justify-center py-12 text-gray-500">Loading...</div>;
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Teams</h1>
          <p className="mt-1 text-sm text-gray-500">
            Organize users into teams for better collaboration.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          New Team
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-gray-700">Team Name</label>
              <input
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                required
                placeholder="e.g., Frontend Team"
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <button type="submit" disabled={createTeam.isPending} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
              Create
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Team list */}
        <div>
          {!teams || teams.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white py-12 text-center">
              <UsersRound className="mx-auto h-10 w-10 text-gray-400" />
              <p className="mt-2 text-sm font-medium text-gray-900">No teams</p>
            </div>
          ) : (
            <div className="space-y-2">
              {teams.map((team: any) => (
                <div
                  key={team.id}
                  className={`flex cursor-pointer items-center justify-between rounded-lg border bg-white p-3 transition-colors ${
                    selectedTeamId === team.id ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => setSelectedTeamId(team.id)}
                >
                  <div>
                    <h3 className="text-sm font-medium text-gray-900">{team.name}</h3>
                    <p className="text-xs text-gray-500">Created {new Date(team.createdAt).toLocaleDateString()}</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(team.id); }}
                    className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
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
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-medium text-gray-900">Team Members</h3>

      {/* Add member */}
      <div className="mb-4 flex gap-2">
        <select
          value={addUserId}
          onChange={(e) => setAddUserId(e.target.value)}
          className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">Select a user...</option>
          {availableUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.displayName || u.email}
            </option>
          ))}
        </select>
        <button
          onClick={handleAdd}
          disabled={!addUserId || addMember.isPending}
          className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          <UserPlus className="h-3.5 w-3.5" />
          Add
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading members...</p>
      ) : !members || members.length === 0 ? (
        <p className="text-sm text-gray-500">No members yet. Add users to this team.</p>
      ) : (
        <ul className="space-y-2">
          {members.map((member) => (
            <li key={member.id} className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-medium text-indigo-600">
                  {(member.displayName || member.email).slice(0, 2).toUpperCase()}
                </div>
                <span className="text-sm text-gray-900">{member.displayName || member.email}</span>
              </div>
              <button
                onClick={() => handleRemove(member.id)}
                className="rounded p-1 text-gray-400 hover:text-red-600"
                title="Remove member"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
