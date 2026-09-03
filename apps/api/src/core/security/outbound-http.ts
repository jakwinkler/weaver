import { BadRequestException } from '@nestjs/common';
import { lookup as dnsLookup } from 'dns/promises';
import { BlockList, isIP } from 'net';

export interface ResolvedAddress {
  address: string;
  family: number;
}

export type AddressLookup = (hostname: string) => Promise<ResolvedAddress[]>;

const blockedAddresses = new BlockList();

for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blockedAddresses.addSubnet(network, prefix, 'ipv4');
}

for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
  ['2001:db8::', 32],
] as const) {
  blockedAddresses.addSubnet(network, prefix, 'ipv6');
}

const defaultLookup: AddressLookup = async (hostname) =>
  dnsLookup(hostname, { all: true, verbatim: true });

function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    return blockedAddresses.check(address, 'ipv4');
  }
  if (family === 6) {
    const mappedIpv4 = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (mappedIpv4) {
      return blockedAddresses.check(mappedIpv4[1], 'ipv4');
    }
    return blockedAddresses.check(address, 'ipv6');
  }
  return true;
}

export async function resolveSafeOutboundHost(
  rawHostname: string,
  lookup: AddressLookup = defaultLookup,
): Promise<ResolvedAddress[]> {
  const trimmed = rawHostname.trim();
  if (
    !trimmed ||
    trimmed.includes('/') ||
    trimmed.includes('\\') ||
    trimmed.includes('@') ||
    /\s/.test(trimmed)
  ) {
    throw new BadRequestException('Outbound hostname is invalid');
  }

  const hostname = trimmed.replace(/^\[|\]$/g, '');
  const literalFamily = isIP(hostname);
  const addresses = literalFamily
    ? [{ address: hostname, family: literalFamily }]
    : await lookup(hostname);

  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => isBlockedAddress(address))
  ) {
    throw new BadRequestException(
      'Outbound hostname resolves to a private or reserved address',
    );
  }

  return addresses;
}

export async function assertSafeOutboundUrl(
  rawUrl: string,
  lookup: AddressLookup = defaultLookup,
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new BadRequestException('Outbound URL is invalid');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new BadRequestException('Outbound URL must use HTTP or HTTPS');
  }
  if (url.username || url.password) {
    throw new BadRequestException('Outbound URL must not include credentials');
  }

  await resolveSafeOutboundHost(url.hostname, lookup);

  return url;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export async function fetchWithSafeRedirects(
  rawUrl: string,
  init: RequestInit,
  options: {
    fetcher?: typeof fetch;
    lookup?: AddressLookup;
    maxRedirects?: number;
  } = {},
): Promise<Response> {
  const fetcher = options.fetcher || fetch;
  const lookup = options.lookup || defaultLookup;
  const maxRedirects = options.maxRedirects ?? 3;
  let currentUrl = rawUrl;

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const validatedUrl = await assertSafeOutboundUrl(currentUrl, lookup);
    const response = await fetcher(validatedUrl, {
      ...init,
      redirect: 'manual',
    });

    if (!REDIRECT_STATUSES.has(response.status)) {
      return response;
    }

    const location = response.headers.get('location');
    if (!location) {
      return response;
    }
    if (redirectCount === maxRedirects) {
      throw new BadRequestException('Outbound request exceeded redirect limit');
    }

    currentUrl = new URL(location, validatedUrl).toString();
  }

  throw new BadRequestException('Outbound request exceeded redirect limit');
}

export async function readLimitedResponseText(
  response: Response,
  maximumBytes: number,
): Promise<string> {
  if (!response.body) {
    return '';
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      return text + decoder.decode();
    }

    size += value.byteLength;
    if (size > maximumBytes) {
      await reader.cancel();
      throw new BadRequestException('Outbound response exceeded size limit');
    }
    text += decoder.decode(value, { stream: true });
  }
}
