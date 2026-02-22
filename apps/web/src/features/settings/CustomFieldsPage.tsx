import { useState, type FormEvent } from 'react';
import {
  useCustomFields,
  useCreateCustomField,
  useDeleteCustomField,
  useUpdateCustomField,
} from '@/api';
import type { CustomFieldType } from '@weaver/shared';
import { Pencil, Trash2, Settings, Puzzle } from 'lucide-react';

const FIELD_TYPES: CustomFieldType[] = [
  'text',
  'number',
  'select',
  'multi_select',
  'date',
  'user',
  'checkbox',
  'url',
];

const ENTITY_TYPES = ['issue', 'project', 'user', 'team'] as const;
type EntityType = typeof ENTITY_TYPES[number];

const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  issue: 'Issue',
  project: 'Project',
  user: 'User',
  team: 'Team',
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

const fieldTypeColors: Record<string, string> = {
  text: 'bg-blue-100 text-blue-700',
  number: 'bg-green-100 text-green-700',
  select: 'bg-purple-100 text-purple-700',
  multi_select: 'bg-purple-100 text-purple-700',
  date: 'bg-orange-100 text-orange-700',
  user: 'bg-indigo-100 text-indigo-700',
  checkbox: 'bg-yellow-100 text-yellow-700',
  url: 'bg-cyan-100 text-cyan-700',
};

export function CustomFieldsPage() {
  const [activeTab, setActiveTab] = useState<EntityType>('issue');
  const { data: fields, isLoading } = useCustomFields();
  const createField = useCreateCustomField();
  const deleteField = useDeleteCustomField();
  const updateField = useUpdateCustomField();

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [fieldType, setFieldType] = useState<CustomFieldType>('text');
  const [entityType, setEntityType] = useState<EntityType>('issue');
  const [required, setRequired] = useState(false);
  const [choices, setChoices] = useState('');

  const filteredFields = fields?.filter((f: any) => (f.entityType || 'issue') === activeTab) || [];

  const resetForm = () => {
    setName('');
    setSlug('');
    setFieldType('text');
    setEntityType(activeTab);
    setRequired(false);
    setChoices('');
    setEditId(null);
    setShowForm(false);
  };

  const handleNameChange = (value: string) => {
    setName(value);
    if (!editId) setSlug(slugify(value));
  };

  const handleEdit = (field: any) => {
    setEditId(field.id);
    setName(field.name);
    setSlug(field.slug);
    setFieldType(field.fieldType);
    setEntityType(field.entityType || 'issue');
    setRequired(field.required);
    setChoices(field.options?.choices?.join(', ') || '');
    setShowForm(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) return;

    const options: Record<string, unknown> = {};
    if ((fieldType === 'select' || fieldType === 'multi_select') && choices.trim()) {
      options.choices = choices.split(',').map((c) => c.trim()).filter(Boolean);
    }

    if (editId) {
      await updateField.mutateAsync({
        id: editId,
        name: name.trim(),
        required,
        options: Object.keys(options).length > 0 ? options : undefined,
      });
    } else {
      await createField.mutateAsync({
        name: name.trim(),
        slug: slug.trim(),
        fieldType,
        entityType,
        required,
        options: Object.keys(options).length > 0 ? options : undefined,
      } as any);
    }

    resetForm();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this custom field?')) return;
    await deleteField.mutateAsync(id);
  };

  const handleTabChange = (tab: EntityType) => {
    setActiveTab(tab);
    resetForm();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-500">Loading custom fields...</div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Custom Fields</h1>
          <p className="mt-1 text-sm text-gray-500">
            Define custom fields to capture additional data.
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setEntityType(activeTab); setShowForm(true); }}
          className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          New Field
        </button>
      </div>

      {/* Entity Type Tabs */}
      <div className="mb-4 flex gap-1 rounded-lg bg-gray-100 p-1">
        {ENTITY_TYPES.map((et) => (
          <button
            key={et}
            onClick={() => handleTabChange(et)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === et
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {ENTITY_TYPE_LABELS[et]}
          </button>
        ))}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-medium text-gray-900">
            {editId ? 'Edit Field' : 'Create Field'}
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
              <input
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                required
                placeholder="e.g. Story Points"
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Slug</label>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                required
                disabled={!!editId}
                placeholder="Auto-generated"
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Type</label>
              <select
                value={fieldType}
                onChange={(e) => setFieldType(e.target.value as CustomFieldType)}
                disabled={!!editId}
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50"
              >
                {FIELD_TYPES.map((ft) => (
                  <option key={ft} value={ft}>{ft.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Entity Type</label>
              <select
                value={entityType}
                onChange={(e) => setEntityType(e.target.value as EntityType)}
                disabled={!!editId}
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50"
              >
                {ENTITY_TYPES.map((et) => (
                  <option key={et} value={et}>{ENTITY_TYPE_LABELS[et]}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={required}
                  onChange={(e) => setRequired(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600"
                />
                <span className="text-sm text-gray-700">Required</span>
              </label>
            </div>
          </div>

          {(fieldType === 'select' || fieldType === 'multi_select') && (
            <div className="mt-4">
              <label className="mb-1 block text-sm font-medium text-gray-700">Choices (comma-separated)</label>
              <input
                value={choices}
                onChange={(e) => setChoices(e.target.value)}
                placeholder="Option A, Option B, Option C"
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          )}

          {(createField.isError || updateField.isError) && (
            <p className="mt-2 text-sm text-red-600">Failed to save field.</p>
          )}

          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              disabled={createField.isPending || updateField.isPending}
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

      {filteredFields.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white py-12 text-center">
          <Settings className="mx-auto h-10 w-10 text-gray-400" />
          <p className="mt-2 text-sm font-medium text-gray-900">No custom fields</p>
          <p className="mt-1 text-sm text-gray-500">
            No {ENTITY_TYPE_LABELS[activeTab].toLowerCase()} custom fields yet.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Slug</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Required</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Source</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredFields.map((field: any) => (
                <tr key={field.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{field.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{field.slug}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${fieldTypeColors[field.fieldType] || 'bg-gray-100 text-gray-700'}`}>
                      {field.fieldType.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {field.required && (
                      <span className="inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
                        Required
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {field.pluginId && (
                      <span className="inline-flex items-center gap-1 rounded bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                        <Puzzle className="h-3 w-3" />
                        {field.pluginId}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {!field.pluginId && (
                        <>
                          <button
                            onClick={() => handleEdit(field)}
                            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                            title="Edit field"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(field.id)}
                            disabled={deleteField.isPending}
                            className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                            title="Delete field"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      )}
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
