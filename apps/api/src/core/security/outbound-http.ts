import { BadRequestException } from '@nestjs/common';
import * as outbound from '@weaver/server-common';
export type { AddressLookup, ResolvedAddress } from '@weaver/server-common';

async function asBadRequest<T>(operation: Promise<T>): Promise<T> {
  try { return await operation; } catch (error) {
    if (error instanceof outbound.OutboundRequestError) throw new BadRequestException(error.message);
    throw error;
  }
}
export const resolveSafeOutboundHost = (...args: Parameters<typeof outbound.resolveSafeOutboundHost>) => asBadRequest(outbound.resolveSafeOutboundHost(...args));
export const assertSafeOutboundUrl = (...args: Parameters<typeof outbound.assertSafeOutboundUrl>) => asBadRequest(outbound.assertSafeOutboundUrl(...args));
export const fetchWithSafeRedirects = (...args: Parameters<typeof outbound.fetchWithSafeRedirects>) => asBadRequest(outbound.fetchWithSafeRedirects(...args));
export const readLimitedResponseText = (...args: Parameters<typeof outbound.readLimitedResponseText>) => asBadRequest(outbound.readLimitedResponseText(...args));
