import { z } from 'zod';
import type { PluginManifest } from '@weaver/sdk';

const semverSchema = z
  .string()
  .regex(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/,
    'must be a semantic version',
  );

const nonEmptyString = z.string().min(1);
const permissionList = z.array(nonEmptyString);

const settingDefinitionSchema = z
  .object({
    type: z.enum(['string', 'number', 'boolean', 'select']),
    required: z.boolean().optional(),
    default: z.unknown().optional(),
    description: z.string().optional(),
    options: z.array(z.string()).optional(),
  })
  .strict();

const manifestSchema = z
  .object({
    id: z.string().regex(/^(@[a-z0-9-]+\/)?[a-z0-9][a-z0-9-]*$/),
    name: nonEmptyString,
    version: semverSchema,
    description: z.string().optional(),
    author: z.string().optional(),
    icon: z.string().optional(),
    type: z.enum(['app', 'widget', 'feature', 'integration']).optional(),
    scope: z.enum(['tenant', 'project']).optional(),
    enabledByDefault: z.boolean().optional(),
    uninstall: z
      .object({
        deletesPrivateData: z.boolean(),
        confirmationMessage: nonEmptyString.optional(),
      })
      .strict()
      .optional(),
    entrypoints: z
      .object({
        server: nonEmptyString.optional(),
        client: nonEmptyString.optional(),
      })
      .strict(),
    permissions: permissionList,
    requires: z
      .object({
        coreCapabilities: z.array(z.enum(['issue-candidates', 'time-entries'])).optional(),
        plugins: z
          .array(
            z
              .object({
                id: nonEmptyString,
                minimumVersion: semverSchema.optional(),
              })
              .strict(),
          )
          .optional(),
      })
      .strict()
      .optional(),
    companion: z
      .object({
        platform: z.enum(['macos', 'windows', 'linux']),
        downloadArtifact: nonEmptyString,
        minimumVersion: semverSchema,
        pairingRoute: z.string().startsWith('/'),
      })
      .strict()
      .optional(),
    declaredPermissions: z
      .array(
        z
          .object({
            key: nonEmptyString,
            label: nonEmptyString,
            description: z.string().optional(),
          })
          .strict(),
      )
      .optional(),
    settings: z
      .object({
        schema: z.record(settingDefinitionSchema).optional(),
      })
      .strict()
      .optional(),
    events: z
      .object({
        subscribes: z.array(nonEmptyString).optional(),
        emits: z.array(nonEmptyString).optional(),
      })
      .strict()
      .optional(),
    ui: z
      .object({
        slots: z
          .array(
            z
              .object({
                slot: nonEmptyString,
                component: nonEmptyString,
                requiredPermissions: permissionList.optional(),
              })
              .strict(),
          )
          .optional(),
        navigation: z
          .array(
            z
              .object({
                label: nonEmptyString,
                icon: nonEmptyString,
                path: z.string().startsWith('/'),
                requiredPermissions: permissionList.optional(),
              })
              .strict(),
          )
          .optional(),
        pages: z
          .array(
            z
              .object({
                path: z.string().startsWith('/'),
                component: nonEmptyString,
                requiredPermissions: permissionList.optional(),
              })
              .strict(),
          )
          .optional(),
        projectViews: z
          .array(
            z
              .object({
                label: nonEmptyString,
                icon: nonEmptyString,
                viewPath: nonEmptyString,
                requiredPermissions: permissionList.optional(),
              })
              .strict(),
          )
          .optional(),
      })
      .strict()
      .optional(),
    routes: z
      .array(
        z
          .object({
            method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
            path: z.string().startsWith('/'),
            handler: nonEmptyString,
            requiredPermissions: permissionList.optional(),
          })
          .strict(),
      )
      .optional(),
    migrations: z
      .array(
        z.union([
          nonEmptyString,
          z
            .object({
              version: semverSchema,
              path: nonEmptyString,
            })
            .strict(),
        ]),
      )
      .optional(),
  })
  .strict();

export function parsePluginManifest(value: unknown): PluginManifest {
  return manifestSchema.parse(value) as PluginManifest;
}
