import { lookup as dnsLookup } from 'dns/promises';
import { BlockList, isIP } from 'net';

const blocked = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10],
  ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) {
  blocked.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10],
  ['ff00::', 8], ['2001:db8::', 32],
] as const) {
  blocked.addSubnet(network, prefix, 'ipv6');
}

async function assertSafeUrl(rawUrl: string): Promise<URL> {
  const url = new URL(rawUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Unsafe webhook URL');
  }
  await resolveSafeOutboundHost(url.hostname);
  return url;
}

export async function resolveSafeOutboundHost(rawHostname: string) {
  const hostname = rawHostname.trim().replace(/^\[|\]$/g, '');
  if (!hostname || /[\s/@\\]/.test(hostname)) throw new Error('Invalid outbound hostname');
  const family = isIP(hostname);
  const addresses = family
    ? [{ address: hostname, family }]
    : await dnsLookup(hostname, { all: true, verbatim: true });
  if (
    addresses.length === 0 ||
    addresses.some(({ address, family: addressFamily }) => {
      if (addressFamily === 4) return blocked.check(address, 'ipv4');
      const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
      return mapped
        ? blocked.check(mapped[1], 'ipv4')
        : blocked.check(address, 'ipv6');
    })
  ) {
    throw new Error('Outbound hostname resolves to a private or reserved address');
  }
  return addresses;
}

export async function fetchWithSafeRedirects(
  rawUrl: string,
  init: RequestInit,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  let currentUrl = rawUrl;
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const url = await assertSafeUrl(currentUrl);
    const response = await fetcher(url, { ...init, redirect: 'manual' });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get('location');
    if (!location) return response;
    if (redirects === 3) throw new Error('Webhook redirect limit exceeded');
    currentUrl = new URL(location, url).toString();
  }
  throw new Error('Webhook redirect limit exceeded');
}

export async function readLimitedText(response: Response, limit: number): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let result = '';
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) return result + decoder.decode();
    bytes += value.byteLength;
    if (bytes > limit) {
      await reader.cancel();
      throw new Error('Webhook response exceeded size limit');
    }
    result += decoder.decode(value, { stream: true });
  }
}
