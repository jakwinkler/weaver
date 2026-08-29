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
      .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), {
        message: 'Jira URL must use HTTP or HTTPS',
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
});

export type DiscoverJiraProjectsDto = z.infer<typeof discoverJiraProjectsSchema>;
export type StartJiraImportDto = z.infer<typeof startJiraImportSchema>;
