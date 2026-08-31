import { useMemo } from 'react';
import { AutomaticTimeSettingsPage } from './AutomaticTimeSettingsPage';
import { createAutomaticTimeApi, type PluginApi } from './types';

export function AutomaticTimeSettingsPageWrapper({
  pluginContext,
}: {
  pluginContext: { api: PluginApi };
}) {
  const api = useMemo(() => createAutomaticTimeApi(pluginContext.api), [pluginContext.api]);
  return <AutomaticTimeSettingsPage api={api} />;
}
