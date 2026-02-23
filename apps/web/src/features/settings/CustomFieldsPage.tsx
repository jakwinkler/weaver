import { useState, type FormEvent } from 'react';
import {
  useCustomFields,
  useCreateCustomField,
  useDeleteCustomField,
  useUpdateCustomField,
} from '@/api';
import type { CustomFieldType } from '@weaver/shared';
import { Pencil, Trash2, Settings, Puzzle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

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
  text: 'bg-blue-100 text-blue-700 border-blue-200',
  number: 'bg-green-100 text-green-700 border-green-200',
  select: 'bg-purple-100 text-purple-700 border-purple-200',
  multi_select: 'bg-purple-100 text-purple-700 border-purple-200',
  date: 'bg-orange-100 text-orange-700 border-orange-200',
  user: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  checkbox: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  url: 'bg-cyan-100 text-cyan-700 border-cyan-200',
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
      <div className="flex items-center justify-center py-12 text-muted-foreground">Loading custom fields...</div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Custom Fields</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Define custom fields to capture additional data.
          </p>
        </div>
        <Button
          onClick={() => { resetForm(); setEntityType(activeTab); setShowForm(true); }}
        >
          New Field
        </Button>
      </div>

      {/* Entity Type Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(val) => handleTabChange(val as EntityType)}
        className="mb-4"
      >
        <TabsList className="w-full">
          {ENTITY_TYPES.map((et) => (
            <TabsTrigger key={et} value={et} className="flex-1">
              {ENTITY_TYPE_LABELS[et]}
            </TabsTrigger>
          ))}
        </TabsList>

        {showForm && (
          <Card className="mt-4 mb-6">
            <CardContent className="pt-4">
              <form onSubmit={handleSubmit}>
                <h3 className="mb-3 text-sm font-medium text-foreground">
                  {editId ? 'Edit Field' : 'Create Field'}
                </h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="field-name">Name</Label>
                    <Input
                      id="field-name"
                      value={name}
                      onChange={(e) => handleNameChange(e.target.value)}
                      required
                      placeholder="e.g. Story Points"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="field-slug">Slug</Label>
                    <Input
                      id="field-slug"
                      value={slug}
                      onChange={(e) => setSlug(e.target.value)}
                      required
                      disabled={!!editId}
                      placeholder="Auto-generated"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="field-type">Type</Label>
                    <select
                      id="field-type"
                      value={fieldType}
                      onChange={(e) => setFieldType(e.target.value as CustomFieldType)}
                      disabled={!!editId}
                      className="block w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:bg-muted/50 disabled:text-muted-foreground"
                    >
                      {FIELD_TYPES.map((ft) => (
                        <option key={ft} value={ft}>{ft.replace('_', ' ')}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="entity-type">Entity Type</Label>
                    <select
                      id="entity-type"
                      value={entityType}
                      onChange={(e) => setEntityType(e.target.value as EntityType)}
                      disabled={!!editId}
                      className="block w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:bg-muted/50 disabled:text-muted-foreground"
                    >
                      {ENTITY_TYPES.map((et) => (
                        <option key={et} value={et}>{ENTITY_TYPE_LABELS[et]}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-end">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="field-required"
                        checked={required}
                        onCheckedChange={(checked) => setRequired(Boolean(checked))}
                      />
                      <Label htmlFor="field-required" className="cursor-pointer">Required</Label>
                    </div>
                  </div>
                </div>

                {(fieldType === 'select' || fieldType === 'multi_select') && (
                  <div className="mt-4 space-y-1">
                    <Label htmlFor="field-choices">Choices (comma-separated)</Label>
                    <Input
                      id="field-choices"
                      value={choices}
                      onChange={(e) => setChoices(e.target.value)}
                      placeholder="Option A, Option B, Option C"
                    />
                  </div>
                )}

                {(createField.isError || updateField.isError) && (
                  <p className="mt-2 text-sm text-destructive">Failed to save field.</p>
                )}

                <div className="mt-4 flex gap-2">
                  <Button
                    type="submit"
                    disabled={createField.isPending || updateField.isPending}
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

        {ENTITY_TYPES.map((et) => (
          <TabsContent key={et} value={et}>
            {filteredFields.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Settings className="mx-auto h-10 w-10 text-muted-foreground" />
                  <p className="mt-2 text-sm font-medium text-foreground">No custom fields</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    No {ENTITY_TYPE_LABELS[activeTab].toLowerCase()} custom fields yet.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card className="overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="uppercase tracking-wider text-xs">Name</TableHead>
                      <TableHead className="uppercase tracking-wider text-xs">Slug</TableHead>
                      <TableHead className="uppercase tracking-wider text-xs">Type</TableHead>
                      <TableHead className="uppercase tracking-wider text-xs">Required</TableHead>
                      <TableHead className="uppercase tracking-wider text-xs">Source</TableHead>
                      <TableHead className="text-right uppercase tracking-wider text-xs">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredFields.map((field: any) => (
                      <TableRow key={field.id}>
                        <TableCell className="font-medium text-foreground">{field.name}</TableCell>
                        <TableCell className="text-muted-foreground">{field.slug}</TableCell>
                        <TableCell>
                          <Badge
                            className={cn(
                              fieldTypeColors[field.fieldType] || 'bg-muted text-muted-foreground border-border'
                            )}
                          >
                            {field.fieldType.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {field.required && (
                            <Badge variant="destructive">
                              Required
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {field.pluginId && (
                            <Badge className="bg-purple-100 text-purple-700 border-purple-200 gap-1">
                              <Puzzle className="h-3 w-3" />
                              {field.pluginId}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {!field.pluginId && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleEdit(field)}
                                  title="Edit field"
                                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDelete(field.id)}
                                  disabled={deleteField.isPending}
                                  title="Delete field"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
