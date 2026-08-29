import type { PluginContext, PluginRequest, PluginResponse } from '@weaver/sdk';

const pluginName = WEAVER_PLUGIN_DISPLAY_NAME;

export async function getHello(
  _request: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  return {
    status: 200,
    body: {
      message: `Hello from ${pluginName} in tenant ${context.tenant.slug}`,
    },
  };
}
