import { useEffect, useState, type FormEvent } from 'react';
import { useBlocker } from 'react-router-dom';
import type {
  CreateFormDto,
  Form,
  FormFieldDefinition,
  FormFieldMapping,
  FormFieldType,
  IssuePriority,
} from '@weaver/shared';
import {
  AlignLeft,
  AtSign,
  CheckCircle2,
  ChevronRight,
  FileInput,
  Link2,
  ListChecks,
  Plus,
  Share2,
  Trash2,
  Type,
} from 'lucide-react';
import { useCreateForm, useDeleteForm, useForms, useProjectIssueTypes, useUpdateForm } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { FormShareDialog } from './FormShareDialog';
import { SubmissionsList } from './SubmissionsList';

type FormDraft = CreateFormDto & { id?: string; tenantSlug?: string };

const PRIORITIES: IssuePriority[] = ['lowest', 'low', 'medium', 'high', 'highest'];
const MAPPINGS: Array<{ value: FormFieldMapping; label: string }> = [
  { value: 'summary', label: 'Issue summary' },
  { value: 'description', label: 'Issue description' },
  { value: 'labels', label: 'Issue labels' },
  { value: 'custom-field', label: 'Custom field' },
];

const FIELD_TYPES: Array<{ type: FormFieldType; label: string; icon: typeof Type }> = [
  { type: 'text', label: 'Short text', icon: Type },
  { type: 'textarea', label: 'Long text', icon: AlignLeft },
  { type: 'select', label: 'Select', icon: ListChecks },
  { type: 'email', label: 'Email', icon: AtSign },
];

function fieldId(): string {
  return `field_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

function customFieldKey(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'external_value'
  );
}

function newDraft(): FormDraft {
  return {
    name: 'Request form',
    slug: 'request-form',
    description: 'Tell us what you need and our team will review it.',
    active: true,
    issueDefaults: { priority: 'medium', labels: [] },
    fields: [
      {
        id: fieldId(),
        type: 'text',
        label: 'What do you need help with?',
        required: true,
        mapping: 'summary',
        placeholder: 'A short summary',
      },
      {
        id: fieldId(),
        type: 'textarea',
        label: 'Details',
        required: true,
        mapping: 'description',
        placeholder: 'Include context, expected behavior, and anything else that will help.',
      },
      {
        id: fieldId(),
        type: 'email',
        label: 'Your email',
        required: true,
        mapping: 'custom-field',
        customFieldKey: 'requester_email',
        placeholder: 'you@example.com',
      },
    ],
  };
}

function draftFromForm(form: Form): FormDraft {
  return {
    id: form.id,
    tenantSlug: form.tenantSlug,
    name: form.name,
    slug: form.slug,
    description: form.description ?? null,
    active: form.active,
    issueDefaults: {
      issueTypeId: form.issueDefaults.issueTypeId,
      priority: form.issueDefaults.priority || 'medium',
      labels: form.issueDefaults.labels || [],
    },
    fields: form.fields.map((field) => ({
      ...field,
      options: field.options ? [...field.options] : undefined,
    })),
  };
}

function mutationMessage(error: unknown): string {
  const responseMessage = (error as any)?.response?.data?.message;
  if (Array.isArray(responseMessage)) return responseMessage.join(', ');
  if (typeof responseMessage === 'string') return responseMessage;
  return 'The form could not be saved. Review the fields and try again.';
}

export function FormBuilder({
  projectKey,
  onDirtyChange,
}: {
  projectKey: string;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { data: forms, isLoading, isError } = useForms(projectKey);
  const { data: issueTypes } = useProjectIssueTypes(projectKey);
  const createForm = useCreateForm(projectKey);
  const updateForm = useUpdateForm(projectKey);
  const deleteForm = useDeleteForm(projectKey);
  const [draft, setDraft] = useState<FormDraft | null>(null);
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null);
  const [slugEdited, setSlugEdited] = useState(false);
  const [formError, setFormError] = useState('');
  const [saved, setSaved] = useState(false);
  const [shareForm, setShareForm] = useState<Form | null>(null);
  const [defaultLabels, setDefaultLabels] = useState('');
  const [dirty, setDirty] = useState(false);
  const navigationBlocker = useBlocker(dirty);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [dirty]);

  useEffect(() => {
    if (navigationBlocker.state !== 'blocked') return;
    if (confirm('Discard your unsaved form changes?')) {
      setDirty(false);
      navigationBlocker.proceed();
      return;
    }
    navigationBlocker.reset();
  }, [navigationBlocker]);

  useEffect(() => {
    if (!selectedFormId && !draft && forms?.length) {
      setSelectedFormId(forms[0].id);
      setDraft(draftFromForm(forms[0]));
      setDefaultLabels((forms[0].issueDefaults.labels || []).join(', '));
      setSlugEdited(true);
    }
  }, [draft, forms, selectedFormId]);

  const selectForm = (form: Form) => {
    if (form.id === selectedFormId) return;
    if (dirty && !confirm('Discard your unsaved form changes?')) return;
    setSelectedFormId(form.id);
    setDraft(draftFromForm(form));
    setSlugEdited(true);
    setDefaultLabels((form.issueDefaults.labels || []).join(', '));
    setFormError('');
    setSaved(false);
    setDirty(false);
  };

  const startNewForm = () => {
    if (dirty && !confirm('Discard your unsaved form changes?')) return;
    setSelectedFormId(null);
    setDraft(newDraft());
    setSlugEdited(false);
    setDefaultLabels('');
    setFormError('');
    setSaved(false);
    setDirty(false);
  };

  const updateDraft = <K extends keyof FormDraft>(key: K, value: FormDraft[K]) => {
    if (!draft || Object.is(draft[key], value)) return;
    setDraft((current) => (current ? { ...current, [key]: value } : current));
    setSaved(false);
    setDirty(true);
  };

  const updateField = (id: string, partial: Partial<FormFieldDefinition>) => {
    if (!draft) return;
    updateDraft(
      'fields',
      draft.fields.map((field) => (field.id === id ? { ...field, ...partial } : field)),
    );
  };

  const addField = (type: FormFieldType) => {
    if (!draft) return;
    const definition = FIELD_TYPES.find((fieldType) => fieldType.type === type)!;
    const label = type === 'email' ? 'Email address' : definition.label;
    updateDraft('fields', [
      ...draft.fields,
      {
        id: fieldId(),
        type,
        label,
        required: false,
        mapping: 'custom-field',
        customFieldKey: customFieldKey(label),
        ...(type === 'select' ? { options: ['Option 1', 'Option 2'] } : {}),
      },
    ]);
  };

  const removeField = (id: string) => {
    if (!draft) return;
    updateDraft(
      'fields',
      draft.fields.filter((field) => field.id !== id),
    );
  };

  const validateDraft = (): string => {
    if (!draft?.name.trim()) return 'Give the form a name.';
    const normalizedSlug = slugify(draft.slug);
    if (normalizedSlug.length < 2)
      return 'Use at least two lowercase letters or numbers in the public path.';
    if (!draft.fields.length) return 'Add at least one field.';
    if (!draft.fields.some((field) => field.mapping === 'summary'))
      return 'Map one field to the issue summary.';
    for (const field of draft.fields) {
      if (!field.label.trim()) return 'Every field needs a label.';
      if (field.type === 'select' && !field.options?.some((option) => option.trim()))
        return `${field.label} needs at least one option.`;
      if (field.mapping === 'custom-field' && !field.customFieldKey?.trim())
        return `${field.label} needs a custom field key.`;
    }
    return '';
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    const validationError = validateDraft();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setFormError('');
    setSaved(false);
    const data: CreateFormDto = {
      name: draft.name.trim(),
      slug: slugify(draft.slug),
      description: draft.description?.trim() || null,
      active: draft.active,
      issueDefaults: {
        issueTypeId: draft.issueDefaults.issueTypeId || undefined,
        priority: draft.issueDefaults.priority || 'medium',
        labels: defaultLabels
          .split(',')
          .map((label) => label.trim())
          .filter(Boolean),
      },
      fields: draft.fields.map((field) => ({
        ...field,
        label: field.label.trim(),
        placeholder: field.placeholder?.trim() || undefined,
        customFieldKey: field.mapping === 'custom-field' ? field.customFieldKey?.trim() : undefined,
        options:
          field.type === 'select'
            ? field.options?.map((option) => option.trim()).filter(Boolean)
            : undefined,
      })),
    };

    try {
      const result = draft.id
        ? await updateForm.mutateAsync({ formId: draft.id, data })
        : await createForm.mutateAsync(data);
      setSelectedFormId(result.id);
      setDraft(draftFromForm(result));
      setSlugEdited(true);
      setDefaultLabels((result.issueDefaults.labels || []).join(', '));
      setSaved(true);
      setDirty(false);
      window.setTimeout(() => setSaved(false), 2200);
    } catch (error) {
      setFormError(mutationMessage(error));
    }
  };

  const handleDelete = async () => {
    if (!draft?.id || !confirm(`Delete "${draft.name}" and its submission history?`)) return;
    try {
      await deleteForm.mutateAsync(draft.id);
      setDraft(null);
      setSelectedFormId(null);
      setDefaultLabels('');
      setFormError('');
      setDirty(false);
    } catch (error) {
      setFormError(mutationMessage(error));
    }
  };

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Loading forms...</div>;
  }

  if (isError) {
    return (
      <p className="border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        Forms could not be loaded. Confirm you can update this project, then refresh the page.
      </p>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="space-y-3" aria-label="Project forms">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">External forms</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{forms?.length || 0} configured</p>
          </div>
          <Button type="button" size="sm" onClick={startNewForm}>
            <Plus className="h-4 w-4" />
            New
          </Button>
        </div>

        {!forms?.length ? (
          <button
            type="button"
            onClick={startNewForm}
            className="w-full border border-dashed border-border px-5 py-8 text-left hover:border-foreground/30 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <FileInput className="h-6 w-6 text-muted-foreground" />
            <span className="mt-3 block text-sm font-medium text-foreground">
              Create your first form
            </span>
            <span className="mt-1 block text-xs leading-5 text-muted-foreground">
              Collect bug reports, requests, or support questions without requiring a login.
            </span>
          </button>
        ) : (
          <div className="border border-border bg-card">
            {forms.map((form) => (
              <div
                key={form.id}
                className={cn(
                  'flex items-stretch border-b border-border last:border-b-0',
                  selectedFormId === form.id && 'bg-muted/60',
                )}
              >
                <button
                  type="button"
                  onClick={() => selectForm(form)}
                  className="min-w-0 flex-1 px-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">
                      {form.name}
                    </span>
                    {!form.active && (
                      <Badge variant="secondary" className="text-[10px]">
                        Inactive
                      </Badge>
                    )}
                  </span>
                  <span className="mt-1 block truncate text-xs text-muted-foreground">
                    /{form.slug}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setShareForm(form)}
                  className="px-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  aria-label={`Share ${form.name}`}
                >
                  <Share2 className="h-4 w-4" />
                </button>
                <ChevronRight
                  className="mr-2 h-4 w-4 self-center text-muted-foreground"
                  aria-hidden="true"
                />
              </div>
            ))}
          </div>
        )}
      </aside>

      <main className="min-w-0">
        {!draft ? (
          <div className="flex min-h-72 flex-col items-center justify-center border border-dashed border-border px-6 text-center">
            <FileInput className="h-8 w-8 text-muted-foreground" />
            <h2 className="mt-3 text-base font-semibold text-foreground">
              Choose a form or create a new one
            </h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Forms turn public responses into issues with the defaults and field mappings you
              choose.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-8">
            <section aria-labelledby="form-details-heading">
              <div className="mb-4 flex flex-col justify-between gap-3 border-b border-border pb-4 sm:flex-row sm:items-center">
                <div>
                  <h2 id="form-details-heading" className="text-lg font-semibold text-foreground">
                    {draft.id ? 'Edit form' : 'New form'}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Control the public page and the issue each response creates.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {draft.id && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setShareForm(forms?.find((form) => form.id === draft.id) || null)
                      }
                    >
                      <Share2 className="h-4 w-4" />
                      Share
                    </Button>
                  )}
                  <Button
                    type="submit"
                    size="sm"
                    disabled={createForm.isPending || updateForm.isPending}
                  >
                    {createForm.isPending || updateForm.isPending ? 'Saving...' : 'Save form'}
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="form-name">Form name</Label>
                  <Input
                    id="form-name"
                    value={draft.name}
                    onChange={(event) => {
                      updateDraft('name', event.target.value);
                      if (!slugEdited) updateDraft('slug', slugify(event.target.value));
                    }}
                    maxLength={255}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="form-slug">Public path</Label>
                  <div className="flex items-center border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
                    <span className="border-r border-input bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                      /forms/
                    </span>
                    <input
                      id="form-slug"
                      value={draft.slug}
                      onChange={(event) => {
                        setSlugEdited(true);
                        updateDraft(
                          'slug',
                          event.target.value
                            .toLowerCase()
                            .replace(/[^a-z0-9-]/g, '')
                            .replace(/-{2,}/g, '-')
                            .slice(0, 100),
                        );
                      }}
                      onBlur={() => updateDraft('slug', slugify(draft.slug))}
                      className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-foreground outline-none"
                      maxLength={100}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="form-description">Introduction</Label>
                  <Textarea
                    id="form-description"
                    value={draft.description || ''}
                    onChange={(event) => updateDraft('description', event.target.value)}
                    rows={3}
                    maxLength={2000}
                    placeholder="Explain what this form is for and what happens next."
                  />
                </div>
                <div className="flex items-center justify-between border border-border bg-muted/20 px-4 py-3 sm:col-span-2">
                  <div>
                    <Label htmlFor="form-active">Accept responses</Label>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Inactive forms return a not-found response and cannot create issues.
                    </p>
                  </div>
                  <Switch
                    id="form-active"
                    checked={draft.active}
                    onCheckedChange={(checked) => updateDraft('active', checked)}
                  />
                </div>
              </div>
            </section>

            <section aria-labelledby="form-fields-heading">
              <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                <div>
                  <h2 id="form-fields-heading" className="text-base font-semibold text-foreground">
                    Form fields
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Each response must include one field mapped to the issue summary.
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5" aria-label="Add a form field">
                  {FIELD_TYPES.map(({ type, label, icon: Icon }) => (
                    <Button
                      key={type}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => addField(type)}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                {draft.fields.map((field, index) => (
                  <Card key={field.id}>
                    <CardContent className="pt-5">
                      <div className="mb-4 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 items-center justify-center bg-muted text-xs font-semibold tabular-nums text-muted-foreground">
                            {index + 1}
                          </span>
                          <span className="text-sm font-medium capitalize text-foreground">
                            {field.type === 'textarea' ? 'Long text' : field.type}
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeField(field.id)}
                          aria-label={`Remove ${field.label || `field ${index + 1}`}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="space-y-2 xl:col-span-2">
                          <Label htmlFor={`${field.id}-label`}>Label</Label>
                          <Input
                            id={`${field.id}-label`}
                            value={field.label}
                            onChange={(event) => {
                              const nextLabel = event.target.value;
                              updateField(field.id, {
                                label: nextLabel,
                                ...(field.mapping === 'custom-field'
                                  ? { customFieldKey: customFieldKey(nextLabel) }
                                  : {}),
                              });
                            }}
                            maxLength={120}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`${field.id}-type`}>Field type</Label>
                          <select
                            id={`${field.id}-type`}
                            value={field.type}
                            onChange={(event) => {
                              const type = event.target.value as FormFieldType;
                              updateField(field.id, {
                                type,
                                options:
                                  type === 'select'
                                    ? field.options || ['Option 1', 'Option 2']
                                    : undefined,
                              });
                            }}
                            className="block h-9 w-full border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                          >
                            {FIELD_TYPES.map((fieldType) => (
                              <option key={fieldType.type} value={fieldType.type}>
                                {fieldType.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`${field.id}-mapping`}>Create issue field</Label>
                          <select
                            id={`${field.id}-mapping`}
                            value={field.mapping}
                            onChange={(event) => {
                              const mapping = event.target.value as FormFieldMapping;
                              updateField(field.id, {
                                mapping,
                                customFieldKey:
                                  mapping === 'custom-field'
                                    ? field.customFieldKey || customFieldKey(field.label)
                                    : undefined,
                              });
                            }}
                            className="block h-9 w-full border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                          >
                            {MAPPINGS.map((mapping) => {
                              const taken =
                                mapping.value !== 'custom-field' &&
                                draft.fields.some(
                                  (candidate) =>
                                    candidate.id !== field.id &&
                                    candidate.mapping === mapping.value,
                                );
                              return (
                                <option key={mapping.value} value={mapping.value} disabled={taken}>
                                  {mapping.label}
                                  {taken ? ' (used)' : ''}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                        <div className="space-y-2 xl:col-span-2">
                          <Label htmlFor={`${field.id}-placeholder`}>
                            Placeholder{' '}
                            <span className="font-normal text-muted-foreground">(optional)</span>
                          </Label>
                          <Input
                            id={`${field.id}-placeholder`}
                            value={field.placeholder || ''}
                            onChange={(event) =>
                              updateField(field.id, { placeholder: event.target.value })
                            }
                            maxLength={200}
                          />
                        </div>
                        {field.mapping === 'custom-field' && (
                          <div className="space-y-2 xl:col-span-2">
                            <Label htmlFor={`${field.id}-custom-key`}>Custom field key</Label>
                            <Input
                              id={`${field.id}-custom-key`}
                              value={field.customFieldKey || ''}
                              onChange={(event) =>
                                updateField(field.id, {
                                  customFieldKey: customFieldKey(event.target.value),
                                })
                              }
                              className="font-mono text-xs"
                              required
                            />
                          </div>
                        )}
                        {field.type === 'select' && (
                          <div className="space-y-2 xl:col-span-4">
                            <Label htmlFor={`${field.id}-options`}>
                              Options{' '}
                              <span className="font-normal text-muted-foreground">
                                (one per line)
                              </span>
                            </Label>
                            <Textarea
                              id={`${field.id}-options`}
                              value={(field.options || []).join('\n')}
                              onChange={(event) =>
                                updateField(field.id, { options: event.target.value.split('\n') })
                              }
                              rows={3}
                              required
                            />
                          </div>
                        )}
                        <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground xl:col-span-4">
                          <input
                            type="checkbox"
                            checked={field.required}
                            onChange={(event) =>
                              updateField(field.id, { required: event.target.checked })
                            }
                            className="h-4 w-4 accent-primary"
                          />
                          Require a response
                        </label>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>

            <section aria-labelledby="issue-defaults-heading">
              <h2 id="issue-defaults-heading" className="text-base font-semibold text-foreground">
                Issue defaults
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Applied to every issue created through this form.
              </p>
              <div className="mt-4 grid gap-4 border border-border p-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="default-issue-type">Issue type</Label>
                  <select
                    id="default-issue-type"
                    value={draft.issueDefaults.issueTypeId || ''}
                    onChange={(event) =>
                      updateDraft('issueDefaults', {
                        ...draft.issueDefaults,
                        issueTypeId: event.target.value || undefined,
                      })
                    }
                    className="block h-9 w-full border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Project default</option>
                    {issueTypes?.map((issueType) => (
                      <option key={issueType.id} value={issueType.id}>
                        {issueType.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="default-priority">Priority</Label>
                  <select
                    id="default-priority"
                    value={draft.issueDefaults.priority || 'medium'}
                    onChange={(event) =>
                      updateDraft('issueDefaults', {
                        ...draft.issueDefaults,
                        priority: event.target.value as IssuePriority,
                      })
                    }
                    className="block h-9 w-full border border-input bg-background px-3 text-sm capitalize text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {PRIORITIES.map((priority) => (
                      <option key={priority} value={priority}>
                        {priority}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="default-labels">Labels</Label>
                  <Input
                    id="default-labels"
                    value={defaultLabels}
                    onChange={(event) => {
                      setDefaultLabels(event.target.value);
                      setSaved(false);
                      setDirty(true);
                    }}
                    placeholder="external, support"
                  />
                </div>
              </div>
            </section>

            {draft.id && (
              <section aria-labelledby="submissions-heading">
                <div className="mb-4 flex items-end justify-between gap-3">
                  <div>
                    <h2
                      id="submissions-heading"
                      className="text-base font-semibold text-foreground"
                    >
                      Recent submissions
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      The newest issues created through this form.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setShareForm(forms?.find((form) => form.id === draft.id) || null)
                    }
                  >
                    <Link2 className="h-4 w-4" />
                    Get link
                  </Button>
                </div>
                <SubmissionsList projectKey={projectKey} formId={draft.id} />
              </section>
            )}

            {formError && (
              <p
                role="alert"
                className="border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
              >
                {formError}
              </p>
            )}

            <div className="flex flex-col-reverse justify-between gap-3 border-t border-border pt-5 sm:flex-row sm:items-center">
              <div>
                {draft.id && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleDelete}
                    disabled={deleteForm.isPending}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                    {deleteForm.isPending ? 'Deleting...' : 'Delete form'}
                  </Button>
                )}
              </div>
              <div className="flex items-center justify-end gap-3">
                {saved && (
                  <span className="inline-flex items-center gap-1.5 text-sm text-green-700 dark:text-green-400">
                    <CheckCircle2 className="h-4 w-4" />
                    Saved
                  </span>
                )}
                <Button type="submit" disabled={createForm.isPending || updateForm.isPending}>
                  {createForm.isPending || updateForm.isPending ? 'Saving...' : 'Save form'}
                </Button>
              </div>
            </div>
          </form>
        )}
      </main>

      <FormShareDialog
        form={shareForm}
        open={!!shareForm}
        onOpenChange={(open) => {
          if (!open) setShareForm(null);
        }}
      />
    </div>
  );
}
