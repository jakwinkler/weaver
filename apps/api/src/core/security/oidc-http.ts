import { BadRequestException } from '@nestjs/common';
import { readLimitedResponseBuffer } from '@weaver/server-common';
import { assertSafeOutboundUrl, fetchWithSafeRedirects } from './outbound-http';

export async function assertSafeOidcUrl(value: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BadRequestException('OIDC discovery URL is invalid');
  }
  if (url.protocol !== 'https:') throw new BadRequestException('OIDC discovery URL must use HTTPS');
  try {
    return await assertSafeOutboundUrl(value);
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException('OIDC discovery URL could not be resolved safely');
  }
}

// Applied by openid-client to discovery, token exchange, and signing-key retrieval.
// Keep its manual redirect policy; never silently follow a credential-bearing POST.
export const fetchOidc: typeof fetch = async (input, init = {}) => {
  const deadline = AbortSignal.timeout(10_000);
  const signal = init.signal ? AbortSignal.any([init.signal, deadline]) : deadline;
  const response = await fetchWithSafeRedirects(
    String(input),
    { ...init, signal },
    { requireHttps: true },
  );
  const body = await readLimitedResponseBuffer(response, 1024 * 1024);
  return new Response([204, 205, 304].includes(response.status) ? null : body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
};
