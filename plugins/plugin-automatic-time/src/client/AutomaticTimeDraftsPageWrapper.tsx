import { useMemo } from 'react';
import { AutomaticTimeDraftsPage } from './AutomaticTimeDraftsPage';
import { createAutomaticTimeApi, type PluginApi } from './types';

export function AutomaticTimeDraftsPageWrapper({
  pluginContext,
}: {
  pluginContext: { api: PluginApi };
}) {
  const api = useMemo(() => createAutomaticTimeApi(pluginContext.api), [pluginContext.api]);
  return <AutomaticTimeDraftsPage api={api} />;
}
