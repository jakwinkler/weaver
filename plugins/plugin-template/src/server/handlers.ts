import type { PluginContext, PluginRequest, PluginResponse } from '@weaver/sdk';

export async function getHello(
  _request: PluginRequest,
  _context: PluginContext,
): Promise<PluginResponse> {
  return {
    status: 200,
    body: { message: 'The client bundle and server route are both running.' },
  };
}
