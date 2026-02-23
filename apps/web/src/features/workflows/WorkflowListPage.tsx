import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useWorkflows, useCreateWorkflow, useDeleteWorkflow } from '@/api';
import { Plus, Trash2, GitBranch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';

export function WorkflowListPage() {
  const navigate = useNavigate();
  const { data: workflows, isLoading } = useWorkflows();
  const createWorkflow = useCreateWorkflow();
  const deleteWorkflow = useDeleteWorkflow();

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    const wf = await createWorkflow.mutateAsync({ name, isDefault: false });
    setName('');
    setShowForm(false);
    navigate(`/workflows/${wf.id}`);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this workflow? This cannot be undone.')) return;
    await deleteWorkflow.mutateAsync(id);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        Loading workflows...
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Workflows</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Define statuses and transitions for your issues.
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4" />
          New Workflow
        </Button>
      </div>

      {showForm && (
        <Card className="mb-6">
          <CardContent className="pt-4">
            <form onSubmit={handleCreate}>
              <div className="flex items-end gap-3">
                <div className="flex-1 space-y-1.5">
                  <Label>Workflow Name</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Software Development"
                    required
                  />
                </div>
                <Button type="submit" disabled={createWorkflow.isPending}>
                  {createWorkflow.isPending ? 'Creating...' : 'Create'}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {!workflows || workflows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <GitBranch className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium text-foreground">No workflows yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create your first workflow to define issue statuses.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs uppercase tracking-wider">Name</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Default</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Created</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wider">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workflows.map((wf) => (
                <TableRow key={wf.id}>
                  <TableCell>
                    <Link
                      to={`/workflows/${wf.id}`}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      {wf.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {(wf as any).isDefault && (
                      <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-200">
                        Default
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(wf.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(wf.id)}
                      disabled={deleteWorkflow.isPending}
                      className="h-7 w-7 p-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      title="Delete workflow"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
