import { z } from 'zod';

const apiTokenSchema = z.object({
  type: z.literal('api_token'),
  token: z.string().min(1).max(2000),
  email: z.string().email().optional(),
});

const oauthSchema = z.object({
  type: z.literal('oauth'),
  accessToken: z.string().min(1).max(4000),
});

export const jiraConnectionSchema = z
  .object({
    source: z.enum(['jira_cloud', 'jira_server']),
    baseUrl: z
      .string()
      .url()
      .max(2000)
      .refine(
        (value) => {
          const url = new URL(value);
          return !url.username && !url.password && !url.search && !url.hash;
        },
        { message: 'Use a Jira base URL without credentials, query parameters, or a fragment' },
      )
      .refine((value) => new URL(value).protocol === 'https:', {
        message: 'Jira URL must use HTTPS',
      }),
    auth: z.discriminatedUnion('type', [apiTokenSchema, oauthSchema]),
  })
  .superRefine((value, ctx) => {
    if (value.source === 'jira_cloud' && value.auth.type === 'api_token' && !value.auth.email) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['auth', 'email'],
        message: 'Email is required for Jira Cloud API-token authentication',
      });
    }
  });

const projectKeysSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1)
      .max(255)
      .regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  )
  .min(1)
  .max(500)
  .transform((keys) => [...new Set(keys.map((key) => key.toUpperCase()))]);

export const discoverJiraProjectsSchema = z.object({
  config: jiraConnectionSchema,
});

export const startJiraImportSchema = z.object({
  config: jiraConnectionSchema,
  projectKeys: projectKeysSchema.optional(),
  updatedSince: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => {
      const date = new Date(`${value}T00:00:00Z`);
      return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
    }, 'Invalid import date')
    .optional(),
});

export type DiscoverJiraProjectsDto = z.infer<typeof discoverJiraProjectsSchema>;
export type StartJiraImportDto = z.infer<typeof startJiraImportSchema>;
