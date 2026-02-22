import { useState, useRef, type FormEvent } from 'react';
import { useIssueTypes, useCreateIssueType, useUpdateIssueType, useDeleteIssueType, useGenericUploadAttachment } from '@/api';
import { Plus, Trash2, Pencil, Tags, Upload, X } from 'lucide-react';
import { IconPicker, IssueTypeIcon } from '@/components/IconPicker';
import { getAttachmentUrl } from '@/api';

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
    if (!confirm('Delete this issue type?')) return;
    await deleteIssueType.mutateAsync(id);
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
    return <div className="flex items-center justify-center py-12 text-gray-500">Loading...</div>;
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Issue Types</h1>
          <p className="mt-1 text-sm text-gray-500">
            Define the types of issues that can be created in projects.
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          New Issue Type
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!editId) setSlug(slugify(e.target.value));
                }}
                required
                placeholder="e.g., Bug"
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Slug</label>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                required
                placeholder="e.g., bug"
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Icon</label>
              {iconAttachmentId ? (
                <div className="flex items-center gap-2">
                  <img
                    src={getAttachmentUrl(iconAttachmentId)}
                    alt="Custom icon"
                    className="h-8 w-8 rounded object-contain border border-gray-200"
                  />
                  <span className="text-sm text-gray-500">Custom image</span>
                  <button
                    type="button"
                    onClick={handleRemoveCustomIcon}
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-500"
                    title="Remove custom icon"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <IconPicker value={icon} onChange={handleIconSelect} color={iconColor} onColorChange={setIconColor} />
              )}
            </div>
            <div className="flex flex-col gap-2">
              <label className="mb-1 block text-sm font-medium text-gray-700">Custom Image</label>
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleIconUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadAttachment.isPending}
                  className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm hover:bg-gray-50 disabled:opacity-50"
                >
                  <Upload className="h-4 w-4" />
                  {uploadAttachment.isPending ? 'Uploading...' : 'Upload Image'}
                </button>
              </div>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={isSubtask}
                  onChange={(e) => setIsSubtask(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600"
                />
                <span className="text-sm text-gray-700">Is Subtask</span>
              </label>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              disabled={createIssueType.isPending || updateIssueType.isPending}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {editId ? 'Update' : 'Create'}
            </button>
            <button type="button" onClick={resetForm} className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200">
              Cancel
            </button>
          </div>
        </form>
      )}

      {!issueTypes || issueTypes.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white py-12 text-center">
          <Tags className="mx-auto h-10 w-10 text-gray-400" />
          <p className="mt-2 text-sm font-medium text-gray-900">No issue types</p>
          <p className="mt-1 text-sm text-gray-500">Create your first issue type.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Slug</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Icon</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Subtask</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {issueTypes.map((it) => (
                <tr key={it.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{it.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{it.slug}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    <span className="inline-flex items-center gap-1.5">
                      <IssueTypeIcon
                        icon={(it as any).icon}
                        iconColor={(it as any).iconColor}
                        iconAttachmentId={(it as any).iconAttachmentId}
                      />
                      {(it as any).iconAttachmentId ? (
                        <span className="text-xs text-gray-400">custom</span>
                      ) : (it as any).icon ? (
                        <>
                          <span>{(it as any).icon}</span>
                          {(it as any).iconColor && (
                            <span className="inline-block h-3 w-3 rounded-full border border-gray-200" style={{ backgroundColor: (it as any).iconColor }} />
                          )}
                        </>
                      ) : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {(it as any).isSubtask && (
                      <span className="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-800">
                        Subtask
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => handleEdit(it)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600" title="Edit">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDelete(it.id)} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Delete">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
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
