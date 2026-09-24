export const apiPath = (suffix: string) =>
  `/${(process.env.API_PREFIX || 'api/v1').replace(/^\/+|\/+$/g, '')}/${suffix}`;
