# Plugin Settings UI

> Auto-generate settings forms from plugin manifest schema. Admin configures plugins without editing JSON.

## Why
Plugin manifests define `settings.schema` with typed fields, but there's no UI to configure them. Admins must use raw API calls. This makes plugins feel unfinished.

## Current State
- Plugin manifests can define `settings.schema` with field definitions (type, label, default, options)
- `PATCH /plugins/settings` endpoint stores settings in InstalledPluginEntity.settings JSONB
- PluginsPage shows installed plugins with install/enable/disable buttons
- No settings form, no per-plugin config UI

## Tasks

### Frontend
- [ ] **Schema-driven form renderer** — Component that reads plugin manifest `settings.schema` and renders appropriate form fields: text input, number input, boolean toggle, select dropdown, textarea. Respect field labels, descriptions, defaults, required. _Files: `apps/web/src/features/settings/PluginSettingsForm.tsx`_
- [ ] **Settings dialog on PluginsPage** — Add "Settings" button next to each installed plugin. Opens dialog with schema-driven form. Save calls `PATCH /plugins/settings`. _Files: `apps/web/src/features/settings/PluginsPage.tsx`_
- [ ] **Validation** — Validate required fields. Show error messages inline. Type-check values (number fields reject text). _Files: `apps/web/src/features/settings/PluginSettingsForm.tsx`_
- [ ] **Settings display** — Show current settings values as summary when dialog is closed: key=value pairs or "Default settings" if unchanged. _Files: `apps/web/src/features/settings/PluginsPage.tsx`_
- [ ] **Settings API hook** — `usePluginSettings(pluginId)` fetches current settings. `useUpdatePluginSettings(pluginId)` calls PATCH. _Files: `apps/web/src/api/hooks-phase4.ts`_

### Backend
- [ ] **Validate settings against schema** — When PATCH /plugins/settings called, validate the values against the manifest's settings.schema. Return 400 with field errors if invalid. _Files: `apps/api/src/plugins/plugin-registry.service.ts`_
- [ ] **Default values** — When reading settings, merge with defaults from schema for missing keys. _Files: `apps/api/src/plugins/plugin-registry.service.ts`_

### Tests
- [ ] **E2E: update plugin settings** — PATCH with valid settings, verify GET returns them. _File: `apps/api/test/plugin-settings.e2e-spec.ts`_
- [ ] **E2E: validate settings** — PATCH with invalid type (string for number field), expect 400. _File: `apps/api/test/plugin-settings.e2e-spec.ts`_
- [ ] **E2E: defaults merged** — GET settings without PATCH, verify defaults from schema present. _File: `apps/api/test/plugin-settings.e2e-spec.ts`_

## Acceptance Criteria
- Settings button appears on installed plugins
- Form auto-generated from manifest schema
- Text, number, boolean, select field types supported
- Validation errors shown inline
- Settings saved via API
- Defaults shown when no custom settings configured
- Invalid settings rejected with clear error

## Dependencies
- None
