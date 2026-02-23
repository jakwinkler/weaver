import { useState, useRef, type FormEvent } from 'react';
import { useIssueTypes, useCreateIssueType, useUpdateIssueType, useDeleteIssueType, useGenericUploadAttachment } from '@/api';
import { Plus, Trash2, Pencil, Tags, Upload, X } from 'lucide-react';
import { IconPicker, IssueTypeIcon } from '@/components/IconPicker';
import { getAttachmentUrl } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

export function IssueTypesPage() {
  const { data: issueTypes, isLoading } = useIssueTypes();
  const createIssueType = useCreateIssueType();
  const updateIssueType = useUpdateIssueType();
  const deleteIssueType = useDeleteIssueType();
  const uploadAttachment = useGenericUploadAttachment();

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [icon, setIcon] = useState('');
  const [iconColor, setIconColor] = useState('');
  const [iconAttachmentId, setIconAttachmentId] = useState<string | null>(null);
  const [isSubtask, setIsSubtask] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setName('');
    setSlug('');
    setIcon('');
    setIconColor('');
    setIconAttachmentId(null);
    setIsSubtask(false);
    setEditId(null);
    setShowForm(false);
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    const payload = {
      name,
      slug,
      icon: icon || undefined,
      iconColor: iconColor || null,
      iconAttachmentId: iconAttachmentId || null,
      isSubtask,
    };
    if (editId) {
      await updateIssueType.mutateAsync({ id: editId, ...payload });
    } else {
      await createIssueType.mutateAsync(payload);
    }
    resetForm();
  };

  const handleEdit = (it: any) => {
    setEditId(it.id);
    setName(it.name);
    setSlug(it.slug);
    setIcon(it.icon || '');
    setIconColor(it.iconColor || '');
    setIconAttachmentId(it.iconAttachmentId || null);
    setIsSubtask(it.isSubtask || false);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    setDeleteTargetId(id);
  };

  const confirmDelete = async () => {
    if (!deleteTargetId) return;
    await deleteIssueType.mutateAsync(deleteTargetId);
    setDeleteTargetId(null);
  };

  const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const result = await uploadAttachment.mutateAsync(file);
    setIconAttachmentId(result.id);
    setIcon('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleIconSelect = (iconName: string) => {
    setIcon(iconName);
    setIconAttachmentId(null);
  };

  const handleRemoveCustomIcon = () => {
    setIconAttachmentId(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Issue Types</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Define the types of issues that can be created in projects.
          </p>
        </div>
        <Button onClick={() => { resetForm(); setShowForm(true); }}>
          <Plus className="h-4 w-4" />
          New Issue Type
        </Button>
      </div>

      {showForm && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {editId ? 'Edit Issue Type' : 'New Issue Type'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="it-name">Name</Label>
                  <Input
                    id="it-name"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (!editId) setSlug(slugify(e.target.value));
                    }}
                    required
                    placeholder="e.g., Bug"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="it-slug">Slug</Label>
                  <Input
                    id="it-slug"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    required
                    placeholder="e.g., bug"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Icon</Label>
                  {iconAttachmentId ? (
                    <div className="flex items-center gap-2">
                      <img
                        src={getAttachmentUrl(iconAttachmentId)}
                        alt="Custom icon"
                        className="h-8 w-8 rounded object-contain border border-border"
                      />
                      <span className="text-sm text-muted-foreground">Custom image</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={handleRemoveCustomIcon}
                        title="Remove custom icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <IconPicker value={icon} onChange={handleIconSelect} color={iconColor} onColorChange={setIconColor} />
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Custom Image</Label>
                  <div className="flex items-center gap-2">
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
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadAttachment.isPending}
                    >
                      <Upload className="h-4 w-4" />
                      {uploadAttachment.isPending ? 'Uploading...' : 'Upload Image'}
                    </Button>
                  </div>
                </div>
                <div className="flex items-end">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="it-subtask"
                      checked={isSubtask}
                      onCheckedChange={(checked) => setIsSubtask(checked === true)}
                    />
                    <Label htmlFor="it-subtask" className="cursor-pointer font-normal">
                      Is Subtask
                    </Label>
                  </div>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <Button
                  type="submit"
                  disabled={createIssueType.isPending || updateIssueType.isPending}
                >
                  {editId ? 'Update' : 'Create'}
                </Button>
                <Button type="button" variant="secondary" onClick={resetForm}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {!issueTypes || issueTypes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Tags className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium text-foreground">No issue types</p>
            <p className="mt-1 text-sm text-muted-foreground">Create your first issue type.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="uppercase tracking-wider text-xs">Name</TableHead>
                <TableHead className="uppercase tracking-wider text-xs">Slug</TableHead>
                <TableHead className="uppercase tracking-wider text-xs">Icon</TableHead>
                <TableHead className="uppercase tracking-wider text-xs">Subtask</TableHead>
                <TableHead className="uppercase tracking-wider text-xs text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {issueTypes.map((it) => (
                <TableRow key={it.id}>
                  <TableCell className="font-medium text-foreground">{it.name}</TableCell>
                  <TableCell className="text-muted-foreground">{it.slug}</TableCell>
                  <TableCell className="text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <IssueTypeIcon
                        icon={(it as any).icon}
                        iconColor={(it as any).iconColor}
                        iconAttachmentId={(it as any).iconAttachmentId}
                      />
                      {(it as any).iconAttachmentId ? (
                        <span className="text-xs text-muted-foreground">custom</span>
                      ) : (it as any).icon ? (
                        <>
                          <span>{(it as any).icon}</span>
                          {(it as any).iconColor && (
                            <span
                              className="inline-block h-3 w-3 rounded-full border border-border"
                              style={{ backgroundColor: (it as any).iconColor }}
                            />
                          )}
                        </>
                      ) : '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    {(it as any).isSubtask && (
                      <Badge variant="secondary" className="bg-purple-100 text-purple-800 border-transparent dark:bg-purple-900/30 dark:text-purple-300">
                        Subtask
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(it)}
                        title="Edit"
                        className={cn('h-7 w-7 text-muted-foreground hover:text-foreground')}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(it.id)}
                        title="Delete"
                        className={cn('h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={!!deleteTargetId} onOpenChange={(open) => { if (!open) setDeleteTargetId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Issue Type</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this issue type? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleteTargetId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteIssueType.isPending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
