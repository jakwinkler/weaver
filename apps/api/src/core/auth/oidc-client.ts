// openid-client is ESM; the API is compiled as CommonJS.
export const loadOpenIdClient = new Function('return import("openid-client")') as () => Promise<
  typeof import('openid-client')
>;
