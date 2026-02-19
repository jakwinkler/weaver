import { useState, type FormEvent } from 'react';
import {
  useCustomFields,
  useCreateCustomField,
  useDeleteCustomField,
} from '@/api/hooks-phase3';
import type { CustomFieldType } from '@weaver/shared';

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

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

export function CustomFieldsPage() {
  const { data: fields, isLoading } = useCustomFields();
  const createField = useCreateCustomField();
  const deleteField = useDeleteCustomField();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [fieldType, setFieldType] = useState<CustomFieldType>('text');
  const [required, setRequired] = useState(false);
  const [choices, setChoices] = useState('');

  const handleNameChange = (value: string) => {
    setName(value);
    setSlug(slugify(value));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) return;

    const options: Record<string, unknown> = {};
    if ((fieldType === 'select' || fieldType === 'multi_select') && choices.trim()) {
      options.choices = choices
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
    }

    await createField.mutateAsync({
      name: name.trim(),
      slug: slug.trim(),
      fieldType,
      required,
      options: Object.keys(options).length > 0 ? options : undefined,
    });

    setName('');
    setSlug('');
    setFieldType('text');
    setRequired(false);
    setChoices('');
  };

  const handleDelete = async (id: string) => {
    await deleteField.mutateAsync(id);
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <p className="text-sm text-gray-500">Loading custom fields...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Custom Fields</h1>

      {/* Create form */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          Create Custom Field
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="fieldName"
                className="block text-sm font-medium text-gray-700"
              >
                Name
              </label>
              <input
                id="fieldName"
                type="text"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. Story Points"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label
                htmlFor="fieldSlug"
                className="block text-sm font-medium text-gray-700"
              >
                Slug
              </label>
              <input
                id="fieldSlug"
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="Auto-generated from name"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="fieldType"
                className="block text-sm font-medium text-gray-700"
              >
                Field Type
              </label>
              <select
                id="fieldType"
                value={fieldType}
                onChange={(e) => setFieldType(e.target.value as CustomFieldType)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {FIELD_TYPES.map((ft) => (
                  <option key={ft} value={ft}>
                    {ft.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={required}
                  onChange={(e) => setRequired(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm font-medium text-gray-700">Required</span>
              </label>
            </div>
          </div>

          {(fieldType === 'select' || fieldType === 'multi_select') && (
            <div>
              <label
                htmlFor="fieldChoices"
                className="block text-sm font-medium text-gray-700"
              >
                Choices (comma-separated)
              </label>
              <input
                id="fieldChoices"
                type="text"
                value={choices}
                onChange={(e) => setChoices(e.target.value)}
                placeholder="e.g. Option A, Option B, Option C"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          )}

          {createField.isError && (
            <p className="text-sm text-red-600">Failed to create custom field.</p>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={createField.isPending || !name.trim()}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {createField.isPending ? 'Creating...' : 'Create Field'}
            </button>
          </div>
        </form>
      </div>

      {/* Fields list */}
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Existing Fields</h2>
        </div>

        {(!fields || fields.length === 0) ? (
          <div className="px-6 py-8 text-center">
            <p className="text-sm text-gray-400">No custom fields defined yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {fields.map((field) => (
              <div
                key={field.id}
                className="flex items-center justify-between px-6 py-4"
              >
                <div className="flex items-center gap-4">
                  <div>
                    <h3 className="text-sm font-medium text-gray-900">
                      {field.name}
                    </h3>
                    <p className="text-xs text-gray-500">
                      {field.slug}
                    </p>
                  </div>
                  <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                    {field.fieldType.replace('_', ' ')}
                  </span>
                  {field.required && (
                    <span className="inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
                      Required
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(field.id)}
                  disabled={deleteField.isPending}
                  className="rounded p-1 text-gray-400 hover:bg-red-100 hover:text-red-600"
                  title="Delete field"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
