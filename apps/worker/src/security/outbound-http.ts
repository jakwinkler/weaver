import { fetchWithSafeRedirects as safeFetch } from '@weaver/server-common';
export { resolveSafeOutboundHost, readLimitedResponseText as readLimitedText } from '@weaver/server-common';
export const fetchWithSafeRedirects = (url: string, init: RequestInit, fetcher?: typeof fetch) => safeFetch(url, init, { fetcher });
