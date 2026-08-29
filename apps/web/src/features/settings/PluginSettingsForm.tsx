import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { PluginSettingDefinition, PluginSettingsSchema } from '@/api/hooks-phase4';

export type { PluginSettingDefinition, PluginSettingsSchema };

interface PluginSettingsFormProps {
  schema: PluginSettingsSchema;
  values: Record<string, unknown>;
  onSubmit: (values: Record<string, unknown>) => void | Promise<void>;
  onCancel?: () => void;
  isSaving?: boolean;
  serverErrors?: Record<string, string>;
}

function humanizeSettingKey(key: string): string {
  const spaced = key
    .replace(
      /([a-z0-9])([A-Z])/g,
      (_match, before: string, uppercase: string) => `${before} ${uppercase.toLowerCase()}`,
    )
    .replace(/[_-]+/g, ' ')
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function isSensitiveSetting(key: string): boolean {
  return /secret|token|password|private.?key|api.?key/i.test(key);
}

function initialFormValues(
  schema: PluginSettingsSchema,
  values: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(schema).map(([key, definition]) => [
      key,
      values[key] ?? definition.default ?? (definition.type === 'boolean' ? false : ''),
    ]),
  );
}

export function PluginSettingsForm({
  schema,
  values,
  onSubmit,
  onCancel,
  isSaving = false,
  serverErrors = {},
}: PluginSettingsFormProps) {
  const resolvedInitialValues = useMemo(() => initialFormValues(schema, values), [schema, values]);
  const [formValues, setFormValues] = useState(resolvedInitialValues);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setFormValues(resolvedInitialValues);
    setClientErrors({});
  }, [resolvedInitialValues]);

  const setValue = (key: string, value: unknown) => {
    setFormValues((current) => ({ ...current, [key]: value }));
    setClientErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const validate = (): Record<string, string> => {
    const errors: Record<string, string> = {};

    for (const [key, definition] of Object.entries(schema)) {
      const value = formValues[key];
      const label = definition.label || humanizeSettingKey(key);
      if (definition.required && (value === undefined || value === null || value === '')) {
        errors[key] = `${label} is required`;
      } else if (definition.type === 'number' && value !== '' && !Number.isFinite(Number(value))) {
        errors[key] = `${label} must be a number`;
      }
    }

    return errors;
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const errors = validate();
    setClientErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const typedValues = Object.fromEntries(
      Object.entries(schema).flatMap(([key, definition]) => {
        const value = formValues[key];
        if (definition.type === 'number') {
          return [[key, value === '' ? null : Number(value)]];
        }
        return [[key, value]];
      }),
    );
    void onSubmit(typedValues);
  };

  return (
    <form
      aria-label="Plugin settings"
      onSubmit={handleSubmit}
      className="space-y-5"
      noValidate
    >
      {Object.entries(schema).map(([key, definition]) => {
        const id = `plugin-setting-${key}`;
        const label = definition.label || humanizeSettingKey(key);
        const error = clientErrors[key] || serverErrors[key];
        const describedBy = [
          definition.description ? `${id}-description` : null,
          error ? `${id}-error` : null,
        ]
          .filter(Boolean)
          .join(' ');

        return (
          <div key={key} className="space-y-2">
            <div
              className={
                definition.type === 'boolean'
                  ? 'flex items-center justify-between gap-4'
                  : undefined
              }
            >
              <Label htmlFor={id}>
                {label}
                {definition.required ? <span aria-hidden="true"> *</span> : null}
              </Label>

              {definition.type === 'boolean' ? (
                <Switch
                  id={id}
                  aria-label={label}
                  checked={Boolean(formValues[key])}
                  onCheckedChange={(checked) => setValue(key, checked)}
                  aria-invalid={Boolean(error)}
                  aria-describedby={describedBy || undefined}
                />
              ) : null}
            </div>

            {definition.type === 'string' ? (
              <Input
                id={id}
                aria-label={label}
                type={isSensitiveSetting(key) ? 'password' : 'text'}
                autoComplete={isSensitiveSetting(key) ? 'new-password' : undefined}
                value={String(formValues[key] ?? '')}
                onChange={(event) => setValue(key, event.target.value)}
                required={definition.required}
                aria-invalid={Boolean(error)}
                aria-describedby={describedBy || undefined}
              />
            ) : null}

            {definition.type === 'number' ? (
              <Input
                id={id}
                aria-label={label}
                type="number"
                value={String(formValues[key] ?? '')}
                onChange={(event) => setValue(key, event.target.value)}
                required={definition.required}
                aria-invalid={Boolean(error)}
                aria-describedby={describedBy || undefined}
              />
            ) : null}

            {definition.type === 'select' ? (
              <Select
                value={String(formValues[key] ?? '')}
                onValueChange={(value) => setValue(key, value)}
              >
                <SelectTrigger
                  id={id}
                  aria-label={label}
                  aria-invalid={Boolean(error)}
                  aria-describedby={describedBy || undefined}
                >
                  <SelectValue placeholder="Select an option" />
                </SelectTrigger>
                <SelectContent>
                  {(definition.options ?? []).map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            {definition.type === 'textarea' ? (
              <Textarea
                id={id}
                aria-label={label}
                value={String(formValues[key] ?? '')}
                onChange={(event) => setValue(key, event.target.value)}
                required={definition.required}
                aria-invalid={Boolean(error)}
                aria-describedby={describedBy || undefined}
              />
            ) : null}

            {definition.description ? (
              <p id={`${id}-description`} className="text-xs text-muted-foreground">
                {definition.description}
              </p>
            ) : null}
            {error ? (
              <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
        );
      })}

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save settings'}
        </Button>
      </div>
    </form>
  );
}
